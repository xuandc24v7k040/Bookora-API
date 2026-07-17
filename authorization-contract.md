# Authorization Contract — Phase 8

> Trạng thái: contract authoritative sau backend remediation.
> Nguồn sự thật: runtime source → Prisma/migration → tests → `docs/openapi.json`.
> Base path: `/api/v1`.

## 1. Phạm vi và readiness

Phase 8 gồm:

| Phase | Capability              | Trạng thái                           |
| ----- | ----------------------- | ------------------------------------ |
| 8A    | Branches                | READY                                |
| 8B    | Roles & Permissions     | READY                                |
| 8C    | Branch Admin Management | READY, trừ profile update được defer |
| 8D    | Staff Management        | READY                                |
| 8E    | Users Management        | READY                                |

8E là **Users Management**, không phải API tạo SYSTEM user. `POST /users` luôn tạo CUSTOMER. Việc chuyển CUSTOMER thành Branch Admin hoặc Staff phải dùng các convert endpoint chuyên biệt.

Các quyết định ngoài phạm vi:

- Không có create SYSTEM user.
- Reactivate Role được defer. Branch hỗ trợ lifecycle hai chiều qua `PATCH /branches/:id`; `DELETE /branches/:id` vẫn là deactivate.
- Branch Admin profile update endpoint được defer.
- Hard-delete User không được hỗ trợ; `DELETE /users/:id` là soft-disable.
- Danh sách và ý nghĩa dangerous permissions không thay đổi.
- Dangerous-permission policy là immutable và Super Admin không được bypass.

## 2. HTTP, auth, CSRF và envelope

Mọi endpoint management yêu cầu access-token cookie và `JwtAccessGuard`. Mutation yêu cầu `CsrfGuard`, cookie CSRF và header `X-CSRF-Token`. Endpoint branch-scoped dùng `X-Branch-Id` theo decorator của từng route.

```ts
type SuccessEnvelope<T> = {
  statusCode: number;
  message: string;
  data: T;
};

type PaginatedEnvelope<T> = SuccessEnvelope<T[]> & {
  meta: {
    total: number;
    page: number;
    lastPage: number;
    limit: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

type ErrorEnvelope = {
  statusCode: number;
  message: string;
  error: string;
  code?: string;
  errors?: Record<string, string[]>;
  path: string;
  method: string;
  timestamp: string;
};
```

Các response 400/401/403/404/409 của authorization-management đều tham chiếu `ErrorResponseDto` trong OpenAPI; client generator không được suy ra `ErrorType<void>`.

## 3. Schema authoritative

### 3.1. Branch

```ts
type BranchResponse = {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string | null;
  province: string | null;
  ward: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

Branch không có field `email` hoặc `district`; `address` là required
free-form detail. Địa chỉ hành chính hiện hành dùng đúng hai cấp
`province + ward`. Tọa độ dùng canonical `latitude/longitude`, được trả
dưới dạng JSON number và có giới hạn lần lượt `[-90, 90]`, `[-180, 180]`.

Create nhận `isActive?: boolean`, mặc định `true` khi omitted. Update nhận
`isActive?: boolean`; omitted giữ nguyên trạng thái. Chuyển active → inactive
và `DELETE /branches/:id` dùng chung invariant: không được deactivate khi còn
`UserBranch` active. Chuyển inactive → active là idempotent, không tự kích hoạt
assignment, không gán role và không restore session. Profile fields và status
trong cùng request được ghi atomically.

### 3.2. Auth me profile

`GET /auth/me` giữ nguyên principal roles/permissions/branch assignments và
trả thêm ba field luôn hiện diện:

```ts
type AuthMeProfile = {
  phone: string | null;
  gender: string | null;
  birthday: string | null; // YYYY-MM-DD
};
```

Ba field không được đưa vào JWT payload. Birthday chỉ được map tại response
principal, không thay global Date serialization.

### 3.3. User

```ts
type UserResponse = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  gender: string | null;
  birthday: string | null; // YYYY-MM-DD
  type: 'SYSTEM' | 'BRANCH' | 'CUSTOMER';
  provider: 'LOCAL' | 'GOOGLE';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

`gender` là nullable string tối đa 20 ký tự và được trim. `birthday` là calendar date, lưu PostgreSQL `DATE` và serialize ổn định dạng `YYYY-MM-DD`.

### 3.4. Catalog detail

