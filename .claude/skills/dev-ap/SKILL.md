---
name: dev-ap
description: ASP.NET Core 8.0 + C# 後端開發規範。撰寫 Controller、Service、Repository、Model 時使用。包含架構模式、命名規範、錯誤處理、資料庫操作、DI 註冊、分頁、授權等。
---

# Backend Development Skill — ASP.NET Core 8.0

## 技術棧

- **框架**: ASP.NET Core 8.0
- **語言**: C# 12.0（nullable enabled, implicit usings）
- **資料庫**: PostgreSQL（EF Core 8.0 + Dapper）、MongoDB（MongoDB.Driver）
- **認證**: JWT Bearer Token
- **授權**: 自訂 PermissionsCheck 屬性（RBAC）
- **映射**: AutoMapper 12.0
- **Excel**: NPOI
- **API 版控**: Asp.Versioning
- **排程**: Coravel
- **Namespace**: `Tpi.Lalaleap`

---

## 專案結構

```
backend/
├── Tpi.Lalaleap.sln
├── Tpi.TPAD/                          # 主 API 專案
│   ├── Controllers/                   # API Controllers
│   │   ├── BaseApiController.cs       # 基底 Controller + ResponseResult<T>
│   │   └── {Name}Controller.cs
│   ├── Interface/                     # Service 介面 (I{Name}Service.cs)
│   ├── Service/                       # Service 實作
│   ├── Repository/
│   │   ├── DataAccessLayer/           # 基底 Repository
│   │   │   ├── BaseRepository.cs      # PostgreSQL (EF Core + Dapper)
│   │   │   ├── BaseMomgoRepository.cs # MongoDB（注意: 保留原始命名）
│   │   │   ├── IBaseRepository.cs
│   │   │   └── IBaseMomgoRepository.cs
│   │   ├── Entities/                  # PostgreSQL 實體 (Tp{Name}.cs)
│   │   ├── MongoEntities/             # MongoDB 實體 (Mg{Name}.cs)
│   │   ├── Tp{Name}Repository.cs      # PostgreSQL Repository
│   │   ├── Mg{Name}Repository.cs      # MongoDB Repository
│   │   ├── ApiDbContext.cs            # EF Core DbContext
│   │   └── ApiMgContext.cs            # MongoDB Context
│   ├── Model/
│   │   ├── Request/                   # API Request DTO
│   │   ├── Response/                  # API Response DTO
│   │   ├── DTO/                       # 內部 DTO
│   │   ├── Msg/                       # 訊息常數 (MsgCodes)
│   │   └── Param/                     # 參數模型
│   ├── Extensions/
│   │   ├── FeatureServicesExtensions.cs      # DI: Service 註冊
│   │   ├── FeatureRepositoriesExtensions.cs  # DI: Repository 註冊
│   │   └── DataPagerExtensions.cs            # 分頁擴充方法
│   ├── ErrorHandling/
│   │   ├── BaseException.cs           # 例外基底類別
│   │   ├── BusinessException.cs       # 商業邏輯例外 → HTTP 400
│   │   ├── InternalException.cs       # 系統例外 → HTTP 500
│   │   ├── BusinessError.cs           # 商業錯誤列舉
│   │   ├── SystemError.cs             # 系統錯誤列舉
│   │   └── ErrorCodeType.cs           # 錯誤碼類型
│   ├── Middleware/
│   │   ├── ExceptionMiddleware.cs     # 全域例外攔截
│   │   └── LoggingMiddleware.cs       # 請求/回應記錄
│   ├── Authorization/
│   │   ├── PermissionsCheckAuthorizeAttribute.cs
│   │   ├── PermissionsCheckHandler.cs
│   │   └── PermissionsCheckPolicyProvider.cs
│   ├── Attributes/
│   │   └── BsonCollectionAttribute.cs # MongoDB Collection 名稱屬性
│   ├── Util/
│   │   ├── DictionaryUtil.cs          # Dictionary 驗證工具
│   │   ├── MappingProfiles.cs         # AutoMapper 設定
│   │   └── UnitOfWork.cs              # MongoDB UoW
│   ├── Scheduler/                     # 排程任務 (Coravel)
│   ├── STMP/                          # 郵件服務
│   └── CloudStorage/                  # GCP Cloud Storage
└── Tpi.Permissions/                   # 權限模組
```

