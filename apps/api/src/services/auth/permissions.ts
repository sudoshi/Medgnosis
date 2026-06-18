import type { AuthPermission, UserRole } from '@medgnosis/shared';

const ADMIN_PERMISSIONS: AuthPermission[] = [
  'admin:access',
  'admin:users',
  'admin:audit',
  'admin:system-health',
  'admin:etl',
  'admin:ehr',
  'patients:read',
  'patients:write',
];

const SUPER_ADMIN_PERMISSIONS: AuthPermission[] = [
  ...ADMIN_PERMISSIONS,
  'admin:roles',
  'admin:auth-providers',
  'admin:ai-providers',
];

export function isUserRole(role: string): role is UserRole {
  return ['provider', 'analyst', 'admin', 'super_admin', 'care_coordinator'].includes(role);
}

export function isAdminRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdminRole(role: string | undefined): boolean {
  return role === 'super_admin';
}

export function permissionsForRole(role: string): AuthPermission[] {
  switch (role) {
    case 'super_admin':
      return SUPER_ADMIN_PERMISSIONS;
    case 'admin':
      return ADMIN_PERMISSIONS;
    case 'provider':
    case 'care_coordinator':
      return ['patients:read', 'patients:write'];
    case 'analyst':
      return ['patients:read'];
    default:
      return [];
  }
}

export function roleSatisfies(actualRole: UserRole, requiredRoles: UserRole[]): boolean {
  if (actualRole === 'super_admin' && requiredRoles.includes('admin')) {
    return true;
  }
  return requiredRoles.includes(actualRole);
}

export function hasPermission(role: string, permission: AuthPermission): boolean {
  return permissionsForRole(role).includes(permission);
}