```ts
type RoleDetailResponse = RoleResponse & {
  rolePermissions: Array<{ permission: PermissionResponse }>;
};

type PermissionDetailResponse = PermissionResponse & {
  _count: {
    rolePermissions: number;
    userPermissions: number;
    userBranchPermissions: number;
  };
};
```

`GET /roles/:id/permissions` trả chính xác:

```ts
Array<{ permission: PermissionResponse }>;
```

`DELETE /permissions/:id` trả `PermissionDetailResponse` đã đọc trước khi xóa, không trả mutation count.

### 3.4. Assignment mutation responses

```ts
type UserBranchCreateResponse = {
  id: string;
  userId: string;
  branchId: string;
  isPrimary: boolean;
  isActive: boolean;
};

type UserBranchStateResponse = UserBranchCreateResponse & {
  assignedBy: string | null;
  assignedAt: string;
};

type UserBranchRoleResponse = {
  id: string;
  userBranchId: string;
  roleId: string;
  assignedBy: string | null;
  assignedAt: string;
};

type UserBranchPermissionResponse = {
  id: string;
  userBranchId: string;
  permissionId: string;
  effect: 'ALLOW' | 'DENY';
  assignedBy: string | null;
  assignedAt: string;
};

type MutationCountResponse = { count: number };
```

- Assign branch trả `UserBranchCreateResponse`.
- Activate/deactivate/set-primary branch assignment trả `UserBranchStateResponse`.
- Add role trả `UserBranchRoleResponse`.
- Upsert permission override trả `UserBranchPermissionResponse`.
- Remove role/permission trả `MutationCountResponse`; mapping không tồn tại trả `{ count: 0 }`.

## 4. Query contract

Query chung: `page >= 1`, `limit = 1..100`, pagination meta tính trên cùng filtered dataset.

### 4.1. Branches

`GET /branches?page&limit&search&isActive&sortBy&sortOrder&createdFrom&createdTo`

- `search` được trim.
- Empty search tương đương không search.
- Case-insensitive `contains` trên `code` hoặc `name`.
- `isActive?: boolean` lọc trên cùng dataset dùng cho data và count.
- `sortBy?: code | name | isActive | createdAt | updatedAt` và `sortOrder?: asc | desc`.
- `createdFrom`/`createdTo` dùng `YYYY-MM-DD`, theo ngày Việt Nam (UTC+7).
- `createdFrom` inclusive; `createdTo` inclusive theo ngày và được query bằng mốc `< startOfNextDay`.
- Có thể truyền riêng `createdFrom` hoặc `createdTo`; nếu truyền cả hai thì `createdFrom <= createdTo`.
- Mặc định giữ `code ASC`; mọi sort thêm `id ASC` làm tie-break ổn định.
- Search được AND với allowed branch scope.
- Data và count dùng cùng `where`.
- Ordering: `code ASC`.

### 4.2. Roles

`GET /roles?page&limit&search&type&isActive&isSystem&guardName&levelFrom&levelTo&createdFrom&createdTo&sortBy&sortOrder`

- `search` được trim; chuỗi rỗng tương đương không search và tìm kiếm
  case-insensitive `contains` trên `code`, `name`, `description`.
- `type?: SYSTEM | BRANCH | CUSTOMER`; `isActive?: boolean`;
  `isSystem?: boolean`; `guardName?: web`.
- `levelFrom`/`levelTo` là số nguyên trong `[1, 99]`, có thể truyền riêng;
  nếu có cả hai thì `levelFrom <= levelTo`.
- `createdFrom`/`createdTo` dùng `YYYY-MM-DD` theo ngày Việt Nam (UTC+7),
  có thể truyền riêng; `createdFrom` inclusive và `createdTo` được query bằng
  mốc `< startOfNextDay`.
- `sortBy?: code | name | description | type | guardName | level | isSystem |
  isActive | createdAt | updatedAt`; `sortOrder?: asc | desc`.
- Mặc định `createdAt DESC`; mọi sort thêm `id ASC` làm tie-break ổn định.
- Search và filter compose bằng AND; data và count dùng cùng một `where`.
- Đây là global catalog, không yêu cầu `X-Branch-Id`.

### 4.3. Permissions

`GET /permissions?page&limit&search&resource&action&guardName&createdFrom&createdTo&sortBy&sortOrder`

- `search` được trim; chuỗi rỗng tương đương không search và tìm kiếm
  case-insensitive `contains` trên `code`, `name`, `resource`, `action`, `description`.
