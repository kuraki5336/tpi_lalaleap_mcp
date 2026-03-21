---
name: dev-web
description: Vue 3 + TypeScript 前端開發規範。撰寫或審查 Vue 組件、Composable、Store、Route Guard 時使用。包含組件結構順序、命名規範、型別定義、App 共用元件使用、Element Plus 慣例、錯誤處理等。
---

# Frontend Development Skill — Vue 3 + TypeScript

## 技術棧

- **框架**: Vue 3 (Composition API `<script setup>`) + TypeScript + Vite
- **UI**: Element Plus（自動 import）
- **狀態**: Pinia（Composition API setup stores）
- **路由**: Vue Router（含自訂 guards）
- **工具**: VueUse, date-fns, lodash-es, Sortable.js
- **樣式**: Tailwind CSS + SCSS (scoped)

---

## 專案目錄結構

```
frontend/src/
├── assets/              # SVG icons、圖片資源
├── components/          # 共用 App 級元件（app-table, app-dialog 等）
├── composables/         # 共用 Composition Functions (use-*.ts)
├── data/                # 靜態資料
├── enums/               # Enum 常數（api-path, router-name, flag 等）
├── guards/              # Route Guards（auth-guard, theme-guard）
├── layouts/             # 佈局元件（main-layout）
├── models/              # TypeScript 介面
│   └── api/             # Request/Response 型別定義
├── router/              # Vue Router 設定
├── services/            # API Service 類別 (*.service.ts)
├── stores/              # Pinia Stores
├── styles/              # 全域樣式
│   ├── variables/       # SCSS 變數 (_colors.scss, _font.scss)
│   ├── element-plus/    # Element Plus 覆寫
│   └── main.scss        # CSS custom properties、dark mode
├── types/               # 全域型別定義
├── typings/             # 額外型別宣告
├── utils/               # 工具函數
│   └── api/             # ApiFactory、helpers (isApiSuccess, resolveApiData)
└── views/               # 頁面級元件（按功能分資料夾）
```

### 元件資料夾結構

```
components/app-table/
├── app-table.vue           # 主元件
├── composables/            # 元件專用 composable
│   └── use-app-table-resize.ts
└── types/                  # Props、Emits、型別
    ├── app-table-props.ts
    ├── app-table-emits.ts
    ├── app-table-slot-data.ts
    ├── table-column.ts
    ├── pagination-type.ts
    └── index.ts            # Barrel export
```

---

## Vue 組件結構順序（必須嚴格遵循）

```vue
<script setup lang="ts">
// 1. Type/Interface 定義
// 2. defineOptions
// 3. Props（withDefaults + defineProps）
// 4. Emits（defineEmits）
// 5. Route/Router
// 6. Store
// 7. 子組件 Ref
// 8. ref 變數
// 9. reactive 變數
// 10. computed
// 11. 一般方法
// 12. async 方法
// 13. defineExpose
// 14. watch
// 15. 生命週期 hooks（onMounted 等）
</script>

<template>...</template>

<style lang="scss" scoped>
...
</style>
```

---

## 命名規範

### 檔案命名

| 類別 | 規則 | 範例 |
|:-----|:-----|:-----|
| 組件 | `kebab-case.vue`（至少 2 單字） | `app-button.vue`, `user-list.vue` |
| Composable | `use-*.ts` | `use-server-pagination.ts` |
| Service | `*.service.ts` | `require.service.ts` |
| Store | `*.ts`（依領域命名） | `project.ts`, `auth.ts` |
| Enum | `kebab-case.ts` | `api-path.ts`, `flag.ts` |
| Model | `kebab-case.ts` 在 `models/api/` | `require-request.ts` |

### 變數命名

- **camelCase**: 變數、函數（`userName`, `fetchData`）
- **PascalCase**: 組件、Class、Interface（`AppButton`, `UserData`）
- **UPPER_SNAKE_CASE**: 常數（`MAX_COUNT`, `API_URL`）
- **Boolean**: `is*`, `has*`, `can*` 前綴（`isLoading`, `hasPermission`）
- **Handler**: `on*` 或 `handle*` 前綴（`onSubmit`, `handleDelete`）

---

## TypeScript 規範

### Props 定義

```typescript
interface Props {
  modelValue: string
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
  disabled: false
})
```

### Emits 定義

```typescript
const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [data: FormData]
  cancel: []
}>()
```

### API Response 型別

```typescript
// frontend/src/models/api/user-response.ts
export interface UserResponse {
  id: string
  name: string
  email: string
}
```

---

## App 共用元件使用

### AppTable

核心表格元件，支援分頁、欄位拖拉調整寬度、多選。

```typescript
import AppTable from '@/components/app-table/app-table.vue'
import type { TableColumn, AppTableSlotData } from '@/components/app-table/types'

// 欄位定義
const columns: TableColumn<RequireData>[] = [
  { title: '名稱', field: 'name', minWidth: '200' },
  { title: '狀態', field: 'status', type: 'select', width: '120' },
  { title: '優先級', field: 'priority', type: 'priority-select', width: '100' },
  { title: '日期', field: 'dueDate', type: 'date-picker', width: '150' }
]
```

