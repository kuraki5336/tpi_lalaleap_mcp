// 規格審查 MCP 工具（mcp-server.md §6）
// HTTP 模式：9 個工具（scope spec_review；寫入類另受 WriteGuard 保護）
// stdio 模式：只加 upload_spec_material（讀本機檔案，沿用 llp_ 既有 API spec-case/upload）
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import axios from 'axios';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { formatError } from '../api-client.js';
import type { WriteGuard } from '../write-guard.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ROLES = ['SA', 'SD', 'UX'] as const;
const TEXT_ROLES = ['SA', 'SD'] as const;
const MAX_READ_BYTES = 300 * 1024;
const MAX_TEXT_FILE_BYTES = 512 * 1024;
const MAX_TEXT_TOTAL_BYTES = 1024 * 1024;
const MAX_PROJECTS = 20;

const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
});
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

// ───────────────────────── 錯誤轉譯 ─────────────────────────

/** 把後端／網路錯誤轉成給 AI 看得懂、可行動的中文說明 */
export function translateSpecError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response) {
    const status = err.response.status;
    const body = err.response.data as any;
    const headerCode = String(err.response.headers?.['x-error-code'] ?? '');
    if (status === 403) {
      if (body?.error === 'AI_ZONE_ACCESS_DENIED') return '你的帳號不在規格審查開放範圍，請聯絡管理員開通。';
      if (body?.error === 'insufficient_scope' || body?.error === 'MCP_ENDPOINT_NOT_ALLOWED') {
        return '授權範圍不足：請在 /mcp 重新認證並勾選 spec_review（查詢專案清單另需 lalaleap.read）。';
      }
    }
    const dataStr = typeof body?.data === 'string' ? body.data : '';
    const code = /^\[([^\]]+)\]/.exec(dataStr)?.[1] ?? headerCode;
    const msg = String(body?.message ?? '').trim() || (typeof body === 'string' ? body.trim() : '') || `HTTP ${status}`;
    return `規格審查操作失敗：${decorate(code, msg)}`;
  }
  return formatError(err);
}

function decorate(code: string, msg: string): string {
  switch (code) {
    case 'TRNS.SpecTicketInvalid':
      return '連結已過期或已使用，請重新呼叫 request_spec_upload／pull_spec_materials 取得新連結（每條連結只能用一次、10 分鐘內有效）。';
    case 'TRNS.SpecRoleNotApplicable':
      return `${msg}。請先呼叫 mark_spec_not_applicable（value=false）取消不適用，再上傳。`;
    case 'TRNS.SpecConcurrentEdit':
      return `${msg}。此角色剛被其他人同時修改，請稍後重試。`;
    case 'TRNS.SpecRuleConflict':
      return `${msg}。檢核標準已被他人更新，請重新讀取後再試。`;
    case 'TRNS.NotProjectMember':
    case 'TRNS.MemberNotInProject':
      return `${msg}。請確認 pno／caseId 是否正確，或請專案管理員將你加入專案。`;
    case 'TRNS.DuplicateCaseCode':
      return msg;
  }
  if (msg.includes('AI 掃描中')) return `${msg}。掃描完成後才能上傳或交件；可用 get_spec_case 查看 status。`;
  if (msg.includes('案件已發布')) return `${msg}。已發布的案件不能再上傳、交件或標記不適用。`;
  if (msg.includes('只有案件成員')) return `${msg}。你需要被指派為該案件的 SA／SD／UIUX／PM 任一角色，請聯絡案件負責人。`;
  if (msg.includes('請先上傳檔案')) return `${msg}。請先用 request_spec_upload（或 upload_spec_text）上傳，再呼叫 submit_spec。`;
  if (msg.includes('連結已過期或已使用')) return `${msg}。請重新呼叫 request_spec_upload 或 pull_spec_materials 取得新連結（每條連結只能用一次、10 分鐘內有效）。`;
  if (msg.includes('找不到案件')) return `${msg}。請用 get_spec_case（pno＋caseCode）確認 caseId。`;
  return msg;
}

const wrap = async (fn: () => Promise<ToolResult>): Promise<ToolResult> => {
  try {
    return await fn();
  } catch (err) {
    return fail(translateSpecError(err));
  }
};

// ───────────────────────── 純函式 ─────────────────────────

const SHELL_NOTE =
  'Windows PowerShell 請改用 curl.exe（PowerShell 的 curl 是 Invoke-WebRequest 別名）。若失敗想看後端訊息，把 -fS 改成 -sS。';

