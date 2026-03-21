# [動作名稱] API

**版本**: v1.0.0
**建立日期**: YYYY-MM-DD
**最後更新**: YYYY-MM-DD

## 相關資料表
- {table_name}（讀取/寫入）

## 1. API 概述

### 1.1 用途
{簡述此 API 的主要功能與使用場景}

### 1.2 基本資訊
| 欄位 | 說明 |
|------|------|
| Content-Type | application/json |
| Method | {GET / POST / PUT / DELETE} |
| URL | /api/{resource} |
| Authorization | Bearer Token |

## 2. Request

### 2.1 Headers
| 名稱 | 必填 | 說明 |
|------|------|------|
| X-UserId | 是 | 使用者編號 |

### 2.2 Path Parameters（如有）
| 參數名 | 類型 | 必填 | 說明 |
|--------|------|------|------|
| id | string | 是 | 資源 ID (UUID) |

### 2.3 Request Body（如有）
| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| page | int | 是 | 頁碼 |
| pageSize | int | 是 | 每頁筆數 |
| keyword | string | 否 | 關鍵字搜尋 |

### 2.4 Request 範例
```json
{
  "page": 1,
  "pageSize": 10,
  "keyword": "搜尋文字"
}
```

## 3. Response

### 3.1 Response 欄位說明
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | string | 資源 ID |

### 3.2 Response 範例 (200 OK)
```json
{
  "status": 200,
  "message": "success",
  "success": true,
  "total": 1,
  "data": {}
}
```

## 4. 實作說明

### 4.1 業務邏輯流程
1. 驗證權限
2. 驗證參數
3. 執行業務邏輯
4. 回傳結果

## 5. 錯誤代碼

| 錯誤碼 | HTTP 狀態 | 說明 |
|-------|----------|------|
| [MODULE]_NOT_FOUND | 404 | 資源不存在 |

## 6. 測試案例

### 6.1 正常流程
- [ ] 測試案例1

### 6.2 異常流程
- [ ] 測試案例1

## 7. 變更歷史

| 版本 | 日期 | 修改內容 | 修改人 |
|------|------|----------|--------|
| v1.0.0 | YYYY-MM-DD | 初版建立 | - |
