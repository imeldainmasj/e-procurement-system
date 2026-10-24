import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@sipita/shared';
import { useAuthStore } from '@/stores/authStore';
import { Can } from './Can';

function signInAs(roles: Role[]) {
  useAuthStore.getState().setSession({
    accessToken: 'token',
    user: {
      id: '1',
      name: 'Test',
      email: 't@test.local',
      nip: null,
      phone: null,
      approvalLevel: null,
      division: null,
      roles,
    },
  });
}

describe('<Can>', () => {
  beforeEach(() => useAuthStore.getState().clear());

  it('renders children when the user has the role', () => {
    signInAs(['PROCUREMENT']);
    render(<Can role={['PROCUREMENT', 'VIEWER']}>Tambah Vendor</Can>);
    expect(screen.getByText('Tambah Vendor')).toBeInTheDocument();
  });

  it('renders the fallback otherwise', () => {
    signInAs(['REQUESTER']);
    render(
      <Can role="PROCUREMENT" fallback="Tidak ada akses">
        Tambah Vendor
      </Can>,
    );
    expect(screen.queryByText('Tambah Vendor')).not.toBeInTheDocument();
    expect(screen.getByText('Tidak ada akses')).toBeInTheDocument();
  });

  it('renders nothing when signed out', () => {
    const { container } = render(<Can role="VIEWER">Laporan</Can>);
    expect(container).toBeEmptyDOMElement();
  });
});
