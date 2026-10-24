import type { ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { PROCUREMENT_READ_ROLES } from '@sipita/shared';
import { GuestOnly, RequireAuth } from '@/components/auth/RequireAuth';
import { RequireRole } from '@/components/auth/RequireRole';
import { AppLayout } from '@/components/layout/AppLayout';
import { NAV_SECTIONS } from '@/config/navigation';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { NotFoundPage } from '@/features/errors/NotFoundPage';
import { MemoDetailPage } from '@/features/memos/MemoDetailPage';
import { MemoListPage } from '@/features/memos/MemoListPage';
import { ComingSoonPage } from '@/features/placeholder/ComingSoonPage';
import { PrDetailPage } from '@/features/purchase-requests/PrDetailPage';
import { PrFormPage } from '@/features/purchase-requests/PrFormPage';
import { PriceHistoryPage } from '@/features/prices/PriceHistoryPage';
import { PoDetailPage } from '@/features/purchase-orders/PoDetailPage';
import { PoListPage } from '@/features/purchase-orders/PoListPage';
import { PrListPage } from '@/features/purchase-requests/PrListPage';
import { QuotationComparisonPage } from '@/features/quotations/QuotationComparisonPage';
import { ApprovalRulesPage } from '@/features/settings/approval-rules/ApprovalRulesPage';
import { DivisionsPage } from '@/features/settings/divisions/DivisionsPage';
import { GeneralSettingsPage } from '@/features/settings/general/GeneralSettingsPage';
import { ItemsPage } from '@/features/settings/items/ItemsPage';
import { UsersPage } from '@/features/settings/users/UsersPage';
import { WarehousesPage } from '@/features/settings/warehouses/WarehousesPage';
import { VendorDetailPage } from '@/features/vendors/VendorDetailPage';
import { VendorListPage } from '@/features/vendors/VendorListPage';

/** Pages built so far, keyed by menu path. Other menu routes show a placeholder. */
const PAGES: Record<string, ReactNode> = {
  '/pengajuan': <PrListPage />,
  '/persetujuan': <ApprovalsPage />,
  '/memo': <MemoListPage />,
  '/vendor': <VendorListPage />,
  '/purchase-order': <PoListPage />,
  '/harga': <PriceHistoryPage />,
  '/pengaturan/umum': <GeneralSettingsPage />,
  '/pengaturan/pengguna': <UsersPage />,
  '/pengaturan/divisi': <DivisionsPage />,
  '/pengaturan/item': <ItemsPage />,
  '/pengaturan/aturan-approval': <ApprovalRulesPage />,
  '/pengaturan/gudang': <WarehousesPage />,
};

// Every menu route is guarded by the same roles as the sidebar entry.
const moduleRoutes: RouteObject[] = NAV_SECTIONS.flatMap((section) => section.items)
  .filter((item) => item.path !== '/')
  .map((item) => ({
    path: item.path.slice(1),
    element: (
      <RequireRole roles={item.roles}>
        {PAGES[item.path] ?? <ComingSoonPage title={item.label} />}
      </RequireRole>
    ),
  }));

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          ...moduleRoutes,
          {
            path: 'pengajuan/baru',
            element: (
              <RequireRole roles={['REQUESTER']}>
                <PrFormPage />
              </RequireRole>
            ),
          },
          { path: 'pengajuan/:id', element: <PrDetailPage /> },
          { path: 'pengajuan/:id/ubah', element: <PrFormPage /> },
          // Requesters reach their memo through the PR; the server enforces visibility.
          { path: 'memo/:id', element: <MemoDetailPage /> },
          {
            path: 'vendor/:id',
            element: (
              <RequireRole roles={['PROCUREMENT']}>
                <VendorDetailPage />
              </RequireRole>
            ),
          },
          {
            path: 'penawaran/:prId',
            element: (
              <RequireRole roles={PROCUREMENT_READ_ROLES}>
                <QuotationComparisonPage />
              </RequireRole>
            ),
          },
          {
            path: 'purchase-order/:id',
            element: (
              <RequireRole roles={['PROCUREMENT', 'VIEWER', 'WAREHOUSE']}>
                <PoDetailPage />
              </RequireRole>
            ),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
