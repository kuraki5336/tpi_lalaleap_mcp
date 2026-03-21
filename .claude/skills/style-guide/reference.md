# Style Guide — 設計稿參考（Figma）

> **注意**：此文件記錄的是 Figma 設計稿中的色彩規格（深藍色系 Primary `#00416A`）。
> 實際程式碼使用的色彩系統已調整為紫色系（Primary `#6651e4`）。
> **開發時請以 `skill.md` 和 `frontend/src/styles/variables/_colors.scss` 為準。**
> 此文件僅作為設計意圖的歷史參考。
>
> 原始來源：Figma 設計稿「訓練管理平台（內部）」

---

## 色彩系統

### Primary 主色（深藍色系）

| Token       | HEX       | 用途                           |
|:------------|:----------|:-------------------------------|
| Primary 10  | `#F4FAFD` | 最淺底色                       |
| Primary 20  | `#D6EAF5` | 淺色背景、hover 底色           |
| Primary 30  | `#A3CCE2` | 淺色標籤背景、disabled 狀態    |
| Primary 40  | `#6FAECF` | 中間色調                       |
| Primary 50  | `#1A6B9A` | 輔助強調                       |
| Primary 60  | `#00416A` | **主色** — Headings、nav、logo |
| Primary 70  | `#003557` | hover 狀態                     |
| Primary 80  | `#002A45` | active / pressed 狀態          |
| Primary 90  | `#001E33` | 深色強調、深色文字             |

### Secondary 次要色（亮藍色系）

| Token        | HEX       | 用途                              |
|:-------------|:----------|:----------------------------------|
| Secondary 10 | `#E8F4FC` | 淺色背景                          |
| Secondary 20 | `#C4E2F6` | 淺色標籤                          |
| Secondary 30 | `#8DC8ED` | 輔助元素                          |
| Secondary 40 | `#5BB0E4` | 中間色調                          |
| Secondary 50 | `#3298DC` | **次要色** — CTA 按鈕、accents    |
| Secondary 60 | `#2882C2` | hover 狀態                        |
| Secondary 70 | `#1F6DA6` | active 狀態                       |
| Secondary 80 | `#17578A` | 深色輔助                          |
| Secondary 90 | `#0E3F6B` | 最深色調                          |

### 情境色（功能色）

| 類別    | 10（淺底色） | 30（中間色） | 50（主色）  | 用途                   |
|:--------|:-------------|:-------------|:------------|:-----------------------|
| Success | `#EDF7ED`    | `#A5D6A7`   | `#4CAF50`   | 成功、通過、正確       |
| Warning | `#FFF8E1`    | `#FFE082`   | `#FFC107`   | 警示、處理中、注意     |
| Danger  | `#FDECED`    | `#F1959B`   | `#E63946`   | 錯誤、刪除、危險操作   |
| Info    | `#E8F4FC`    | `#8DC8ED`   | `#3298DC`   | 資訊提示、說明         |

**情境色使用規則：**
- 10 色階用於背景底色（如 alert、badge 背景）
- 30 色階用於邊框或中間狀態
- 50 色階用於圖標、文字、主要標識

### 背景色（BG）

| Token  | HEX       | 用途                              |
|:-------|:----------|:----------------------------------|
| BG 10  | `#1C1C1C` | 深色背景（如深色模式、footer）     |
| BG 20  | `#404040` | 深色輔助                          |
| BG 30  | `#5F5F5F` | 深灰                              |
| BG 40  | `#818181` | 中灰                              |
| BG 50  | `#9C9C9C` | 灰色分隔線                        |
| BG 60  | `#BBBBBB` | 淺灰邊框                          |
| BG 70  | `#DEDEDE` | 淺灰分隔、disabled 背景           |
| BG 80  | `#F2F2F2` | 表格斑馬紋、卡片背景              |
| BG 90  | `#FAFAFA` | 極淺背景                          |

**全站背景色：`#F4FAFD`**

### 文字色（Text）

| Token   | HEX       | 用途                         |
|:--------|:----------|:-----------------------------|
| Text 10 | `#FFFFFF` | 深色背景上的白色文字         |
| Text 20 | `#CBD5E1` | placeholder 文字（Slate 300）|
| Text 30 | `#94A3B8` | disabled 文字（Slate 400）   |
| Text 50 | `#94A3B8` | 輔助說明文字（Slate 400）    |
| Text 70 | `#64748B` | 次要文字、描述（Slate 500）  |
| Text 90 | `#475569` | **主要文字**（Slate 600）    |

### Alpha 色（白色透明度）

| Token | 透明度 | 用途                     |
|:------|:-------|:-------------------------|
| A100  | 100%   | 純白                     |
| A70   | 70%    | 半透明白色覆蓋           |
| A50   | 50%    | 毛玻璃效果               |
| A30   | 30%    | 淺覆蓋                   |
| A10   | 10%    | 極淺覆蓋                 |

---

## 字體系統（Typography）

### 字體家族

| 用途     | 字體                                          | CSS Variable       |
|:---------|:----------------------------------------------|:--------------------|
| 中文     | `Noto Sans TC`                                | `--font-zh`         |
| 英文     | `Rounded Mplus 1c` / `Rounded Mplus 1c Bold` | `--font-en`         |
| 等寬字體 | `JetBrains Mono`（程式碼用）                  | `--font-mono`       |

### 中文字體規格（Noto Sans TC）