export interface UploadTicket {
  uploadUrl: string;
  expiresAt: string;
  /** 後端不限檔案數量，恆為 null／省略；舊版後端可能回數字 */
  maxFiles?: number | null;
  allowedExtensions?: string[];
  maxFileSizeMb?: number;
}

export function buildUploadInstructions(t: UploadTicket, role: string, caseCode?: string): { curlCommand: string; instructions: string } {
  const exts = t.allowedExtensions?.length ? t.allowedExtensions : role === 'UX' ? ['.png', '.jpg', '.jpeg', '.webp'] : ['.md'];
  const sample = exts[0] === '.md' ? `./docs/${caseCode ?? 'spec'}.md` : `./screens/${caseCode ?? 'screen'}-1${exts[0]}`;
  const curlCommand = `curl -fS -X POST -F "files=@${sample}" "${t.uploadUrl}"`;
  const instructions =
    `請在 shell 執行：${curlCommand}（把 ${sample} 換成實際檔案；多檔重複 -F "files=@…"${t.maxFiles != null ? `，最多 ${t.maxFiles} 檔` : ""}，只收 ${exts.join(' ')}）。` +
    `連結只能用一次（即使失敗也失效，需重新呼叫 request_spec_upload），${expiryText(t.expiresAt)}。` +
    `上傳成功只代表檔案已收到；請接著呼叫 submit_spec 才算交件。${SHELL_NOTE}` +
    ` 若無法執行 shell（如 Claude 桌面版），SA／SD 的 .md 可改用 upload_spec_text。`;
  return { curlCommand, instructions };
}

export function buildDownloadInstructions(fileName: string, downloadUrl: string, expiresAt: string, dir: string): { curlCommand: string; extractCommand?: string; instructions: string } {
  const curlCommand = `curl -fSL -o "${fileName}" "${downloadUrl}"`;
  const isZip = fileName.toLowerCase().endsWith('.zip');
  const extractCommand = isZip ? `mkdir -p "${dir}" && unzip -o "${fileName}" -d "${dir}"` : undefined;
  const instructions =
    `請在 shell 執行：${curlCommand}` +
    (isZip ? `，再解壓縮到 ${dir}（${extractCommand}；Windows 可用 tar -xf "${fileName}" -C "${dir}"，目錄需先建立）` : '') +
    `。連結只能用一次，${expiryText(expiresAt)}，過期請重新呼叫 pull_spec_materials。${SHELL_NOTE}`;
  return { curlCommand, extractCommand, instructions };
}

function expiryText(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.now();
  if (Number.isNaN(ms)) return `有效期限至 ${expiresAt}`;
  return `有效期限至 ${expiresAt}（約 ${Math.max(0, Math.round(ms / 60000))} 分鐘內）`;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/** 最小 zip 讀取器（只支援 stored／deflate、非 zip64；規格審查材料 zip 夠用）*/
export function readZip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('下載內容不是有效的 zip 檔');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 目錄毀損');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const lhName = buf.readUInt16LE(lho + 26);
    const lhExtra = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lhName + lhExtra;
    const raw = buf.subarray(start, start + csize);
    if (method === 0) out.push({ name, data: Buffer.from(raw) });
    else if (method === 8) out.push({ name, data: inflateRawSync(raw) });
    else throw new Error(`zip 內有不支援的壓縮方式（${method}）：${name}`);
  }
  return out;
}

export interface TextFileInput {
  name: string;
  content: string;
}

/** upload_spec_text 的前置驗證；回傳錯誤訊息或 null */
export function validateTextFiles(files: TextFileInput[]): string | null {
  if (files.length < 1) return '請至少提供 1 個檔案';
  const seen = new Set<string>();
  let total = 0;
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.md')) return `${f.name} 不是 .md；upload_spec_text 只收 .md`;
    const key = f.name.toLowerCase();
    if (seen.has(key)) return `同一次上傳有重複檔名：${f.name}`;
    seen.add(key);
    const size = Buffer.byteLength(f.content, 'utf8');
    if (size > MAX_TEXT_FILE_BYTES) return `${f.name} 超過 512 KB，請改用 request_spec_upload 上傳`;
    total += size;
  }
  if (total > MAX_TEXT_TOTAL_BYTES) return '合計超過 1 MB，請改用 request_spec_upload 上傳';
  return null;
}