---

## 架構流程

```
HTTP Request
  → Middleware (ExceptionMiddleware → LoggingMiddleware)
    → Controller (JWT 認證 → PermissionsCheck 授權)
      → Service (商業邏輯)
        → Repository (資料存取)
          → DbContext / MongoContext
```

---

## Controller Pattern

### BaseApiController

所有 Controller 繼承 `BaseApiController`，提供標準回應方法：

```csharp
protected ResponseResult<T> SuccessResult<T>(T content, string message = MsgCodes.Msg_00)
protected OkObjectResult Success<T>(T content, string message = MsgCodes.Msg_00)
protected OkObjectResult Failure(string message = MsgCodes.Msg_99)
```

### 標準 Controller 範本

```csharp
namespace Tpi.Lalaleap.Controllers;

[ApiVersion(1.0)]
[ApiController]
[Route("ap2/lalaleap/[controller]")]
public class RequireController : BaseApiController
{
    private readonly IRequireService _requireService;

    public RequireController(IRequireService requireService)
    {
        _requireService = requireService;
    }

    [HttpPost("add")]
    [PermissionsCheckAuthorize("require", "add")]
    public async Task<ResponseResult<RequireCreateResp>> Create(Dictionary<string, object> req)
    {
        var result = await _requireService.CreateAsync(req, User.Identity?.Name!);
        return SuccessResult(result);
    }

    [HttpPost("list")]
    [PermissionsCheckAuthorize("require", "list")]
    public async Task<DataPagerResp<Dictionary<string, object?>>> GetList(RequireListReq req)
    {
        return await _requireService.GetListAsync(req);
    }
}
```

### 重點規則

- **全部使用 `[HttpPost]`**，包含查詢（專案慣例）
- **路由格式**: `ap2/lalaleap/{controller}/{action}`
- **授權**: `[PermissionsCheckAuthorize("resource", "action")]`
- **當前用戶**: `User.Identity?.Name!`（回傳員工編號 sno）
- **回傳型別**: `ResponseResult<T>` 或 `DataPagerResp<T>`
- **所有方法**: `async Task<T>`

### API 版控

```csharp
[ApiVersion(1.0)]
[ApiVersion(2.0)]
public class RequireController : BaseApiController
{
    [HttpPost("list")]
    [MapToApiVersion(1.0)]
    public async Task<DataPagerResp<...>> GetList(RequireListReq req) { ... }

    [HttpPost("list")]
    [MapToApiVersion(2.0)]
    public async Task<DataPagerResp<...>> GetListV2(RequireListV2Req req) { ... }
}
```

### 回應格式

```csharp
// 單一物件
public class ResponseResult<T>
{
    public int Status { get; set; }        // 200 = 成功, 999 = 失敗
    public string Message { get; set; }
    public bool Success { get; set; }
    public T? Data { get; set; }
}

// 分頁列表
public class DataPagerResp<T>
{
    public int Status { get; set; }
    public string? Message { get; set; }
    public bool Success { get; set; }
    public int TotalCount { get; set; }
    public IEnumerable<T>? Data { get; set; }
}
```

---

## Service Pattern

### Interface 定義

```csharp
// backend/Tpi.TPAD/Interface/IRequireService.cs
public interface IRequireService
{
    Task<RequireCreateResp> CreateAsync(Dictionary<string, object> req, string userNo);
    Task<DataPagerResp<Dictionary<string, object?>>> GetListAsync(RequireListReq req);
    Task<Dictionary<string, object>> GetDetailListAsync(DetailListReq req);
    Task<FileContentResult> ExportAsync(RequireExportReq req);
}
```

