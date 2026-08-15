# Lalaleap MCP Server

透過 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 讓 AI 工具直接操作 Lalaleap 專案管理系統。

接上之後，你可以用自然語言請 AI 幫你建需求、查缺陷、管理待辦 — 不需要切到瀏覽器。

---

## 它是什麼？

```
你（在 Claude Code / Cursor 裡打字）
  ↓  "幫我在彰基專案建一筆需求：病歷查詢 API"
Claude / Cursor（透過 MCP Protocol 呼叫 tool）
  ↓  callTool("create_requirement", { pno, title, priority })
Lalaleap MCP Server（本專案，TypeScript + stdio）
  ↓  POST /require/add → POST /require/edit
Lalaleap 後端 API（Java）
  ↓
回傳結果 → AI 告訴你「需求已建立，編號 1000160」
```

一句話：**它是 AI 和 Lalaleap 之間的翻譯層。**

---

## 快速上手（3 分鐘）

### Step 1：設定你的 AI 工具

不需要手動 clone，直接在 MCP 設定裡指向 GitHub repo，npx 會自動拉、自動 build。

**Claude Code** — 編輯 `~/.claude/settings.json`：

```jsonc
{
  "mcpServers": {
    "lalaleap": {
      "command": "npx",
      "args": ["-y", "github:kuraki5336/tpi_lalaleap_mcp"],
      "env": {
        "LALALEAP_API_URL": "https://your-domain.com/ap2/lalaleap",
        "LALALEAP_EMAIL": "你的email@gmail.com",
        "LALALEAP_PASSWORD": "你的密碼",
        "LALALEAP_UNSAFE_SSL": "1"
      }
    }
  }
}
```

**Cursor** — 在 Settings → MCP 中新增 server，欄位同上。

> **前提**：使用者的機器需要有 GitHub repo 的存取權限（private repo 需設定 SSH key 或 personal access token）。
>
> `LALALEAP_UNSAFE_SSL=1` 是因為 dev 環境 SSL 憑證過期，正式環境不需要。

#### 替代方案：本機安裝

如果不想每次 npx 拉取，也可以 clone 下來：

```bash
git clone https://github.com/kuraki5336/tpi_lalaleap_mcp.git
cd tpi_lalaleap_mcp && npm install
```

然後 MCP 設定改指向本機路徑：

```jsonc
{
  "mcpServers": {
    "lalaleap": {
      "command": "node",
      "args": ["/你的路徑/tpi_lalaleap_mcp/dist/index.js"],
      "env": { ... }
    }
  }
}
```

### Step 2：開始用

重啟你的 AI 工具，直接對話就能用了。

---

## 認證方式

支援兩種，二擇一：

| 方式 | 環境變數 | 說明 |
|------|---------|------|
| **帳密登入** | `LALALEAP_EMAIL` + `LALALEAP_PASSWORD` | 密碼 SHA256 加密由程式處理，你填明文 |
| **API Token** | `LALALEAP_API_TOKEN` | 未來後端支援後可用，優先度高於帳密 |

全部環境變數：

| 變數 | 必填 | 說明 |
|------|------|------|
| `LALALEAP_API_URL` | 是 | API 基礎 URL |
| `LALALEAP_EMAIL` | 擇一 | 登入 Email |
| `LALALEAP_PASSWORD` | 擇一 | 登入密碼 |
| `LALALEAP_API_TOKEN` | 擇一 | API Token（優先於帳密） |
| `LALALEAP_UNSAFE_SSL` | 否 | `1` = 跳過 SSL 驗證 |
| `LALALEAP_READONLY` | 否 | `1` = 唯讀模式，禁止所有寫入操作 |
| `LALALEAP_ALLOWED_PROJECTS` | 否 | 專案白名單（逗號分隔 pno），只允許對這些專案寫入 |
| `LALALEAP_WRITE_RATE_LIMIT` | 否 | 每分鐘最大寫入次數（預設 10） |

---

## 可用 Tools 一覽

共 15 個 tool，AI 會根據你的指令自動選擇呼叫。

### 專案

| Tool | 做什麼 | 必填參數 | 可選參數 |
|------|--------|---------|---------|
| `list_projects` | 列出你的所有專案 | — | — |
| `get_project_detail` | 看專案詳情 | `pno` | — |
| `create_project` | 建新專案 | `name` | `type`（0 公開/1 私人） |

### 需求

