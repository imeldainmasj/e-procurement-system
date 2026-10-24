import { describe, expect, it } from 'vitest';
import { getVisibleNav } from './navigation';

const paths = (roles: Parameters<typeof getVisibleNav>[0]) =>
  getVisibleNav(roles).flatMap((s) => s.items.map((i) => i.path));

describe('getVisibleNav', () => {
  it('shows a requester only the common pages', () => {
    expect(paths(['REQUESTER'])).toEqual(['/', '/pengajuan']);
  });

  it('combines menus for users with several roles', () => {
    const result = paths(['WAREHOUSE', 'REQUESTER']);
    expect(result).toContain('/gudang/stok');
    expect(result).toContain('/aset');
    expect(result).not.toContain('/vendor');
  });

  it('gives the viewer read-only reports', () => {
    expect(paths(['VIEWER'])).toEqual(['/', '/pengajuan', '/harga', '/anggaran']);
  });

  it('shows everything to SUPER_ADMIN', () => {
    expect(paths(['SUPER_ADMIN'])).toContain('/pengaturan/aturan-approval');
    expect(getVisibleNav(['SUPER_ADMIN'])).toHaveLength(5);
  });

  it('drops empty sections', () => {
    expect(getVisibleNav(['APPROVER']).map((s) => s.title)).toEqual(['Menu', 'Pengadaan']);
  });
});
