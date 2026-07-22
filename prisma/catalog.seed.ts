import { Prisma, UserType } from '../src/generated/prisma/client';

export const ROLE_IDS = {
  SUPER_ADMIN: '01JZ0000000000000000000001',
  BRANCH_ADMIN: '01JZ0000000000000000000002',
  CUSTOMER: '01JZ0000000000000000000003',
  STAFF: '01JZ0000000000000000000004',
  INVENTORY: '01JZ0000000000000000000005',
  CASHIER: '01JZ0000000000000000000006',
} as const;

export const roles = [
  {
    id: ROLE_IDS.SUPER_ADMIN,
    code: 'SUPER_ADMIN',
    name: 'Quản trị hệ thống',
    description: 'Quản trị toàn bộ hệ thống Bookora',
    type: UserType.SYSTEM,
    level: 100,
  },
  {
    id: ROLE_IDS.BRANCH_ADMIN,
    code: 'BRANCH_ADMIN',
    name: 'Quản trị chi nhánh',
    description: 'Quản trị các chi nhánh được phân công',
    type: UserType.BRANCH,
    level: 70,
  },
  {
    id: ROLE_IDS.STAFF,
    code: 'STAFF',
    name: 'Nhân viên chi nhánh',
    description: 'Nhân viên vận hành tại chi nhánh',
    type: UserType.BRANCH,
    level: 30,
  },
  {
    id: ROLE_IDS.INVENTORY,
    code: 'INVENTORY',
    name: 'Nhân viên kho',
    description: 'Nhân viên phụ trách nhập, xuất và kiểm kê kho',
    type: UserType.BRANCH,
    level: 30,
  },
  {
    id: ROLE_IDS.CASHIER,
    code: 'CASHIER',
    name: 'Thu ngân',
    description: 'Nhân viên phụ trách bán hàng và thanh toán tại chi nhánh',
    type: UserType.BRANCH,
    level: 20,
  },
  {
    id: ROLE_IDS.CUSTOMER,
    code: 'CUSTOMER',
    name: 'Khách hàng',
    description: 'Khách hàng sử dụng dịch vụ Bookora',
    type: UserType.CUSTOMER,
    level: 10,
  },
] as const;

