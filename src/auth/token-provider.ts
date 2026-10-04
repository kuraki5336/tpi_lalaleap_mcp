import type { TokenProvider } from '../api-client.js';
import { sha256 } from '../config.js';
import { TtlCache } from './ttl-cache.js';

export const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

export interface DelegationOptions {
  tokenUrl: string;
  rsClientId: string;
  rsClientSecret: string;
  /** token-exchange 的 resource（後端 API audience）*/
  apiResource: string;
  /** 到期前幾秒重換（預設 30）*/
  refreshSkewSec?: number;
  timeoutMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

/**
 * RFC 8693 token-exchange：把收到的 llo_at_ 換成 5 分鐘委派 token（llo_dt_）。
 * MUST NOT 把原 token 轉送上游——ApiClient 只會拿到這裡回傳的委派 token。
 * 快取鍵 sha256(at)，到期前 30 秒重換。
 */
export class DelegationExchanger {
  private cache: TtlCache<string>;
  private now: () => number;
  private doFetch: typeof fetch;
  private inflight = new Map<string, Promise<string>>();

  constructor(private opts: DelegationOptions) {
    this.now = opts.now ?? Date.now;
    this.cache = new TtlCache<string>(10_000, this.now);
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  async getDelegatedToken(accessToken: string): Promise<string> {
    const key = sha256(accessToken);
    const hit = this.cache.get(key);
    if (hit) return hit;
    let p = this.inflight.get(key);
    if (!p) {
      p = this.exchange(accessToken, key).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  invalidate(accessToken: string): void {
    this.cache.delete(sha256(accessToken));
  }

  private async exchange(accessToken: string, key: string): Promise<string> {
    const basic = Buffer.from(
      `${encodeURIComponent(this.opts.rsClientId)}:${encodeURIComponent(this.opts.rsClientSecret)}`
    ).toString('base64');
    let resp: Response;
    try {
      resp = await this.doFetch(this.opts.tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: accessToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          resource: this.opts.apiResource,
        }).toString(),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 5000),
      });
    } catch {
      throw new Error('授權伺服器無回應，無法換發委派憑證');
    }
    if (!resp.ok) {
      // 不把回應內容原樣帶出；只帶 HTTP 狀態
      throw new Error(
        resp.status === 400 || resp.status === 401
          ? '授權已失效，請在 /mcp 重新認證'
          : `換發委派憑證失敗 (HTTP ${resp.status})`
      );
    }
    const body = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token || typeof body.expires_in !== 'number') {
      throw new Error('換發委派憑證回應格式錯誤');
    }
    const ttlMs = (body.expires_in - (this.opts.refreshSkewSec ?? 30)) * 1000;
    this.cache.set(key, body.access_token, ttlMs);
    return body.access_token;
  }
}

/** 每個 HTTP 請求一個：綁定該請求 Bearer 的 access token */
export class DelegatedTokenProvider implements TokenProvider {
  constructor(
    private exchanger: DelegationExchanger,
    private accessToken: string
  ) {}

  getToken(): Promise<string> {
    return this.exchanger.getDelegatedToken(this.accessToken);
  }

  async onUnauthorized(): Promise<boolean> {
    this.exchanger.invalidate(this.accessToken);
    return true;
  }
}
