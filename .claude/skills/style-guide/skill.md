---
name: style-guide
description: 專案視覺設計規範 — 色彩系統、字體排版、間距、圓角、陰影、互動效果、Dark Mode、z-index。建立或修改 UI 元件時必須遵循。
---

# Style Guide — 設計 Token 與視覺規範

## 色彩來源聲明

> **Source of Truth**: `frontend/src/styles/variables/_colors.scss`
> `reference.md` 為 Figma 設計稿參考（深藍色系），與實際程式碼色值（紫色系）不同。
> 開發時一律以程式碼中的色值為準。

---

## 色彩架構流程

```
SCSS 變數 (_colors.scss)
  ↓ 透過 #{$var} 插值
CSS Custom Properties (main.scss :root)
  ↓ 透過 var(--token)
Tailwind Config (tailwind.config.js)
  ↓ 透過 utility class
元件使用
```

### 三種使用方式

| 方式 | 語法 | 使用場景 |
|:-----|:-----|:---------|
| CSS Variable | `color: var(--primary-50)` | `<style>` 區塊、SCSS 檔案 |
| Tailwind Class | `text-primary-50`、`bg-primary-50`、`border-primary-50` | `<template>` 中的 class |
| SCSS Variable | `$primary-50` | 僅在 `.scss` 檔案中使用 |

---

## 色票表（程式碼實際值）

### Primary（紫色系）— 品牌主色、按鈕、連結、強調

| Token | HEX | CSS Variable | Tailwind | 用途 |
|:------|:----|:-------------|:---------|:-----|
| 90 | `#291d6e` | `var(--primary-90)` | `*-primary-90` | 最深色調 |
| 80 | `#312386` | `var(--primary-80)` | `*-primary-80` | active / pressed |
| 70 | `#4131a1` | `var(--primary-70)` | `*-primary-70` | hover 狀態 |
| 60 | `#5b48ca` | `var(--primary-60)` | `*-primary-60` | hover 輔助 |
| **50** | **`#6651e4`** | `var(--primary-50)` | `*-primary-50` | **主色** — CTA、按鈕、連結 |
| 40 | `#7663ed` | `var(--primary-40)` | `*-primary-40` | 淺色強調 |
| 30 | `#8977f5` | `var(--primary-30)` | `*-primary-30` | 輔助元素 |
| 20 | `#aa9dfe` | `var(--primary-20)` | `*-primary-20` | 淺色標籤 |
| 10 | `#d2caff` | `var(--primary-10)` | `*-primary-10` | 極淺背景 |

### Secondary（淡紫灰系）— 次要元素、輔助裝飾

| Token | HEX | 用途 |
|:------|:----|:-----|
| 90 | `#5f5a80` | 最深 |
| 80 | `#716c96` | 深色輔助 |
| 70 | `#8881a9` | 中深 |
| 60 | `#a29cbf` | 中間色 |
| **50** | **`#bfb9d8`** | **次要色** |
| 40 | `#d3cee7` | 淺色 |
| 30 | `#e3def3` | 更淺 |
| 20 | `#ececfa` | 極淺 |
| 10 | `#f7f7fc` | 最淺背景 |

### Text（文字色）

| Token | HEX | 用途 |
|:------|:----|:-----|
| 90 | `#000` | 最深黑 — 極少使用 |
| 80 | `#161616` | 深黑 — 重要標題 |
| **70** | **`#323232`** | **主文字** — 內文、標籤 |
| 60 | `#464646` | 次要文字 — Label |
| 50 | `#6f6f6f` | 灰色文字 — 輔助說明 |
| 40 | `#a8a8a8` | 淺灰 — placeholder |
| 30 | `#c6c6c6` | 更淺 — disabled |
| 20 | `#e0e0e0` | 極淺 — disabled 文字 |
| 10 | `#fff` | 白色 — 深色背景上的文字 |

### BG（背景色）

| Token | HEX | 用途 |
|:------|:----|:-----|
| **90** | **`#fff`** | **白色背景** — 卡片、面板 |
| 80 | `#f5f5f5` | 淺灰 — hover、斑馬紋 |
| 70 | `#e0e0e0` | 灰色 — 邊框、分隔線 |
| 60 | `#c2c2c2` | 中灰 |
| 50 | `#a3a3a3` | 中性灰 |
| 40 | `#858585` | 深灰 |
| 30 | `#5c5c5c` | 更深 |
| 20 | `#292929` | 極深 |
| 10 | `#000` | 黑色 |

### 語義色

| 色系 | 主色(50) | 用途 |
|:-----|:---------|:-----|
| Blue | `#4567f3` | 連結、資訊提示 |
| Green | `#61e192` | 成功、通過 |
| Red | `#d91616` | 錯誤、刪除、危險 |
| Yellow | `#f8992a` | 警告、處理中 |
| Gray | `#8d8d8d` | 中性、disabled |

**語義色使用規則：**
- **10 色階**：背景底色（alert、badge 背景）
- **30 色階**：邊框、中間狀態
- **50 色階**：圖標、文字、主要標識

---

## Dark Mode

### 運作機制

`html.dark` class 切換時，`main.scss` 中的 CSS variable 會被覆寫。色階方向反轉：

```
Light: 90 = 最深, 10 = 最淺
Dark:  90 = 最淺, 10 = 最深（反轉）
```

### Dark Mode 色票（關鍵變更）

| Token | Light 值 | Dark 值 | 說明 |
|:------|:---------|:--------|:-----|
| primary-50 | `#6651e4` | `#9f94e3` | 主色提亮 |
| primary-10 | `#d2caff` | `#4c37ca` | 最淺→最深反轉 |
| text-90 | `#000` | `#fff` | 主文字反轉 |
| text-70 | `#323232` | `#d9d9d9` | 內文反轉 |
| bg-90 | `#fff` | `#1b1b1b` | 卡片背景→深色 |
| bg-80 | `#f5f5f5` | `#282828` | hover 背景→深色 |

