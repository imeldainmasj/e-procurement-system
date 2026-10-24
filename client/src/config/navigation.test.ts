import { describe, expect, it } from 'vitest';
import { FEATURES, toPermissionMap, type AccessSubject } from '@sipita/shared';
import { getVisibleNav } from './navigation';

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

const paths = (s: AccessSubject) => getVisibleNav(s).flatMap((x) => x.items.map((i) => i.path));

describe('getVisibleNav', () => {
  it('hides Monitoring Tim and Pengaturan from staff', () => {
    const result = paths(subject());
    expect(result).toContain('/pekerjaan/saya');
    expect(result).toContain('/report/kepatuhan');
    expect(result).not.toContain('/monitoring');
    expect(result.some((p) => p.startsWith('/pengaturan'))).toBe(false);
  });

  it('shows Monitoring Tim to managers', () => {
    expect(paths(subject({ jobLevel: 'MANAGER_L1' }))).toContain('/monitoring');
  });

  it('follows the per-feature view permission', () => {
    const noImport = { ...full, IMPORT: { ...full.IMPORT, view: false } };
    expect(paths(subject({ permissions: noImport }))).not.toContain('/import');
  });

  it('shows everything to admins and drops empty sections otherwise', () => {
    expect(getVisibleNav(subject({ isAdmin: true }))).toHaveLength(4);
    const onlyDashboard = toPermissionMap([
      { feature: 'DASHBOARD', canView: true, canCreate: false, canUpdate: false, canDelete: false },
    ]);
    expect(getVisibleNav(subject({ permissions: onlyDashboard })).map((s) => s.title)).toEqual([
      'Menu',
    ]);
  });
});
