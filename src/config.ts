import { createHash } from 'crypto';

export interface Config {
  apiUrl: string;
  apiToken?: string;
  email?: string;
  password?: string;
  unsafeSsl?: boolean;
  readOnly?: boolean;
  allowedProjects?: string[];
  writeRateLimit?: number; // max writes per minute
}

export function loadConfig(): Config {
  const apiUrl = process.env.LALALEAP_API_URL;
  if (!apiUrl) {
    throw new Error('LALALEAP_API_URL 環境變數未設定');
  }

  const allowedProjects = process.env.LALALEAP_ALLOWED_PROJECTS
    ? process.env.LALALEAP_ALLOWED_PROJECTS.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const writeRateLimit = process.env.LALALEAP_WRITE_RATE_LIMIT
    ? parseInt(process.env.LALALEAP_WRITE_RATE_LIMIT, 10)
    : 10; // default: max 10 writes per minute

  return {
    apiUrl: apiUrl.replace(/\/$/, ''),
    apiToken: process.env.LALALEAP_API_TOKEN,
    email: process.env.LALALEAP_EMAIL,
    password: process.env.LALALEAP_PASSWORD,
    unsafeSsl: process.env.LALALEAP_UNSAFE_SSL === '1',
    readOnly: process.env.LALALEAP_READONLY === '1',
    allowedProjects,
    writeRateLimit,
  };
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ───────────────────────── HTTP (OAuth Resource Server) 模式 ─────────────────────────

export interface HttpConfig {
  /** canonical resource URI（PRM 的 resource、audience 比對用）*/
  publicUrl: string;
  /** MCP 端點路徑（取自 publicUrl，例如 /mcp）*/
  mcpPath: string;
  port: number;
  issuer: string;
  introspectUrl: string;
  tokenUrl: string;
  rsClientId: string;
  rsClientSecret: string;
  apiUrl: string;
  apiResource: string;
  allowedHosts: string[];
  allowedOrigins: string[];
  trustProxy?: number;
  readOnly: boolean;
  allowedProjects?: string[];
  writeRateLimit: number;
}

/** scheme/host 小寫、去尾斜線（audience 比對用）*/
export function normalizeResourceUri(uri: string): string {
  try {
    const u = new URL(uri);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return uri.replace(/\/+$/, '');
  }
}

export function isHttpTransport(argv: string[] = process.argv, env = process.env): boolean {
  const i = argv.indexOf('--transport');
  const fromArg = i >= 0 ? argv[i + 1] : undefined;
  const v = (fromArg ?? env.LALALEAP_TRANSPORT ?? 'stdio').toLowerCase();
  return v === 'http';
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`${name} 環境變數未設定（HTTP 模式必填）`);
  return v;
}

export function loadHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const publicUrl = normalizeResourceUri(required(env, 'MCP_PUBLIC_URL'));
  const issuer = required(env, 'OAUTH_ISSUER').replace(/\/+$/, '');
  const apiUrl = required(env, 'LALALEAP_API_URL').replace(/\/+$/, '');
  const list = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
  const allowedHosts = list(required(env, 'MCP_ALLOWED_HOSTS'));
  const mcpPath = new URL(publicUrl).pathname || '/';

  return {
    publicUrl,
    mcpPath,
    port: env.PORT ? parseInt(env.PORT, 10) : 3000,
    issuer,
    introspectUrl: env.OAUTH_INTROSPECT_URL || `${issuer}/introspect`,
    tokenUrl: env.OAUTH_TOKEN_URL || `${issuer}/token`,
    rsClientId: required(env, 'OAUTH_RS_CLIENT_ID'),
    rsClientSecret: required(env, 'OAUTH_RS_CLIENT_SECRET'),
    apiUrl,
    apiResource: (env.LALALEAP_API_RESOURCE || apiUrl).replace(/\/+$/, ''),
    allowedHosts,
    allowedOrigins: list(env.MCP_ALLOWED_ORIGINS),
    trustProxy: env.MCP_TRUST_PROXY ? parseInt(env.MCP_TRUST_PROXY, 10) : undefined,
    readOnly: env.LALALEAP_READONLY === '1',
    allowedProjects: list(env.LALALEAP_ALLOWED_PROJECTS).length ? list(env.LALALEAP_ALLOWED_PROJECTS) : undefined,
    writeRateLimit: env.LALALEAP_WRITE_RATE_LIMIT ? parseInt(env.LALALEAP_WRITE_RATE_LIMIT, 10) : 10,
  };
}
