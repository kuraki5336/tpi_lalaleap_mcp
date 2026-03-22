# Lalaleap MCP Server 規格文件

## 1. 概述

### 目的
提供 MCP (Model Context Protocol) Server，讓 AI 工具（Claude Code、Cursor 等）能直接操作 Lalaleap 專案管理系統 — 建立需求、查詢專案、管理缺陷等。

### 架構

```
AI Client (Claude Code / Cursor)
       ↓  MCP Protocol (stdio)
Lalaleap MCP Server (TypeScript)
       ↓  HTTP REST (axios)
Lalaleap 後端 API (Java)
```

### 技術棧
- **Runtime：** Node.js 18+
- **語言：** TypeScript
- **MCP SDK：** `@modelcontextprotocol/sdk`
- **HTTP Client：** axios
- **獨立 Repo：** `lalaleap-mcp-server`

---

## 2. 認證機制

### 方案：API Token

使用者在 Lalaleap 系統產生 Personal API Token，配置在 MCP client 端。

```jsonc
// Claude Code 的 MCP 設定 (~/.claude/settings.json)
{
  "mcpServers": {
    "lalaleap": {
      "command": "npx",
      "args": ["lalaleap-mcp-server"],
      "env": {
        "LALALEAP_API_URL": "https://your-domain.com/ap2/lalaleap",
        "LALALEAP_API_TOKEN": "usr_xxxxxxxxxxxx"
      }
    }
  }
}
```

### Token 驗證流程
1. MCP Server 啟動時讀取 `LALALEAP_API_TOKEN` 環境變數
2. 所有對後端的 HTTP 請求在 Header 帶上 `Authorization: Bearer {token}`
3. 後端根據 token 識別使用者身份（sno），僅回傳該使用者有權限的資料
4. Token 無效時，tool 回傳明確錯誤訊息

### 後端需新增
- `POST /api-token/generate` — 產生 Personal API Token（綁定 sno）
- `POST /api-token/verify` — 驗證 token 並回傳使用者資訊
- Token 驗證 middleware — 攔截帶 Bearer token 的請求，注入使用者身份

---

## 3. Tools 定義

### 分級策略

| 優先級 | 分類 | 說明 |
|-------|------|------|
| P0 必做 | 核心操作 | 建立需求、查詢專案、查詢需求 |
| P1 重要 | 常用操作 | 建立缺陷、查詢缺陷、建立待辦、迭代管理 |
| P2 加值 | 進階功能 | WBS、管制表、報表、成員管理 |

---

### P0：核心 Tools

#### Tool 1: `list_projects`

> 列出使用者可存取的專案清單

**Parameters：** 無

**對應 API：** `POST /project/list`

**回傳格式：**
```json
[
  { "pno": "be3fd182-...", "name": "彰基_測試" },
  { "pno": "c53f210f-...", "name": "C" }
]
```

**說明：** 後端根據 token 對應的使用者，僅回傳該使用者所屬的專案。

---

#### Tool 2: `get_project_detail`

> 取得專案詳細資訊

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |

**對應 API：** `GET /project/{pno}`

**回傳格式：**
```json
{
  "pno": "be3fd182-...",
  "name": "彰基_測試",
  "type": "0",
  "content": "專案描述...",
  "flag": "Y"
}
```

---

#### Tool 3: `create_requirement`

> 在指定專案中建立一筆需求

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |
| title | string | 是 | 需求標題 |
| describe | string | 否 | 需求描述（支援純文字） |
| priority | string | 否 | 優先度：`高` / `中`（預設）/ `低` |
| start_date | string | 否 | 起始日期 YYYY-MM-DD |
| end_date | string | 否 | 結束日期 YYYY-MM-DD |

**對應 API：** `POST /require/add`

**回傳格式：**
```json
{
  "rno": "1000159",
  "title": "使用者登入功能",
  "message": "需求已建立"
}
```

---

#### Tool 4: `list_requirements`