| Tool | 做什麼 | 必填參數 | 可選參數 |
|------|--------|---------|---------|
| `create_requirement` | 建立需求 | `pno`, `title` | `describe`, `priority`(高/中/低), `start_date`, `end_date` |
| `list_requirements` | 查需求清單 | `pno` | `page`, `limit`, `keyword` |
| `get_requirement_detail` | 看需求詳情 | `pno`, `rno` | — |
| `update_requirement` | 改需求 | `pno`, `rno` | `title`, `status`, `priority`, `describe`, `start_date`, `end_date` |

### 缺陷

| Tool | 做什麼 | 必填參數 | 可選參數 |
|------|--------|---------|---------|
| `create_bug` | 建立缺陷 | `pno`, `title` | `describe`, `priority`(高/中/低), `serious` |
| `list_bugs` | 查缺陷清單 | `pno` | `page`, `limit` |
| `update_bug` | 改缺陷 | `pno`, `rno` | `title`, `status`, `priority`, `serious`, `describe` |

### 待辦 / 迭代 / 其他

| Tool | 做什麼 | 必填參數 | 可選參數 |
|------|--------|---------|---------|
| `create_todo` | 建待辦 | `pno`, `title` | `content`, `priority`(high/medium/low), `due_date`, `lane_no` |
| `list_todos` | 看待辦看板 | `pno` | — |
| `list_sprints` | 查迭代清單 | `pno` | — |
| `list_project_members` | 查專案成員 | `pno` | — |
| `search_tags` | 搜尋標籤 | `pno` | `keyword` |

---

## MCP Resources

除了 tool（要主動呼叫），也有 resource（AI 可以當上下文讀取）：

| URI | 內容 |
|-----|------|
| `lalaleap://projects` | 專案清單 |
| `lalaleap://project/{pno}/requirements` | 某專案的需求 |
| `lalaleap://project/{pno}/bugs` | 某專案的缺陷 |
| `lalaleap://project/{pno}/sprints` | 某專案的迭代 |
| `lalaleap://project/{pno}/members` | 某專案的成員 |

---

## 實際對話範例

```
你：幫我看一下有哪些專案
AI：→ list_projects
    你有 12 個專案：彰基_測試、ProjectC、...

你：在彰基_測試建一筆需求「病歷查詢 API」，優先度高
AI：→ list_projects（找到 pno）
    → create_requirement(pno, title="病歷查詢 API", priority="高")
    需求已建立，編號 1000160

你：列出這個專案所有需求
AI：→ list_requirements(pno)
    共 5 筆需求：
    1. 病歷查詢 API（高）- 規劃中
    2. 使用者登入（中）- 進行中
    ...

你：建一個 bug「登入頁按鈕在 Safari 沒反應」
AI：→ create_bug(pno, title="登入頁按鈕在 Safari 沒反應")
    缺陷已建立，編號 2000005

你：幫我加一個待辦「寫 API 文件」，截止下週五
AI：→ create_todo(pno, title="寫 API 文件", due_date="2026-03-28")
    待辦已建立
```

---

## 架構 & 原始碼導覽

```
tpi_tpad_mcp/
├── src/
│   ├── index.ts            # 入口：啟動 MCP Server、註冊 tools & resources
│   ├── config.ts           # 讀取環境變數
│   ├── api-client.ts       # axios HTTP client，處理登入/token/重試
│   ├── resources.ts        # 5 個 MCP Resources 定義
│   ├── test.ts             # API 整合測試（14 個端點）
│   ├── test-mcp.ts         # MCP Protocol E2E 測試（50 個案例）
│   └── tools/
│       ├── projects.ts     # list_projects, get_project_detail, create_project
│       ├── requirements.ts # create/list/get/update requirement
│       ├── bugs.ts         # create_bug, list_bugs
│       ├── todos.ts        # create_todo, list_todos
│       ├── sprints.ts      # list_sprints
│       ├── tags.ts         # search_tags
│       └── members.ts      # list_project_members
├── docs/
│   └── test-report.md      # QA 測試報告
├── package.json
└── tsconfig.json
```

### 關鍵設計

- **認證自動處理**：啟動時自動登入，401 時自動 refresh token，失敗再重新登入
- **兩步建立**：建需求/缺陷時，先 `POST /add` 拿到編號，再 `POST /edit` 填欄位（與前端行為一致）
- **所有錯誤不會 crash**：每個 tool 都有 try-catch，回傳友善中文錯誤訊息
- **寫入防護**：WriteGuard 機制保護所有寫入操作（詳見下方）

---

## 安全防護（WriteGuard）

