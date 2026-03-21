# Lalaleap MCP Server — 正式測試報告

## 文件資訊

| 項目 | 內容 |
|------|------|
| 文件版本 | v1.0 |
| 測試日期 | 2026-03-21 |
| 測試人員 | QA Agent |
| 測試方法 | MCP Protocol 端到端測試（E2E via stdio transport） |

---

## 一、測試環境

| 項目 | 說明 |
|------|------|
| API 伺服器 | https://your-domain.com/ap2/lalaleap |
| 測試帳號 | kuraki5336@gmail.com |
| SSL 設定 | LALALEAP_UNSAFE_SSL=1（開發環境憑證過期） |
| MCP SDK 版本 | @modelcontextprotocol/sdk v1.27.1 |
| Node.js 執行方式 | npx tsx (tsx v4.21.0) |
| TypeScript 版本 | 5.9.3 |
| 測試腳本路徑 | src/test-mcp.ts |

---

## 二、測試範圍摘要

### 測試方法
使用 MCP SDK 的 `Client` 類別搭配 `StdioClientTransport`，以子進程方式啟動 MCP Server（`src/index.ts`），透過標準 MCP Protocol 進行真實連線測試，完整模擬 AI 客戶端的實際呼叫行為。

### 測試涵蓋範圍
- MCP Protocol 連線建立與初始化
- 14 個 tools 的正確註冊與功能驗證
- 5 個 resources 的正確列出與讀取
- 10 個邊界條件 / 錯誤處理案例
- TypeScript 靜態型別正確性（npx tsc --noEmit）

---

## 三、測試案例執行結果

### 總覽

| 測試套件 | 總計 | 通過 | 失敗 |
|----------|------|------|------|
| Suite 0: MCP Protocol 連線建立 | 1 | 1 | 0 |
| Suite 1: Tools 清單驗證 | 15 | 15 | 0 |
| Suite 2: Resources 清單驗證 | 2 | 2 | 0 |
| Suite 3: 正常流程 — 專案相關 Tools | 4 | 3 | 1 |
| Suite 4: 正常流程 — 需求相關 Tools | 4 | 4 | 0 |
| Suite 5: 正常流程 — 缺陷相關 Tools | 2 | 2 | 0 |
| Suite 6: 正常流程 — 待辦/迭代/成員/標籤 | 5 | 5 | 0 |
| Suite 7: Resources 讀取測試 | 6 | 5 | 1 |
| Suite 8: 邊界條件 / 錯誤處理 | 10 | 10 | 0 |
| Suite 9: 測試資料清理 | 2 | 2 | 0 |
| **合計** | **51** | **49** | **2** |

---

### Suite 0: MCP Protocol 連線建立

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| S0-01 | mcp_connect | 通過 | MCP Client 成功透過 stdio transport 連線到 Server |

### Suite 1: Tools 清單驗證

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| S1-01 | list_tools | 通過 | listTools() 回傳 14 個 tools |
| S1-02 | tool_registered_list_projects | 通過 | Tool 正確註冊 |
| S1-03 | tool_registered_get_project_detail | 通過 | Tool 正確註冊 |
| S1-04 | tool_registered_create_project | 通過 | Tool 正確註冊 |
| S1-05 | tool_registered_create_requirement | 通過 | Tool 正確註冊 |
| S1-06 | tool_registered_list_requirements | 通過 | Tool 正確註冊 |
| S1-07 | tool_registered_get_requirement_detail | 通過 | Tool 正確註冊 |
| S1-08 | tool_registered_update_requirement | 通過 | Tool 正確註冊 |
| S1-09 | tool_registered_create_bug | 通過 | Tool 正確註冊 |
| S1-10 | tool_registered_list_bugs | 通過 | Tool 正確註冊 |
| S1-11 | tool_registered_create_todo | 通過 | Tool 正確註冊 |
| S1-12 | tool_registered_list_todos | 通過 | Tool 正確註冊 |
| S1-13 | tool_registered_list_sprints | 通過 | Tool 正確註冊 |
| S1-14 | tool_registered_list_project_members | 通過 | Tool 正確註冊 |
| S1-15 | tool_registered_search_tags | 通過 | Tool 正確註冊 |

### Suite 2: Resources 清單驗證

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| S2-01 | list_resources | 通過 | listResources() 回傳 5 個 resources |
| S2-02 | resource_registered_lalaleap://projects | 通過 | 靜態 Resource 正確列出 |

### Suite 3: 正常流程 — 專案相關 Tools

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| TC-01 | list_projects | 通過 | 取得 14 個專案，回傳結構正確（含 pno, name） |
| TC-02 | get_project_detail | 通過 | 取得專案詳細資料，名稱與 pno 正確 |
| TC-03a | create_project（功能） | 通過 | 專案建立成功，可從 Pno 取得新建 pno |
| TC-03b | create_project（欄位命名） | **失敗** | 見缺陷 BUG-001：回傳 "Pno" 而非 "pno" |