> 查詢指定專案的需求清單

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |
| page | number | 否 | 頁碼（預設 1） |
| limit | number | 否 | 每頁筆數（預設 20） |
| keyword | string | 否 | 搜尋關鍵字（標題模糊搜尋） |

**對應 API：** `POST /require/list`

**回傳格式：**
```json
[
  {
    "rno": "1000158",
    "title": "dwdw",
    "status": "規劃中",
    "priority": "中",
    "start_date": "2026-03-21",
    "end_date": "2026-03-25",
    "create_user": "韓子彥",
    "create_date": "2026-03-21"
  }
]
```

---

#### Tool 5: `get_requirement_detail`

> 取得單筆需求的完整資訊

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |
| rno | string | 是 | 需求編號 |

**對應 API：** `POST /require/detail`

**回傳格式：**
```json
{
  "rno": "1000158",
  "title": "dwdw",
  "describe": "需求描述內容...",
  "status": "規劃中",
  "priority": "中",
  "start_date": "2026-03-21",
  "end_date": "2026-03-25",
  "tags": ["AA"],
  "create_user": "韓子彥",
  "scale": 3
}
```

---

### P1：常用 Tools

#### Tool 6: `create_bug`

> 在指定專案中建立一筆缺陷

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |
| title | string | 是 | 缺陷標題 |
| describe | string | 否 | 缺陷描述 |
| priority | string | 否 | 優先度：`高` / `中`（預設）/ `低` |
| serious | string | 否 | 嚴重程度 |

**對應 API：** `POST /bug/add`

---

#### Tool 7: `list_bugs`

> 查詢指定專案的缺陷清單

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |
| page | number | 否 | 頁碼（預設 1） |
| limit | number | 否 | 每頁筆數（預設 20） |

**對應 API：** `POST /bug/list`

---

#### Tool 8: `create_todo`

> 建立待辦項目

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |
| title | string | 是 | 待辦標題 |
| content | string | 否 | 待辦內容 |
| priority | string | 否 | 優先度：`high` / `medium`（預設）/ `low` |
| due_date | string | 否 | 截止日期 YYYY-MM-DD |
| lane_no | string | 否 | 看板欄位編號（預設第一欄） |

**對應 API：** `POST /todo/item/add`

---

#### Tool 9: `list_todos`

> 查詢專案的待辦看板

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |

**對應 API：** `POST /todo/board`

**回傳格式：** 包含 lanes（看板欄位）和 items（待辦項目）

---

#### Tool 10: `list_sprints`

> 查詢專案的迭代清單

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |

**對應 API：** `POST /sprint/list`

---

#### Tool 11: `update_requirement`

> 更新需求欄位（標題、狀態、優先度等）

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |
| rno | string | 是 | 需求編號 |
| title | string | 否 | 新標題 |
| status | string | 否 | 新狀態 |
| priority | string | 否 | 新優先度 |
| start_date | string | 否 | 起始日期 |
| end_date | string | 否 | 結束日期 |

**對應 API：** `POST /require/edit`

---

### P2：進階 Tools

#### Tool 12: `list_project_members`

> 查詢專案成員

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |

**對應 API：** `POST /project/member/list`

---

#### Tool 13: `create_project`

> 建立新專案

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| name | string | 是 | 專案名稱（最多 20 字） |
| type | string | 否 | `0` 公開（預設）/ `1` 私人 |

**對應 API：** `POST /project/add`

---

#### Tool 14: `search_tags`

> 搜尋專案標籤

**Parameters：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| pno | string | 是 | 專案編號 |
| keyword | string | 否 | 搜尋關鍵字 |

**對應 API：** `POST /tag/query`

---

## 4. Resources 定義（唯讀資料）

MCP Resources 讓 AI 可以讀取系統資料作為上下文，不需要主動呼叫 tool。

