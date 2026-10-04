// Scope 對應與 tools/call、resources/read 前置檢查（mcp-server.md §5）
// lalaleap.write 隱含 lalaleap.read；不足時由 http.ts 回 403 insufficient_scope。

export const SCOPE_READ = 'lalaleap.read';
export const SCOPE_WRITE = 'lalaleap.write';
export const SCOPE_SPEC_REVIEW = 'spec_review';

/** HTTP 模式工具所需 scope（既有 15＋規格審查 9；stdio 不使用此表）*/
export const TOOL_SCOPES: Record<string, string> = {
  list_projects: SCOPE_READ,
  get_project_detail: SCOPE_READ,
  list_project_members: SCOPE_READ,
  list_requirements: SCOPE_READ,
  get_requirement_detail: SCOPE_READ,
  list_bugs: SCOPE_READ,
  list_sprints: SCOPE_READ,
  search_tags: SCOPE_READ,
  list_todos: SCOPE_READ,
  create_project: SCOPE_WRITE,
  create_requirement: SCOPE_WRITE,
  update_requirement: SCOPE_WRITE,
  create_bug: SCOPE_WRITE,
  update_bug: SCOPE_WRITE,
  create_todo: SCOPE_WRITE,
  // 規格審查（T6／T7）：HTTP 模式 9 個工具；寫入類另受 WriteGuard 保護，但不需要 lalaleap.write
  list_my_spec_tasks: SCOPE_SPEC_REVIEW,
  get_spec_case: SCOPE_SPEC_REVIEW,
  get_spec_report: SCOPE_SPEC_REVIEW,
  pull_spec_materials: SCOPE_SPEC_REVIEW,
  read_spec_material: SCOPE_SPEC_REVIEW,
  request_spec_upload: SCOPE_SPEC_REVIEW,
  upload_spec_text: SCOPE_SPEC_REVIEW,
  submit_spec: SCOPE_SPEC_REVIEW,
  mark_spec_not_applicable: SCOPE_SPEC_REVIEW,
};

/** resources/read 一律需要 lalaleap.read（projects／project-requirements／-bugs／-sprints／-members）*/
export const RESOURCE_READ_SCOPE = SCOPE_READ;

/** 展開 scope 階層：write 隱含 read */
export function expandScopes(granted: readonly string[]): Set<string> {
  const set = new Set(granted);
  if (set.has(SCOPE_WRITE)) set.add(SCOPE_READ);
  return set;
}

export function hasScopes(granted: readonly string[], required: readonly string[]): boolean {
  const have = expandScopes(granted);
  return required.every((s) => have.has(s));
}

export function toolScope(name: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(TOOL_SCOPES, name) ? TOOL_SCOPES[name] : undefined;
}

/** 單一 JSON-RPC 訊息所需 scope（無需 scope 回空陣列；未知工具交給 MCP 層回 unknown tool）*/
export function requiredScopesForMessage(msg: unknown): string[] {
  if (!msg || typeof msg !== 'object') return [];
  const m = msg as { method?: unknown; params?: { name?: unknown } };
  if (m.method === 'tools/call') {
    const name = m.params?.name;
    const s = typeof name === 'string' ? toolScope(name) : undefined;
    return s ? [s] : [];
  }
  if (m.method === 'resources/read') return [RESOURCE_READ_SCOPE];
  return [];
}

/** 整個請求本體（單筆或 batch）所需 scope 的聯集，維持穩定順序 */
export function requiredScopesForBody(body: unknown): string[] {
  const msgs = Array.isArray(body) ? body : [body];
  const out = new Set<string>();
  for (const m of msgs) for (const s of requiredScopesForMessage(m)) out.add(s);
  // write 已涵蓋 read：只回報最高階，避免客戶端重複請求
  if (out.has(SCOPE_WRITE)) out.delete(SCOPE_READ);
  return [...out];
}

export interface ScopeGateResult {
  ok: boolean;
  /** 本操作需要的全部 scope（不足時用於 WWW-Authenticate scope=）*/
  required: string[];
}

export function checkScopeGate(body: unknown, granted: readonly string[]): ScopeGateResult {
  const required = requiredScopesForBody(body);
  return { ok: hasScopes(granted, required), required };
}

export function insufficientScopeChallenge(required: readonly string[], resourceMetadataUrl: string): string {
  return `Bearer error="insufficient_scope", scope="${required.join(' ')}", resource_metadata="${resourceMetadataUrl}"`;
}

/** 在 tools/list 的描述末尾加註所需 scope（HTTP 模式用）*/
export function withScopeNotes<T extends { tool: (...args: any[]) => any }>(server: T): T {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === 'tool') {
        return (name: string, description: unknown, ...rest: unknown[]) => {
          const scope = toolScope(name);
          const desc = typeof description === 'string' && scope ? `${description}（需要 scope：${scope}）` : description;
          return target.tool(name, desc, ...rest);
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}
