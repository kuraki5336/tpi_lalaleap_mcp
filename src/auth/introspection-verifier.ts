import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { InvalidTokenError, ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { normalizeResourceUri, sha256 } from '../config.js';
import { TtlCache } from './ttl-cache.js';

export const ACCESS_TOKEN_PREFIX = 'llo_at_';

export interface IntrospectionVerifierOptions {
  introspectUrl: string;
  issuer: string;
  /** canonical resource URI（已 normalize）*/
  resource: string;
  rsClientId: string;
  rsClientSecret: string;
  /** 正向結果快取上限秒數（預設 60）*/
  positiveTtlSec?: number;
  /** inactive 結果快取秒數（預設 10）*/
  negativeTtlSec?: number;
  timeoutMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

interface IntrospectionResponse {
  active?: boolean;
  client_id?: string;
  scope?: string;
  sub?: string;
  username?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  grant_id?: string;
}

type CacheEntry = { ok: true; info: AuthInfo } | { ok: false; message: string };

/**
 * 以 RFC 7662 introspection 驗證 llo_at_。
 * SDK 的 requireBearerAuth 不檢查 audience，因此 iss／aud 由這裡檢查。
 * 快取鍵是 sha256(token)，記憶體與 log 都不存 token 明文（AuthInfo 本身帶 token 供換發委派 token 用，僅存於記憶體快取）。
 */
export class IntrospectionVerifier implements OAuthTokenVerifier {
  private cache: TtlCache<CacheEntry>;
  private now: () => number;
  private doFetch: typeof fetch;
  /** 同一 token 同時多個請求時只打一次 AS */
  private inflight = new Map<string, Promise<CacheEntry>>();

  constructor(private opts: IntrospectionVerifierOptions) {
    this.now = opts.now ?? Date.now;
    this.cache = new TtlCache<CacheEntry>(10_000, this.now);
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // 1. 前綴（llp_ 與其他一律拒收，且不打 AS）
    if (!token.startsWith(ACCESS_TOKEN_PREFIX)) {
      throw new InvalidTokenError('Unsupported token type');
    }
    const key = sha256(token);

    // 2. 快取
    let entry = this.cache.get(key);
    if (!entry) {
      let p = this.inflight.get(key);
      if (!p) {
        p = this.introspect(token, key).finally(() => this.inflight.delete(key));
        this.inflight.set(key, p);
      }
      entry = await p;
    }
    if (!entry.ok) throw new InvalidTokenError(entry.message);
    // 快取期間 token 可能已到期（TTL 已取 min，這裡再保險）
    if (entry.info.expiresAt! <= this.now() / 1000) throw new InvalidTokenError('Token has expired');
    return entry.info;
  }

  private async introspect(token: string, key: string): Promise<CacheEntry> {
    const basic = Buffer.from(
      `${encodeURIComponent(this.opts.rsClientId)}:${encodeURIComponent(this.opts.rsClientSecret)}`
    ).toString('base64');

    let resp: Response;
    try {
      resp = await this.doFetch(this.opts.introspectUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ token, token_type_hint: 'access_token' }).toString(),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 5000),
      });
    } catch {
      // AS 無回應：500，不是 401（避免客戶端誤以為要重新登入）；不快取
      throw new ServerError('Authorization server unavailable');
    }
    if (!resp.ok) {
      // 5xx 或 RS 認證失敗（401）都是我方設定／AS 問題，不能當成使用者 token 無效
      throw new ServerError(`Introspection failed (HTTP ${resp.status})`);
    }

    let body: IntrospectionResponse;
    try {
      body = (await resp.json()) as IntrospectionResponse;
    } catch {
      throw new ServerError('Introspection returned invalid JSON');
    }

    const ttlNeg = (this.opts.negativeTtlSec ?? 10) * 1000;
    const reject = (message: string): CacheEntry => {
      const e: CacheEntry = { ok: false, message };
      this.cache.set(key, e, ttlNeg);
      return e;
    };

    // 3. active
    if (body.active !== true) return reject('Token is not active');
    // 4. iss（有帶才比；規格回應一定帶）
    if (body.iss !== undefined && body.iss.replace(/\/+$/, '') !== this.opts.issuer) {
      return reject('Token issuer mismatch');
    }
    // 5. aud 必須等於本 MCP 的 canonical URI（RFC 8707）
    const auds = Array.isArray(body.aud) ? body.aud : body.aud ? [body.aud] : [];
    const audOk = auds.some((a) => normalizeResourceUri(a) === this.opts.resource);
    if (!audOk) return reject('Token audience mismatch');
    if (typeof body.exp !== 'number') return reject('Token has no expiration time');

    const info: AuthInfo = {
      token,
      clientId: body.client_id ?? '',
      scopes: (body.scope ?? '').split(' ').filter(Boolean),
      expiresAt: body.exp,
      resource: new URL(this.opts.resource),
      extra: { sno: body.sub, email: body.username, grantId: body.grant_id },
    };
    const remainingMs = body.exp * 1000 - this.now();
    const ttl = Math.min((this.opts.positiveTtlSec ?? 60) * 1000, remainingMs);
    const entry: CacheEntry = { ok: true, info };
    this.cache.set(key, entry, ttl);
    return entry;
  }
}

/** lalaleap.write 隱含 lalaleap.read */
export function hasScope(scopes: string[], required: string): boolean {
  if (scopes.includes(required)) return true;
  return required === 'lalaleap.read' && scopes.includes('lalaleap.write');
}
