// HTTP（OAuth Resource Server）模式整合測試：mock AS（introspect＋token-exchange）＋mock 後端 API
// 執行：npm run test:http（node:test＋tsx）
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { createHttpApp } from './http.js';
import type { HttpConfig } from './config.js';
import { IntrospectionVerifier } from './auth/introspection-verifier.js';

const PUBLIC_URL = 'https://mcp.example.test/mcp';
const ISSUER = 'https://as.example.test/ap2/lalaleap/oauth';
const GOOD = 'llo_at_goodtoken';
// 快取跨測試共用，需要乾淨狀態的測試用各自的 token
const good = (name: string) => `llo_at_good_${name}`;
const WRONG_AUD = 'llo_at_wrongaud';
const INACTIVE = 'llo_at_inactive';
const WRONG_ISS = 'llo_at_wrongiss';

interface Recorded {
  introspectCalls: number;
  exchangeCalls: number;
  exchangeBodies: URLSearchParams[];
  apiAuthHeaders: (string | undefined)[];
  apiUserNoHeaders: (string | undefined)[];
  basicAuth: (string | undefined)[];
}
const rec: Recorded = {
  introspectCalls: 0,
  exchangeCalls: 0,
  exchangeBodies: [],
  apiAuthHeaders: [],
  apiUserNoHeaders: [],
  basicAuth: [],
};
let asDown = false;
let asServer: Server;
let apiServer: Server;
let mcpServer: Server;
let mcpBase: string;
let apiReject401Once = false;

const exp = () => Math.floor(Date.now() / 1000) + 3600;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });
}

function introspectPayload(token: string) {
  const base = {
    active: true,
    token_type: 'Bearer',
    client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
    scope: 'lalaleap.read offline_access',
    sub: 'S000123',
    username: 'user@example.test',
    aud: PUBLIC_URL,
    iss: ISSUER,
    exp: exp(),
    iat: exp() - 10,
    grant_id: '1',
  };
  if (token === GOOD || token.startsWith('llo_at_good_')) return base;
  if (token === WRONG_AUD) return { ...base, aud: 'https://other.example.test/mcp' };
  if (token === WRONG_ISS) return { ...base, iss: 'https://evil.example.test' };
  return { active: false };
}

before(async () => {
  asServer = http.createServer(async (req, res) => {
    const body = new URLSearchParams(await readBody(req));
    rec.basicAuth.push(req.headers.authorization);
    if (asDown) {
      res.writeHead(503).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/introspect') {
      rec.introspectCalls++;
      res.end(JSON.stringify(introspectPayload(body.get('token') ?? '')));
    } else if (req.url === '/token') {
      rec.exchangeCalls++;
      rec.exchangeBodies.push(body);
      res.end(
        JSON.stringify({
          access_token: `llo_dt_delegated${rec.exchangeCalls}`,
          issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
          token_type: 'Bearer',
          expires_in: 300,
        })
      );
    } else {
      res.writeHead(404).end();
    }
  });
  apiServer = http.createServer(async (req, res) => {
    await readBody(req);
    rec.apiAuthHeaders.push(req.headers.authorization);
    rec.apiUserNoHeaders.push(req.headers['x-userno'] as string | undefined);
    res.setHeader('Content-Type', 'application/json');
    if (apiReject401Once) {
      apiReject401Once = false;
      res.writeHead(401).end(JSON.stringify({ success: false, message: 'unauthorized' }));
      return;
    }
    res.end(
      JSON.stringify({
        success: true,
        status: 200,
        message: 'ok',
        data: [{ pno: 'P001', name: '專案一', secret: 'x' }],
      })
    );
  });
  const asBase = await listen(asServer);
  const apiBase = await listen(apiServer);

  const cfg: HttpConfig = {
    publicUrl: PUBLIC_URL,
    mcpPath: '/mcp',
    port: 0,
    issuer: ISSUER,
    introspectUrl: `${asBase}/introspect`,
    tokenUrl: `${asBase}/token`,
    rsClientId: 'lalaleap-mcp-rs',
    rsClientSecret: 's3cret',
    apiUrl: apiBase,
    apiResource: 'lalaleap-api',
    allowedHosts: ['127.0.0.1', 'mcp.example.test'],
    allowedOrigins: [],
    readOnly: false,
    writeRateLimit: 10,
  };
  mcpServer = http.createServer(createHttpApp(cfg));
  mcpBase = await listen(mcpServer);
});