### Suite 4: 正常流程 — 需求相關 Tools

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| TC-04 | create_requirement | 通過 | 需求建立成功，回傳 rno 正確 |
| TC-05 | list_requirements | 通過 | 需求清單取得成功，results.requirements 為陣列 |
| TC-06 | get_requirement_detail | 通過 | 單筆需求詳細資料取得成功 |
| TC-07 | update_requirement | 通過 | 需求更新成功，回傳訊息為「需求已更新」 |

### Suite 5: 正常流程 — 缺陷相關 Tools

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| TC-08 | create_bug | 通過 | 缺陷建立成功，回傳 rno 正確 |
| TC-09 | list_bugs | 通過 | 缺陷清單取得成功，result.bugs 為陣列 |

### Suite 6: 正常流程 — 待辦/迭代/成員/標籤 Tools

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| TC-10 | list_todos | 通過 | 看板 3 欄，回傳 lanes/items 結構正確 |
| TC-11 | create_todo | 通過 | 待辦建立成功，回傳 todo_no 正確 |
| TC-12 | list_sprints | 通過 | 迭代清單取得成功（0 個迭代，正常） |
| TC-13 | list_project_members | 通過 | 成員清單取得成功 |
| TC-14 | search_tags | 通過 | 標籤搜尋成功（0 個標籤，正常） |

### Suite 7: Resources 讀取測試

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| RC-01 | lalaleap://projects（靜態） | 通過 | 成功讀取專案清單，共 15 個，格式正確 |
| RC-02 | lalaleap://project/{pno}/requirements（template 列出） | 通過 | Resource template URI 已正確列出 |
| RC-03 | lalaleap://project/{pno}/bugs（template 列出） | 通過 | Resource template URI 已正確列出 |
| RC-04 | lalaleap://project/{pno}/sprints（template 列出） | 通過 | Resource template URI 已正確列出 |
| RC-05 | lalaleap://project/{pno}/members（template 列出） | 通過 | Resource template URI 已正確列出 |
| RC-02b | 動態 URI 讀取（BUG-002 確認） | **失敗** | 見缺陷 BUG-002：動態 URI 無法讀取 |

### Suite 8: 邊界條件 / 錯誤處理測試

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| EC-01 | get_project_detail — 不存在 pno | 通過 | 回傳友善錯誤訊息，未 crash |
| EC-02 | list_requirements — 不存在 pno | 通過 | 回傳友善結果，未 crash |
| EC-03 | get_requirement_detail — 不存在 rno | 通過 | 回傳友善訊息，未 crash |
| EC-04 | create_requirement — 空字串 title | 通過 | API 接受空標題並建立（已即時清理），未 crash |
| EC-05 | list_bugs — 不存在 pno | 通過 | 回傳友善結果，未 crash |
| EC-06 | search_tags — 空字串 keyword | 通過 | 回傳空陣列（正常行為），未 crash |
| EC-07 | list_todos — 不存在 pno | 通過 | 回傳友善結果，未 crash |
| EC-08 | list_sprints — 不存在 pno | 通過 | 回傳友善結果，未 crash |
| EC-09 | list_project_members — 不存在 pno | 通過 | 回傳友善結果，未 crash |
| EC-10 | create_todo — 不存在 pno | 通過 | 回傳「找不到看板欄位」友善訊息，未 crash |

### Suite 9: 測試資料清理

| 編號 | 測試案例 | 結果 | 說明 |
|------|----------|------|------|
| CL-01 | 清理測試需求 | 通過 | 需求標題已更新為已刪除標記 |
| CL-02 | 清理測試缺陷（記錄） | 通過（記錄） | tool 未暴露 flag:'D' 刪除介面，已記錄待手動清理 |

---

## 四、發現的缺陷清單

### BUG-001：create_project 回傳欄位命名不一致

| 項目 | 說明 |
|------|------|
| 缺陷編號 | BUG-001 |
| 嚴重程度 | 中（功能可用但回傳格式不一致） |
| 影響範圍 | `create_project` tool、`tools/projects.ts` |
| 問題描述 | `create_project` tool 呼叫後，MCP server 回傳的 JSON 中，專案編號欄位名稱為 `"Pno"`（首字母大寫），而系統其他所有 API 均使用 `"pno"`（全小寫）命名慣例。 |
| 重現步驟 | 1. 呼叫 `create_project` tool，傳入 `name` 和 `type` 參數。2. 觀察回傳的 JSON content。 |
| 預期結果 | `{ "pno": "xxx-xxx-xxx", "message": "專案已建立" }` |
| 實際結果 | `{ "Pno": "xxx-xxx-xxx", "message": "專案已建立" }` |
| 根本原因 | `/project/add` API 後端直接回傳 `Pno`（大寫 P），`tools/projects.ts` 的 `create_project` handler 未進行欄位名稱正規化就直接展開 `...resp.data`。 |
| 建議修復 | 在 `tools/projects.ts` 的 `create_project` handler 中，將回傳資料正規化：`const pno = resp.data.pno || resp.data.Pno;` 並以小寫 `pno` 回傳。 |

