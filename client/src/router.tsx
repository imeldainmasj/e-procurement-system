import type { ReactNode } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { RequireAccess } from '@/components/auth/RequireAccess';
import { GuestOnly, RequireAuth } from '@/components/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { NAV_SECTIONS } from '@/config/navigation';
import { LoginPage } from '@/features/auth/LoginPage';
import { NotFoundPage } from '@/features/errors/NotFoundPage';
import { ComingSoonPage } from '@/features/placeholder/ComingSoonPage';
import { GeneralSettingsPage } from '@/features/settings/general/GeneralSettingsPage';
import { OrganizationPage } from '@/features/settings/organization/OrganizationPage';
import { UsersPage } from '@/features/settings/users/UsersPage';
import { VendorDetailPage } from '@/features/vendors/VendorDetailPage';
import { VendorListPage } from '@/features/vendors/VendorListPage';

/** Pages built so far, keyed by menu path. Other menu routes show a placeholder. */
const PAGES: Record<string, ReactNode> = {
  '/vendor': <VendorListPage />,
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