export const permissionCatalog = [
  {
    code: 'dashboard.read',
    name: 'Xem tổng quan',
    description: 'Cho phép xem dữ liệu tổng quan vận hành',
  },
  {
    code: 'users.read',
    name: 'Xem người dùng',
    description: 'Cho phép xem danh sách và thông tin người dùng hệ thống',
  },
  {
    code: 'users.create',
    name: 'Tạo người dùng',
    description: 'Cho phép tạo tài khoản người dùng hệ thống',
  },
  {
    code: 'users.update',
    name: 'Cập nhật người dùng',
    description: 'Cho phép cập nhật thông tin người dùng hệ thống',
  },
  {
    code: 'users.delete',
    name: 'Xóa người dùng',
    description: 'Cho phép xóa người dùng khỏi hệ thống',
  },
  {
    code: 'staff.read',
    name: 'Xem nhân viên chi nhánh',
    description: 'Cho phép xem danh sách và thông tin nhân viên tại chi nhánh',
  },
  {
    code: 'staff.create',
    name: 'Tạo nhân viên chi nhánh',
    description: 'Cho phép tạo tài khoản nhân viên tại chi nhánh',
  },
  {
    code: 'staff.update',
    name: 'Cập nhật nhân viên chi nhánh',
    description: 'Cho phép cập nhật thông tin nhân viên tại chi nhánh',
  },
  {
    code: 'staff.delete',
    name: 'Ngừng hoạt động nhân viên',
    description: 'Cho phép ngừng hoạt động tài khoản nhân viên tại chi nhánh',
  },
  {
    code: 'staff.assign_role',
    name: 'Gán vai trò nhân viên',
    description: 'Cho phép gán hoặc gỡ vai trò của nhân viên tại chi nhánh',
  },
  {
    code: 'staff.assign_permission',
    name: 'Gán quyền nhân viên',
    description: 'Cho phép quản lý quyền bổ sung của nhân viên tại chi nhánh',
  },
  {
    code: 'staff.assign_branch',
    name: 'Phân công chi nhánh cho nhân viên',
    description: 'Cho phép phân công hoặc chuyển nhân viên giữa các chi nhánh',
  },
  {
    code: 'branches.read',
    name: 'Xem chi nhánh',
    description: 'Cho phép xem danh sách và thông tin chi nhánh',
  },
  {
    code: 'branches.create',
    name: 'Tạo chi nhánh',
    description: 'Cho phép tạo chi nhánh mới',
  },
  {
    code: 'branches.update',
    name: 'Cập nhật chi nhánh',
    description: 'Cho phép cập nhật thông tin chi nhánh',
  },
  {
    code: 'branches.delete',
    name: 'Ngừng hoạt động chi nhánh',
    description: 'Cho phép ngừng hoạt động chi nhánh',
  },
  {
    code: 'branches.assign',
    name: 'Phân công chi nhánh',
    description: 'Cho phép quản lý phân công người dùng vào chi nhánh',
  },
  {
    code: 'roles.read',
    name: 'Xem vai trò',
    description: 'Cho phép xem danh mục và chi tiết vai trò hệ thống',
  },
  {
    code: 'roles.create',
    name: 'Tạo vai trò',
    description: 'Cho phép tạo vai trò mới trong hệ thống',
  },
  {
    code: 'roles.update',
    name: 'Cập nhật vai trò',
    description: 'Cho phép cập nhật thông tin vai trò',
  },
  {
    code: 'roles.delete',
    name: 'Ngừng hoạt động vai trò',
    description: 'Cho phép ngừng hoạt động vai trò',
  },
  {
    code: 'roles.assign_permission',
    name: 'Gán quyền cho vai trò',
    description: 'Cho phép thay đổi tập quyền của vai trò',
  },
  {
    code: 'permissions.read',
    name: 'Xem quyền hạn',
    description: 'Cho phép xem danh mục và chi tiết quyền hạn hệ thống',
  },
  {
    code: 'permissions.create',
    name: 'Tạo quyền hạn',
    description: 'Cho phép tạo quyền hạn mới trong hệ thống',
  },
  {
    code: 'permissions.update',
    name: 'Cập nhật quyền hạn',
    description: 'Cho phép cập nhật thông tin quyền hạn',
  },
  {
    code: 'permissions.delete',
    name: 'Xóa quyền hạn',
    description: 'Cho phép xóa quyền hạn khỏi hệ thống',
  },
  {
    code: 'super_admin.assign',
    name: 'Gán quản trị hệ thống',
    description: 'Cho phép gán vai trò quản trị hệ thống',
  },
  {
    code: 'branch_admin.assign',
    name: 'Gán quản trị chi nhánh',
    description: 'Cho phép gán vai trò quản trị chi nhánh',
  },
  {
    code: 'orders.read',
    name: 'Xem đơn hàng',
    description: 'Cho phép xem danh sách và chi tiết đơn hàng',
  },
  {
    code: 'orders.create',
    name: 'Tạo đơn hàng',
    description: 'Cho phép tạo đơn hàng tại chi nhánh',
  },
  {
    code: 'orders.update_status',
    name: 'Cập nhật trạng thái đơn hàng',
    description: 'Cho phép cập nhật trạng thái xử lý đơn hàng',
  },
  {
    code: 'payments.create',
    name: 'Tạo thanh toán',
    description: 'Cho phép ghi nhận thanh toán cho đơn hàng',
  },
  {
    code: 'products.read',
    name: 'Xem sản phẩm',
    description: 'Cho phép xem danh sách và thông tin sản phẩm',
  },
  {
    code: 'categories.read',
    name: 'Xem danh mục',
    description: 'Cho phép xem cây và chi tiết danh mục sách',
  },
  {
    code: 'categories.create',
    name: 'Tạo danh mục',
    description: 'Cho phép tạo danh mục sách',
  },
  {
    code: 'categories.update',
    name: 'Cập nhật danh mục',
    description: 'Cho phép cập nhật trạng thái, cấu trúc và ảnh danh mục',
  },
  {
    code: 'categories.delete',
    name: 'Xóa danh mục',
    description: 'Cho phép xóa vĩnh viễn danh mục không còn được sử dụng',
  },
  {
    code: 'suppliers.read',
    name: 'Xem nhà cung cấp',
    description: 'Cho phép xem danh sách và thông tin nhà cung cấp sản phẩm',
  },
  {
    code: 'suppliers.create',
    name: 'Tạo nhà cung cấp',
    description: 'Cho phép tạo nhà cung cấp sản phẩm',
  },
  {
    code: 'suppliers.update',
    name: 'Cập nhật nhà cung cấp',
    description: 'Cho phép cập nhật thông tin nhà cung cấp sản phẩm',
  },
  {
    code: 'suppliers.delete',
    name: 'Xóa nhà cung cấp',
    description: 'Cho phép xóa nhà cung cấp chưa được sản phẩm sử dụng',
  },
  {
    code: 'publishers.read',
    name: 'Xem nhà xuất bản',
    description: 'Cho phép xem danh sách và thông tin nhà xuất bản',
  },
  {
    code: 'publishers.create',
    name: 'Tạo nhà xuất bản',
    description: 'Cho phép tạo nhà xuất bản',
  },
  {
    code: 'publishers.update',
    name: 'Cập nhật nhà xuất bản',
    description: 'Cho phép cập nhật thông tin nhà xuất bản',
  },
  {
    code: 'publishers.delete',
    name: 'Xóa nhà xuất bản',
    description: 'Cho phép xóa nhà xuất bản chưa được sản phẩm sử dụng',
  },
  {
    code: 'authors.read',
    name: 'Xem tác giả',
    description: 'Cho phép xem danh sách và thông tin tác giả',
  },
  {
    code: 'authors.create',
    name: 'Tạo tác giả',
    description: 'Cho phép tạo tác giả',
  },
  {
    code: 'authors.update',
    name: 'Cập nhật tác giả',
    description: 'Cho phép cập nhật thông tin tác giả',
  },
  {
    code: 'authors.delete',
    name: 'Xóa tác giả',
    description: 'Cho phép xóa tác giả chưa được gắn với sản phẩm',
  },
  {
    code: 'product_attributes.read',
    name: 'Xem thuộc tính sản phẩm',
    description:
      'Cho phép xem danh sách và thông tin thuộc tính mô tả sản phẩm',
  },
  {
    code: 'product_attributes.create',
    name: 'Tạo thuộc tính sản phẩm',
    description: 'Cho phép tạo định nghĩa thuộc tính mô tả sản phẩm',
  },
  {
    code: 'product_attributes.update',
    name: 'Cập nhật thuộc tính sản phẩm',
    description: 'Cho phép chỉnh sửa định nghĩa thuộc tính mô tả sản phẩm',
  },
  {
    code: 'product_attributes.delete',
    name: 'Xóa thuộc tính sản phẩm',
    description: 'Cho phép xóa thuộc tính chưa có giá trị trên sản phẩm',
  },
  {
    code: 'products.create',
    name: 'Tạo sản phẩm',
    description: 'Cho phép tạo sản phẩm mới',
  },
  {
    code: 'products.update',
    name: 'Cập nhật sản phẩm',
    description: 'Cho phép cập nhật thông tin sản phẩm',
  },
  {
    code: 'products.delete',
    name: 'Xóa sản phẩm',
    description:
      'Cho phép xóa sản phẩm bản nháp chưa có dữ liệu nghiệp vụ tham chiếu',
  },
  {
    code: 'products.publish',
    name: 'Chuyển trạng thái sản phẩm',
    description:
      'Cho phép thay đổi trạng thái sản phẩm sau khi kiểm tra điều kiện nghiệp vụ',
  },
  {
    code: 'inventory.read',
    name: 'Xem tồn kho',
    description: 'Cho phép xem số lượng và thông tin tồn kho tại chi nhánh',
  },
  {
    code: 'inventory.update_threshold',
    name: 'Cập nhật ngưỡng cảnh báo tồn kho',
    description: 'Cho phép cập nhật ngưỡng cảnh báo tồn kho tại chi nhánh',
  },
  {
    code: 'stock_receipts.read',
    name: 'Xem phiếu nhập kho',
    description: 'Cho phép xem danh sách và chi tiết phiếu nhập kho',
  },
  {
    code: 'stock_receipts.create',
    name: 'Tạo phiếu nhập kho',
    description: 'Cho phép tạo phiếu nhập kho bản nháp',
  },
  {
    code: 'stock_receipts.update',
    name: 'Cập nhật phiếu nhập kho',
    description: 'Cho phép cập nhật phiếu nhập kho bản nháp',
  },
  {
    code: 'stock_receipts.cancel',
    name: 'Hủy phiếu nhập kho',
    description: 'Cho phép hủy phiếu nhập kho bản nháp',
  },
  {
    code: 'stock_receipts.confirm',
    name: 'Xác nhận phiếu nhập kho',
    description: 'Cho phép xác nhận phiếu nhập và cộng tồn kho',
  },
  {
    code: 'profile.read_own',
    name: 'Xem hồ sơ cá nhân',
    description: 'Cho phép xem hồ sơ của chính người dùng',
  },
  {
    code: 'profile.update_own',
    name: 'Cập nhật hồ sơ cá nhân',
    description: 'Cho phép cập nhật hồ sơ của chính người dùng',
  },
  {
    code: 'orders.create_own',
    name: 'Tạo đơn hàng cá nhân',
    description: 'Cho phép khách hàng tạo đơn hàng của chính mình',
  },
  {
    code: 'orders.read_own',
    name: 'Xem đơn hàng cá nhân',
    description: 'Cho phép khách hàng xem đơn hàng của chính mình',
  },
] as const;