after(() => {
  asServer.close();
  apiServer.close();
  mcpServer.close();
  asServer.closeAllConnections?.();
  apiServer.closeAllConnections?.();
  mcpServer.closeAllConnections?.();
});

beforeEach(() => {
  rec.introspectCalls = 0;
  rec.exchangeCalls = 0;
  rec.exchangeBodies = [];
  rec.apiAuthHeaders = [];
  rec.apiUserNoHeaders = [];
  rec.basicAuth = [];
  asDown = false;
});

const MCP_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

function rpc(method: string, params: unknown, token?: string, id = 1) {
  return fetch(`${mcpBase}/mcp`, {
    method: 'POST',
    headers: { ...MCP_HEADERS, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
}

const callListProjects = (token?: string) =>
  rpc('tools/call', { name: 'list_projects', arguments: {} }, token);

test('Protected Resource Metadata：兩個路徑內容一致、不含 offline_access', async () => {
  for (const p of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
    const r = await fetch(`${mcpBase}${p}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    const j = (await r.json()) as any;
    assert.equal(j.resource, PUBLIC_URL);
    assert.deepEqual(j.authorization_servers, [ISSUER]);
    assert.deepEqual(j.bearer_methods_supported, ['header']);
    assert.ok(!j.scopes_supported.includes('offline_access'));
    assert.deepEqual(j.scopes_supported, ['lalaleap.read', 'lalaleap.write', 'spec_review']);
  }
});

test('無 token → 401 ＋ WWW-Authenticate(resource_metadata, scope)，且不打 AS', async () => {
  const r = await callListProjects();
  assert.equal(r.status, 401);
  const h = r.headers.get('www-authenticate')!;
  assert.match(h, /^Bearer /);
  assert.ok(h.includes('resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"'));
  assert.ok(h.includes('scope="lalaleap.read"'));
  assert.ok(!h.includes('offline_access'));
  assert.equal(rec.introspectCalls, 0);
});

test('llp_ token 一律拒收（401，不打 AS）', async () => {
  const r = await callListProjects('llp_abcdef');
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate')!, /error="invalid_token"/);
  assert.match(r.headers.get('www-authenticate')!, /resource_metadata=/);
  assert.equal(rec.introspectCalls, 0);
});

test('aud 不符 → 401', async () => {
  const r = await callListProjects(WRONG_AUD);
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate')!, /error="invalid_token"/);
  assert.equal(rec.exchangeCalls, 0);
});

test('iss 不符 → 401', async () => {
  const r = await callListProjects(WRONG_ISS);
  assert.equal(r.status, 401);
});

test('introspect inactive → 401（結果短暫快取）', async () => {
  const r1 = await callListProjects(INACTIVE);
  assert.equal(r1.status, 401);
  const r2 = await callListProjects(INACTIVE);
  assert.equal(r2.status, 401);
  assert.equal(rec.introspectCalls, 1, '負結果快取 10 秒');
  assert.equal(rec.apiAuthHeaders.length, 0);
});

test('AS 5xx → 500（不是 401）', async () => {
  asDown = true;
  const r = await callListProjects('llo_at_brandnew');
  assert.equal(r.status, 500);
  assert.equal(r.headers.get('www-authenticate'), null);
});

test('RS 以 Basic 認證呼叫 AS', async () => {
  await callListProjects(good('basic'));
  const expected = 'Basic ' + Buffer.from('lalaleap-mcp-rs:s3cret').toString('base64');
  assert.ok(rec.basicAuth.length > 0);
  for (const a of rec.basicAuth) assert.equal(a, expected);
});

test('合法 token：tools/list 回傳全部 24 個工具（既有 15＋規格審查 9）', async () => {
  const r = await rpc('tools/list', {}, GOOD);
  assert.equal(r.status, 200);
  const j = (await r.json()) as any;
  assert.equal(j.result.tools.length, 24);
  assert.ok(j.result.tools.some((t: any) => t.name === 'list_projects'));
});

test('合法 token：list_projects 成功，上游收到委派 token 而非原 token', async () => {
  const T = good('flow');
  const r = await callListProjects(T);
  assert.equal(r.status, 200);
  const j = (await r.json()) as any;
  assert.ok(!j.result.isError);
  assert.deepEqual(JSON.parse(j.result.content[0].text), [{ pno: 'P001', name: '專案一' }]);

  assert.equal(rec.apiAuthHeaders.length, 1);
  const up = rec.apiAuthHeaders[0]!;
  assert.match(up, /^Bearer llo_dt_/);
  assert.ok(!up.includes(T), '不得轉送原 access token');
  assert.equal(rec.apiUserNoHeaders[0], undefined, 'HTTP 模式不送 X-UserNo');

  const ex = rec.exchangeBodies[0];
  assert.equal(ex.get('grant_type'), 'urn:ietf:params:oauth:grant-type:token-exchange');
  assert.equal(ex.get('subject_token'), T);
  assert.equal(ex.get('subject_token_type'), 'urn:ietf:params:oauth:token-type:access_token');
  assert.equal(ex.get('resource'), 'lalaleap-api');
});

test('快取：introspect 與 token-exchange 在 TTL 內只打一次', async () => {
  for (let i = 0; i < 3; i++) {
    const r = await callListProjects(good('cache'));
    assert.equal(r.status, 200);
  }
  assert.equal(rec.introspectCalls, 1);
  assert.equal(rec.exchangeCalls, 1);
  assert.equal(rec.apiAuthHeaders.length, 3);
  assert.equal(new Set(rec.apiAuthHeaders).size, 1);
});

test('後端回 401 → 丟棄委派 token 重換一次後重試', async () => {
  // 先確保快取內有 dt（上一個測試的快取在 beforeEach 不清；這裡直接觀察 exchange 增量）
  const T = good('retry');
  await callListProjects(T);
  const before = rec.exchangeCalls;
  apiReject401Once = true;
  const r = await callListProjects(T);
  const j = (await r.json()) as any;
  assert.ok(!j.result.isError);
  assert.equal(rec.exchangeCalls, before + 1, '401 後重換');
});

test('GET／DELETE /mcp：無 token 401；帶 token 405', async () => {
  const noTok = await fetch(`${mcpBase}/mcp`);
  assert.equal(noTok.status, 401);
  for (const method of ['GET', 'DELETE']) {
    const r = await fetch(`${mcpBase}/mcp`, { method, headers: { Authorization: `Bearer ${GOOD}` } });
    assert.equal(r.status, 405);
  }
});

test('Host 不在白名單 → 403；有 Origin 且不在清單 → 403；/healthz 不需認證', async () => {
  const bad = await new Promise<number>((resolve) => {
    const u = new URL(`${mcpBase}/mcp`);
    const req = http.request(
      { host: u.hostname, port: u.port, path: '/mcp', method: 'POST', headers: { Host: 'evil.test', ...MCP_HEADERS } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }
    );
    req.end('{}');
  });
  assert.equal(bad, 403);

  const o = await fetch(`${mcpBase}/mcp`, {
    method: 'POST',
    headers: { ...MCP_HEADERS, Origin: 'https://evil.test', Authorization: `Bearer ${GOOD}` },
    body: '{}',
  });
  assert.equal(o.status, 403);

  const hz = await fetch(`${mcpBase}/healthz`);
  assert.equal(hz.status, 200);
});

// ───────────── verifier 單元測試（可控時鐘）─────────────

test('verifier：快取 TTL = min(60s, exp-now)，到期後重新 introspect', async () => {
  let t = 1_000_000_000_000;
  let calls = 0;
  const fixedExp = Math.floor(t / 1000) + 90;
  const fakeFetch = (async () => {
    calls++;
    return new Response(
      JSON.stringify({ active: true, aud: PUBLIC_URL, iss: ISSUER, scope: 'lalaleap.read', exp: fixedExp }),
      { status: 200 }
    );
  }) as unknown as typeof fetch;
  const v = new IntrospectionVerifier({
    introspectUrl: 'http://x/introspect',
    issuer: ISSUER,
    resource: PUBLIC_URL,
    rsClientId: 'a',
    rsClientSecret: 'b',
    now: () => t,
    fetchImpl: fakeFetch,
  });
  await v.verifyAccessToken('llo_at_x');
  t += 59_000;
  await v.verifyAccessToken('llo_at_x');
  assert.equal(calls, 1);
  t += 2_000; // 61 秒 → 快取過期，重打；新 TTL = min(60, 剩 29)
  await v.verifyAccessToken('llo_at_x');
  assert.equal(calls, 2);
  t += 31_000; // 已過 exp（+92s）
  await assert.rejects(() => v.verifyAccessToken('llo_at_x'));
});

// ───────────── stdio 模式不受影響 ─────────────

// ───────────── HTTP 模式已停用（1.3.0）：遠端 MCP 改由 .NET 後端內建提供 ─────────────

for (const how of ['環境變數 LALALEAP_TRANSPORT=http', '參數 --transport http']) {
  test(`HTTP 模式已停用：${how} 啟動時印明確訊息並以非 0 結束，不監聽任何埠`, async () => {
    const args = ['--import', 'tsx/esm', 'src/index.ts', ...(how.startsWith('參數') ? ['--transport', 'http'] : [])];
    const child = spawn(process.execPath, args, {
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        ...(how.startsWith('環境') ? { LALALEAP_TRANSPORT: 'http' } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    const code: number | null = await new Promise((resolve) => child.on('exit', (c) => resolve(c)));
    assert.notEqual(code, 0, 'HTTP 模式必須以非 0 結束');
    assert.match(err, /HTTP 模式已停用/);
    assert.match(err, /https:\/\/lalaleap\.twkuraki\.com\/ap2\/lalaleap\/mcp/, '訊息要指向新的遠端網址');
    assert.match(err, /stdio/, '訊息要提到仍可用 stdio 本機模式');
  });
}

test('stdio 模式（預設）：啟動並列出 23 個工具（既有 15＋規格審查 8）；不需要 HTTP 環境變數', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx/esm', 'src/index.ts'], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      LALALEAP_API_URL: 'http://127.0.0.1:9',
      LALALEAP_API_TOKEN: 'llp_testtoken',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  const send = (o: unknown) => child.stdin.write(JSON.stringify(o) + '\n');
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const deadline = Date.now() + 15_000;
  while (!out.includes('"id":2') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  child.kill();
  const line = out.split('\n').find((l) => l.includes('"id":2'))!;
  assert.ok(line, 'stdio 應回應 tools/list');
  const tools = JSON.parse(line).result.tools.map((t: any) => t.name);
  assert.equal(tools.length, 23);
  for (const n of ['list_my_spec_tasks', 'get_spec_case', 'get_spec_report', 'pull_spec_materials', 'read_spec_material', 'submit_spec', 'mark_spec_not_applicable', 'upload_spec_material']) assert.ok(tools.includes(n), n);
  assert.ok(!tools.includes('request_spec_upload') && !tools.includes('upload_spec_text'), 'stdio 不含票券／純文字上傳');
  assert.ok(tools.includes('list_projects') && tools.includes('create_project'));
});