- `resource`, `action` và `guardName` lọc exact; catalog hiện dùng guard `web`.
- `createdFrom`/`createdTo` dùng `YYYY-MM-DD` theo ngày Việt Nam (UTC+7),
  có thể truyền riêng; `createdFrom` inclusive và `createdTo` được query bằng
  mốc `< startOfNextDay`.
- `sortBy?: code | name | resource | action | guardName | description |
  createdAt | updatedAt`; `sortOrder?: asc | desc`.
- Mặc định `createdAt DESC`; mọi sort thêm `id ASC` làm tie-break ổn định.
- Search và filter compose bằng AND; data và count dùng cùng một `where`.
- Đây là global catalog, không yêu cầu `X-Branch-Id`.

### 4.4. Staff

`GET /staff?page&limit&search` giữ search và branch scope hiện hữu. Branch actor chỉ thấy assignment thuộc selected/allowed branch; Super Admin giữ quyền xem theo contract route.

### 4.5. Users

`GET /users?page&limit&search&sortBy&sortOrder&type&isActive`

- `type?: SYSTEM | BRANCH | CUSTOMER`.
- `isActive?: boolean`.
- Search và mọi filter compose bằng AND trong cả query dữ liệu và count.
- Search áp dụng theo các public user fields hiện hữu.
- Ordering dùng sort chính từ query và luôn thêm `id ASC` làm tie-break.
- Use case hỗ trợ: `type=CUSTOMER`, `type=BRANCH&isActive=false`, `type=SYSTEM`.

## 5. Users Management

### 5.1. Create

`POST /users`

```ts
type CreateUserRequest = {
  fullName: string;
  email: string;
  phone?: string | null;
  gender?: string | null;
  birthday?: string | null; // YYYY-MM-DD
};
```

Server lowercase email và luôn tạo `type=CUSTOMER`, `isActive=true`. User và active default CUSTOMER role được tạo/gán atomically. Thiếu active CUSTOMER role làm toàn bộ request fail; không để user thiếu authorization graph.

Request không nhận `type`, `roleIds`, `branchIds`, `isActive`, `provider`, `password` hoặc `permissions`.

### 5.2. Update

`PATCH /users/:id` nhận partial `fullName,email,phone,gender,birthday`; email được lowercase. Endpoint không đổi type, active state, provider, role, permission hay branch assignment. Empty patch giữ behavior no-op hiện hữu.

### 5.3. Disable và activate

- `DELETE /users/:id`: soft-disable và revoke active sessions; không hard-delete.
- `PATCH /users/:id/activate`: không body, permission `users.update`, CSRF, và service-level Super Admin assertion.

Activate là idempotent. Với BRANCH user, trước khi activate phải có ít nhất một active assignment trên active Branch và có đúng một active primary assignment. Endpoint không tự tạo/activate assignment, không gán role và không restore session cũ. User phải đăng nhập lại.

Business error:

```text
USER_ACTIVATION_REQUIRES_ACTIVE_BRANCH
```

## 6. Staff management

### 6.1. Read all assignments

`GET /staff/:id/assignments`

- Chỉ Super Admin.
- Không yêu cầu `X-Branch-Id`.
- Target phải là BRANCH user có ít nhất một qualifying Staff role trên một assignment, kể cả assignment đã inactive.
- Trả public profile và toàn bộ assignments, gồm branch, role mappings và permission overrides.
- Không trả password hash, token, session hoặc auth secret.

```ts
type StaffAssignmentsResponse = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    phone: string | null;
    gender: string | null;
    birthday: string | null;
    type: 'BRANCH';
    isActive: boolean;
  };
  assignments: Array<{
    id: string;
    branchId: string;
    isActive: boolean;
    isPrimary: boolean;
    assignedBy: string | null;
    assignedAt: string;
    branch: { id: string; code: string; name: string; isActive: boolean };
    roles: Array<{
      id: string;
      role: {
        id: string;
        code: string;
        name: string;
        level: number;
        isActive: boolean;
        isSystem: boolean;
        type: 'BRANCH';
        guardName: string;
      };
    }>;
    permissions: Array<{
      id: string;
      effect: 'ALLOW' | 'DENY';
      permission: {
        id: string;
        code: string;
        name: string;
        resource: string;
        action: string;
        guardName: string;
      };
    }>;
  }>;
};
```

Assignments có ordering deterministic: primary trước, active trước, rồi `branch.code ASC`, `id ASC`. Nested roles/permissions được order theo catalog code.