| Style            | Weight       | Size  | Line Height | Letter Spacing |
|:-----------------|:-------------|:------|:------------|:---------------|
| Ch/H1            | Bold (700)   | 32px  | 40px (1.25) | 4%             |
| Ch/H2            | Bold (700)   | 24px  | 30px (1.25) | 4%             |
| Ch/H3            | Bold (700)   | 20px  | 28px (1.4)  | 4%             |
| Ch/Subtitle 1    | Bold (700)   | 16px  | 24px (1.5)  | 4%             |
| Ch/Subtitle 2-B  | Bold (700)   | 14px  | 20px (1.4)  | 4%             |
| Ch/Subtitle 3    | Medium (500) | 13px  | 18px (1.4)  | 4%             |
| Ch/Body Medium   | Medium (500) | 16px  | 24px (1.5)  | 4%             |
| Ch/Body Regular  | Regular (400)| 16px  | 24px (1.5)  | 4%             |
| Ch/Caption Medium| Medium (500) | 14px  | 20px (1.4)  | 4%             |
| Ch/Caption Regular| Regular (400)| 14px | 20px (1.4)  | 4%             |
| Ch/Tiny Medium   | Medium (500) | 12px  | 16px (1.33) | 4%             |
| Ch/Tiny Regular  | Regular (400)| 12px  | 16px (1.33) | 4%             |

### 英文字體規格（Rounded Mplus 1c）

| Style            | Weight       | Size  | Line Height | Letter Spacing |
|:-----------------|:-------------|:------|:------------|:---------------|
| EN/H1            | Bold (700)   | 32px  | 40px (1.25) | 5%             |
| EN/H2            | Bold (700)   | 24px  | 30px (1.25) | 5%             |
| EN/H3            | Bold (700)   | 20px  | 28px (1.4)  | 5%             |
| EN/Subtitle 1    | Bold (700)   | 16px  | 24px (1.5)  | 5%             |
| EN/Subtitle 2-B  | Bold (700)   | 14px  | 20px (1.4)  | 5%             |
| EN/Subtitle 3    | Medium (500) | 13px  | 18px (1.4)  | 5%             |
| EN/Body Medium   | Medium (500) | 16px  | 24px (1.5)  | 5%             |
| EN/Body Regular  | Regular (400)| 16px  | 24px (1.5)  | 5%             |
| EN/Caption Medium| Medium (500) | 14px  | 20px (1.4)  | 5%             |
| EN/Caption Regular| Regular (400)| 14px | 20px (1.4)  | 5%             |
| EN/Tiny Medium   | Medium (500) | 12px  | 16px (1.33) | 5%             |
| EN/Tiny Regular  | Regular (400)| 12px  | 16px (1.33) | 5%             |

### 字體使用指引

- **頁面標題**：H1（32px Bold）— 僅用於主要頁面標題
- **區塊標題**：H2（24px Bold）— 卡片標題、區塊標題
- **次級標題**：H3（20px Bold）— 表格標題、對話框標題
- **小標題**：Subtitle 1（16px Bold）— 表單區塊標題
- **標籤文字**：Subtitle 2-B（14px Bold）— 表單 label、按鈕文字
- **輔助標籤**：Subtitle 3（13px Medium）— 次要標籤
- **正文**：Body Regular/Medium（16px）— 一般內文
- **表格內文**：Caption Regular/Medium（14px）— 表格資料、說明文字
- **最小文字**：Tiny（12px）— 時間戳記、版權、極小提示

---

## 圓角（Border Radius）

| 元素             | 值    |
|:-----------------|:------|
| 卡片 / 對話框    | 12px  |
| 按鈕 / 輸入框    | 8px   |
| 標籤（Tag）      | 6px   |
| 小元素 / Checkbox| 4px   |

## 陰影與邊框

- 預設狀態：`box-shadow: 0 1px 3px rgba(0,65,106,0.08)` + `border: 1px solid #DEDEDE`
- Hover 狀態：`box-shadow: 0 4px 12px rgba(0,65,106,0.12)` 搭配微幅上移
- 卡片預設：`box-shadow: 0 2px 8px rgba(0,65,106,0.06)`

## 互動效果

- 所有按鈕與可互動元素：`transition: all 0.3s ease`
- 點擊回饋：`transform: scale(0.97)`
- Header 毛玻璃：`backdrop-filter: blur(12px)`
- hover 色彩變化：使用色階中下一階的顏色（如 Primary 60 `#00416A` → Primary 70 `#003557`）

## 間距系統

| Token | 值    | 用途                   |
|:------|:------|:-----------------------|
| xs    | 4px   | 元素內微間距           |
| sm    | 8px   | 元素間小間距           |
| md    | 16px  | 區塊內間距             |
| lg    | 24px  | 區塊間間距             |
| xl    | 32px  | 大區塊間距             |
| 2xl   | 48px  | 頁面級間距             |

## Z-index 層級

| 層級           | Z-index |
|:---------------|:--------|
| Header         | 10      |
| Sidebar        | 100     |
| Dropdown/Popup | 200     |
| Modal Overlay  | 999     |
| Modal / Drawer | 1000    |
| Toast          | 2000    |

## RWD 響應式斷點

| 斷點 | 寬度    |
|:-----|:--------|
| sm   | 640px   |
| md   | 768px   |
| lg   | 1024px  |
| xl   | 1280px  |
| 2xl  | 1536px  |

---

## 備註

- 色階系統以 Primary `#00416A` 深藍為基準進行色彩調配
- Figma 僅建立有使用到的色票，開發端使用色階框架建立完整 color token
- 文字色採用 Tailwind Slate 色系，與深藍主色系自然搭配
- 情境色（Success / Warning / Danger / Info）若與專案主色調太接近，可微調以確保辨識度