const SUGGESTED_TOOL: Record<string, string> = {
  submit_pending: 'submit_spec（role 見 action.role）',
  upload_needed: 'request_spec_upload（或 SA／SD 的 upload_spec_text）',
  fix_by_report: 'get_spec_report（onlyMine）→ 本機修改 → request_spec_upload → submit_spec',
  ready_to_scan: '無對應工具：請到網頁按「開始掃描」',
  scan_failed: '無對應工具：請到網頁查看並重新掃描',
  ready_to_release: '無對應工具：請到網頁發布',
};

// ───────────────────────── 共用查詢 ─────────────────────────

async function resolveCaseId(api: ApiClient, a: { caseId?: number; pno?: string; caseCode?: string }): Promise<number> {
  if (a.caseId !== undefined) return a.caseId;
  if (!a.pno || !a.caseCode) throw new Error('請提供 caseId，或同時提供 pno 與 caseCode');
  const q = new URLSearchParams({ pno: a.pno, keyword: a.caseCode, page: '1', pageSize: '20' });
  const resp = await api.get<{ items: any[] }>(`/spec-case/list?${q}`);
  if (!resp.success) throw new Error(resp.message || '查詢案件失敗');
  const hits = (resp.data?.items ?? []).filter((i) => String(i.caseCode).toLowerCase() === a.caseCode!.toLowerCase());
  if (hits.length !== 1) {
    throw new Error(hits.length === 0 ? `專案 ${a.pno} 找不到案件編號 ${a.caseCode}` : `案件編號 ${a.caseCode} 命中多筆，請改用 caseId`);
  }
  return Number(hits[0].caseId);
}

async function getDetail(api: ApiClient, caseId: number): Promise<any> {
  const resp = await api.get(`/spec-case/detail?caseId=${caseId}`);
  if (!resp.success) throw new Error(resp.message || '查詢案件失敗');
  return resp.data;
}

/** 上傳回應：保留後端欄位，但把材料清單縮成檔名（不回傳簽章 url）*/
export function slimUploadResult(d: any): Record<string, unknown> {
  const { materials, ...rest } = d ?? {};
  return Array.isArray(materials) ? { ...rest, files: materials.map((m: any) => m.fileName) } : rest;
}

const caseIdArg = z.number().int().describe('案件 ID（可由 list_my_spec_tasks／get_spec_case 取得）');

// ───────────────────────── HTTP 模式：9 個工具 ─────────────────────────

