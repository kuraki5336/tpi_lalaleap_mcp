# 專案規則

## UI 框架與樣式規範

- 元件庫：Element Plus v2.7.3，大量客製化覆寫於 `frontend/src/styles/element-plus/`
- CSS 框架：Tailwind CSS v3.4.1（非 v4），色彩全部映射 CSS Variables
- 樣式語言：SCSS，Vue scoped style + `:deep()` 覆寫 Element Plus
- 字體：Noto Sans / Noto Sans JP，大小用 `%h1`~`%caption2` placeholder（scoped 內直接寫 font-size）
- Dark Mode：支援，所有色彩變數皆有 `html.dark` 覆寫
- 新增 UI 元件時，優先使用 Element Plus 現有元件 + 客製化樣式，不引入其他元件庫
- Tailwind 自定義斷點：xs(480) / sm(768) / md(976) / lg(1440) / xl(1920)

## 自主執行原則（重要）

- **不得向用戶提問**，遇到不確定的地方自己做合理假設並繼續執行
- 假設的內容在最後的回覆中統一說明，不在執行過程中打斷
- 遇到可以繼續的錯誤，自己判斷並修正；只有**完全無法繼續**時才停下來回報
- 用戶不在場時（未明確要求確認），直接完成任務

## 功能完成後產出文件規則

每完成一個功能項目後，必須產出對應的技術文件：

### 觸發時機
- 當一個功能經過多次迭代、確認完整可交付時
- AI 應主動判斷功能是否已完成，並提醒用戶產出文件
- 用戶確認後，使用對應的 skill 產出文件

### 既有文件同步更新規則（重要）
- **任何對既有功能的修改（包含 UI 佈局調整、欄位增減、API 參數變更、邏輯重構等），若該功能已有 SA/SD 文件，必須在同一次 commit 中同步更新對應文件**
- 這不需要詢問用戶，屬於強制規則：改了程式碼就必須一起改文件
- 判斷標準：只要改動涉及「畫面結構」、「欄位規格」、「API 請求/回應格式」、「商業邏輯」中的任一項，就需要更新
- 更新時直接編輯既有文件的對應段落，不需要重新產出整份文件

### SA 文件（系統分析）— 每個功能必寫
- 存放路徑：`docs/sa/{功能名稱}.md`
- 使用 `sa-spec-writer` skill 產出
- 內容涵蓋：功能概述、使用情境、畫面規格、欄位規格、操作流程、權限設定

### SD 文件（系統設計）— 僅涉及後端 API 的功能才寫
- 存放路徑：`docs/sd/{模組名稱}/overview.md`（功能總覽）+ `docs/sd/{模組名稱}/{中文動作名稱}.md`（各 API）
- 使用 `api-spec-writer` skill 產出
- **每個 API 端點必須獨立一份文件**，不可將多個 API 混寫在同一份檔案
- API 文件使用**中文功能名稱**命名（如 `使用者登入.md`、`查詢分析列表.md`）
- overview.md 遵循 skill 的 `templates/overview.md` 範本
- 各 API 文件遵循 skill 的 `templates/api-simple.md` 範本
- **純前端靜態頁面（無後端 API）不需要撰寫 SD 文件**

### 文件命名規範
- SA 文件：使用功能的英文名稱作為檔名，如 `donate.md`、`watchlist.md`
- SD 文件：模組資料夾用英文（如 `auth/`、`admin/`），API 文件用中文（如 `使用者登入.md`）
- 全部使用繁體中文撰寫

### 流程
1. 功能開發完成 → AI 主動提醒「此功能已完成，是否產出 SA/SD 文件？」
2. 用戶確認後 → 先產出 SA 文件
3. 若該功能涉及後端 API → 再產出 SD 文件
4. 文件產出後一併 commit

## 推版 Tag 規則（強制）

推版前**必須先在本地完成編譯驗證**，確認無錯誤後才能推送 tag。此為強制規則，不可跳過。

### 流程
1. 更新版本號（`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 三個檔案同步）
2. 更新 `src/constants/changelog.ts` 新增版本條目
3. **本地執行 `npm run tauri build`**，確認編譯成功、零錯誤
4. Commit 所有變更
5. 打 tag（格式：`v{版本號}`，如 `v0.3.2`）
6. Push commit + tag（`git push && git push --tags`）

### 注意事項
- **絕對不可以跳過步驟 3**（本地編譯驗證），避免 CI 建置失敗浪費時間
- 若本地 build 失敗，修正問題後重新走流程
- Tag 推送後會觸發 GitHub Actions release workflow（四平台自動建置 + 簽名）
