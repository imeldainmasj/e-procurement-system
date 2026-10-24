import { describe, expect, it } from 'vitest';
import {
  canAccess,
  FULL_PERMISSION,
  NO_PERMISSION,
  toPermissionMap,
  type AccessSubject,
} from './access.js';
import { FEATURES } from './enums.js';

const full = toPermissionMap(
  FEATURES.map((feature) => ({
    feature,
    canView: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  })),
);

const subject = (over: Partial<AccessSubject> = {}): AccessSubject => ({
  jobLevel: 'STAFF',
  isAdmin: false,
  permissions: full,
  ...over,
});

describe('canAccess', () => {
  it('limits Monitoring Tim to managers even with the permission flag', () => {
    expect(canAccess(subject(), 'MONITORING', 'view')).toBe(false);
    expect(canAccess(subject({ jobLevel: 'MANAGER_L1' }), 'MONITORING', 'view')).toBe(true);
    expect(canAccess(subject({ jobLevel: 'MANAGER_L2' }), 'MONITORING', 'view')).toBe(true);
  });

  it('keeps Pengaturan admin-only', () => {
    expect(canAccess(subject({ jobLevel: 'MANAGER_L2' }), 'SETTINGS', 'view')).toBe(false);
    expect(canAccess(subject({ isAdmin: true }), 'SETTINGS', 'update')).toBe(true);
  });

  it('lets permissions narrow but never widen the job level', () => {
    const narrowed = { ...full, WORK: { ...FULL_PERMISSION, delete: false } };
    expect(canAccess(subject({ permissions: narrowed }), 'WORK', 'delete')).toBe(false);
    expect(canAccess(subject({ permissions: narrowed }), 'WORK', 'update')).toBe(true);
  });

  it('lets admins bypass missing permissions', () => {
    const none = toPermissionMap([]);
    expect(canAccess(subject({ permissions: none }), 'REPORT', 'view')).toBe(false);
    expect(canAccess(subject({ isAdmin: true, permissions: none }), 'IMPORT', 'create')).toBe(true);
  });

  it('treats a feature without a stored row as no access', () => {
    expect(toPermissionMap([]).VENDOR).toEqual(NO_PERMISSION);
  });
});
