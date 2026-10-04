// T6／T7：規格審查 MCP 工具（mock AS＋mock 後端 API）
// token 命名：llo_at_u_<sno>_<scopes 以 + 連接>
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHttpApp } from './http.js';
import type { HttpConfig } from './config.js';
import { ApiClient } from './api-client.js';
import { WriteGuard } from './write-guard.js';
import {
  buildDownloadInstructions, buildUploadInstructions, readZip, translateSpecError, validateTextFiles,
  registerSpecStdioTools,
} from './tools/spec-review.js';
import { TOOL_SCOPES } from './auth/scope-gate.js';

const PUBLIC_URL = 'https://mcp.example.test/mcp';
const ISSUER = 'https://as.example.test/ap2/lalaleap/oauth';
const SPEC_TOOLS = [
  'list_my_spec_tasks', 'get_spec_case', 'get_spec_report', 'pull_spec_materials', 'read_spec_material',
  'request_spec_upload', 'upload_spec_text', 'submit_spec', 'mark_spec_not_applicable',
];

let asServer: Server, apiServer: Server, mcpServer: Server, mcpBase: string, apiBase: string;
type Rec = { method: string; path: string; query: URLSearchParams; body: Buffer; auth?: string; ctype?: string };
type Reply = { status?: number; json?: unknown; raw?: Buffer; headers?: Record<string, string> };
let calls: Rec[] = [];
let routes: Record<string, (r: Rec) => Reply> = {};

