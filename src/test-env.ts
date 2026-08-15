/**
 * 測試用環境變數載入與檢查。
 *
 * 憑證絕對不寫死在原始碼裡 — repo 是 public，寫死等於公開帳密。
 * 測試前把 .env.example 複製成 .env（已被 .gitignore 忽略）填入自己的憑證，
 * npm scripts 會透過 node --env-file-if-exists=.env 自動載入。
 */

const REQUIRED = ['LALALEAP_API_URL'] as const;

/**
 * 確認測試所需的環境變數齊全，缺少時印出說明並中止。
 */
export function requireTestEnv(): void {
  const missing = REQUIRED.filter((key) => !process.env[key]);

  const hasToken = !!process.env.LALALEAP_API_TOKEN;
  const hasAccount = !!process.env.LALALEAP_EMAIL && !!process.env.LALALEAP_PASSWORD;
  if (!hasToken && !hasAccount) {
    missing.push('LALALEAP_API_TOKEN 或 LALALEAP_EMAIL + LALALEAP_PASSWORD' as any);
  }

  if (missing.length === 0) return;

  console.error('\n[測試中止] 缺少環境變數：');
  for (const key of missing) console.error(`  - ${key}`);
  console.error('\n請複製 .env.example 為 .env 並填入憑證後重試。\n');
  process.exit(1);
}

/**
 * 組出要傳給子行程（MCP Server）的環境變數。
 * 憑證取自目前行程的環境，另外帶上 Windows/Node 執行所需的系統變數。
 */
export function buildServerEnv(): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH || '',
    NODE_PATH: process.env.NODE_PATH || '',
    HOME: process.env.HOME || process.env.USERPROFILE || '',
    APPDATA: process.env.APPDATA || '',
    TEMP: process.env.TEMP || '',
    TMP: process.env.TMP || '',
    SystemRoot: process.env.SystemRoot || '',
    COMSPEC: process.env.COMSPEC || '',
  };

  for (const key of [
    'LALALEAP_API_URL',
    'LALALEAP_EMAIL',
    'LALALEAP_PASSWORD',
    'LALALEAP_API_TOKEN',
    'LALALEAP_UNSAFE_SSL',
    'LALALEAP_READONLY',
    'LALALEAP_ALLOWED_PROJECTS',
    'LALALEAP_WRITE_RATE_LIMIT',
  ]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }

  return env;
}