### Service 實作

```csharp
// backend/Tpi.TPAD/Service/RequireService.cs
public class RequireService : IRequireService
{
    private readonly ILogger<RequireService> _logger;
    private readonly IMgProjectRequireRepository _mgProjectRequireRepository;
    private readonly ITpStaffRepository _tpStaffRepository;
    private readonly IMapper _mapper;
    private readonly ApiDbContext _dbContext;

    public RequireService(
        ILogger<RequireService> logger,
        IMgProjectRequireRepository mgProjectRequireRepository,
        ITpStaffRepository tpStaffRepository,
        IMapper mapper,
        ApiDbContext dbContext)
    {
        _logger = logger;
        _mgProjectRequireRepository = mgProjectRequireRepository;
        _tpStaffRepository = tpStaffRepository;
        _mapper = mapper;
        _dbContext = dbContext;
    }

    public async Task<RequireCreateResp> CreateAsync(Dictionary<string, object> req, string userNo)
    {
        _ = DictionaryUtil.ValidateRequiredFields(req, "pno");
        string pno = req["pno"].ToString()!;
        var user = await _tpStaffRepository.GetAsync(o => o.Sno == userNo);
        // 商業邏輯...
        return new RequireCreateResp { Rno = rno };
    }
}
```

### DI 註冊

```csharp
// backend/Tpi.TPAD/Extensions/FeatureServicesExtensions.cs
services.AddScoped<IRequireService, RequireService>();
```

---

## Repository Pattern

### PostgreSQL（EF Core + Dapper）

**BaseRepository 主要方法：**

```csharp
IQueryable<T> Queryable()                                    // LINQ 查詢
Task<T> GetAsync(Expression<Func<T, bool>> predicate)        // 單筆
Task<IEnumerable<T>> GetManyAsync(Expression<Func<T, bool>> predicate) // 多筆
Task<int> InsertAsync(T obj)                                 // 新增
Task<int> UpdateAsync(T obj)                                 // 更新
Task<int> DeleteAsync(T obj)                                 // 刪除
Task<int> SaveChangesAsync()                                 // 儲存
Task<IEnumerable<T>> ExecuteSqlQueryAsync(string sql, object parameters) // Dapper SQL
Task<IDbContextTransaction> BeginTransactionAsync()          // 交易
```

**Entity 範例：**

```csharp
[Table("tp_project")]
public class TpProject
{
    [Key]
    [Column("pno")]
    [StringLength(50)]
    public string Pno { get; set; } = string.Empty;

    [Column("name")]
    [StringLength(100)]
    public string? Name { get; set; }

    [Column("flag")]
    [StringLength(1)]
    public string? Flag { get; set; }    // Y=啟用, D=刪除, A=封存
}
```

### MongoDB

**BaseMomgoRepository 主要方法：**

```csharp
Task<T> GetByIdAsync(string id)
Task<T> GetByColumnAsync(string column, string value)
Task InsertAsync(T obj)
void UpdateAsync(T obj, ObjectId id)                         // ReplaceOne
Task<IEnumerable<T>> GetByMutiColumnAsync(Dictionary<string, object> fieldValues)
```

**MongoDB Entity 範例：**

```csharp
[BsonCollection("tp_project_require")]
public class MgProjectRequire : MgBaseModel
{
    [BsonElement("pno")]
    public string? Pno { get; set; }

    [BsonElement("rno")]
    public string? Rno { get; set; }

    [BsonElement("info")]
    public BsonDocument? Info { get; set; }
}
```

**MgBaseModel 共用欄位**：Id (ObjectId)、Flag、CreateUserNo、CreateDate、ModiUserNo、ModiDate

### DI 註冊

```csharp
// backend/Tpi.TPAD/Extensions/FeatureRepositoriesExtensions.cs
services.AddScoped<ITpProjectRepository, TpProjectRepository>();
services.AddScoped<IMgProjectRequireRepository, MgProjectRequireRepository>();
```

