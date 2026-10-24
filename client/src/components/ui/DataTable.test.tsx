import type { ColumnDef } from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row>[] = [
  { id: 'name', header: 'Nama', enableSorting: true, cell: ({ row }) => row.original.name },
  { id: 'actions', header: 'Aksi', cell: () => null },
];

const rows: Row[] = [
  { id: '1', name: 'Laptop' },
  { id: '2', name: 'Monitor' },
];

describe('<DataTable>', () => {
  it('renders rows and the range summary', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={42}
        params={{ page: 2, limit: 20 }}
        onParamsChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Laptop')).toBeInTheDocument();
    expect(screen.getByText('Menampilkan 21–40 dari 42 data')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('cycles server-side sort on header click', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={rows}
        total={2}
        params={{ page: 1, limit: 20 }}
        onParamsChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nama/ }));
    expect(onChange).toHaveBeenLastCalledWith({ sort: 'name:asc' });

    rerender(
      <DataTable
        columns={columns}
        data={rows}
        total={2}
        params={{ page: 1, limit: 20, sort: 'name:asc' }}
        onParamsChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nama/ }));
    expect(onChange).toHaveBeenLastCalledWith({ sort: 'name:desc' });
  });

  it('only makes sortable columns clickable', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={2}
        params={{ page: 1, limit: 20 }}
        onParamsChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Aksi' })).not.toBeInTheDocument();
  });

  it('pages forward', () => {
    const onChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={42}
        params={{ page: 1, limit: 20 }}
        onParamsChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Halaman berikutnya'));
    expect(onChange).toHaveBeenCalledWith({ page: 2 });
  });

  it('shows the empty state', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        total={0}
        params={{ page: 1, limit: 20 }}
        onParamsChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Belum ada data')).toBeInTheDocument();
  });
});
