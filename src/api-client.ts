import https from 'https';
import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { type Config, sha256 } from './config.js';

interface ApiResponse<T = any> {
  status: number;
  message: string;
  success: boolean;
  totalCount?: number;
  data: T;
}

interface LoginResponse {
  token: string;
  refresh_token: string;
  sno: string;
  name: string;
  email: string;
}

/** 取得呼叫後端 API 用的 Bearer token（stdio 以外的模式使用）*/
export interface TokenProvider {
  getToken(): Promise<string>;
  /** 後端回 401 時呼叫；回傳 true 表示已丟棄舊 token，可重試一次 */
  onUnauthorized(): Promise<boolean>;
}

export const AUTH_EXPIRED_MESSAGE = '授權已失效，請在 /mcp 重新認證';

export class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private userEmail: string | null = null;
  private config: Config;
  private tokenProvider?: TokenProvider;

  constructor(config: Config, tokenProvider?: TokenProvider) {
    this.config = config;
    this.tokenProvider = tokenProvider;
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
      ...(config.unsafeSsl
        ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
        : {}),
    });

    // Request interceptor: attach auth headers
    this.client.interceptors.request.use(async (reqConfig) => {
      if (this.tokenProvider) {
        // provider 模式（HTTP/OAuth）：只送委派 token，不送 X-UserNo
        reqConfig.headers.Authorization = `Bearer ${await this.tokenProvider.getToken()}`;
        return reqConfig;
      }
      if (this.token) {
        reqConfig.headers.Authorization = `Bearer ${this.token}`;
      }
      if (this.userEmail) {
        reqConfig.headers['X-UserNo'] = this.userEmail;
      }
      return reqConfig;
    });
  }

  async initialize(): Promise<void> {
    if (this.tokenProvider) return;
    if (this.config.apiToken) {
      // Use API Token directly
      this.token = this.config.apiToken;
      return;
    }

    if (this.config.email && this.config.password) {
      await this.login(this.config.email, this.config.password);
      return;
    }

    throw new Error(
      '請提供 LALALEAP_API_TOKEN，或 LALALEAP_EMAIL + LALALEAP_PASSWORD 環境變數'
    );
  }

  private async login(email: string, password: string): Promise<void> {
    const cipher = sha256(password);

    const doLogin = async (keepCipher: string) => {
      return this.client.post<ApiResponse<LoginResponse>>(
        '/login/account',
        { email, channel: '1', cipher, keepCipher },
        { validateStatus: () => true } // accept any HTTP status
      );
    };

    let resp = await doLogin('N');

    // If server asks to change password (HTTP 601), retry with keepCipher='Y'
    if (resp.status === 601 || resp.data?.status === 601) {
      resp = await doLogin('Y');
    }

    if (!resp.data?.success) {
      throw new Error(`登入失敗: ${resp.data?.message || resp.statusText}`);
    }

    this.token = resp.data.data.token;
    this.refreshToken = resp.data.data.refresh_token;
    this.userEmail = resp.data.data.email;
  }

  private async tryRefreshToken(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const resp = await this.client.post<
        ApiResponse<{ token: string; refresh_token: string }>
      >('/login/refreshtoken', { refresh_token: this.refreshToken });
      if (resp.data.success) {
        this.token = resp.data.data.token;
        this.refreshToken = resp.data.data.refresh_token;
        return true;
      }
    } catch {
      // refresh failed
    }
    return false;
  }

  async request<T = any>(
    method: 'GET' | 'POST',
    path: string,
    data?: any,
    headers?: Record<string, string>,
    responseType?: 'arraybuffer'
  ): Promise<ApiResponse<T>> {
    const doRequest = async (): Promise<ApiResponse<T>> => {
      const resp =
        method === 'GET'
          ? await this.client.get<ApiResponse<T>>(path, { headers, ...(responseType ? { responseType } : {}) })
          : await this.client.post<ApiResponse<T>>(path, data, { headers });
      return resp.data;
    };

    try {
      return await doRequest();
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      if (axiosErr.response?.status === 401 && this.tokenProvider) {
        if (await this.tokenProvider.onUnauthorized()) {
          try {
            return await doRequest();
          } catch (err2) {
            if ((err2 as AxiosError).response?.status === 401) throw new Error(AUTH_EXPIRED_MESSAGE);
            throw err2;
          }
        }
        throw new Error(AUTH_EXPIRED_MESSAGE);
      }
      if (axiosErr.response?.status === 401) {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          return await doRequest();
        }
        // Re-login if possible
        if (this.config.email && this.config.password) {
          await this.login(this.config.email, this.config.password);
          return await doRequest();
        }
      }
      throw err;
    }
  }

  /** 下載二進位內容（如 zip）；失敗仍丟 AxiosError（含 401 重試）*/
  async getBinary(path: string): Promise<Buffer> {
    const data = (await this.request('GET', path, undefined, undefined, 'arraybuffer')) as unknown as ArrayBuffer;
    return Buffer.from(data);
  }

  async get<T = any>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  async post<T = any>(
    path: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, data, headers);
  }
}

// Error formatting helper
export function formatError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const axErr = err as AxiosError<ApiResponse>;
    if (axErr.response?.data) {
      const d = axErr.response.data;
      return `API 錯誤 (${axErr.response.status}): ${d.message || JSON.stringify(d)}`;
    }
    if (axErr.code === 'ECONNREFUSED') {
      return `無法連線到 API 伺服器`;
    }
    return `HTTP 錯誤: ${axErr.message}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
