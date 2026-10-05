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

## 兩種使用方式

| 方式 | 適合 | 傳輸 | 認證 |
|------|------|------|------|
| **遠端（Lalaleap 後端內建，推薦）** | 一般使用者：不裝套件、不設環境變數 | Streamable HTTP（stateless） | OAuth 2.1（PKCE、CIMD／DCR），登入 Lalaleap 後同意授權；進階：`Authorization: Bearer llp_…`（後端開啟 `Mcp:AcceptApiToken` 時） |
| **本機（stdio，本套件）** | 離線、需自行控管設定 | stdio | `llp_` API Token 或帳密 |

> **1.3.0 起**：遠端 MCP 由 Lalaleap 後端（.NET）直接提供，**不需要也不能再用本套件啟動 HTTP 模式**。本套件只剩 stdio 本機模式（維護模式：不再新增工具，只修安全問題）。

使用者端只要一行：

```bash
claude mcp add --transport http lalaleap https://lalaleap.twkuraki.com/ap2/lalaleap/mcp
# 進 Claude Code → /mcp → 選 lalaleap → Authenticate → 瀏覽器登入並同意
```

VS Code（`.vscode/mcp.json`）：`{ "servers": { "lalaleap": { "type": "http", "url": "https://lalaleap.twkuraki.com/ap2/lalaleap/mcp" } } }`；Cursor（`~/.cursor/mcp.json`）：`{ "mcpServers": { "lalaleap": { "url": "https://lalaleap.twkuraki.com/ap2/lalaleap/mcp" } } }`。這兩者走 DCR 註冊。使用者可在 Lalaleap「個人設定 → 已授權應用程式」撤銷（**下一次呼叫即失效**）。

伺服器端部署（設定、閘道需求、回滾）見前端 repo `docs/specs/mcp_dotnet/DEPLOY.md`；架構與決策見 `docs/specs/mcp_dotnet/overview.md`。

---

## 快速上手：本機 stdio（3 分鐘）

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

### 規格審查工具（`spec_review`）

遠端（後端內建）24 個工具（上列 15 個＋下列 9 個）、stdio 模式 23 個（上列 15 個＋下列 8 個）。需要 `spec_review` scope（HTTP）與 AiZone 網域帳號；寫入類工具同受 WriteGuard 限制。

| Tool | 做什麼 | HTTP | stdio |
|------|--------|:----:|:-----:|
| `list_my_spec_tasks` | 我的規格審查待辦 | v | v |
| `get_spec_case` | 案件詳情、各角色交件狀態 | v | v |
| `get_spec_report` | 審查報告（可 `onlyMine`、`format=markdown`） | v | v |
| `pull_spec_materials` | 取料：取得其他角色最新版材料（HTTP 回一次性下載網址，stdio 直接下載到本機） | v | v |
| `read_spec_material` | 讀取某份材料文字 | v | v |
| `request_spec_upload` | 交件第 1 步：取得一次性上傳網址（10 分鐘，由客戶端 `curl` 上傳） | v | — |
| `upload_spec_text` | 無 shell 時以純文字上傳材料 | v | — |
| `upload_spec_material` | 從本機路徑上傳材料 | — | v |
| `submit_spec` | 交件 | v | v |
| `mark_spec_not_applicable` | 標記角色不適用 | v | v |

搭配的統一 skill（`/待辦`、`/取料`、`/交件`、`/修正`）由各角色自行安裝，不在本套件內。

### Scope 對照（遠端，後端內建）

| Scope | 可用工具 |
|-------|----------|
| `lalaleap.read` | 既有 9 個唯讀工具（`list_projects`、`get_project_detail`、`list_project_members`、`list_requirements`、`get_requirement_detail`、`list_bugs`、`list_sprints`、`search_tags`、`list_todos`）與 5 個 resources（一律包含）|
| `lalaleap.write`（隱含 read） | 既有 6 個寫入工具（`create_project`、`create_requirement`、`update_requirement`、`create_bug`、`update_bug`、`create_todo`）|
| `spec_review` | 規格審查 9 個工具（不隱含 read／write；寫入類另受 WriteGuard 限制）|

scope 不足時回 HTTP 403 `insufficient_scope`，客戶端會引導重新授權。

---

## HTTP 模式（已停用）

**1.3.0 起停用。** 遠端 MCP（OAuth 2.1 Resource Server、Streamable HTTP、PRM、scope 閘門、寫入保護）已改由 Lalaleap 後端（.NET，`ModelContextProtocol.AspNetCore`）內建提供，網址為 `https://lalaleap.twkuraki.com/ap2/lalaleap/mcp`，隨後端一起部署：

- **不需要**本程式的容器、`mcp.` 子網域、`OAUTH_RS_CLIENT_SECRET`／`OAuth__RsClientSecretHash`。
- 以 `LALALEAP_TRANSPORT=http` 或 `--transport http` 啟動本程式會印出停用訊息並以非 0（2）結束，不會監聽任何埠。
- 24 個工具的名稱與參數與舊 HTTP 模式完全相同（後端有 tools/list 金檔測試強制）。
- `src/http.ts`、`src/auth/` 等原始碼暫時保留供參考（含它們的測試），不再由入口啟動；後續另行請示移除。
- 部署、閘道設定、檢查清單與回滾：前端 repo `docs/specs/mcp_dotnet/DEPLOY.md`（舊的 Node 獨立服務版 `docs/specs/mcp_oauth/DEPLOY.md` 已標註取代）。

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
│   ├── index.ts            # 入口：依 transport 啟動 stdio 或 HTTP、註冊 tools & resources
│   ├── http.ts             # （已停用，保留供參）舊 HTTP 模式：Express＋Streamable HTTP、PRM、Bearer 驗證、scope 閘
│   ├── auth/               # （已停用，保留供參）introspection 驗證、委派 token（Token Exchange）、scope 閘、TTL 快取
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
│       ├── spec-review.ts  # 規格審查 9（HTTP）／8（stdio）個工具
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
| 啟動時印「HTTP 模式已停用」並結束 | 1.3.0 起 HTTP 模式停用：改用 `claude mcp add --transport http lalaleap https://lalaleap.twkuraki.com/ap2/lalaleap/mcp`，或移除 `--transport http`／`LALALEAP_TRANSPORT=http` 使用 stdio |
| （HTTP）所有請求 401，`aud` 不符 | `MCP_PUBLIC_URL` 與後端 `OAuth:McpResource` 不一致 |
| （HTTP）token exchange 失敗／後端 401 | `LALALEAP_API_RESOURCE`（預設＝`LALALEAP_API_URL`）與後端 `OAuth:ApiResource` 不一致，或 RS secret 與後端雜湊不符 |
| （HTTP）403 `Invalid Host` | 反代沒轉送正確 `Host`，或 `MCP_ALLOWED_HOSTS` 沒列該網域 |
| （HTTP）回應被切斷／延遲 | 反代沒關緩衝（`proxy_buffering off`）或讀取逾時太短 |
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
| 傳輸方式 | stdio（標準輸入輸出）；Streamable HTTP（stateless，Express 5）＋OAuth 2.1 Resource Server |
| Docker | `Dockerfile` 為舊 HTTP 模式用，已停用（容器啟動會印停用訊息並結束） |

---

## 測試覆蓋

| 類別 | 數量 | 通過率 |
|------|------|--------|
| MCP Protocol E2E（含 tools + resources + 邊界條件） | 50 | 100% |
| API 整合測試 | 14 | 100% |
| TypeScript 型別檢查 | — | 零錯誤 |

完整測試報告見 `docs/test-report.md`。