```vue
<AppTable
  :columns="columns"
  :data="tableData"
  row-key="rno"
  v-bind="tableProps"
  v-on="tableEvent"
  enable-resize
>
  <template #name="{ row }: AppTableSlotData<RequireData>">
    {{ row.name }}
  </template>
</AppTable>
```

**搭配分頁 composable：**

```typescript
const { tableProps, tableEvent, getApiParams } = useServerPagination()

async function fetchList() {
  const res = await api.require.getList({ ...filters, ...getApiParams() })
  if (isApiSuccess(res)) {
    tableData.value = resolveApiData(res)
  }
}
```

### AppDialog

包裝 Element Plus Dialog，標準化 header/footer。

```vue
<AppDialog
  v-model="dialogVisible"
  title="編輯需求"
  type="confirm"
  :loading="isSaving"
  confirm-button-text="儲存"
  cancel-button-text="取消"
  @confirm="handleSave"
  @cancel="dialogVisible = false"
  @closed="resetForm"
>
  <!-- 內容 -->
</AppDialog>
```

**type 選項：**
- `'alert'` — 僅一個按鈕（alertButtonText）
- `'confirm'` — 確認 + 取消按鈕
- `'none'` — 無按鈕，自行處理

### AppDropdown

```vue
<AppDropdown>
  <template #trigger>
    <AppButton>選項</AppButton>
  </template>
  <template #default>
    <el-dropdown-item @click="handleAction">操作</el-dropdown-item>
  </template>
</AppDropdown>
```

---

## Composable 模式（實際 Codebase）

### useServerPagination — 伺服器端分頁

```typescript
import { useServerPagination } from '@/composables'

const { tableProps, tableEvent, getApiParams, setTotal } = useServerPagination()

// tableProps: 綁定到 AppTable（currentPage, pageSize, total, paginationType）
// tableEvent: 綁定到 AppTable 事件（update:current-page）
// getApiParams(): 回傳 { page, limit } 供 API 呼叫
// setTotal(n): 設定總筆數
```

### useClientPagination — 客戶端分頁

```typescript
const { tableProps, tableEvent, setCurrentPage } = useClientPagination()
// 預設 pageSize: 12
```

### useResponsive — 響應式斷點

```typescript
import { useResponsive } from '@/composables'

const { isMobile, isTablet, isDesktop } = useResponsive()
// isMobile: ≤768px, isTablet: 768px-976px, isDesktop: >976px
```

### useToast — Toast 通知

```typescript
import { useToast } from '@/composables'

const { openToast } = useToast()
openToast('success', '操作成功')
openToast('error', '操作失敗')
```

### Domain Composable 模式（如 useRequireData）

封裝特定領域的表格設定與 CRUD 邏輯，回傳元件需要的 props 與方法。

```typescript
export function useRequireData() {
  const columns = computed<TableColumn<RequireData>[]>(() => [...])
  const updateData = async (data: RequireUpdateRequest) => { ... }
  return { columns, updateData }
}
```

### Composable 匯出慣例

所有共用 composable 從 `composables/index.ts` barrel export：

```typescript
import { useServerPagination, useToast } from '@/composables'
```

---

## 狀態管理（Pinia）

```typescript
export const useUserStore = defineStore('user', () => {
  const userData = ref<User | null>(null)
  const isLoading = ref(false)
  const userName = computed(() => userData.value?.name || '')

  async function fetchUser(id: string) {
    isLoading.value = true
    try {
      const res = await api.user.getUser(id)
      if (isApiSuccess(res)) { userData.value = resolveApiData(res) }
    } finally { isLoading.value = false }
  }

  return { userData, isLoading, userName, fetchUser }
})
```

### 在組件中使用

```typescript
const userStore = useUserStore()
const { fetchUser } = userStore
const { userData, isLoading } = storeToRefs(userStore)
```

### 主要 Store

`useAuthStore`（Token）、`useUserStore`（使用者）、`useProjectStore`（當前專案 pno）、`useProjectListStore`、`useMenuStore`、`useLoadingStore`、`usePageStore`、`useCustomThemeStore`

---

## Route Guards

### authGuard

驗證 Token 與使用者資料，未登入導向 `/login?redirect=`。Token Store 為空時從 Cookies 還原。

### themeGuard

導航時套用使用者主題設定。

### ssoRedirectGuard

處理 SSO OAuth callback 流程。

---

## Element Plus 慣例

- **自動 import**：透過 `unplugin-vue-components`，不需手動 import El* 組件
- **手動 import 例外**：`import { ElMessage } from 'element-plus'`
- **通知**：`ElMessage.success()` / `.error()` / `.warning()`
- **Loading**：`<div v-loading="isLoading">...</div>`
- **主題覆寫**：`frontend/src/styles/element-plus/`，使用 Tailwind `theme()` 函數