| Resource URI | 說明 |
|-------------|------|
| `lalaleap://projects` | 使用者的專案清單 |
| `lalaleap://project/{pno}/requirements` | 專案的需求清單 |
| `lalaleap://project/{pno}/bugs` | 專案的缺陷清單 |
| `lalaleap://project/{pno}/sprints` | 專案的迭代清單 |
| `lalaleap://project/{pno}/members` | 專案的成員清單 |

---

## 5. 錯誤處理

### 標準錯誤回傳

```json
{
  "error": true,
  "code": "AUTH_FAILED",
  "message": "API Token 無效或已過期，請至 Lalaleap 重新產生"
}
```

### 錯誤碼定義

| 錯誤碼 | 說明 | 使用者應對 |
|-------|------|---------|
| `AUTH_FAILED` | Token 無效或過期 | 重新產生 token |
| `PERMISSION_DENIED` | 無此專案權限 | 確認專案成員資格 |
| `NOT_FOUND` | 資源不存在 | 確認 pno/rno 正確 |
| `VALIDATION_ERROR` | 參數驗證失敗 | 檢查必填欄位 |
| `API_ERROR` | 後端回傳錯誤 | 聯繫管理員 |

---

## 6. 安裝與使用

### 使用者安裝

```bash
npm install -g lalaleap-mcp-server
```

### 設定

1. 登入 Lalaleap → 個人設定 → 產生 API Token
2. 編輯 MCP 設定：

```jsonc
{
  "mcpServers": {
    "lalaleap": {
      "command": "lalaleap-mcp-server",
      "env": {
        "LALALEAP_API_URL": "https://your-domain.com/ap2/lalaleap",
        "LALALEAP_API_TOKEN": "usr_xxxxxxxxxxxx"
      }
    }
  }
}
```

3. 重啟 AI 工具，即可使用

### 使用範例

```
User: 幫我在彰基測試專案建一個需求「病歷查詢 API」，優先度高
Claude: 我來幫你建立。
       → 呼叫 list_projects 找到「彰基_測試」的 pno
       → 呼叫 create_requirement(pno, title="病歷查詢 API", priority="高")
       → 需求已建立，編號 1000160
```

---

## 7. 實作順序

| Phase | 內容 | 預估 |
|-------|------|------|
| Phase 1 | 專案骨架 + 認證 + `list_projects` + `create_requirement` + `list_requirements` | 1-2 天 |
| Phase 2 | `get_requirement_detail` + `create_bug` + `list_bugs` + `create_todo` | 1 天 |
| Phase 3 | `update_requirement` + `list_sprints` + `list_todos` + Resources | 1 天 |
| Phase 4 | `create_project` + `list_project_members` + `search_tags` + 錯誤處理完善 | 1 天 |
| 後端配合 | API Token 機制（generate / verify / middleware） | 後端評估 |

---

## 8. 後端需配合事項

| # | 項目 | 狀態 | 說明 |
|---|------|------|------|
| 1 | **API Token CRUD** | 已完成 | generate / list / revoke / verify 四個端點 |
| 2 | **API Token 認證 Middleware** | 已完成 | 所有既有 API 皆可接受 `llp_` Token（2026-03-22 驗證通過） |
| 3 | **個人設定頁面入口** | 待排 | 前端需在個人設定頁新增「API Token」區塊 |
| 4 | **CORS（如需 SSE 模式）** | 待排 | 若未來改用 SSE 傳輸，需開放 CORS |

---

### 8.1 API Token 認證 Middleware（已完成）

> **狀態：** 2026-03-22 部署並驗證通過，所有 API 端點皆可使用 `llp_` Token 認證。

#### 驗證結果

| 端點 | Bearer JWT | Bearer llp_* | 驗證日期 |
|------|-----------|-------------|---------|
| `/project/list` | 200 | 200 | 2026-03-22 |
| `/project/{pno}` | 200 | 200 | 2026-03-22 |
| `/require/list` | 200 | 200 | 2026-03-22 |
| `/bug/list` | 200 | 200 | 2026-03-22 |
| `/sprint/list` | 200 | 200 | 2026-03-22 |
| `/project/member/list` | 200 | 200 | 2026-03-22 |
| `/todo/board` | 200 | 200 | 2026-03-22 |
| `/tag/query` | 200 | 200 | 2026-03-22 |

