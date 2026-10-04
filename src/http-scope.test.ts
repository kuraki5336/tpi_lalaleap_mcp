// T2：scope 強制（mock AS＋mock 後端 API）
// token 命名：llo_at_u_<sno>_<scopes 以 + 連接>，例 llo_at_u_A_lalaleap.read
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHttpApp } from './http.js';
import type { HttpConfig } from './config.js';
import { TOOL_SCOPES, requiredScopesForBody, hasScopes } from './auth/scope-gate.js';
import { WriteGuard } from './write-guard.js';

const PUBLIC_URL = 'https://mcp.example.test/mcp';
const ISSUER = 'https://as.example.test/ap2/lalaleap/oauth';
const PRM = 'https://mcp.example.test/.well-known/oauth-protected-resource/mcp';

let asServer: Server, apiServer: Server, mcpServer: Server, mcpBase: string;
let apiPaths: string[] = [];

const listen = (s: Server) =>
  new Promise<string>((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
const readBody = (req: http.IncomingMessage) =>
  new Promise<string>((r) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => r(b));
  });

const tok = (sno: string, scopes: string) => `llo_at_u_${sno}_${scopes}`;

before(async () => {
  asServer = http.createServer(async (req, res) => {
    const body = new URLSearchParams(await readBody(req));
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/introspect') {
      const t = body.get('token') ?? '';
      const m = /^llo_at_u_([^_]+)_(.+)$/.exec(t);
      if (!m) return void res.end(JSON.stringify({ active: false }));
      const exp = Math.floor(Date.now() / 1000) + 3600;
      res.end(
        JSON.stringify({
          active: true, client_id: 'c1', scope: m[2].split('+').join(' '), sub: m[1], username: `${m[1]}@x.test`,
          aud: PUBLIC_URL, iss: ISSUER, exp, grant_id: '1',
        })
      );
    } else if (req.url === '/token') {
      res.end(JSON.stringify({ access_token: 'llo_dt_x', token_type: 'Bearer', expires_in: 300 }));
    } else res.writeHead(404).end();
  });
  apiServer = http.createServer(async (req, res) => {
    await readBody(req);
    apiPaths.push(`${req.method} ${req.url}`);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, status: 200, message: 'ok', data: { pno: 'P001', rno: 'R1', name: 'n' } }));
  });
  const asBase = await listen(asServer);
  const apiBase = await listen(apiServer);
  const cfg: HttpConfig = {
    publicUrl: PUBLIC_URL, mcpPath: '/mcp', port: 0, issuer: ISSUER,
    introspectUrl: `${asBase}/introspect`, tokenUrl: `${asBase}/token`,
    rsClientId: 'rs', rsClientSecret: 's', apiUrl: apiBase, apiResource: 'api',
    allowedHosts: ['127.0.0.1', 'mcp.example.test'], allowedOrigins: [],
    readOnly: false, writeRateLimit: 2,
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

const rpc = (token: string, method: string, params: unknown, id: number | string = 1) =>
  fetch(`${mcpBase}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
const call = (token: string, name: string, args: unknown = {}) => rpc(token, 'tools/call', { name, arguments: args });

test('scope 表涵蓋 24 個工具（既有 15＋規格審查 9），lalaleap.write 工具恰為 6 個', () => {
  const names = Object.keys(TOOL_SCOPES);
  assert.equal(names.length, 24);
  assert.equal(names.filter((n) => TOOL_SCOPES[n] === 'spec_review').length, 9);
  assert.deepEqual(names.filter((n) => TOOL_SCOPES[n] === 'lalaleap.write').sort(), [
    'create_bug', 'create_project', 'create_requirement', 'create_todo', 'update_bug', 'update_requirement',
  ]);
});

test('scope 計算：write 隱含 read；read 不隱含 write；batch 取聯集', () => {
  assert.ok(hasScopes(['lalaleap.write'], ['lalaleap.read']));
  assert.ok(!hasScopes(['lalaleap.read'], ['lalaleap.write']));
  assert.deepEqual(
    requiredScopesForBody([
      { method: 'tools/call', params: { name: 'list_bugs' } },
      { method: 'tools/call', params: { name: 'create_bug' } },
    ]),
    ['lalaleap.write']
  );
  assert.deepEqual(requiredScopesForBody({ method: 'resources/read', params: { uri: 'x' } }), ['lalaleap.read']);
  assert.deepEqual(requiredScopesForBody({ method: 'tools/list' }), []);
});

test('只有 read：寫入工具 -> 403 insufficient_scope＋WWW-Authenticate，且不打後端', async () => {
  apiPaths = [];
  const r = await call(tok('A', 'lalaleap.read'), 'create_requirement', { pno: 'P001', title: 't' });
  assert.equal(r.status, 403);
  const h = r.headers.get('www-authenticate')!;
  assert.equal(h, `Bearer error="insufficient_scope", scope="lalaleap.write", resource_metadata="${PRM}"`);
  assert.equal(((await r.json()) as any).error, 'insufficient_scope');
  assert.equal(apiPaths.length, 0);
});

test('只有 read：create_bug 也被擋；讀取工具與 resource 通過', async () => {
  const t = tok('A', 'lalaleap.read');
  assert.equal((await call(t, 'create_bug', { pno: 'P001', title: 't' })).status, 403);
  assert.equal((await call(t, 'list_projects')).status, 200);
  assert.equal((await call(t, 'list_bugs', { pno: 'P001' })).status, 200);
  assert.equal((await rpc(t, 'resources/read', { uri: 'lalaleap://projects' })).status, 200);
});

test('只有 spec_review（無 read）：讀取工具 -> 403 scope=lalaleap.read；resources/read 同', async () => {
  const t = tok('B', 'spec_review');
  const r = await call(t, 'list_projects');
  assert.equal(r.status, 403);
  assert.match(r.headers.get('www-authenticate')!, /scope="lalaleap.read"/);
  assert.equal((await rpc(t, 'resources/read', { uri: 'lalaleap://projects' })).status, 403);
});

test('write 隱含 read：讀取工具通過、寫入工具通過', async () => {
  const t = tok('C', 'lalaleap.write');
  assert.equal((await call(t, 'list_projects')).status, 200);
  const r = await call(t, 'create_project', { name: 'x' });
  assert.equal(r.status, 200);
  assert.ok(apiPaths.some((p) => p.startsWith('POST /project/add')));
});

test('tools/list 對 read-only token 仍回 24 個，描述加註 scope', async () => {
  const r = await rpc(tok('A', 'lalaleap.read'), 'tools/list', {});
  assert.equal(r.status, 200);
  const tools = ((await r.json()) as any).result.tools as { name: string; description: string }[];
  assert.equal(tools.length, 24);
  assert.match(tools.find((t) => t.name === 'create_bug')!.description, /需要 scope：lalaleap\.write/);
  assert.match(tools.find((t) => t.name === 'list_bugs')!.description, /需要 scope：lalaleap\.read/);
});

test('WriteGuard 每位使用者獨立計數（HTTP 整合：上限 2）', async () => {
  const a = tok('UA', 'lalaleap.write');
  const b = tok('UB', 'lalaleap.write');
  const text = async (r: Response) => ((await r.json()) as any).result.content[0].text as string;
  for (let i = 0; i < 2; i++) assert.match(await text(await call(a, 'create_project', { name: `p${i}` })), /專案已建立/);
  assert.match(await text(await call(a, 'create_project', { name: 'p3' })), /頻率限制/);
  assert.match(await text(await call(b, 'create_project', { name: 'q1' })), /專案已建立/, 'B 不受 A 影響');
});

test('WriteGuard 單元：不同 sno 互不影響；未指定 sno 為 stdio 共用鍵', () => {
  const cfg = { apiUrl: 'x', writeRateLimit: 1 };
  const g1 = new WriteGuard(cfg, { sno: 'U1' });
  const g2 = new WriteGuard(cfg, { sno: 'U2' });
  g1.record('create_bug', 'P1');
  assert.ok(g1.check('create_bug', 'P1')?.includes('頻率限制'));
  assert.equal(g2.check('create_bug', 'P1'), null);
  assert.equal(new WriteGuard(cfg, { sno: 'U1' }).getRecentWrites().length, 1, '同一使用者跨請求共用');
  assert.equal(new WriteGuard(cfg).getRecentWrites().length, 0);
});