AI 有可能誤解指令導致批量寫入垃圾資料。所有寫入操作（create / update）都有三道防線：

### 1. 唯讀模式

完全禁止寫入，AI 只能查詢不能建立/修改任何東西：

```jsonc
{
  "env": {
    "LALALEAP_READONLY": "1"  // 所有 create/update tool 會被直接阻擋
  }
}
```

**適用場景**：Demo、新人剛接手不確定 AI 行為時、只需查詢的情境。

### 2. 專案白名單

限制 AI 只能在特定專案寫入，防止操作到錯誤的專案：

```jsonc
{
  "env": {
    // 只允許對這兩個專案做寫入操作，其他專案的 create/update 會被阻擋
    "LALALEAP_ALLOWED_PROJECTS": "be3fd182-3696-41a6-bce8-7f2e9d88b648,c53f210f-xxxx"
  }
}
```

**適用場景**：正式環境只開放測試專案、團隊成員只操作自己負責的專案。

### 3. 寫入頻率限制

限制每分鐘最多寫入幾次，防止 AI 短時間大量建立項目：

```jsonc
{
  "env": {
    "LALALEAP_WRITE_RATE_LIMIT": "5"  // 每分鐘最多 5 次寫入（預設 10）
  }
}
```

觸發限制時，AI 會收到明確的錯誤訊息：
```
[頻率限制] 過去一分鐘已執行 5 次寫入操作（上限 5 次）。請稍後再試。
```

**適用場景**：防止 AI 跑迴圈批量建立、誤解「幫我建 100 個需求」這類指令。

### 建議設定組合

| 情境 | 設定 |
|------|------|
| **開發/測試** | 不設限，或 `WRITE_RATE_LIMIT=20` |
| **日常使用** | `ALLOWED_PROJECTS=你的專案pno` + `WRITE_RATE_LIMIT=10` |
| **Demo 展示** | `READONLY=1` |
| **團隊共用** | `ALLOWED_PROJECTS=團隊專案` + `WRITE_RATE_LIMIT=5` |

---

## 開發

```bash
# 開發模式（tsx 直接跑，不需編譯）
npm run dev

# 編譯
npm run build

# API 整合測試（直接打 API，14 個端點）
npm test

# MCP Protocol E2E 測試（透過 stdio 模擬真實 MCP 連線，50 個案例）
LALALEAP_UNSAFE_SSL=1 npx tsx src/test-mcp.ts
```

### 新增一個 Tool

1. 在 `src/tools/` 新增或修改對應檔案
2. 用 `server.tool(name, description, zodSchema, handler)` 註冊
3. 如果是新檔案，在 `src/index.ts` import 並呼叫 register 函式
4. 跑測試確認

```typescript
// 範例：新增一個 tool
server.tool(
  'my_new_tool',
  '這個 tool 做什麼',
  {
    pno: z.string().describe('專案編號'),
    someParam: z.string().optional().describe('說明'),
  },
  async ({ pno, someParam }) => {
    try {
      const resp = await api.post('/some/endpoint', { pno, someParam });
      return {
        content: [{ type: 'text', text: JSON.stringify(resp.data, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: formatError(err) }],
        isError: true,
      };
    }
  }
);
```

---

## Troubleshooting

| 問題 | 解法 |
|------|------|
| `certificate has expired` | 設定 `LALALEAP_UNSAFE_SSL=1` |
| `Need to change password (601)` | 已自動處理（server 會用 `keepCipher='Y'` 重試） |
| `LALALEAP_API_URL 環境變數未設定` | 確認 MCP client 設定中的 `env` 區塊有帶 |
| 連不上 server | 確認 `npm run build` 過了，`dist/index.js` 存在 |
| tool 沒出現 | 重啟 AI 工具，確認 settings.json 格式正確 |

---

## 技術棧

| 項目 | 版本 |
|------|------|
| Node.js | 18+ |
| TypeScript | 5.9 |
| MCP SDK | @modelcontextprotocol/sdk 1.27 |
| HTTP Client | axios 1.13 |
| Schema Validation | zod 4.3 |
| 傳輸方式 | stdio（標準輸入輸出） |

---

## 測試覆蓋

| 類別 | 數量 | 通過率 |
|------|------|--------|
| MCP Protocol E2E（含 tools + resources + 邊界條件） | 50 | 100% |
| API 整合測試 | 14 | 100% |
| TypeScript 型別檢查 | — | 零錯誤 |

完整測試報告見 `docs/test-report.md`。