### 6.2. Remove-last-role invariant

`DELETE /staff/:id/roles/:roleId` chạy trong serializable transaction. Nếu mapping là qualifying active Staff role cuối cùng của assignment, backend không xóa và trả 409:

```text
STAFF_LAST_ROLE_REQUIRED
```

Mapping không tồn tại vẫn idempotent `{ count: 0 }`. Backend không tự offboard. Concurrent removals không được để active assignment có zero qualifying role.

### 6.3. CUSTOMER → Staff conversion

`POST /staff/:id/convert`:

- Target phải là active CUSTOMER.
- Branch IDs unique và đúng một primary.
- Mỗi branch phải có ít nhất một unique active BRANCH/web role hợp lệ.
- Permission override trong từng branch phải unique.
- Mọi override, cả `ALLOW` và `DENY`, đều đi qua delegation policy.
- Mọi code trong `DANGEROUS_PERMISSION_CODES` bị từ chối, kể cả Super Admin.
- Transaction repository revalidate dangerous codes để chống bypass/TOCTOU.

Frontend nên validate các invariant để có UX tốt, nhưng backend là security boundary.

## 7. Branch assignment lifecycle

User activation và assignment activation là hai trạng thái độc lập:

- Assign/activate UserBranch không tự activate `User.isActive`.
- Set primary không tự activate `User.isActive`.
- Activate user không tự activate/tạo UserBranch.
- Deactivate Role/Branch vẫn một chiều trong public API hiện tại.

## 8. Finding ledger

| Finding | Trạng thái                   | Contract sau remediation                                                 |
| ------- | ---------------------------- | ------------------------------------------------------------------------ |
| G-01    | RESOLVED                     | Add staff role dùng exact `UserBranchRoleResponse`.                      |
| G-02    | RESOLVED                     | Staff permission dùng exact `UserBranchPermissionResponse`.              |
| G-03    | RESOLVED                     | Delete permission trả `PermissionDetailResponse`.                        |
| G-04    | RESOLVED                     | Role detail khai báo `rolePermissions`.                                  |
| G-05    | RESOLVED                     | Permission detail khai báo `_count`.                                     |
| G-06    | RESOLVED                     | User DTO/runtime/OpenAPI thống nhất provider và nullable profile fields. |
| G-07    | RESOLVED                     | Error `message` là string; `error` required; `errors` là field map.      |
| G-08    | RESOLVED                     | Authorization 4xx có shared error schema.                                |
| G-09    | RESOLVED                     | Branch search chạy server-side và giữ scope.                             |
| G-10    | RESOLVED                     | Generated OpenAPI không còn authorization `ErrorType<void>`.             |
| G-15    | RESOLVED_BY_PRODUCT_DECISION | 8E là Users Management; create vẫn là CUSTOMER.                          |
| G-18    | RESOLVED                     | Có explicit user activate API; session cũ không được restore.            |
| G-19    | RESOLVED                     | Transaction chặn remove qualifying Staff role cuối.                      |
| G-21    | RESOLVED                     | Convert Staff không bypass dangerous delegation policy.                  |

## 9. Migration và compatibility

Migration `20260714090000_add_user_gender_birthday` chỉ:

```sql
ALTER TABLE "users"
  ADD COLUMN "gender" VARCHAR(20),
  ADD COLUMN "birthday" DATE;
```

Không backfill, drop, rename hoặc reset dữ liệu. Existing rows nhận `NULL`. Auth cookie/JWT/refresh/CSRF/session architecture không thay đổi.

Migration `20260714170000_two_level_addresses` bảo toàn district legacy vào
`branches.address` hoặc `user_addresses.detail` nếu chuỗi chưa chứa giá trị
đó, sau đó xóa `branches.district`, `user_addresses.district` và
`user_addresses.ghn_district_id`. Các cột province, ward, latitude và
longitude được giữ nguyên; không backfill tọa độ giả.

Development seed authoritative có 7 branch-role mappings. Mapping thứ bảy là
`cashier.hg@bookora.local → INVENTORY → hau-giang`, bổ sung hợp lệ bên cạnh
role `CASHIER`; đây không phải duplicate.

## 10. OpenAPI và frontend handoff

`docs/openapi.json` là backend generated contract. Frontend canonical copy nằm ngoài repository này phải được sync trước khi regenerate Orval client. Frontend không được tự thêm `X-Branch-Id` cho `GET /staff/:id/assignments`; endpoint này là Super Admin global read.