/** zip 內容解壓到 dir；拒絕跳出目錄的路徑，回傳寫入的相對檔名 */
export async function extractZipTo(buf: Buffer, dir: string): Promise<string[]> {
  const root = resolve(dir);
  const written: string[] = [];
  for (const e of readZip(buf)) {
    const target = resolve(root, e.name);
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`zip 內含不安全的路徑：${e.name}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, e.data);
    written.push(e.name);
  }
  return written;
}

/** 寫入類工具的共用前置：唯讀／頻率限制／專案白名單（有設白名單時先以 caseId 查 pno 再比對）*/
function makeGuarded(api: ApiClient, guard: WriteGuard) {
  return async (tool: string, caseId: number, fn: (pno: string) => Promise<ToolResult>): Promise<ToolResult> => {
    let pno: string | undefined;
    if (guard.hasProjectWhitelist) {
      try {
        pno = String((await getDetail(api, caseId)).pno);
      } catch (err) {
        return fail(translateSpecError(err));
      }
    }
    const blocked = guard.check(tool, pno);
    if (blocked) return fail(blocked);
    return wrap(() => fn(pno ?? '-'));
  };
}

/**
 * 規格審查工具。
 * mode='http'：9 個工具（票券上傳／下載走 spec-case/mcp/*）；
 * mode='stdio'：共用 6 個（list/get/report/read/submit/mark）＋直接下載的 pull_spec_materials，走既有網頁 API（spec-case/*，llp_ token）；
 * 本機上傳 upload_spec_material 由 registerSpecStdioTools 補上。
 */
export function registerSpecReviewTools(server: McpServer, api: ApiClient, guard: WriteGuard, mode: 'http' | 'stdio' = 'http') {
  const stdio = mode === 'stdio';
  const guarded = makeGuarded(api, guard);
  /** 取得某角色材料 zip：http 走下載票券（匿名下載），stdio 走 spec-case/download */
  const fetchMaterialZip = async (caseId: number, role?: string): Promise<Buffer | ToolResult> => {
    if (stdio) {
      const q = new URLSearchParams({ caseId: String(caseId), ...(role ? { role } : {}) });
      return api.getBinary(`/spec-case/download?${q}`);
    }
    const t = await api.post<{ downloadUrl: string }>('/spec-case/mcp/download-ticket', { caseId, kind: 'material', ...(role ? { role } : {}) });
    if (!t.success) return fail(t.message || '取得下載連結失敗');
    const file = await axios.get<ArrayBuffer>(t.data.downloadUrl, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 200 * 1024 * 1024 });
    return Buffer.from(file.data);
  };

  server.tool(
    'list_my_spec_tasks',
    '列出我在規格審查（SA／SD／UIUX 三方交叉比對）的待辦：要上傳、要交件、要依報告修正等。每筆含 kind、urgency、headline 與建議的下一個工具。不帶 pno 時會查我所屬的專案（最多 20 個，需要 lalaleap.read）；只有 spec_review 授權時請帶 pno。',
    { pno: z.string().optional().describe('專案編號；不帶＝查詢我所屬的所有專案') },
    ({ pno }) =>
      wrap(async () => {
        let pnos: string[];
        let truncated = false;
        if (pno) pnos = [pno];
        else {
          let list;
          try {
            list = await api.post<any[]>('/project/list');
          } catch (e) {
            if (axios.isAxiosError(e) && e.response?.status === 403) {
              return fail('無法列出專案：目前授權只有 spec_review。請帶 pno 參數，或重新授權並加上 lalaleap.read。');
            }
            throw e;
          }
          const all = (list.data ?? []).map((p: any) => String(p.pno));
          truncated = all.length > MAX_PROJECTS;
          pnos = all.slice(0, MAX_PROJECTS);
        }
        const todos: any[] = [];
        const waits: any[] = [];
        const errors: { pno: string; message: string }[] = [];
        let okCount = 0;
        let lastErr: unknown;
        for (const p of pnos) {
          try {
            const r = await api.get<{ todos?: any[]; waits?: any[] }>(`/spec-case/todo?pno=${encodeURIComponent(p)}`);
            if (!r.success) throw new Error(r.message);
            okCount++;
            for (const t of r.data?.todos ?? []) {
              todos.push({
                caseId: t.caseId, caseCode: t.caseCode, title: t.title, pno: p, kind: t.kind, urgency: t.urgency,
                headline: t.headline, meta: t.meta, action: t.action, suggestedTool: SUGGESTED_TOOL[t.kind],
              });
            }
            for (const w of r.data?.waits ?? []) waits.push({ pno: p, caseId: w.caseId, caseCode: w.caseCode, title: w.title, text: w.text });
          } catch (e) {
            lastErr = e;
            // 不是該專案成員／未開放：多專案掃描時略過，單專案才當錯誤
            if (pno) throw e;
            errors.push({ pno: p, message: translateSpecError(e) });
          }
        }
        if (!pno && pnos.length > 0 && okCount === 0 && lastErr) throw lastErr;
        const order: Record<string, number> = { urgent: 0, soon: 1, normal: 2 };
        todos.sort((a, b) => (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3));
        const out: Record<string, unknown> = { todos };
        if (waits.length) out.waits = waits;
        if (truncated) out.note = `只查詢前 ${MAX_PROJECTS} 個專案；其他專案請帶 pno 指定。`;
        if (errors.length) out.skipped = errors;
        return ok(out);
      })
  );

  server.tool(
    'get_spec_case',
    '取得規格審查案件詳情：狀態、目前輪次、最新一輪問題數、我的角色、各角色（SA／SD／UX）的交件狀態與檔名、我能做什麼（can）。可用 caseId，或 pno＋caseCode（如 F.2.8）。',
    {
      caseId: z.number().int().optional().describe('案件 ID'),
      pno: z.string().optional().describe('專案編號（用 caseCode 查詢時必填）'),
      caseCode: z.string().optional().describe('案件編號，如 F.2.8（需搭配 pno，必須唯一命中）'),
    },
    (args) =>
      wrap(async () => {
        const caseId = await resolveCaseId(api, args);
        const d = await getDetail(api, caseId);
        return ok({
          caseId: d.caseId, pno: d.pno, caseCode: d.caseCode, title: d.title, status: d.status, dueDate: d.dueDate,
          currentRound: d.currentRound, latestRound: d.latestRound, hasUnscannedChange: d.hasUnscannedChange,
          my: { roles: d.my?.roles ?? [] },
          submissions: (d.submissions ?? []).map((s: any) => ({
            role: s.role, status: s.status, versionNo: s.versionNo, fileCount: s.fileCount, uploadedAt: s.uploadedAt, via: s.via,
            changedSinceScan: s.changedSinceScan,
            files: (s.materials ?? []).map((m: any) => m.fileName), // 不回傳簽章 url
          })),
          can: { upload: d.can?.upload, submit: d.can?.submit, markNa: d.can?.markNa },
        });
      })
  );

  server.tool(
    'get_spec_report',
    '取得掃描報告（用於「依報告修正」）。預設只回與我的角色有關的問題（onlyMine），每題含嚴重度、涉及角色、證據、分析與修正建議。format=markdown 回完整報告 Markdown。',
    {
      caseId: caseIdArg,
      round: z.number().int().optional().describe('輪次；不帶＝最新成功輪'),
      onlyMine: z.boolean().optional().describe('預設 true：只回 parties 含我角色的問題（我沒有 SA／SD／UX 角色時回全部）'),
      format: z.enum(['json', 'markdown']).optional().describe('預設 json；markdown 回報告全文'),
    },
    ({ caseId, round, onlyMine, format }) =>
      wrap(async () => {
        const q = new URLSearchParams({ caseId: String(caseId) });
        if (round !== undefined) q.set('round', String(round));
        const resp = await api.get<any>(`/spec-case/report?${q}`);
        if (!resp.success) return fail(resp.message || '查詢報告失敗');
        const r = resp.data;
        if (format === 'markdown') return ok(String(r.reportMd ?? ''));
        const mine = onlyMine !== false;
        let myRoles: string[] = [];
        let issues: any[] = r.issues ?? [];
        let filtered = false;
        if (mine) {
          const d = await getDetail(api, caseId);
          myRoles = (d.my?.roles ?? []).filter((x: string) => (ROLES as readonly string[]).includes(x));
          if (myRoles.length) {
            issues = issues.filter((i) => (i.parties ?? []).some((p: string) => myRoles.includes(p)));
            filtered = true;
          }
        }
        const count = (arr: any[], s: string) => arr.filter((i) => i.severity === s).length;
        return ok({
          roundNo: r.roundNo, summary: r.summary,
          issues: issues.map((i) => ({
            key: i.key, title: i.title, type: i.type, severity: i.severity, parties: i.parties,
            evidence: i.evidence, analysis: i.analysis, suggestion: i.suggestion,
          })),
          counts: { total: (r.issues ?? []).length, shown: issues.length, blocker: count(issues, 'Blocker'), major: count(issues, 'Major'), minor: count(issues, 'Minor') },
          filteredByMyRoles: filtered ? myRoles : null,
          next: `依建議修改本機文件後，用 ${stdio ? 'upload_spec_material' : 'request_spec_upload'} 上傳、submit_spec 交件；重新掃描需在網頁按「開始掃描」。`,
        });
      })
  );

  if (stdio) {
    server.tool(
      'pull_spec_materials',
      '取料（本機模式）：直接把規格材料（SA／SD 的 .md、UX 截圖）下載並解壓到本機目錄。預設目錄 ./spec-ref/{caseCode}/{role}（不帶 role 為 all，內含 SA／SD／UX 子目錄）；會覆蓋同名檔。若只想看 SA／SD 的 .md 內容，用 read_spec_material。',
      {
        caseId: caseIdArg,
        role: z.enum(ROLES).optional().describe('SA／SD／UX；不帶＝全部角色'),
        outputDir: z.string().optional().describe('目的地目錄；預設 ./spec-ref/{caseCode}/{role}'),
      },
      ({ caseId, role, outputDir }) =>
        wrap(async () => {
          const zip = await fetchMaterialZip(caseId, role);
          if (!Buffer.isBuffer(zip)) return zip;
          let caseCode = String(caseId);
          try {
            caseCode = (await getDetail(api, caseId)).caseCode ?? caseCode;
          } catch {
            /* 只影響預設目錄名 */
          }
          const dir = resolve(outputDir ?? `./spec-ref/${caseCode}/${role ?? 'all'}`);
          const files = await extractZipTo(zip, dir);
          return ok({ outputDir: dir, files, note: '材料已解壓到本機；修改後用 upload_spec_material 上傳、submit_spec 交件。' });
        })
    );
  } else server.tool(
    'pull_spec_materials',
    '取料：取得規格材料（SA／SD 的 .md、UX 截圖）的一次性下載連結與 curl 指令。連結 10 分鐘內有效且只能用一次；請用 shell 執行回傳的 curlCommand 下載 zip 後解壓縮。若只想直接讀 SA／SD 的 .md 內容，改用 read_spec_material。',
    {
      caseId: caseIdArg,
      role: z.enum(ROLES).optional().describe('SA／SD／UX；不帶＝全部角色'),
    },
    ({ caseId, role }) =>
      wrap(async () => {
        const resp = await api.post<{ downloadUrl: string; fileName: string; expiresAt: string }>('/spec-case/mcp/download-ticket', {
          caseId, kind: 'material', ...(role ? { role } : {}),
        });
        if (!resp.success) return fail(resp.message || '取得下載連結失敗');
        let caseCode = String(caseId);
        try {
          caseCode = (await getDetail(api, caseId)).caseCode ?? caseCode;
        } catch {
          /* 只影響建議的解壓目錄 */
        }
        const dir = `./spec-ref/${caseCode}/${role ?? 'all'}`;
        const t = resp.data;
        const ins = buildDownloadInstructions(t.fileName, t.downloadUrl, t.expiresAt, dir);
        return ok({ fileName: t.fileName, expiresAt: t.expiresAt, downloadUrl: t.downloadUrl, ...ins });
      })
  );

  server.tool(
    'read_spec_material',
    '直接讀取 SA／SD 的 .md 內容（不落地、不需 shell）。不帶 fileName＝該角色全部 .md，合計上限 300 KB，超過會截斷並提示改用 pull_spec_materials。',
    {
      caseId: caseIdArg,
      role: z.enum(TEXT_ROLES).describe('SA 或 SD（UX 是截圖，請用 pull_spec_materials）'),
      fileName: z.string().optional().describe('只讀這個檔名；不帶＝全部 .md'),
    },
    ({ caseId, role, fileName }) =>
      wrap(async () => {
        const d = await getDetail(api, caseId);
        const sub = (d.submissions ?? []).find((s: any) => s.role === role);
        const names: string[] = (sub?.materials ?? []).map((m: any) => m.fileName);
        if (!names.length) return fail(`${role} 目前沒有上傳任何材料。`);
        if (fileName && !names.some((n) => n.toLowerCase() === fileName.toLowerCase())) {
          return fail(`${role} 沒有檔案 ${fileName}。現有檔案：${names.join('、')}`);
        }
        if (!stdio) {
          // HTTP：直接用 mcp/material-text 逐檔讀 .md（後端去 BOM、單檔上限 300 KB），不需票券與解壓
          const mats: { materialId: number; fileName: string }[] = (sub?.materials ?? []).filter(
            (m: any) => String(m.fileName).toLowerCase().endsWith('.md') && (!fileName || String(m.fileName).toLowerCase() === fileName.toLowerCase())
          );
          const files: { fileName: string; versionNo: number; content: string; truncated?: boolean }[] = [];
          let used = 0;
          let cut = false;
          for (const m of mats) {
            if (used >= MAX_READ_BYTES) {
              cut = true;
              break;
            }
            const r = await api.get<{ content: string; truncated?: boolean }>(`/spec-case/mcp/material-text?caseId=${caseId}&materialId=${m.materialId}`);
            if (!r.success) return fail(r.message || '讀取失敗');
            let text = r.data.content ?? '';
            let t = !!r.data.truncated;
            if (used + Buffer.byteLength(text, 'utf8') > MAX_READ_BYTES) {
              text = Buffer.from(text, 'utf8').subarray(0, MAX_READ_BYTES - used).toString('utf8');
              t = true;
            }
            used += Buffer.byteLength(text, 'utf8');
            if (t) cut = true;
            files.push({ fileName: m.fileName, versionNo: sub?.versionNo ?? 0, content: text, ...(t ? { truncated: true } : {}) });
          }
          const note = cut ? `內容超過 ${MAX_READ_BYTES / 1024} KB 已截斷；完整檔案請改用 pull_spec_materials 下載。` : undefined;
          return ok(note ? { files, note } : files);
        }
        const zip = await fetchMaterialZip(caseId, role);
        if (!Buffer.isBuffer(zip)) return zip;
        const entries = readZip(zip).filter((e) => e.name.toLowerCase().endsWith('.md'));
        const picked = fileName ? entries.filter((e) => basename(e.name).toLowerCase() === fileName.toLowerCase()) : entries;
        const out: { fileName: string; versionNo: number; content: string; truncated?: boolean }[] = [];
        let used = 0;
        let truncated = false;
        for (const e of picked) {
          const remain = MAX_READ_BYTES - used;
          if (remain <= 0) {
            truncated = true;
            break;
          }
          let text = e.data.toString('utf8').replace(/^﻿/, '');
          let cut = false;
          if (Buffer.byteLength(text, 'utf8') > remain) {
            text = Buffer.from(text, 'utf8').subarray(0, remain).toString('utf8');
            cut = true;
            truncated = true;
          }
          used += Buffer.byteLength(text, 'utf8');
          out.push({ fileName: basename(e.name), versionNo: sub?.versionNo ?? 0, content: text, ...(cut ? { truncated: true } : {}) });
        }
        const note = truncated ? `內容超過 ${MAX_READ_BYTES / 1024} KB 已截斷；完整檔案請改用 pull_spec_materials 下載。` : undefined;
        return ok(note ? { files: out, note } : out);
      })
  );

  if (!stdio) server.tool(
    'request_spec_upload',
    '交件第 1 步：申請一次性上傳連結。回傳可直接執行的 curl 指令範本（遠端 MCP 讀不到你的本機檔案，請由 shell 執行 curl 上傳）；連結 10 分鐘內有效且只能用一次。上傳後要呼叫 submit_spec 才算交件。任何案件成員可替任何角色上傳。mode：預設 append：新檔名加入、同名覆蓋該份、其餘保留；SA／SD 一個章節可分成多份文件分次追加；replace＝取代該角色全部檔案。',
    {
      caseId: caseIdArg,
      role: z.enum(ROLES).describe('要上傳的角色：SA／SD（.md）或 UX（截圖）'),
      mode: z.enum(['replace', 'append']).optional().describe('預設 append：新檔名加入、同名覆蓋該份、其餘保留；SA／SD 一個章節可分成多份文件分次追加；replace＝取代該角色全部檔案'),
    },
    ({ caseId, role, mode }) =>
      guarded('request_spec_upload', caseId, async (pno) => {
        const resp = await api.post<UploadTicket>('/spec-case/mcp/upload-ticket', { caseId, role, mode: mode ?? 'append' });
        if (!resp.success) return fail(resp.message || '申請上傳連結失敗');
        let caseCode: string | undefined;
        try {
          caseCode = (await getDetail(api, caseId)).caseCode;
        } catch {
          /* 只影響範本檔名 */
        }
        const t = resp.data;
        guard.record('request_spec_upload', pno);
        return ok({
          uploadUrl: t.uploadUrl, expiresAt: t.expiresAt, maxFiles: t.maxFiles, allowedExtensions: t.allowedExtensions,
          maxFileSizeMb: t.maxFileSizeMb, ...buildUploadInstructions(t, role, caseCode),
        });
      })
  );

  if (!stdio) server.tool(
    'upload_spec_text',
    '純文字上傳 SA／SD 的 .md（無 shell 的客戶端備援）。注意：優先使用 request_spec_upload＋curl——用本工具必須把整份文件內容再輸出一次，耗 token 且可能改寫內容。每檔 ≤ 512 KB、合計 ≤ 1 MB（檔案數量不限），只收 .md。上傳後要呼叫 submit_spec 才算交件。mode：預設 append：新檔名加入、同名覆蓋該份、其餘保留；SA／SD 一個章節可分成多份文件分次追加；replace＝取代該角色全部檔案。',
    {
      caseId: caseIdArg,
      role: z.enum(TEXT_ROLES).describe('SA 或 SD'),
      files: z.array(z.object({ name: z.string().describe('檔名，須以 .md 結尾'), content: z.string().describe('UTF-8 文字內容') })).describe('至少 1 個檔案（數量不限）'),
      mode: z.enum(['replace', 'append']).optional().describe('預設 append：新檔名加入、同名覆蓋該份、其餘保留；SA／SD 一個章節可分成多份文件分次追加；replace＝取代該角色全部檔案'),
    },
    ({ caseId, role, files, mode }) =>
      guarded('upload_spec_text', caseId, async (pno) => {
        const bad = validateTextFiles(files);
        if (bad) return fail(bad);
        const resp = await api.post('/spec-case/mcp/upload-text', { caseId, role, files, mode: mode ?? 'append' });
        if (!resp.success) return fail(resp.message || '上傳失敗');
        guard.record('upload_spec_text', pno);
        return ok({ ...slimUploadResult(resp.data), next: '已上傳，請呼叫 submit_spec 交件。' });
      })
  );

  server.tool(
    'submit_spec',
    '交件第 2 步：把某角色已上傳的檔案送出。該角色必須已有檔案；已交件再呼叫是冪等。案件狀態只由掃描改變，交件後若至少兩個角色都已交件，請人員到網頁按「開始掃描」。',
    { caseId: caseIdArg, role: z.enum(ROLES).describe('SA／SD／UX') },
    ({ caseId, role }) =>
      guarded('submit_spec', caseId, async (pno) => {
        const resp = await api.post(`/spec-case${stdio ? '' : '/mcp'}/submit`, { caseId, role });
        if (!resp.success) return fail(resp.message || '交件失敗');
        guard.record('submit_spec', pno);
        return ok({ ...resp.data, next: '掃描需由人員在網頁按「開始掃描」（至少兩個角色已交件）。' });
      })
  );

  server.tool(
    'mark_spec_not_applicable',
    '標記或取消某角色「本案不適用」（例如沒有畫面變更就把 UX 標為不適用）。value=true 標記、false 取消。已標記不適用的角色不能上傳或交件，需先取消。',
    { caseId: caseIdArg, role: z.enum(ROLES).describe('SA／SD／UX'), value: z.boolean().describe('true＝標記不適用；false＝取消') },
    ({ caseId, role, value }) =>
      guarded('mark_spec_not_applicable', caseId, async (pno) => {
        const resp = await api.post(`/spec-case${stdio ? '' : '/mcp'}/not-applicable`, { caseId, role, value });
        if (!resp.success) return fail(resp.message || '操作失敗');
        guard.record('mark_spec_not_applicable', pno);
        return ok(resp.data);
      })
  );
}

// ───────────────────────── stdio 模式：upload_spec_material ─────────────────────────

export function registerSpecStdioTools(server: McpServer, api: ApiClient, guard: WriteGuard) {
  registerSpecReviewTools(server, api, guard, 'stdio');
  const guarded = makeGuarded(api, guard);
  server.tool(
    'upload_spec_material',
    '（本機模式）把本機檔案直接上傳為規格審查材料（不交件）。SA／SD 收 .md；UX 收 png／jpg／jpeg／webp。mode：預設 append：新檔名加入、同名覆蓋該份、其餘保留；SA／SD 一個章節可分成多份文件分次追加；replace＝取代該角色全部檔案。上傳只是收件，上傳後請呼叫 submit_spec 才算交件。',
    {
      caseId: caseIdArg,
      role: z.enum(ROLES).describe('SA／SD／UX'),
      paths: z.array(z.string()).min(1).describe('本機檔案路徑（相對路徑以 MCP 執行目錄為基準）'),
      mode: z.enum(['replace', 'append']).optional().describe('預設 append：新檔名加入、同名覆蓋該份、其餘保留；SA／SD 一個章節可分成多份文件分次追加；replace＝取代該角色全部檔案'),
    },
    async ({ caseId, role, paths, mode }) => {
      return guarded('upload_spec_material', caseId, async (pno) => {
        const form = new FormData();
        form.append('caseId', String(caseId));
        form.append('role', role);
        form.append('mode', mode ?? 'append');
        for (const p of paths) {
          const abs = resolve(p);
          let st;
          try {
            st = await stat(abs);
          } catch {
            return fail(`找不到檔案：${p}`);
          }
          if (!st.isFile()) return fail(`不是檔案：${p}`);
          form.append('files', new Blob([new Uint8Array(await readFile(abs))]), basename(abs));
        }
        const resp = await api.post('/spec-case/upload', form, { 'Content-Type': 'multipart/form-data' });
        if (!resp.success) return fail(resp.message || '上傳失敗');
        guard.record('upload_spec_material', pno);
        return ok({ ...slimUploadResult(resp.data), next: '已上傳但尚未交件，請呼叫 submit_spec 交件。' });
      });
    }
  );
}