---

## Request / Response Model

### Request

```csharp
// backend/Tpi.TPAD/Model/Request/RequireListReq.cs
public class RequireListReq : DataPagerReq
{
    [Required]
    [JsonPropertyName("pno")]
    public string Pno { get; set; } = string.Empty;

    [JsonPropertyName("keyWord")]
    public string? KeyWord { get; set; }
}

// DataPagerReq — 分頁基底
public class DataPagerReq
{
    [JsonPropertyName("page")]
    public virtual int? Page { get; set; }    // 預設 1

    [JsonPropertyName("limit")]
    public virtual int? Limit { get; set; }   // 預設 20
}
```

### Response

```csharp
public class RequireCreateResp
{
    [JsonPropertyName("rno")]
    public string Rno { get; set; } = string.Empty;
}
```

### Dictionary 彈性模式

部分 API 接受 `Dictionary<string, object>` 支援動態欄位：

```csharp
DictionaryUtil.ValidateRequiredFields(req, "pno", "title");
string pno = req["pno"].ToString()!;
```

---

## 錯誤處理

### 例外層級

```
BaseException (abstract)
├── BusinessException → HTTP 400（商業邏輯錯誤）
└── InternalException → HTTP 500（系統錯誤）
```

### 錯誤列舉

```csharp
// BusinessError: TokenNotFound, LoginFail, DataNotFound, DataError, Forbidden...
// SystemError: UnknowError, EnumSettingError, DatabaseError, GoogleApiError
```

### 使用方式

```csharp
throw new BusinessException(BusinessError.DataNotFound, "找不到此需求");
throw new InternalException(SystemError.DatabaseError, "資料庫連線失敗");
```

### ExceptionMiddleware 行為

- **BusinessException** → HTTP 400，錯誤碼 `TRNS.DataNotFound`
- **InternalException** → HTTP 500，錯誤碼 `SYS.DatabaseError`
- 錯誤碼放在 `X-Error-Code` response header

---

## AutoMapper

```csharp
// backend/Tpi.TPAD/Util/MappingProfiles.cs
public class MappingProfiles : Profile
{
    public MappingProfiles()
    {
        CreateMap<TpStage, RequireStageListResp>()
            .ForMember(x => x.Data, y => y.Ignore());

        CreateMap<TpProjectFlow, FlowListResp>()
            .ForMember(x => x.Endpoint, y => y.MapFrom(s => s.Endpoint == "Y"));
    }
}

// Service 中使用
var resp = _mapper.Map<FlowListResp>(flowEntity);
```

---

## 分頁

```csharp
// DataPagerExtensions
var result = await query.PaginateAsync(page, limit, sortModels);

// SortModel
new SortModel { ColName = "CreateDate", Sort = "desc" }

// PagedModel<T>: PageSize (max 500), CurrentPage, TotalItems, TotalPages, Datas
```

---

## 授權

```csharp
[PermissionsCheckAuthorize("require", "add")]
// → policy: "PermissionsCheckrequire.add"

// 取得當前用戶
string userNo = User.Identity?.Name!;
```

---

## 命名慣例

### 類別

| 類別 | 格式 | 範例 |
|:-----|:-----|:-----|
| Controller | `{Name}Controller.cs` | `RequireController.cs` |
| Service | `{Name}Service.cs` / `I{Name}Service.cs` | `RequireService.cs` |
| PG Entity | `Tp{Name}.cs` | `TpProject.cs` |
| Mongo Entity | `Mg{Name}.cs` | `MgProjectRequire.cs` |
| Request | `{Action}{Entity}Req.cs` | `RequireListReq.cs` |
| Response | `{Action}{Entity}Resp.cs` | `RequireCreateResp.cs` |

### 程式碼

