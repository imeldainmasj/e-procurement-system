import type { ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { RequireAccess } from '@/components/auth/RequireAccess';
import { GuestOnly, RequireAuth } from '@/components/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { NAV_SECTIONS } from '@/config/navigation';
import { AgreementDetailPage } from '@/features/agreements/AgreementDetailPage';
import { AgreementListPage } from '@/features/agreements/AgreementListPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { NotFoundPage } from '@/features/errors/NotFoundPage';
import { ComingSoonPage } from '@/features/placeholder/ComingSoonPage';
import { ImportBatchPage } from '@/features/imports/ImportBatchPage';
import { ImportPage } from '@/features/imports/ImportPage';
import { GeneralSettingsPage } from '@/features/settings/general/GeneralSettingsPage';
import { MilestoneTemplatesPage } from '@/features/settings/milestone-templates/MilestoneTemplatesPage';
import { OrganizationPage } from '@/features/settings/organization/OrganizationPage';
import { UsersPage } from '@/features/settings/users/UsersPage';
import { VendorDetailPage } from '@/features/vendors/VendorDetailPage';
import { VendorListPage } from '@/features/vendors/VendorListPage';
import { WorkDetailPage } from '@/features/works/WorkDetailPage';
import { WorkListPage } from '@/features/works/WorkListPage';

/** Pages built so far, keyed by menu path. Other menu routes show a placeholder. */
const PAGES: Record<string, ReactNode> = {
  '/pekerjaan/saya': <WorkListPage mine />,
  '/pekerjaan': <WorkListPage />,
  '/kontrak': <AgreementListPage />,
  '/vendor': <VendorListPage />,
  '/import': <ImportPage />,
  '/pengaturan/template-milestone': <MilestoneTemplatesPage />,
  '/pengaturan/pengguna': <UsersPage />,
  '/pengaturan/organisasi': <OrganizationPage />,
  '/pengaturan/umum': <GeneralSettingsPage />,
};

// Every menu route is guarded by the same rule as its sidebar entry.
const menuItems = NAV_SECTIONS.flatMap((section) => section.items);
const moduleRoutes: RouteObject[] = menuItems.map((item) => {
  const element = (
    <RequireAccess access={item.access}>
      {PAGES[item.path] ?? <ComingSoonPage title={item.label} />}
    </RequireAccess>
  );
  return item.path === '/' ? { index: true, element } : { path: item.path.slice(1), element };
});

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
          ...moduleRoutes,
          {
            path: 'pekerjaan/:id',
            element: (
              <RequireAccess access={{ feature: 'WORK' }}>
                <WorkDetailPage />
              </RequireAccess>
            ),
          },
          {
            path: 'kontrak/:id',
            element: (
              <RequireAccess access={{ feature: 'AGREEMENT' }}>
                <AgreementDetailPage />
              </RequireAccess>
            ),
          },
          {
            path: 'import/:batchId',
            element: (
              <RequireAccess access={{ feature: 'IMPORT' }}>
                <ImportBatchPage />
              </RequireAccess>
            ),
          },
          {
            path: 'vendor/:id',
            element: (
              <RequireAccess access={{ feature: 'VENDOR' }}>
                <VendorDetailPage />
              </RequireAccess>
            ),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
