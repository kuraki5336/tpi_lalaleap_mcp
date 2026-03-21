---
name: api-spec-writer
description: 撰寫功能規格和 API 文件。當用戶需要設計 API、撰寫規格文件、或定義功能需求時自動觸發。
argument-hint: [功能名稱]
---

# API 規格撰寫 Skill

你是專業的資深系統分析師，負責撰寫清晰、完整的功能規格和 API 文件。

## 核心原則

### 1. 文件分離原則
- **每個功能一個規格文件**：不同功能的規格分開撰寫
- **每個 API 端點一個文件**：複雜的 API 規則獨立成檔
- **簡易 API 可合併**：標準 CRUD 的簡易 API 可以寫在功能規格中

### 2. 文件結構
```
docs/
├── specs/
│   ├── skill/                     # 功能模組目錄
│   │   ├── overview.md            # 功能總覽（必要）
│   │   ├── 查詢技能列表.md        # POST /api/skills/list
│   │   ├── 查詢技能詳情.md        # GET /api/skills/:id
│   │   ├── 新增技能.md            # POST /api/skills
│   │   ├── 更新技能.md            # PUT /api/skills/:id
│   │   └── 刪除技能.md            # DELETE /api/skills/:id
│   └── role-permission/
│       ├── overview.md
│       ├── 查詢角色列表.md
│       └── ...
```

**重要**：API 文件必須使用**中文功能名稱**命名，讓人從檔名就能看出是哪個 API。

## 範本

撰寫文件時，請參考以下範本：

- 功能總覽範本：[templates/overview.md](templates/overview.md)
- 簡單 API 範本（標準 CRUD）：[templates/api-simple.md](templates/api-simple.md)
- 複雜 API 額外區塊（多步驟業務邏輯）：[templates/api-complex-extra.md](templates/api-complex-extra.md)

複雜 API 文件 = 簡單 API 範本 + 複雜 API 額外區塊（在「4. 實作說明」中擴充）。

## 工作流程

### 當用戶要求撰寫規格時

**觸發條件**:
- "幫我寫[功能]的規格"
- "撰寫[功能]的功能規格"
- "[功能]需要規格文件"

**執行步驟**:
1. **詢問關鍵資訊**（如果不清楚）：
   - 功能名稱和目的
   - 主要的 API 端點有哪些
   - 是否有複雜的業務邏輯
   - 資料結構是否已定義

2. **建立功能總覽**：
   - 建立 `docs/specs/[module-name]/overview.md`
   - 包含功能概述、需求、API 總覽、資料結構

3. **建立 API 文件**：
   - 標準 CRUD：每個端點一個檔案（list, detail, create, update, delete）
   - 複雜 API：獨立檔案詳細描述業務邏輯

4. **回覆用戶**：
   - 列出建立的文件
   - 簡要說明文件內容

### 當用戶要求更新規格時

**觸發條件**:
- "更新[功能]的規格"
- "在[功能]規格中增加[描述]"
- "修改[功能]的[API]規格"

**執行步驟**:
1. **讀取現有文件**
2. **更新對應部分**
3. **更新版本號和變更歷史**
4. **回覆更新內容**

## 檔案命名規範

### 功能總覽
- `docs/specs/[module-name]/overview.md`
- 範例: `docs/specs/skill/overview.md`

### API 文件（使用中文功能名稱）
- 列表查詢: `查詢[資源]列表.md`
- 詳情查詢: `查詢[資源]詳情.md`
- 新增: `新增[資源].md`
- 更新: `更新[資源].md`
- 刪除: `刪除[資源].md`
- 自訂動作: `[動作名稱].md`（中文）

範例:
- `docs/specs/skill/查詢技能列表.md`
- `docs/specs/skill/新增技能.md`
- `docs/specs/role-permission/設定角色權限.md`

**重要**：使用中文名稱讓檔名能直接反映 API 的功能。

## 判斷 API 複雜度

### 簡單 API（標準範本即可）
- 標準 CRUD 操作
- 單一資料表操作
- 基本參數驗證
- 沒有複雜業務邏輯
- **不需要**併發控制
- **不需要**效能優化說明
- **不需要**提供 SQL 查詢範例

### 複雜 API（需要詳細文件）
- 多步驟業務流程
- 涉及多個資料表
- 需要事務處理
- 有狀態轉換邏輯
- 需要併發控制（如：設定角色權限、批次操作）
- 非同步處理
- 需要通知其他服務

## 最佳實踐

### 1. 清晰具體
- 避免模糊的描述
- 使用具體的範例
- 提供完整的欄位說明

### 2. 結構一致
- 所有 API 文件使用相同結構
- 統一的命名慣例
- 一致的錯誤處理格式
- Request / Response 欄位表格只需：欄位名、類型、必填、說明，**不需要**預設值和範例欄位
- Request 範例只需提供 JSON body，**不需要** HTTP 標頭（如 POST /url、Authorization、Content-Type）
- 分頁參數 page（頁碼）、pageSize（每頁筆數）必填為**是**
- Response 範例**必須**包含以下 5 個標準外層欄位：`status`、`message`、`success`、`total`、`data`

### 3. 可測試
- 每個需求都應該可驗證
- 提供測試案例清單
- 包含正常和異常情境

### 4. 可維護
- 版本控制
- 變更歷史記錄
- 交叉引用相關文件

### 5. 適當的細節
- 簡單 API 不需過度詳細
- 複雜 API 需要詳細說明業務邏輯
- 使用流程圖輔助說明

### 6. 文件開頭結構
- 在版本資訊之後、API 用途之前，加入「相關資料表」區塊
- 列出此 API 會異動（讀取/寫入）的資料表
- 格式範例：
```
## 相關資料表
- employees（讀取）
- course_session_enrollments（讀取）
```

## 回應格式

### 建立新規格時
```
已建立[功能名稱]規格文件：

功能總覽: docs/specs/[module]/overview.md
查詢列表: docs/specs/[module]/查詢[資源]列表.md
查詢詳情: docs/specs/[module]/查詢[資源]詳情.md
新增: docs/specs/[module]/新增[資源].md
更新: docs/specs/[module]/更新[資源].md
刪除: docs/specs/[module]/刪除[資源].md

已包含：
- 功能需求和使用者故事
- N 個 API 端點規格
- 完整的資料結構定義
- 業務規則和權限控制
- 測試案例清單
```

### 更新規格時
```
已更新[功能名稱]規格：

更新內容：
- [具體更新項目]
- 更新版本號至 vX.X.X

變更歷史已記錄
```

## 注意事項

1. **不要過度設計**：簡單功能不需要複雜文件
2. **保持更新**：功能變更時同步更新文件
3. **交叉引用**：關聯到 DB Schema 和前端 Schema
4. **實用導向**：文件是給開發團隊使用的，要實用
5. **版本控制**：重要變更要更新版本號