- **Public**: PascalCase（`CreateAsync()`, `Pno`）
- **Private**: _camelCase（`_requireService`, `_logger`）
- **Async 方法**: +Async 後綴
- **Property**: PascalCase + `[JsonPropertyName("camelCase")]`

### 資料慣例

- **Flag**: `"Y"`=啟用, `"D"`=刪除, `"A"`=封存, `"N"`=停用, `"E"`=已寄信
- **日期**: `CreateDate`, `ModiDate`
- **用戶追蹤**: `CreateUserNo`, `ModiUserNo`

---

## 訊息常數

```csharp
MsgCodes.Msg_00 = "success"
MsgCodes.Msg_99 = "an error occur, please try again, thanks"
```

---

## 新功能開發 Checklist

1. **Request Model** → `Model/Request/{Action}{Entity}Req.cs`
2. **Response Model** → `Model/Response/{Action}{Entity}Resp.cs`
3. **Service Interface** → `Interface/I{Name}Service.cs` 加入方法簽名
4. **Service 實作** → `Service/{Name}Service.cs`
5. **Entity**（如需新表）→ `Entities/Tp{Name}.cs` 或 `MongoEntities/Mg{Name}.cs`
6. **Repository**（如需新表）→ 建立 + 註冊到 `FeatureRepositoriesExtensions`
7. **DI 註冊**（如新 Service）→ `FeatureServicesExtensions.cs`
8. **Controller 方法** → endpoint + `[PermissionsCheckAuthorize]`
9. **AutoMapper**（如需映射）→ `Util/MappingProfiles.cs`

---

## 交易處理

### PostgreSQL

```csharp
var transaction = await _repository.BeginTransactionAsync();
try
{
    await _repository.InsertAsync(entity);
    await _repository.SaveChangesAsync();
    await transaction.CommitAsync();
}
catch
{
    await transaction.RollbackAsync();
    throw;
}
```

### MongoDB

`BaseMomgoRepository` 寫入操作自動呼叫 `_unitOfWork.Commit()`。

---

## Logging

```csharp
_logger.LogInformation("建立需求 {Rno} by {UserNo}", rno, userNo);
_logger.LogError(ex, "建立需求失敗: {Message}", ex.Message);
```

---

## Excel 匯出（NPOI）

```csharp
public async Task<FileContentResult> ExportAsync(ExportReq req)
{
    var workbook = new XSSFWorkbook();
    var sheet = workbook.CreateSheet("Sheet1");
    // 建立表頭、填入資料...
    using var stream = new MemoryStream();
    workbook.Write(stream);
    return new FileContentResult(stream.ToArray(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    { FileDownloadName = "export.xlsx" };
}
```

---

## DO / DON'T

### ✅ DO

1. 所有 I/O 使用 `async/await`
2. 方法名加 `Async` 後綴
3. `DictionaryUtil.ValidateRequiredFields()` 驗證必填
4. `BusinessException` 回傳商業錯誤
5. Constructor DI 注入依賴
6. 新 Service/Repository 註冊到 Extensions
7. `IMapper` 映射 Entity ↔ DTO
8. `_logger` 記錄關鍵操作
9. `[JsonPropertyName]` 確保 camelCase 序列化

### ❌ DON'T

1. Controller 中寫商業邏輯 — 放到 Service
2. 直接 `new` Service — 使用 DI
3. 忽略例外 — 用 BusinessException / InternalException
4. 硬編碼連線字串 — 用 `appsettings.json`
5. Service 直接回傳 HTTP 狀態碼 — 用 ResponseResult
6. 跳過 `[PermissionsCheckAuthorize]` — 所有 endpoint 必須授權

---

## 交叉引用

- 前端開發規範 → `skills/dev-web/SKILL.md`
- 色彩 Token → `skills/style-guide/skill.md`
- API 規格撰寫 → `skills/api-spec-writer/skill.md`
- SA 欄位規格 → `skills/sa-spec-writer/SKILL.md`

---

**專注於**: 架構一致性、型別安全、錯誤處理、DI 註冊、資料庫操作