---

## Import 排序規則

```typescript
// 1. 外部套件
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'

// 2. Type imports
import type { TableColumn } from '@/components/app-table/types'

// 3. 內部 @/ 別名 imports
import AppTable from '@/components/app-table/app-table.vue'
import { useServerPagination, useToast } from '@/composables'
import { api } from '@/services'
import { isApiSuccess, resolveApiData } from '@/utils/api'

// 4. 相對路徑 imports
import SubComponent from './components/sub-component.vue'
```

---

## 新檔案建立指引

| 需求 | 位置 | 命名 |
|:-----|:-----|:-----|
| 新頁面 | `frontend/src/views/{feature}/index.vue` | kebab-case 資料夾 |
| 新共用元件 | `frontend/src/components/{name}/{name}.vue` | kebab-case, 2+ 單字 |
| 新 API 端點 | `frontend/src/services/{name}.service.ts` + 註冊到 `services/index.ts` | |
| 新 Composable | `frontend/src/composables/use-{name}.ts` + export from `index.ts` | |
| 新 Store | `frontend/src/stores/{name}.ts` | |
| 新 Enum | `frontend/src/enums/{name}.ts` + export from `index.ts` | |
| 新 Model | `frontend/src/models/api/{name}-request.ts` / `{name}-response.ts` | |

---

## API 呼叫模式

### Service 定義

```typescript
// frontend/src/services/user.service.ts
export class UserService extends ApiFactory {
  constructor() { super(ApiPath.USER) }

  getList(data: UserQueryRequest, enableLoading = true) {
    return super.execGetList(data, {
      headers: { enableLoading, 'X-Version': 2, cancelable: true }
    })
  }

  getDetail(userId: string) {
    return this.get<void, ApiDataResponse<UserDetailResponse>>(`detail/${userId}`)
  }
}
```

### 標準呼叫

```typescript
import { api } from '@/services'
import { isApiSuccess, resolveApiData } from '@/utils/api'

const res = await api.user.getList({ page: 1, pageSize: 10 })
if (isApiSuccess(res)) {
  data.value = resolveApiData(res)
} else {
  ElMessage.error(res.data.message || '操作失敗')
}
```

### ApiFactory 速查

```typescript
protected execGetList(data, config?)        // POST /api/{path}/list
protected execGetStageList(data, config?)   // POST /api/{path}/stagelist
protected execGetData(...ids)               // GET  /api/{path}/{id}
protected create(data, config?)             // POST /api/{path}/add
protected update(data, config?)             // POST /api/{path}/edit
protected save(data, config?)              // POST /api/{path}/save
protected delete(data)                      // POST /api/{path}/delete
```

---

## 錯誤處理

```typescript
try {
  const res = await api.data.save(data)
  if (isApiSuccess(res)) {
    ElMessage.success('儲存成功')
  } else {
    ElMessage.error(res.data.message || '操作失敗')
  }
} catch (error) {
  ElMessage.error('網路錯誤,請稍後再試')
  console.error(error)
}
```

---

## 效能優化

```typescript
// ✅ 使用 computed 快取
const filteredList = computed(() => list.value.filter((item) => item.active))

// ✅ 使用 watchDebounced
import { watchDebounced } from '@vueuse/core'
watchDebounced(searchKeyword, (val) => performSearch(val), { debounce: 500 })

// ✅ 清理副作用
onUnmounted(() => { clearInterval(timer); abortController?.abort() })
```

---

## ESLint 規則

- `===` 而非 `==`
- `const` 優先（除非需重新賦值用 `let`）
- 禁止 `var`
- 函數複雜度 ≤ 15
- 避免 `any`

---

## DO / DON'T

### ✅ DO

1. 遵循組件結構順序（1-15）
2. 使用 TypeScript 型別定義
3. isApiSuccess + try-catch 錯誤處理
4. computed / watchDebounced 效能優化
5. 重複邏輯抽成 composable
6. AppTable / AppDialog / AppDropdown 共用元件
7. useServerPagination 處理分頁
8. onUnmounted 清理副作用

### ❌ DON'T

1. 直接操作 DOM
2. 使用 `var`
3. 忽略 ESLint 警告
4. 函數過度巢狀（複雜度 > 15）
5. 使用 `any`
6. 重複 API 邏輯
7. 硬編碼顏色 — 見 `skills/style-guide`

---

## 開發工具

```bash
cd frontend
pnpm run dev          # 啟動開發伺服器
pnpm run lint         # ESLint 檢查
pnpm run type-check   # TypeScript 型別檢查
```

---

## 交叉引用

- 色彩 Token → `skills/style-guide/skill.md`
- 後端 API 規範 → `skills/dev-ap/SKILL.md`
- SA 欄位規格 → `skills/sa-spec-writer/SKILL.md`
- API 規格撰寫 → `skills/api-spec-writer/skill.md`

---

**專注於**: 程式邏輯、型別安全、組件結構、效能優化、錯誤處理