#### 實作摘要

在既有的認證 middleware 中，增加 API Token 的判斷分支，所有 API 端點同時接受 JWT 和 API Token 兩種認證方式。

#### 判斷邏輯（虛擬碼）

```
function authMiddleware(request):
    token = extractBearerToken(request)

    if token is null:
        return 401 "未提供認證資訊"

    if token.startsWith("llp_"):
        // ─── API Token 認證（新增） ───
        tokenHash = sha256(token)
        record = db.api_tokens.findOne({ token_hash: tokenHash })

        if record is null:
            return 401 "API Token 無效"
        if record.revoked == true:
            return 401 "API Token 已被撤銷"
        if record.expires_at != null AND record.expires_at < now():
            return 401 "API Token 已過期"

        // 注入使用者身份（與 JWT 認證結果相同的格式）
        request.userIdentity = {
            sno: record.sno,
            email: record.email   // 從 user 表 join 取得
        }

        // 更新最後使用時間（非同步，不阻塞請求）
        db.api_tokens.updateOne(
            { token_hash: tokenHash },
            { $set: { last_used_at: now() } }
        )

    else:
        // ─── 原有的 JWT 認證（不變） ───
        jwtPayload = verifyJwt(token)
        request.userIdentity = {
            sno: jwtPayload.sno,
            email: jwtPayload.email
        }

    // 認證通過，繼續後續 handler
    next()
```

#### 關鍵要求

| # | 要求 | 說明 |
|---|------|------|
| 1 | **判斷依據** | Token 以 `llp_` 開頭 → API Token 路徑；否則 → JWT 路徑 |
| 2 | **身份注入格式一致** | API Token 認證後注入的 `userIdentity` 格式必須與 JWT 認證結果相同，確保下游所有 handler 不需改動 |
| 3 | **X-UserNo header** | 若原有 API 依賴 `X-UserNo` header 識別使用者，middleware 應在 API Token 認證成功後自動補上此 header（值為 `record.email`），讓下游透明 |
| 4 | **不改既有端點** | 所有業務 API（`/project/*`、`/require/*`、`/bug/*` 等）不需做任何修改，完全由 middleware 處理 |
| 5 | **效能考量** | `last_used_at` 更新用非同步 fire-and-forget，不阻塞回應 |
| 6 | **SHA256 查找** | 使用 `token_hash` 欄位的 unique index 查詢，O(1) |

#### 驗收標準

以下 curl 指令必須都能成功（替換為實際 token）：

```bash
# 1. 列出專案（目前回 401，修完後應回 200）
curl -X POST https://{domain}/ap2/lalaleap/project/list \
  -H "Authorization: Bearer llp_xxxxxxxxx" \
  -H "Content-Type: application/json"

# 2. 列出需求
curl -X POST https://{domain}/ap2/lalaleap/require/list \
  -H "Authorization: Bearer llp_xxxxxxxxx" \
  -H "Content-Type: application/json" \
  -H "X-Version: 2" \
  -d '{"pno": "xxx", "page": 1, "limit": 10}'

# 3. 建立需求
curl -X POST https://{domain}/ap2/lalaleap/require/add \
  -H "Authorization: Bearer llp_xxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"pno": "xxx"}'

# 4. 原有 JWT 認證不受影響
curl -X POST https://{domain}/ap2/lalaleap/project/list \
  -H "Authorization: Bearer eyJhbGciOi..." \
  -H "Content-Type: application/json"
```

#### 影響範圍

- **需改動：** 認證 middleware 一處（新增 `llp_` 判斷分支）
- **不需改動：** 所有 Controller、Service、Repository — 它們只看 `userIdentity`，不關心 token 來源
- **風險：** 低 — 新增分支不影響既有 JWT 流程，可用 feature flag 控制上線
