import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { hostHeaderValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { Server } from 'node:http';
import { ApiClient } from './api-client.js';
import type { Config, HttpConfig } from './config.js';
import { IntrospectionVerifier } from './auth/introspection-verifier.js';
import { DelegatedTokenProvider, DelegationExchanger } from './auth/token-provider.js';
import { WriteGuard } from './write-guard.js';
import { checkScopeGate, insufficientScopeChallenge, withScopeNotes } from './auth/scope-gate.js';
import { registerProjectTools } from './tools/projects.js';
import { registerRequirementTools } from './tools/requirements.js';
import { registerBugTools } from './tools/bugs.js';
import { registerTodoTools } from './tools/todos.js';
import { registerSprintTools } from './tools/sprints.js';
import { registerTagTools } from './tools/tags.js';
import { registerMemberTools } from './tools/members.js';
import { registerSpecReviewTools } from './tools/spec-review.js';
import { registerResources } from './resources.js';

/** 無 token 時的最小 scope 指引（不含 offline_access）*/
const MIN_SCOPE = 'lalaleap.read';
const SCOPES_SUPPORTED = ['lalaleap.read', 'lalaleap.write', 'spec_review'];

export interface HttpAppDeps {
  verifier?: OAuthTokenVerifier;
  exchanger?: DelegationExchanger;
}

/** RFC 9728 §3.1：在 resource 的 path 前插入 /.well-known/oauth-protected-resource */
export function protectedResourceMetadataPath(publicUrl: string): string {
  const p = new URL(publicUrl).pathname.replace(/\/+$/, '');
  return `/.well-known/oauth-protected-resource${p}`;
}

export function protectedResourceMetadataUrl(publicUrl: string): string {
  return new URL(protectedResourceMetadataPath(publicUrl), publicUrl).toString();
}

export function buildProtectedResourceMetadata(cfg: HttpConfig) {
  return {
    resource: cfg.publicUrl,
    authorization_servers: [cfg.issuer],
    // 不含 offline_access（refresh 不是資源需求；只列在 AS metadata）
    scopes_supported: SCOPES_SUPPORTED,
    bearer_methods_supported: ['header'],
    resource_name: 'Lalaleap',
    resource_documentation: 'https://lalaleap.twkuraki.com/help?tab=mcp',
  };
}

function toApiConfig(cfg: HttpConfig): Config {
  return {
    apiUrl: cfg.apiUrl,
    readOnly: cfg.readOnly,
    allowedProjects: cfg.allowedProjects,
    writeRateLimit: cfg.writeRateLimit,
  };
}

export function createHttpApp(cfg: HttpConfig, deps: HttpAppDeps = {}): Express {
  const verifier =
    deps.verifier ??
    new IntrospectionVerifier({
      introspectUrl: cfg.introspectUrl,
      issuer: cfg.issuer,
      resource: cfg.publicUrl,
      rsClientId: cfg.rsClientId,
      rsClientSecret: cfg.rsClientSecret,
    });
  const exchanger =
    deps.exchanger ??
    new DelegationExchanger({
      tokenUrl: cfg.tokenUrl,
      rsClientId: cfg.rsClientId,
      rsClientSecret: cfg.rsClientSecret,
      apiResource: cfg.apiResource,
    });

  const prmUrl = protectedResourceMetadataUrl(cfg.publicUrl);
  const prmPath = protectedResourceMetadataPath(cfg.publicUrl);

  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy !== undefined) app.set('trust proxy', cfg.trustProxy);

  // 存活檢查（不驗 Host、不打 AS）
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // DNS rebinding 防護
  app.use(hostHeaderValidation(cfg.allowedHosts));

  // Origin 驗證：有 Origin 且不在允許清單 → 403（CLI 客戶端不送 Origin；/mcp 不開瀏覽器 CORS）
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && !cfg.allowedOrigins.includes(origin)) {
      // PRM 是公開 metadata，允許瀏覽器型客戶端讀取
      if (req.method === 'GET' && (req.path === prmPath || req.path === '/.well-known/oauth-protected-resource')) {
        return next();
      }
      return void res.status(403).json({ error: 'forbidden_origin' });
    }
    next();
  });

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    })
  );

  // Protected Resource Metadata（RFC 9728）：規格指定路徑＋根目錄備援
  const prmHandler = (_req: Request, res: Response) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(buildProtectedResourceMetadata(cfg));
  };
  app.get(prmPath, prmHandler);
  if (prmPath !== '/.well-known/oauth-protected-resource') {
    app.get('/.well-known/oauth-protected-resource', prmHandler);
  }

  // 無 Authorization header：401 帶 resource_metadata＋最小 scope 指引
  const challengeMissingToken = (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers.authorization) {
      res.set('WWW-Authenticate', `Bearer resource_metadata="${prmUrl}", scope="${MIN_SCOPE}"`);
      return void res.status(401).json({
        error: 'invalid_token',
        error_description: 'Missing Authorization header',
      });
    }
    next();
  };

  const bearer = requireBearerAuth({ verifier, resourceMetadataUrl: prmUrl });
  const jsonBody = express.json({ limit: '2mb' });

  app.post(cfg.mcpPath, challengeMissingToken, bearer, jsonBody, async (req: Request, res: Response) => {
    const auth = req.auth!;
    // scope 前置檢查：必須在進入 transport 之前回 403（tool 層錯誤只能回 200＋isError，客戶端不會 step-up）
    const gate = checkScopeGate(req.body, auth.scopes);
    if (!gate.ok) {
      res.set('WWW-Authenticate', insufficientScopeChallenge(gate.required, prmUrl));
      return void res.status(403).json({
        error: 'insufficient_scope',
        error_description: `需要 scope：${gate.required.join(' ')}`,
      });
    }
    // 每個請求一個 server＋transport（stateless），請求結束 close
    const api = new ApiClient(toApiConfig(cfg), new DelegatedTokenProvider(exchanger, auth.token));
    const server = new McpServer({ name: 'lalaleap', version: '1.2.0' });
    // WriteGuard 每位使用者獨立（以 introspect 的 sub 為鍵）
    const extra = (auth.extra ?? {}) as { sno?: string; grantId?: string };
    const apiCfg = toApiConfig(cfg);
    const guard = new WriteGuard(apiCfg, { sno: extra.sno, clientId: auth.clientId, grantId: extra.grantId });
    // tools/list 回傳全部工具（描述加註所需 scope）；實際授權由上方 scope gate 與後端白名單把關
    const tools = withScopeNotes(server);
    registerProjectTools(tools, api, guard);
    registerRequirementTools(tools, api, guard);
    registerBugTools(tools, api, guard);
    registerTodoTools(tools, api, guard);
    registerSprintTools(tools, api);
    registerTagTools(tools, api);
    registerMemberTools(tools, api);
    registerSpecReviewTools(tools, api, guard);
    registerResources(server, api);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request error:', err instanceof Error ? err.message : 'unknown');
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // stateless：不提供 SSE 串流與 session 終止
  const notAllowed = (_req: Request, res: Response) => {
    res.set('Allow', 'POST');
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  };
  app.get(cfg.mcpPath, challengeMissingToken, bearer, notAllowed);
  app.delete(cfg.mcpPath, challengeMissingToken, bearer, notAllowed);

  // JSON 解析錯誤等
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number })?.status;
    if (status === 400 || status === 413) {
      return void res.status(status).json({
        jsonrpc: '2.0',
        error: { code: -32700, message: status === 413 ? 'Payload too large' : 'Parse error' },
        id: null,
      });
    }
    console.error('[http] unhandled error:', err instanceof Error ? err.message : 'unknown');
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}

export function startHttpServer(cfg: HttpConfig, deps: HttpAppDeps = {}): Promise<Server> {
  const app = createHttpApp(cfg, deps);
  return new Promise((resolve, reject) => {
    const server = app.listen(cfg.port, '0.0.0.0', () => {
      console.error(`[mcp] HTTP 模式啟動：0.0.0.0:${cfg.port}，resource=${cfg.publicUrl}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}
