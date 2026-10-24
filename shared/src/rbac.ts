import type { Role } from './enums.js';

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  REQUESTER: 'Requester',
  WAREHOUSE: 'Admin Gudang IT',
  PROCUREMENT: 'Staf Pengadaan',
  APPROVER: 'Approver',
  VIEWER: 'Manajemen',
};

export const APPROVAL_LEVEL_LABELS: Record<number, string> = {
  1: 'Manajer IT',
  2: 'Keuangan',
  3: 'Direksi',
};

/**
 * True when the user holds at least one of the required roles.
 * SUPER_ADMIN is allowed everywhere (CLAUDE.md §4). An empty `required` list means "any authenticated user".
 */
export function hasAnyRole(userRoles: readonly Role[], required: readonly Role[]): boolean {
  if (required.length === 0) return true;
  if (userRoles.includes('SUPER_ADMIN')) return true;
  return required.some((role) => userRoles.includes(role));
}