const listen = (s: Server) =>
  new Promise<string>((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
const readBody = (req: http.IncomingMessage) =>
  new Promise<Buffer>((r) => {
    const b: Buffer[] = [];
    req.on('data', (c) => b.push(c));
    req.on('end', () => r(Buffer.concat(b)));
  });
const okResp = (data: unknown): Reply => ({ json: { status: 200, message: 'success', success: true, data } });
const badResp = (message: string, code = 'TRNS.SpecRoleNotApplicable'): Reply => ({
  status: 400,
  headers: { 'X-Error-Code': code },
  json: { status: 999, success: false, message: `${message} `, data: `[${code}] ${message} ` },
});

// ── 測試用 zip 產生器（stored＋deflate 各一）──
function crc32(buf: Buffer): number {
  let c, crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function makeZip(files: { name: string; content: Buffer; deflate?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = f.deflate ? deflateRawSync(f.content) : f.content;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(f.deflate ? 8 : 0, 8); lh.writeUInt32LE(crc32(f.content), 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(f.content.length, 22); lh.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([lh, name, data]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(f.deflate ? 8 : 0, 10); ch.writeUInt32LE(crc32(f.content), 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(f.content.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, name]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const tok = (sno: string, scopes: string) => `llo_at_u_${sno}_${scopes}`;
const SPEC = 'spec_review';

before(async () => {
  asServer = http.createServer(async (req, res) => {
    const body = new URLSearchParams((await readBody(req)).toString());
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/introspect') {
      const m = /^llo_at_u_([^_]+)_(.+)$/.exec(body.get('token') ?? '');
      if (!m) return void res.end(JSON.stringify({ active: false }));
      res.end(JSON.stringify({
        active: true, client_id: 'c1', scope: m[2].split('+').join(' '), sub: m[1], username: `${m[1]}@x.test`,
        aud: PUBLIC_URL, iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 3600, grant_id: '1',
      }));
    } else if (req.url === '/token') {
      res.end(JSON.stringify({ access_token: 'llo_dt_x', token_type: 'Bearer', expires_in: 300 }));
    } else res.writeHead(404).end();
  });
  apiServer = http.createServer(async (req, res) => {
    const u = new URL(req.url!, 'http://x');
    const rec: Rec = {
      method: req.method!, path: u.pathname, query: u.searchParams, body: await readBody(req),
      auth: req.headers.authorization, ctype: req.headers['content-type'],
    };
    calls.push(rec);
    const h = routes[`${rec.method} ${rec.path}`];
    const r = h ? h(rec) : { status: 404, json: { success: false, message: 'no route' } };
    if (r.raw) {
      res.writeHead(r.status ?? 200, { 'Content-Type': 'application/zip', ...(r.headers ?? {}) });
      return void res.end(r.raw);
    }
    res.writeHead(r.status ?? 200, { 'Content-Type': 'application/json', ...(r.headers ?? {}) });
    res.end(JSON.stringify(r.json));
  });
  const asBase = await listen(asServer);
  apiBase = await listen(apiServer);
  const cfg: HttpConfig = {
    publicUrl: PUBLIC_URL, mcpPath: '/mcp', port: 0, issuer: ISSUER,
    introspectUrl: `${asBase}/introspect`, tokenUrl: `${asBase}/token`,
    rsClientId: 'rs', rsClientSecret: 's', apiUrl: apiBase, apiResource: 'api',
    allowedHosts: ['127.0.0.1', 'mcp.example.test'], allowedOrigins: [],
    readOnly: false, writeRateLimit: 3,
  };
  mcpServer = http.createServer(createHttpApp(cfg));
  mcpBase = await listen(mcpServer);
});

after(() => {
  for (const s of [asServer, apiServer, mcpServer]) {
    s.close();
    s.closeAllConnections?.();
  }
});

beforeEach(() => {
  calls = [];
  routes = {};
});

const rpc = (token: string, method: string, params: unknown) =>
  fetch(`${mcpBase}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
const call = (token: string, name: string, args: unknown = {}) => rpc(token, 'tools/call', { name, arguments: args });
/** 呼叫工具並取回 result（HTTP 200 的 JSON-RPC）*/
async function tool(token: string, name: string, args: unknown = {}) {
  const r = await call(token, name, args);
  assert.equal(r.status, 200, `${name} HTTP ${r.status}`);
  const j = (await r.json()) as any;
  const text: string = j.result.content[0].text;
  return { isError: !!j.result.isError, text, json: () => JSON.parse(text) };
}

const DETAIL = {
  caseId: 12, pno: 'P001', caseCode: 'F.2.8', title: '新增備註歷程', status: 'reported', dueDate: '2026-10-09',
  currentRound: 3, latestRound: { roundNo: 3, status: 'succeeded', issueCount: 3 }, hasUnscannedChange: false,
  my: { roles: ['SD'], isCaseMember: true },
  submissions: [
    { role: 'SA', status: 'submitted', versionNo: 3, fileCount: 1, uploadedAt: 't', via: 'web', materials: [{ materialId: 1, fileName: 'a.md', url: 'https://secret-signed-url' }] },
    { role: 'SD', status: 'writing', versionNo: 2, fileCount: 2, uploadedAt: 't', via: 'mcp', materials: [{ materialId: 2, fileName: 'b.md', url: 'https://secret' }, { materialId: 3, fileName: 'c.md', url: 'https://secret' }] },
    { role: 'UX', status: 'na', versionNo: 0, fileCount: 0, materials: [] },
  ],
  can: { upload: { SA: true, SD: true, UX: true }, submit: { SA: true, SD: true, UX: true }, markNa: { SA: true, SD: true, UX: true } },
};

// ───────────── scope ─────────────

test('scope：9 個規格審查工具皆需 spec_review，且不在 lalaleap.read/write 內', () => {
  for (const n of SPEC_TOOLS) assert.equal(TOOL_SCOPES[n], SPEC, n);
  assert.equal(TOOL_SCOPES['upload_spec_material'], undefined, 'stdio 專用工具不在 HTTP scope 表');
});

test('scope：只有 lalaleap.read／write 的 token 呼叫任一規格審查工具 -> 403 insufficient_scope scope=spec_review，不打後端', async () => {
  for (const scopes of ['lalaleap.read', 'lalaleap.write']) {
    for (const n of SPEC_TOOLS) {
      const r = await call(tok('S1', scopes), n, { caseId: 1, role: 'SA' });
      assert.equal(r.status, 403, `${scopes} ${n}`);
      assert.match(r.headers.get('www-authenticate')!, /error="insufficient_scope", scope="spec_review"/);
    }
  }
  assert.equal(calls.length, 0);
});

test('scope：spec_review token 通過 scope gate（9 個工具皆 200）；tools/list 描述加註 scope', async () => {
  const t = tok('S2', SPEC);
  routes['GET /spec-case/todo'] = () => okResp({ todos: [] });
  for (const n of SPEC_TOOLS) {
    const r = await call(t, n, { pno: 'P001', caseId: 1, role: 'SA', value: true, files: [] });
    assert.equal(r.status, 200, n);
  }
  const l = (await (await rpc(t, 'tools/list', {})).json()) as any;
  const byName = new Map<string, string>(l.result.tools.map((x: any) => [x.name, x.description]));
  for (const n of SPEC_TOOLS) assert.match(byName.get(n)!, /需要 scope：spec_review/);
});

// ───────────── 唯讀工具 ─────────────

test('list_my_spec_tasks：帶 pno 只查該專案；附 suggestedTool', async () => {
  routes['GET /spec-case/todo'] = (r) => okResp({
    todos: [{ caseId: 12, caseCode: 'F.2.8', title: 't', kind: 'fix_by_report', urgency: 'urgent', headline: 'h', meta: 'm', action: { type: 'download_report', round: 3 } }],
    waits: [{ caseId: 9, caseCode: 'F.1', title: 'x', text: 'SD（交件）' }],
  });
  const r = await tool(tok('A1', SPEC), 'list_my_spec_tasks', { pno: 'P001' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query.get('pno'), 'P001');
  assert.ok(calls[0].auth?.startsWith('Bearer llo_dt_'));
  const j = r.json();
  assert.equal(j.todos[0].pno, 'P001');
  assert.equal(j.todos[0].caseCode, 'F.2.8');
  assert.match(j.todos[0].suggestedTool, /get_spec_report/);
  assert.equal(j.waits[0].caseCode, 'F.1');
});

test('list_my_spec_tasks：不帶 pno 依序查 project/list 專案並合併、依急迫度排序；單一專案失敗只略過', async () => {
  routes['POST /project/list'] = () => okResp([{ pno: 'P1' }, { pno: 'P2' }, { pno: 'P3' }]);
  routes['GET /spec-case/todo'] = (r) => {
    const p = r.query.get('pno');
    if (p === 'P3') return badResp('你不是此專案成員', 'TRNS.NotProjectMember');
    return okResp({ todos: [{ caseId: p === 'P1' ? 1 : 2, caseCode: p, title: p, kind: 'upload_needed', urgency: p === 'P1' ? 'normal' : 'urgent' }] });
  };
  const j = (await tool(tok('A2', `${SPEC}+lalaleap.read`), 'list_my_spec_tasks')).json();
  assert.deepEqual(j.todos.map((t: any) => t.pno), ['P2', 'P1']);
  assert.equal(j.skipped.length, 1);
  assert.equal(j.skipped[0].pno, 'P3');
});

test('list_my_spec_tasks：只有 spec_review 且不帶 pno -> project/list 403 時給可行動說明', async () => {
  routes['POST /project/list'] = () => ({ status: 403, json: { error: 'MCP_ENDPOINT_NOT_ALLOWED' } });
  const r = await tool(tok('A3', SPEC), 'list_my_spec_tasks');
  assert.ok(r.isError);
  assert.match(r.text, /帶 pno/);
  assert.match(r.text, /lalaleap\.read/);
});

test('get_spec_case：caseCode 唯一命中 -> detail；輸出不含簽章 url，帶檔名與 can', async () => {
  routes['GET /spec-case/list'] = (r) => okResp({ items: [{ caseId: 12, caseCode: 'F.2.8' }, { caseId: 13, caseCode: 'F.2.80' }] });
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  const r = await tool(tok('A4', SPEC), 'get_spec_case', { pno: 'P001', caseCode: 'f.2.8' });
  assert.equal(calls[0].query.get('keyword'), 'f.2.8');
  assert.equal(calls[1].query.get('caseId'), '12');
  assert.ok(!r.text.includes('secret'), '不得洩漏簽章網址');
  const j = r.json();
  assert.deepEqual(j.my.roles, ['SD']);
  assert.deepEqual(j.submissions[1].files, ['b.md', 'c.md']);
  assert.equal(j.submissions[1].via, 'mcp');
  assert.equal(j.can.upload.SA, true);
  assert.equal(j.latestRound.roundNo, 3);
});

test('get_spec_case：caseCode 找不到／缺 pno 皆回可讀錯誤', async () => {
  routes['GET /spec-case/list'] = () => okResp({ items: [] });
  const a = await tool(tok('A5', SPEC), 'get_spec_case', { pno: 'P001', caseCode: 'Z.9' });
  assert.ok(a.isError);
  assert.match(a.text, /找不到案件編號 Z\.9/);
  const b = await tool(tok('A5', SPEC), 'get_spec_case', { caseCode: 'Z.9' });
  assert.ok(b.isError);
  assert.match(b.text, /pno/);
});

const REPORT = {
  roundNo: 3, summary: 's', reportMd: '# 第 3 輪報告\n內容',
  issues: [
    { key: 'R3-01', title: 'a', type: '缺漏', severity: 'Blocker', parties: ['SA', 'SD'], evidence: { SA: 'x' }, analysis: 'an', suggestion: 'su' },
    { key: 'R3-02', title: 'b', type: '缺漏', severity: 'Major', parties: ['UX'], evidence: {}, analysis: '', suggestion: '' },
    { key: 'R3-03', title: 'c', type: '缺漏', severity: 'Minor', parties: ['SD'], evidence: {}, analysis: '', suggestion: '' },
  ],
};

test('get_spec_report：預設 onlyMine 依我的角色（SD）過濾；onlyMine=false 回全部；counts 正確', async () => {
  routes['GET /spec-case/report'] = () => okResp(REPORT);
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  const mine = (await tool(tok('B1', SPEC), 'get_spec_report', { caseId: 12 })).json();
  assert.deepEqual(mine.issues.map((i: any) => i.key), ['R3-01', 'R3-03']);
  assert.deepEqual(mine.counts, { total: 3, shown: 2, blocker: 1, major: 0, minor: 1 });
  assert.deepEqual(mine.filteredByMyRoles, ['SD']);
  const all = (await tool(tok('B1', SPEC), 'get_spec_report', { caseId: 12, round: 2, onlyMine: false })).json();
  assert.equal(all.issues.length, 3);
  assert.equal(calls.filter((c) => c.path === '/spec-case/report').at(-1)!.query.get('round'), '2');
});

test('get_spec_report：format=markdown 回報告全文', async () => {
  routes['GET /spec-case/report'] = () => okResp(REPORT);
  const r = await tool(tok('B2', SPEC), 'get_spec_report', { caseId: 12, format: 'markdown' });
  assert.equal(r.text, '# 第 3 輪報告\n內容');
});

test('get_spec_report：後端 400 SPEC_REPORT_NOT_FOUND 訊息原樣（trim）帶出', async () => {
  routes['GET /spec-case/report'] = () => badResp('找不到第 9 輪報告', 'TRNS.DataNotFound');
  const r = await tool(tok('B3', SPEC), 'get_spec_report', { caseId: 12, round: 9, onlyMine: false });
  assert.ok(r.isError);
  assert.match(r.text, /找不到第 9 輪報告$/);
});

test('pull_spec_materials：回傳下載連結、curl 與解壓指令範本；POST body 正確', async () => {
  const exp = new Date(Date.now() + 600_000).toISOString();
  routes['POST /spec-case/mcp/download-ticket'] = () => okResp({
    downloadUrl: 'https://x.test/ap2/lalaleap/spec-case/ticket/download?t=llo_ft_abc', fileName: 'F.2.8_SD_v4.zip', expiresAt: exp,
  });
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  const j = (await tool(tok('C1', SPEC), 'pull_spec_materials', { caseId: 12, role: 'SD' })).json();
  assert.deepEqual(JSON.parse(calls[0].body.toString()), { caseId: 12, kind: 'material', role: 'SD' });
  assert.equal(j.curlCommand, 'curl -fSL -o "F.2.8_SD_v4.zip" "https://x.test/ap2/lalaleap/spec-case/ticket/download?t=llo_ft_abc"');
  assert.match(j.extractCommand, /unzip -o "F\.2\.8_SD_v4\.zip" -d "\.\/spec-ref\/F\.2\.8\/SD"/);
  assert.match(j.instructions, /只能用一次/);
  assert.match(j.instructions, /約 (9|10) 分鐘/);
  assert.equal(j.expiresAt, exp);
});

test('pull_spec_materials：不帶 role 不送 role；無材料 400 訊息帶出', async () => {
  routes['POST /spec-case/mcp/download-ticket'] = () => badResp('目前沒有可下載的材料', 'TRNS.DataError');
  const r = await tool(tok('C2', SPEC), 'pull_spec_materials', { caseId: 12 });
  assert.deepEqual(JSON.parse(calls[0].body.toString()), { caseId: 12, kind: 'material' });
  assert.ok(r.isError);
  assert.match(r.text, /目前沒有可下載的材料/);
});

test('read_spec_material（HTTP）：用 mcp/material-text 逐檔讀 .md；不打票券與 zip', async () => {
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  routes['GET /spec-case/mcp/material-text'] = (r) => okResp({ materialId: Number(r.query.get('materialId')), content: r.query.get('materialId') === '2' ? '# B 文件\n中文內容' : '# C', truncated: false });
  const j = (await tool(tok('D1', SPEC), 'read_spec_material', { caseId: 12, role: 'SD' })).json();
  assert.deepEqual(j.map((f: any) => f.fileName), ['b.md', 'c.md']);
  assert.equal(j[0].content, '# B 文件\n中文內容');
  assert.equal(j[0].versionNo, 2);
  const mt = calls.filter((c) => c.path === '/spec-case/mcp/material-text');
  assert.deepEqual(mt.map((c) => c.query.get('materialId')), ['2', '3']);
  assert.equal(mt[0].query.get('caseId'), '12');
  assert.ok(mt[0].auth?.startsWith('Bearer llo_dt_'));
  assert.ok(!calls.some((c) => c.path.includes('download')), '不需下載票券');
  const one = (await tool(tok('D1', SPEC), 'read_spec_material', { caseId: 12, role: 'SD', fileName: 'C.MD' })).json();
  assert.deepEqual(one.map((f: any) => f.fileName), ['c.md']);
});

test('read_spec_material（HTTP）：超過 300 KB 截斷並提示改用 pull_spec_materials；不存在的檔名／無材料給說明', async () => {
  const big = 'a'.repeat(200 * 1024);
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  routes['GET /spec-case/mcp/material-text'] = () => okResp({ content: big, truncated: false });
  const j = (await tool(tok('D2', SPEC), 'read_spec_material', { caseId: 12, role: 'SD' })).json();
  assert.match(j.note, /pull_spec_materials/);
  assert.equal(j.files.length, 2);
  assert.equal(j.files[1].truncated, true);
  const missing = await tool(tok('D2', SPEC), 'read_spec_material', { caseId: 12, role: 'SD', fileName: 'zzz.md' });
  assert.ok(missing.isError);
  assert.match(missing.text, /沒有檔案 zzz\.md.*b\.md、c\.md/);
  routes['GET /spec-case/detail'] = () => okResp({ ...DETAIL, submissions: [{ role: 'SA', materials: [] }] });
  const none = await tool(tok('D2', SPEC), 'read_spec_material', { caseId: 12, role: 'SA' });
  assert.ok(none.isError);
  assert.match(none.text, /沒有上傳/);
});

test('錯誤轉譯：TRNS.SpecTicketInvalid', () => {
  const e: any = new Error('x');
  e.isAxiosError = true;
  e.response = { status: 400, data: { message: '連結已過期或已使用，請重新索取 ', data: '[TRNS.SpecTicketInvalid] ...' }, headers: {} };
  assert.match(translateSpecError(e), /重新呼叫 request_spec_upload／pull_spec_materials/);
});

test('read_spec_material：role=UX 被 schema 拒絕（只收 SA／SD）', async () => {
  const r = await call(tok('D3', SPEC), 'read_spec_material', { caseId: 12, role: 'UX' });
  const j = (await r.json()) as any;
  assert.ok(j.result.isError || j.error, '應拒絕 UX');
  assert.equal(calls.length, 0);
});

// ───────────── 寫入工具 ─────────────

test('request_spec_upload：回傳完整 curl 範本、有效期、副檔名；預設 mode=replace', async () => {
  const exp = new Date(Date.now() + 600_000).toISOString();
  routes['POST /spec-case/mcp/upload-ticket'] = () => okResp({
    uploadUrl: 'https://x.test/ap2/lalaleap/spec-case/ticket/upload?t=llo_ft_up', expiresAt: exp, maxFiles: null, allowedExtensions: ['.md'], maxFileSizeMb: 50,
  });
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  const j = (await tool(tok('E1', SPEC), 'request_spec_upload', { caseId: 12, role: 'SA' })).json();
  assert.deepEqual(JSON.parse(calls[0].body.toString()), { caseId: 12, role: 'SA', mode: 'replace' });
  assert.equal(j.curlCommand, 'curl -fS -X POST -F "files=@./docs/F.2.8.md" "https://x.test/ap2/lalaleap/spec-case/ticket/upload?t=llo_ft_up"');
  assert.equal(j.uploadUrl, 'https://x.test/ap2/lalaleap/spec-case/ticket/upload?t=llo_ft_up');
  assert.equal(j.maxFiles, null);
  assert.doesNotMatch(j.instructions, /最多 \d+ 檔/, '檔案數量不限，不可出現數量上限');
  assert.deepEqual(j.allowedExtensions, ['.md']);
  assert.match(j.instructions, /約 (9|10) 分鐘/);
  assert.match(j.instructions, /只能用一次/);
  assert.match(j.instructions, /submit_spec/);
  assert.match(j.instructions, /upload_spec_text/);
});

test('request_spec_upload：UX＋append 轉送；範本用圖片副檔名', async () => {
  routes['POST /spec-case/mcp/upload-ticket'] = () => okResp({ uploadUrl: 'https://x/u?t=1', expiresAt: new Date(Date.now() + 1000).toISOString(), maxFiles: 30, allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp'] });
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  const j = (await tool(tok('E2', SPEC), 'request_spec_upload', { caseId: 12, role: 'UX', mode: 'append' })).json();
  assert.equal(JSON.parse(calls[0].body.toString()).mode, 'append');
  assert.match(j.curlCommand, /files=@\.\/screens\/F\.2\.8-1\.png/);
});

test('錯誤碼轉譯：TRNS.SpecRoleNotApplicable／checking／已發布／非案件成員／AI_ZONE_ACCESS_DENIED／票券失效', async () => {
  const t = tok('E3', SPEC);
  routes['POST /spec-case/mcp/upload-ticket'] = () => badResp('此角色已標記為本案不適用，請先取消不適用', 'TRNS.SpecRoleNotApplicable');
  let r = await tool(t, 'request_spec_upload', { caseId: 12, role: 'UX' });
  assert.ok(r.isError);
  assert.match(r.text, /mark_spec_not_applicable.*value=false/);

  routes['POST /spec-case/mcp/upload-ticket'] = () => badResp('AI 掃描中，請等掃描完成後再操作', 'TRNS.DataError');
  r = await tool(t, 'request_spec_upload', { caseId: 12, role: 'SA' });
  assert.match(r.text, /AI 掃描中，請等掃描完成後再操作。掃描完成後才能/);

  routes['POST /spec-case/mcp/submit'] = () => badResp('案件已發布，無法再修改', 'TRNS.DataError');
  r = await tool(t, 'submit_spec', { caseId: 12, role: 'SA' });
  assert.match(r.text, /已發布的案件不能再/);

  routes['POST /spec-case/mcp/submit'] = () => badResp('只有案件成員可以執行此操作', 'TRNS.Forbidden');
  r = await tool(t, 'submit_spec', { caseId: 12, role: 'SA' });
  assert.match(r.text, /被指派為該案件/);

  routes['POST /spec-case/mcp/submit'] = () => badResp('請先上傳檔案再交件', 'TRNS.DataError');
  r = await tool(t, 'submit_spec', { caseId: 12, role: 'SA' });
  assert.match(r.text, /request_spec_upload/);

  routes['POST /spec-case/mcp/not-applicable'] = () => ({ status: 403, json: { error: 'AI_ZONE_ACCESS_DENIED' } });
  r = await tool(t, 'mark_spec_not_applicable', { caseId: 12, role: 'UX', value: true });
  assert.ok(r.isError);
  assert.match(r.text, /你的帳號不在規格審查開放範圍/);

  routes['POST /spec-case/mcp/download-ticket'] = () => badResp('連結已過期或已使用，請重新索取', 'TRNS.DataError');
  r = await tool(t, 'pull_spec_materials', { caseId: 12 });
  assert.match(r.text, /重新呼叫 request_spec_upload 或 pull_spec_materials/);
});

test('錯誤碼轉譯：純函式（無回應的錯誤、未知碼原樣、insufficient_scope）', () => {
  assert.equal(translateSpecError(new Error('授權已失效，請在 /mcp 重新認證')), '授權已失效，請在 /mcp 重新認證');
  const mk = (status: number, data: unknown, hdr: Record<string, string> = {}) => {
    const e: any = new Error('x');
    e.isAxiosError = true;
    e.response = { status, data, headers: hdr };
    return e;
  };
  assert.equal(translateSpecError(mk(400, { message: '某訊息 ', data: '[TRNS.Unknown] 某訊息 ' })), '規格審查操作失敗：某訊息');
  assert.match(translateSpecError(mk(403, { error: 'insufficient_scope' })), /重新認證並勾選 spec_review/);
  assert.match(translateSpecError(mk(400, { message: 'm', data: '[TRNS.SpecConcurrentEdit] m ' })), /稍後重試/);
});

test('upload_spec_text：成功 -> 轉送 body、提示 submit_spec；前置驗證不打後端', async () => {
  routes['POST /spec-case/mcp/upload-text'] = () => okResp({ role: 'SA', versionNo: 0, status: 'writing', caseStatus: 'collect' });
  const files = [{ name: 'F.2.8.md', content: '# 中文\n內容' }];
  const j = (await tool(tok('F1', SPEC), 'upload_spec_text', { caseId: 12, role: 'SA', files })).json();
  assert.deepEqual(JSON.parse(calls[0].body.toString()), { caseId: 12, role: 'SA', files });
  assert.equal(j.status, 'writing');
  assert.match(j.next, /submit_spec/);

  calls = [];
  for (const [f, re] of [
    [[{ name: 'a.txt', content: 'x' }], /只收 \.md/],
    [[{ name: 'a.md', content: 'x'.repeat(513 * 1024) }], /超過 512 KB.*request_spec_upload/],
    [[{ name: 'a.md', content: 'x' }, { name: 'A.MD', content: 'y' }], /重複檔名/],
    [[], /至少提供 1 個/],
  ] as [any[], RegExp][]) {
    const r = await tool(tok('F1', SPEC), 'upload_spec_text', { caseId: 12, role: 'SA', files: f });
    assert.ok(r.isError);
    assert.match(r.text, re);
  }
  assert.equal(calls.length, 0);
  const ux = await call(tok('F1', SPEC), 'upload_spec_text', { caseId: 12, role: 'UX', files });
  const uj = (await ux.json()) as any;
  assert.ok(uj.result?.isError || uj.error, 'UX 被 schema 拒絕');
  assert.equal(calls.length, 0);
});

test('upload_spec_text：合計超過 1 MB 被擋', () => {
  const f = (n: string) => ({ name: n, content: 'x'.repeat(400 * 1024) });
  assert.match(validateTextFiles([f('a.md'), f('b.md'), f('c.md')])!, /1 MB/);
  assert.equal(validateTextFiles([f('a.md'), f('b.md')]), null);
});

test('submit_spec／mark_spec_not_applicable：轉送正確 body 與輸出', async () => {
  routes['POST /spec-case/mcp/submit'] = () => okResp({ role: 'SA', status: 'submitted', versionNo: 3 });
  routes['POST /spec-case/mcp/not-applicable'] = () => okResp({ role: 'UX', status: 'na', caseStatus: 'collect' });
  const s = (await tool(tok('G1', SPEC), 'submit_spec', { caseId: 12, role: 'SA' })).json();
  assert.deepEqual(JSON.parse(calls[0].body.toString()), { caseId: 12, role: 'SA' });
  assert.equal(s.status, 'submitted');
  assert.match(s.next, /開始掃描/);
  const n = (await tool(tok('G1', SPEC), 'mark_spec_not_applicable', { caseId: 12, role: 'UX', value: true })).json();
  assert.deepEqual(JSON.parse(calls[1].body.toString()), { caseId: 12, role: 'UX', value: true });
  assert.equal(n.status, 'na');
});

test('WriteGuard：規格審查寫入類工具每位使用者每分鐘 3 次（上限）；讀取工具不受限；另一位使用者不受影響', async () => {
  routes['POST /spec-case/mcp/submit'] = () => okResp({ role: 'SA', status: 'submitted', versionNo: 1 });
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  const a = tok('GW1', SPEC);
  for (let i = 0; i < 3; i++) assert.equal((await tool(a, 'submit_spec', { caseId: 12, role: 'SA' })).isError, false);
  const blocked = await tool(a, 'submit_spec', { caseId: 12, role: 'SA' });
  assert.ok(blocked.isError);
  assert.match(blocked.text, /頻率限制/);
  assert.equal((await tool(a, 'get_spec_case', { caseId: 12 })).isError, false);
  assert.equal((await tool(tok('GW2', SPEC), 'submit_spec', { caseId: 12, role: 'SA' })).isError, false);
});

// ───────────── 純函式 ─────────────

test('buildUploadInstructions／buildDownloadInstructions：範本內容', () => {
  const u = buildUploadInstructions({ uploadUrl: 'U', expiresAt: new Date(Date.now() + 600000).toISOString(), maxFiles: 3, allowedExtensions: ['.md'] }, 'SD', 'F.1');
  assert.equal(u.curlCommand, 'curl -fS -X POST -F "files=@./docs/F.1.md" "U"');
  assert.match(u.instructions, /最多 3 檔/);
  const un = buildUploadInstructions({ uploadUrl: 'U', expiresAt: new Date(Date.now() + 600000).toISOString(), maxFiles: null, allowedExtensions: ['.md'] }, 'SD', 'F.1');
  assert.doesNotMatch(un.instructions, /最多/);
  const d = buildDownloadInstructions('r.md', 'D', 'bad-date', './out');
  assert.equal(d.curlCommand, 'curl -fSL -o "r.md" "D"');
  assert.equal(d.extractCommand, undefined, '非 zip 不給解壓指令');
});

test('readZip：stored／deflate／中文檔名／目錄略過；非 zip 丟錯', () => {
  const z = makeZip([{ name: 'dir/', content: Buffer.alloc(0) }, { name: 'SA/需求.md', content: Buffer.from('哈囉'), deflate: true }, { name: 'x.md', content: Buffer.from('y') }]);
  const e = readZip(z);
  assert.deepEqual(e.map((x) => [x.name, x.data.toString()]), [['SA/需求.md', '哈囉'], ['x.md', 'y']]);
  assert.throws(() => readZip(Buffer.from('not a zip at all, definitely not')), /不是有效的 zip/);
});

// ───────────── stdio：upload_spec_material ─────────────

async function stdioClient(guardCfg: { apiUrl: string; writeRateLimit: number; allowedProjects?: string[] } = { apiUrl: apiBase, writeRateLimit: 10 }) {
  const api = new ApiClient({ apiUrl: apiBase, apiToken: 'llp_testtoken' });
  await api.initialize();
  const server = new McpServer({ name: 't', version: '0' });
  registerSpecStdioTools(server, api, new WriteGuard(guardCfg));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '0' });
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}

test('stdio upload_spec_material：讀本機檔案以 multipart 上傳到 spec-case/upload（llp_ Bearer）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'spec-up-'));
  const f1 = join(dir, 'F.2.8.md');
  const f2 = join(dir, '補充.md');
  writeFileSync(f1, '# 主文件\n中文');
  writeFileSync(f2, '# 補充');
  routes['POST /spec-case/upload'] = () => okResp({ role: 'SA', versionNo: 0, status: 'writing', caseStatus: 'collect', materials: [{ fileName: 'F.2.8.md' }, { fileName: '補充.md' }] });
  const client = await stdioClient();
  const names = (await client.listTools()).tools.map((t) => t.name);
  assert.deepEqual([...names].sort(), ['get_spec_case', 'get_spec_report', 'list_my_spec_tasks', 'mark_spec_not_applicable', 'pull_spec_materials', 'read_spec_material', 'submit_spec', 'upload_spec_material']);
  const res: any = await client.callTool({ name: 'upload_spec_material', arguments: { caseId: 12, role: 'SA', paths: [f1, f2] } });
  assert.ok(!res.isError, res.content[0].text);
  const out = JSON.parse(res.content[0].text);
  assert.deepEqual(out.files, ['F.2.8.md', '補充.md']);
  assert.match(out.next, /交件/);
  const c = calls[0];
  assert.equal(c.auth, 'Bearer llp_testtoken');
  assert.match(c.ctype ?? '', /^multipart\/form-data; boundary=/);
  const body = c.body.toString('utf8');
  assert.match(body, /name="caseId"\r\n\r\n12/);
  assert.match(body, /name="role"\r\n\r\nSA/);
  assert.match(body, /name="mode"\r\n\r\nreplace/);
  assert.equal((body.match(/name="files"; filename=/g) ?? []).length, 2);
  assert.ok(body.includes('# 主文件\n中文'));
  assert.ok(body.includes('F.2.8.md') && body.includes('補充.md'));
});

test('stdio upload_spec_material：檔案不存在、後端錯誤皆轉成可讀訊息；不打後端', async () => {
  const client = await stdioClient();
  let res: any = await client.callTool({ name: 'upload_spec_material', arguments: { caseId: 12, role: 'SA', paths: ['/nonexistent/zzz.md'] } });
  assert.ok(res.isError);
  assert.match(res.content[0].text, /找不到檔案：\/nonexistent\/zzz\.md/);
  assert.equal(calls.length, 0);

  const dir = mkdtempSync(join(tmpdir(), 'spec-up-'));
  mkdirSync(join(dir, 'sub'));
  const f = join(dir, 'a.md');
  writeFileSync(f, 'x');
  routes['POST /spec-case/upload'] = () => badResp('AI 掃描中，請等掃描完成後再操作', 'TRNS.DataError');
  res = await client.callTool({ name: 'upload_spec_material', arguments: { caseId: 12, role: 'SA', paths: [f] } });
  assert.ok(res.isError);
  assert.match(res.content[0].text, /AI 掃描中/);
});

test('stdio 全套：list/get/report/submit/mark 走既有 spec-case/* 並用 llp_ token（不碰 spec-case/mcp/*）', async () => {
  routes['GET /spec-case/todo'] = () => okResp({ todos: [{ caseId: 1, caseCode: 'A', kind: 'upload_needed', urgency: 'normal' }] });
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  routes['GET /spec-case/report'] = () => okResp(REPORT);
  routes['POST /spec-case/submit'] = () => okResp({ role: 'SA', status: 'submitted', versionNo: 1 });
  routes['POST /spec-case/not-applicable'] = () => okResp({ role: 'UX', status: 'na', caseStatus: 'collect' });
  const client = await stdioClient();
  const txt = async (name: string, args: any) => {
    const r: any = await client.callTool({ name, arguments: args });
    assert.ok(!r.isError, `${name}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  assert.equal((await txt('list_my_spec_tasks', { pno: 'P001' })).todos[0].caseCode, 'A');
  assert.equal((await txt('get_spec_case', { caseId: 12 })).caseCode, 'F.2.8');
  const rep = await txt('get_spec_report', { caseId: 12 });
  assert.match(rep.next, /upload_spec_material/);
  assert.equal((await txt('submit_spec', { caseId: 12, role: 'SA' })).status, 'submitted');
  assert.equal((await txt('mark_spec_not_applicable', { caseId: 12, role: 'UX', value: true })).status, 'na');
  assert.ok(calls.every((c) => !c.path.includes('/mcp/')));
  assert.ok(calls.every((c) => c.auth === 'Bearer llp_testtoken'));
});

test('stdio pull_spec_materials：下載 spec-case/download 並解壓到指定目錄；拒絕 zip 路徑穿越', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'spec-pull-'));
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  routes['GET /spec-case/download'] = () => ({ raw: makeZip([{ name: 'b.md', content: Buffer.from('# B'), deflate: true }, { name: 'sub/c.md', content: Buffer.from('哈囉') }]) });
  const client = await stdioClient();
  const r: any = await client.callTool({ name: 'pull_spec_materials', arguments: { caseId: 12, role: 'SD', outputDir: dir } });
  assert.ok(!r.isError, r.content[0].text);
  const j = JSON.parse(r.content[0].text);
  assert.deepEqual(j.files, ['b.md', 'sub/c.md']);
  assert.equal(readFileSync(join(dir, 'b.md'), 'utf8'), '# B');
  assert.equal(readFileSync(join(dir, 'sub', 'c.md'), 'utf8'), '哈囉');
  const dl = calls.find((c) => c.path === '/spec-case/download')!;
  assert.equal(dl.query.get('caseId'), '12');
  assert.equal(dl.query.get('role'), 'SD');
  assert.equal(dl.auth, 'Bearer llp_testtoken');

  routes['GET /spec-case/download'] = () => ({ raw: makeZip([{ name: '../evil.md', content: Buffer.from('x') }]) });
  const bad: any = await client.callTool({ name: 'pull_spec_materials', arguments: { caseId: 12, outputDir: join(dir, 'safe') } });
  assert.ok(bad.isError);
  assert.match(bad.content[0].text, /不安全的路徑/);
});

test('stdio read_spec_material：走 spec-case/download（不需票券）', async () => {
  routes['GET /spec-case/detail'] = () => okResp(DETAIL);
  routes['GET /spec-case/download'] = () => ({ raw: makeZip([{ name: 'b.md', content: Buffer.from('# B 內容') }]) });
  const client = await stdioClient();
  const r: any = await client.callTool({ name: 'read_spec_material', arguments: { caseId: 12, role: 'SD' } });
  assert.ok(!r.isError, r.content[0].text);
  assert.equal(JSON.parse(r.content[0].text)[0].content, '# B 內容');
  assert.ok(calls.every((c) => !c.path.includes('/mcp/')));
});

test('LALALEAP_ALLOWED_PROJECTS：caseId 類寫入工具先查 detail 取 pno 再比對白名單（stdio）', async () => {
  routes['GET /spec-case/detail'] = () => okResp(DETAIL); // pno = P001
  routes['POST /spec-case/submit'] = () => okResp({ role: 'SA', status: 'submitted', versionNo: 1 });
  routes['POST /spec-case/not-applicable'] = () => okResp({ role: 'UX', status: 'na' });
  routes['POST /spec-case/upload'] = () => okResp({ role: 'SA', status: 'writing' });
  const f = join(mkdtempSync(join(tmpdir(), 'spec-wl-')), 'a.md');
  writeFileSync(f, 'x');
  const denied = await stdioClient({ apiUrl: apiBase, writeRateLimit: 10, allowedProjects: ['OTHER'] });
  for (const [name, args] of [
    ['submit_spec', { caseId: 12, role: 'SA' }],
    ['mark_spec_not_applicable', { caseId: 12, role: 'UX', value: true }],
    ['upload_spec_material', { caseId: 12, role: 'SA', paths: [f] }],
  ] as [string, any][]) {
    const r: any = await denied.callTool({ name, arguments: args });
    assert.ok(r.isError, name);
    assert.match(r.content[0].text, /專案白名單.*P001/, name);
  }
  assert.ok(calls.every((c) => c.method === 'GET'), '被擋時不得送出寫入');
  calls = [];
  const allowed = await stdioClient({ apiUrl: apiBase, writeRateLimit: 10, allowedProjects: ['P001'] });
  const r: any = await allowed.callTool({ name: 'submit_spec', arguments: { caseId: 12, role: 'SA' } });
  assert.ok(!r.isError, r.content[0].text);
  assert.ok(calls.some((c) => c.path === '/spec-case/submit'));
});

test('HTTP 模式未設白名單時，寫入工具不多查 detail', async () => {
  routes['POST /spec-case/submit'] = () => okResp({ role: 'SA', status: 'submitted', versionNo: 1 });
  await tool(tok('WL1', SPEC), 'submit_spec', { caseId: 12, role: 'SA' });
  assert.ok(!calls.some((c) => c.path === '/spec-case/detail'));
});