export const permissionCodes = permissionCatalog.map(({ code }) => code);

export const STAFF_PERMISSION_CODES = [
  'dashboard.read',
  'orders.read',
  'orders.create',
  'orders.update_status',
  'payments.create',
  'products.read',
  'inventory.read',
  'inventory.update_threshold',
  'stock_receipts.read',
  'stock_receipts.create',
  'stock_receipts.update',
  'stock_receipts.cancel',
  'stock_receipts.confirm',
] as const;

const rolePermissionCodes: Record<string, readonly string[]> = {
  BRANCH_ADMIN: [
    'dashboard.read',
    'orders.read',
    'orders.update_status',
    'products.read',
    'inventory.read',
    'inventory.update_threshold',
    'stock_receipts.read',
    'stock_receipts.create',
    'stock_receipts.update',
    'stock_receipts.cancel',
    'stock_receipts.confirm',
    'staff.read',
    'staff.create',
    'staff.update',
    'staff.delete',
    'staff.assign_role',
    'staff.assign_permission',
    'roles.read',
    'permissions.read',
  ],
  STAFF: STAFF_PERMISSION_CODES,
  CASHIER: [
    'dashboard.read',
    'orders.read',
    'orders.create',
    'orders.update_status',
    'payments.create',
  ],
  INVENTORY: [
    'dashboard.read',
    'products.read',
    'inventory.read',
    'inventory.update_threshold',
    'stock_receipts.read',
    'stock_receipts.create',
    'stock_receipts.update',
    'stock_receipts.cancel',
    'stock_receipts.confirm',
  ],
  CUSTOMER: [
    'profile.read_own',
    'profile.update_own',
    'orders.create_own',
    'orders.read_own',
  ],
};

const PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

type CatalogSeedClient = Pick<
  Prisma.TransactionClient,
  'role' | 'permission' | 'rolePermission'
>;

export async function seedCatalog(tx: CatalogSeedClient): Promise<void> {
  const roleIds = new Map<string, string>();
  for (const role of roles) {
    const persistedRole = await tx.role.upsert({
      where: { code: role.code },
      create: { ...role, guardName: 'web', isSystem: true, isActive: true },
      update: {
        name: role.name,
        description: role.description,
        guardName: 'web',
        type: role.type,
        level: role.level,
        isSystem: true,
      },
      select: { id: true, code: true },
    });
    roleIds.set(persistedRole.code, persistedRole.id);
  }

  const permissionIds = new Map<string, string>();
  for (const definition of permissionCatalog) {
    const { code, name, description } = definition;
    if (!PERMISSION_CODE_PATTERN.test(code)) {
      throw new Error(`Invalid permission code: ${code}`);
    }

    const [resource, action] = code.split('.') as [string, string];
    const permission = await tx.permission.upsert({
      where: { code },
      create: {
        code,
        name,
        description,
        resource,
        action,
        guardName: 'web',
      },
      update: {
        name,
        description,
        resource,
        action,
        guardName: 'web',
      },
      select: { id: true, code: true },
    });
    permissionIds.set(permission.code, permission.id);
  }

  const superAdminRoleId = roleIds.get('SUPER_ADMIN');
  if (!superAdminRoleId) {
    throw new Error('Seeded role not found: SUPER_ADMIN');
  }
  const allPermissions = await tx.permission.findMany({
    select: { id: true },
  });
  for (const permission of allPermissions) {
    await tx.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRoleId,
          permissionId: permission.id,
        },
      },
      create: {
        roleId: superAdminRoleId,
        permissionId: permission.id,
      },
      update: {},
    });
  }

  for (const [roleCode, codes] of Object.entries(rolePermissionCodes)) {
    const roleId = roleIds.get(roleCode);
    if (!roleId) {
      throw new Error(`Seeded role not found: ${roleCode}`);
    }

    await tx.rolePermission.deleteMany({
      where: {
        roleId,
        permission: { code: { notIn: [...codes] } },
      },
    });

    for (const permissionCode of codes) {
      const permissionId = permissionIds.get(permissionCode);
      if (!permissionId) {
        throw new Error(`Seeded permission not found: ${permissionCode}`);
      }

      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        create: { roleId, permissionId },
        update: {},
      });
    }
  }
}
