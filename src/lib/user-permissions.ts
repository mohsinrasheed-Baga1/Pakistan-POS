/**
 * User Permission Definitions
 * =====================================================
 * Each permission controls access to a specific feature/view.
 * Permissions are stored as JSON in the User.permissions column.
 *
 * Default permissions per role:
 *   - ADMIN: all true
 *   - MANAGER: most true (no user management, no settings)
 *   - CASHIER: only basic sales + products view
 */

export type Permission =
  | "canViewDashboard"
  | "canSell"               // POS view
  | "canAddProducts"        // Add new products
  | "canEditProducts"       // Edit existing products
  | "canDeleteProducts"     // Delete products
  | "canViewSalesHistory"
  | "canViewReports"        // Important: reports are admin's personal data
  | "canApplyDiscount"      // Discount on sales
  | "canProcessReturns"     // Return/refund sales
  | "canAccessLoadBill"     // Load & Bill feature
  | "canAccessVendors"
  | "canAccessExpenses"
  | "canAccessShopCards"
  | "canAccessMainStore"   // Main Store inventory
  | "canManageUsers"        // Create/edit users
  | "canAccessSettings";    // Settings view

export const ALL_PERMISSIONS: Permission[] = [
  "canViewDashboard",
  "canSell",
  "canAddProducts",
  "canEditProducts",
  "canDeleteProducts",
  "canViewSalesHistory",
  "canViewReports",
  "canApplyDiscount",
  "canProcessReturns",
  "canAccessLoadBill",
  "canAccessVendors",
  "canAccessExpenses",
  "canAccessShopCards",
  "canAccessMainStore",
  "canManageUsers",
  "canAccessSettings",
];

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  canViewDashboard: { label: "View Dashboard", description: "Access the dashboard overview" },
  canSell: { label: "Sell (POS)", description: "Make sales via POS screen" },
  canAddProducts: { label: "Add Products", description: "Create new products" },
  canEditProducts: { label: "Edit Products", description: "Modify existing products" },
  canDeleteProducts: { label: "Delete Products", description: "Remove products from inventory" },
  canViewSalesHistory: { label: "View Sales History", description: "See past sales records" },
  canViewReports: { label: "View Reports", description: "Access financial reports (admin's personal data)" },
  canApplyDiscount: { label: "Apply Discount", description: "Give discounts on sales" },
  canProcessReturns: { label: "Process Returns", description: "Handle sales returns and refunds" },
  canAccessLoadBill: { label: "Load & Bill", description: "Mobile load, SIM stock, bills" },
  canAccessVendors: { label: "Vendors", description: "Manage vendors and purchases" },
  canAccessExpenses: { label: "Expenses", description: "Record and view expenses" },
  canAccessShopCards: { label: "Shop Cards", description: "Customer loyalty cards" },
  canAccessMainStore: { label: "Main Store", description: "Inventory management" },
  canManageUsers: { label: "Manage Users", description: "Create/edit system users" },
  canAccessSettings: { label: "Settings", description: "Change app settings" },
};

export type Permissions = Record<Permission, boolean>;

/** Get default permissions for a given role. */
export function getDefaultPermissions(role: string): Permissions {
  if (role === "ADMIN") {
    return ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p]: true }), {} as Permissions);
  }
  if (role === "MANAGER") {
    return {
      canViewDashboard: true,
      canSell: true,
      canAddProducts: true,
      canEditProducts: true,
      canDeleteProducts: false,
      canViewSalesHistory: true,
      canViewReports: true,
      canApplyDiscount: true,
      canProcessReturns: true,
      canAccessLoadBill: true,
      canAccessVendors: true,
      canAccessExpenses: true,
      canAccessShopCards: true,
      canAccessMainStore: true,
      canManageUsers: false,
      canAccessSettings: false,
    };
  }
  // CASHIER (default)
  return {
    canViewDashboard: false,
    canSell: true,
    canAddProducts: false,
    canEditProducts: false,
    canDeleteProducts: false,
    canViewSalesHistory: false,
    canViewReports: false,
    canApplyDiscount: false,
    canProcessReturns: false,
    canAccessLoadBill: false,
    canAccessVendors: false,
    canAccessExpenses: false,
    canAccessShopCards: false,
    canAccessMainStore: false,
    canManageUsers: false,
    canAccessSettings: false,
  };
}

/** Parse permissions from JSON string (stored in DB). */
export function parsePermissions(json: string | null | undefined, role: string): Permissions {
  if (!json) return getDefaultPermissions(role);
  try {
    const parsed = JSON.parse(json) as Partial<Permissions>;
    // Merge with defaults (so new permissions added in updates default correctly)
    const defaults = getDefaultPermissions(role);
    return { ...defaults, ...parsed } as Permissions;
  } catch {
    return getDefaultPermissions(role);
  }
}

/** Serialize permissions to JSON string for DB storage. */
export function serializePermissions(permissions: Permissions): string {
  return JSON.stringify(permissions);
}

/** Check if user has a specific permission. */
export function hasPermission(permissions: Permissions | null, permission: Permission): boolean {
  if (!permissions) return false;
  return permissions[permission] === true;
}