### Dark Mode 相容規則

1. **永遠使用 CSS variable 或 Tailwind class**，不可硬編碼 HEX
2. 陰影可用 `rgb(0 0 0 / 8%)` — 這是唯一允許硬編碼的情況
3. 新增顏色時必須在 `main.scss` 的 `html.dark` 區塊中加入對應覆寫
4. Element Plus dark mode 已透過 `element-plus/theme-chalk/dark/css-vars.css` 啟用

---

## Token 快速決策指南

| 我要... | 使用 Token |
|:--------|:-----------|
| 主文字（內文、標籤） | `var(--text-70)` / `text-text-70` |
| 次要文字（說明） | `var(--text-50)` / `text-text-50` |
| Placeholder 文字 | `var(--text-40)` / `text-text-40` |
| Disabled 文字 | `var(--text-30)` / `text-text-30` |
| 白色文字（深色底） | `var(--text-10)` / `text-text-10` |
| 卡片/面板背景 | `var(--bg-90)` / `bg-bg-90` |
| Hover 背景 | `var(--bg-80)` / `bg-bg-80` |
| 邊框 | `var(--bg-70)` / `border-bg-70` |
| 主要按鈕 | `var(--primary-50)` |
| 按鈕 hover | `var(--primary-60)` |
| 按鈕 active | `var(--primary-70)` |
| 連結文字 | `var(--blue-60)` |
| 成功提示 | `var(--green-50)` |
| 錯誤/危險 | `var(--red-50)` |
| 警告 | `var(--yellow-50)` |

---

## 字體系統

### 字體家族

```css
font-family: 'Noto Sans', 'Noto Sans JP', sans-serif;
```

### SCSS Placeholder

| Placeholder | Size | Weight | 用途 |
|:------------|:-----|:-------|:-----|
| `%h1` | 36px | 700 | 頁面主標題 |
| `%h2` | 24px | 700 | 區塊標題、卡片標題 |
| `%h3` | 20px | 700 | 表格標題、對話框標題 |
| `%h4` | 16px | 700 | 表單區塊標題 |
| `%sub-title1` | 16px | 500 | 次標題 |
| `%sub-title2` | 14px | 700 | 表單 label、按鈕文字 |
| `%body` | 14px | 400 | **預設內文**（全站 body） |
| `%caption1` | 12px | 700 | 小標籤（粗） |
| `%caption2` | 12px | 400 | 小標籤（一般） |

### 使用方式

```scss
// 在 <style scoped> 中
.title {
  @extend %h3;
}
```

Utility classes: `.sub-title1`、`.sub-title2`、`.caption1`、`.caption2`

---

## 間距系統（4px 倍數）

| Token | 值 | Tailwind | 用途 |
|:------|:---|:---------|:-----|
| xs | 4px | `gap-1` / `p-1` | 元素內微間距 |
| sm | 8px | `gap-2` / `p-2` | 元素間小間距 |
| md | 12px | `gap-3` / `p-3` | 按鈕 padding |
| lg | 16px | `gap-4` / `p-4` | 卡片內容 padding |
| xl | 20px | `gap-5` / `p-5` | 抽屜 padding |
| 2xl | 24px | `gap-6` / `p-6` | 區段間距 |
| 3xl | 32px | `gap-8` / `p-8` | 大區塊間距 |

## 圓角

| 元素 | 值 |
|:-----|:---|
| Checkbox | 2px |
| Button / Input | 4px |
| 小卡片 | 6px |
| 卡片 | 8px |
| 大型卡片 / Dialog | 12px |

## 陰影

```scss
// 極淺 — hover
box-shadow: 0 2px 4px rgb(0 0 0 / 5%);
// 淺 — 卡片
box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
// 中 — 抽屜、彈窗
box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
// 深 — Modal
box-shadow: 0 8px 24px rgb(0 0 0 / 15%);
```

> 必須使用 `rgb(0 0 0 / %)` 語法，不使用舊式 `rgba()`

## Z-index

| 層級 | 值 |
|:-----|:---|
| Header | 10 |
| Sidebar | 100 |
| Dropdown / Popup | 200 |
| Modal Overlay | 999 |
| Modal / Drawer | 1000 |
| Toast | 2000 |
| Emoji Picker | 3000 |

## RWD 斷點

| 斷點 | 寬度 | Tailwind |
|:-----|:-----|:---------|
| xs | 480px | `xs:` |
| sm | 768px | `sm:` |
| md | 976px | `md:` |
| lg | 1440px | `lg:` |
| xl | 1920px | `xl:` |

---

## 檔案參照

| 檔案 | 內容 |
|:-----|:-----|
| `frontend/src/styles/variables/_colors.scss` | SCSS 色彩變數定義（source of truth） |
| `frontend/src/styles/variables/_font.scss` | 字體 placeholder 定義 |
| `frontend/src/styles/variables/index.scss` | 共用變數匯出、utility classes |
| `frontend/src/styles/main.scss` | CSS custom properties、dark mode overrides |
| `frontend/src/styles/element-plus/theme.scss` | Element Plus 主題映射 |
| `frontend/tailwind.config.js` | Tailwind 色彩/間距設定 |
| `skills/style-guide/reference.md` | Figma 設計稿參考（色值可能與程式碼不同） |

## 交叉引用

- 元件級樣式規範 → `frontend/.claude/skills/ui-styling/SKILL.md`
- 程式碼中使用方式 → `frontend/.claude/skills/code-development/SKILL.md`
