import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toaster';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="drawer lg:drawer-open">
      <input id="app-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
      <div className="drawer-side z-20">
        <label htmlFor="app-drawer" aria-label="Tutup menu" className="drawer-overlay" />
        <Sidebar />
      </div>
      <Toaster />
    </div>
  );
}