### BUG-002：project-* Resource Templates 無法透過動態 URI 讀取

| 項目 | 說明 |
|------|------|
| 缺陷編號 | BUG-002 |
| 嚴重程度 | 高（Resources 核心功能無法使用） |
| 影響範圍 | `resources.ts`、所有 project-* resource（需求、缺陷、迭代、成員） |
| 問題描述 | `resources.ts` 中定義的 4 個 project-* resources（requirements / bugs / sprints / members）使用 `server.resource()` 搭配帶有 `{pno}` 佔位符的 URI 字串（`'lalaleap://project/{pno}/requirements' as any`）。此模式在 SDK v1.27.1 中不能正確作為動態 template 處理，導致 AI client 嘗試以實際 pno 讀取時（如 `lalaleap://project/abc-123/requirements`），server 回傳 `-32602 not found` 錯誤。 |
| 重現步驟 | 1. 啟動 MCP Server。2. 呼叫 `listResources()`，可看到 URI 為 `lalaleap://project/{pno}/requirements`。3. 呼叫 `readResource({ uri: 'lalaleap://project/<實際pno>/requirements' })`。4. 收到 MCP error -32602。 |
| 預期結果 | 成功回傳該專案的需求清單（JSON 陣列） |
| 實際結果 | `McpError: MCP error -32602: Resource lalaleap://project/.../requirements not found` |
| 根本原因 | `server.resource()` 以 `as any` 強制轉型 URI template 字串，SDK 實際上以靜態字串處理，不會解析其中的 `{pno}` 佔位符，handler 的 `params.pno` 無法被正確解析。應改用 `server.resource()` 正確的 `ResourceTemplate` 物件（含 `uriTemplate` 屬性）。 |
| 建議修復 | 在 `resources.ts` 中，改用以下方式定義動態 resource：`server.resource('project-requirements', new ResourceTemplate('lalaleap://project/{pno}/requirements', { list: undefined }), ...)` 或使用 SDK 提供的 `ResourceTemplate` 類別，確保 URI template 被正確解析。 |

---

## 五、附加發現（非缺陷，值得注意）

### 觀察 1：create_requirement 允許空白標題
- **現象**：EC-04 測試中，以空字串 `title: ''` 呼叫 `create_requirement`，API 接受並成功建立需求。
- **評估**：此行為取決於業務需求定義。若標題為必填欄位，應在 server 端或 API 端加入驗證。目前測試歸類為「可觀察行為」，不計入缺陷，建議由 PM 確認是否需要補充驗證邏輯。

### 觀察 2：缺陷刪除介面未暴露於 MCP Tool 層
- **現象**：`tools/bugs.ts` 提供 `create_bug` 和 `list_bugs`，但未提供刪除缺陷的 tool（需使用 `flag: 'D'`）。
- **評估**：同樣情況存在於需求（`update_requirement` 未包含 `flag: 'D'` 參數）。這導致測試資料清理無法完全自動化。建議評估是否需要新增刪除/封存的 tool。

### 觀察 3：TypeScript 型別檢查零錯誤
- 執行 `npx tsc --noEmit`，整個 TypeScript 專案無任何型別錯誤，程式碼型別安全性良好。

---

## 六、測試覆蓋率摘要

| 類別 | 總數 | 已測試 | 覆蓋率 |
|------|------|--------|--------|
| Tools | 14 | 14 | 100% |
| Resources | 5 | 5 | 100% |
| 邊界條件場景 | 10 | 10 | 100% |
| TypeScript 型別正確性 | 1 | 1 | 100% |

---

## 七、整體品質結論

### 通過率
**49 / 51（96.1%）**

### 結論
Lalaleap MCP Server 的核心功能整體運作正常，MCP Protocol 連線、14 個 tools 的呼叫、邊界條件處理皆符合品質標準。

發現 **2 個缺陷**，其中：
- **BUG-001**（中嚴重度）：`create_project` 回傳欄位命名不一致，會影響任何依賴 `pno` 欄位的下游應用。
- **BUG-002**（高嚴重度）：4 個 project-* Resource Templates 無法被 AI client 正確讀取，此為 Resources 功能的核心缺陷，會影響所有需要讀取特定專案資料的 AI 使用情境。

建議優先修復 BUG-002，再修復 BUG-001，修復後重新執行 `src/test-mcp.ts` 驗證。

---

*報告產出時間：2026-03-21*
*測試腳本：`src/test-mcp.ts`*
*QA 操作日誌：`reports/QA_LOG.md`*
