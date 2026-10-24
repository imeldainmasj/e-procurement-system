import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FEATURES, toPermissionMap, type AuthUser } from '@sipita/shared';
import { useAuthStore } from '@/stores/authStore';
import { Can } from './Can';

function signInAs(over: Partial<AuthUser> = {}) {
  useAuthStore.getState().setSession({
    accessToken: 'token',
    user: {
      id: '1',
      employeeId: 'E1',
      username: 'test',
      name: 'Test',
      email: 't@test.local',
      jobLevel: 'STAFF',
      isAdmin: false,
      department: null,
      permissions: toPermissionMap(
        FEATURES.map((feature) => ({
          feature,
          canView: true,
          canCreate: feature !== 'VENDOR',
          canUpdate: true,
          canDelete: true,
        })),
      ),
      ...over,
    },
  });
}

describe('<Can>', () => {
  beforeEach(() => useAuthStore.getState().clear());

  it('renders children when the user has the permission', () => {
    signInAs();
    render(
      <Can feature="WORK" action="update">
        Update progres
      </Can>,
    );
    expect(screen.getByText('Update progres')).toBeInTheDocument();
  });

  it('renders the fallback when the permission is narrowed', () => {
    signInAs();
    render(
      <Can feature="VENDOR" action="create" fallback="Tidak ada akses">
        Tambah Vendor
      </Can>,
    );
    expect(screen.queryByText('Tambah Vendor')).not.toBeInTheDocument();
    expect(screen.getByText('Tidak ada akses')).toBeInTheDocument();
  });

  it('limits admin-only UI to admins', () => {
    signInAs({ jobLevel: 'MANAGER_L2' });
    const { rerender } = render(<Can admin>Rollback</Can>);
    expect(screen.queryByText('Rollback')).not.toBeInTheDocument();
    signInAs({ isAdmin: true });
    rerender(<Can admin>Rollback</Can>);
    expect(screen.getByText('Rollback')).toBeInTheDocument();
  });

  it('renders nothing when signed out', () => {
    const { container } = render(<Can feature="REPORT">Laporan</Can>);
    expect(container).toBeEmptyDOMElement();
  });
});
