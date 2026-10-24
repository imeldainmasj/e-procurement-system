import { FEATURES, type Feature, type JobLevel, type PermissionAction } from './enums.js';

/** One feature's flags, as stored in `user_permissions`. */
export interface PermissionFlags {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export type PermissionMap = Record<Feature, PermissionFlags>;

export interface AccessSubject {
  jobLevel: JobLevel;
  isAdmin: boolean;
  permissions: PermissionMap;
}

export const MANAGER_LEVELS: readonly JobLevel[] = ['MANAGER_L1', 'MANAGER_L2'];

export function isManager(jobLevel: JobLevel): boolean {
  return MANAGER_LEVELS.includes(jobLevel);
}

/**
 * What the job level allows at most (CLAUDE.md §4). Ownership (staff only change their own
 * works) is checked in the services, not here.
 */
function levelAllows(jobLevel: JobLevel, feature: Feature): boolean {
  if (feature === 'SETTINGS') return false; // admin only
  if (feature === 'MONITORING') return isManager(jobLevel);
  return true;
}

/**
 * Admins pass every check. Everyone else needs both the job level and their
 * `UserPermission` flag: permissions narrow the job level, never widen it.
 */
export function canAccess(
  subject: AccessSubject,
  feature: Feature,
  action: PermissionAction,
): boolean {
  if (subject.isAdmin) return true;
  return levelAllows(subject.jobLevel, feature) && subject.permissions[feature][action];
}

export const NO_PERMISSION: PermissionFlags = {
  view: false,
  create: false,
  update: false,
  delete: false,
};

export const FULL_PERMISSION: PermissionFlags = {
  view: true,
  create: true,
  update: true,
  delete: true,
};

/** Builds a complete map from stored rows; a feature without a row grants nothing. */
export function toPermissionMap(
  rows: readonly {
    feature: Feature;
    canView: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  }[],
): PermissionMap {
  const map = Object.fromEntries(FEATURES.map((f) => [f, NO_PERMISSION])) as PermissionMap;
  for (const row of rows) {
    map[row.feature] = {
      view: row.canView,
      create: row.canCreate,
      update: row.canUpdate,
      delete: row.canDelete,
    };
  }
  return map;
}
