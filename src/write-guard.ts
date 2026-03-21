import { type Config } from './config.js';

/**
 * Write Guard — 防止 AI 誤操作的三道防線：
 * 1. 唯讀模式（LALALEAP_READONLY=1）
 * 2. 專案白名單（LALALEAP_ALLOWED_PROJECTS=pno1,pno2）
 * 3. 寫入頻率限制（LALALEAP_WRITE_RATE_LIMIT=N，預設每分鐘 10 次）
 */

interface WriteRecord {
  timestamp: number;
  tool: string;
  pno: string;
}

const writeLog: WriteRecord[] = [];

export class WriteGuard {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Check if a write operation is allowed.
   * Returns null if OK, or an error message string if blocked.
   */
  check(toolName: string, pno?: string): string | null {
    // Guard 1: Read-only mode
    if (this.config.readOnly) {
      return `[唯讀模式] 寫入操作已停用（LALALEAP_READONLY=1）。Tool "${toolName}" 被阻擋。`;
    }

    // Guard 2: Project whitelist
    if (pno && this.config.allowedProjects && this.config.allowedProjects.length > 0) {
      if (!this.config.allowedProjects.includes(pno)) {
        return `[專案白名單] 專案 ${pno} 不在允許清單中。允許的專案：${this.config.allowedProjects.join(', ')}`;
      }
    }

    // Guard 3: Rate limiting
    const limit = this.config.writeRateLimit ?? 10;
    if (limit > 0) {
      const now = Date.now();
      const oneMinuteAgo = now - 60_000;

      // Clean old entries
      while (writeLog.length > 0 && writeLog[0].timestamp < oneMinuteAgo) {
        writeLog.shift();
      }

      if (writeLog.length >= limit) {
        return `[頻率限制] 過去一分鐘已執行 ${writeLog.length} 次寫入操作（上限 ${limit} 次）。請稍後再試，或調整 LALALEAP_WRITE_RATE_LIMIT。`;
      }
    }

    return null; // all checks passed
  }

  /**
   * Record a successful write operation.
   */
  record(toolName: string, pno: string) {
    writeLog.push({ timestamp: Date.now(), tool: toolName, pno });
  }

  /**
   * Get recent write operations for auditing.
   */
  getRecentWrites(): WriteRecord[] {
    return [...writeLog];
  }
}
