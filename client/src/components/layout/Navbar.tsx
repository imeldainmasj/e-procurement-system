import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APPROVAL_LEVEL_LABELS, ROLE_LABELS } from '@sipita/shared';
import { useAuth } from '@/hooks/useAuth';
import { useThemeStore } from '@/stores/themeStore';
import { NotificationBell } from './NotificationBell';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function Navbar() {
  const { theme, toggleTheme } = useThemeStore();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="navbar bg-base-100 border-base-300 sticky top-0 z-10 gap-1 border-b px-4">
      <div className="flex-none lg:hidden">
        <label htmlFor="app-drawer" className="btn btn-square btn-ghost" aria-label="Buka menu">
          <Menu className="size-5" />
        </label>
      </div>
      <div className="flex-1" />

      <NotificationBell />

      <button
        type="button"
        className="btn btn-ghost btn-circle"
        onClick={toggleTheme}
        aria-label={theme === 'corporate' ? 'Aktifkan mode gelap' : 'Aktifkan mode terang'}
      >
        {theme === 'corporate' ? <Moon className="size-5" /> : <Sun className="size-5" />}
      </button>

      {user && (
        <div className="dropdown dropdown-end">
          <button type="button" className="btn btn-ghost gap-2 px-2" aria-label="Menu profil">
            <div className="avatar avatar-placeholder">
              <div className="bg-primary text-primary-content w-8 rounded-full">
                <span className="text-xs">{initials(user.name)}</span>
              </div>
            </div>
            <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
          </button>
          <div className="dropdown-content bg-base-100 rounded-box z-20 mt-3 w-64 p-2 shadow-lg">
            <div className="px-3 py-2">
              <p className="font-semibold">{user.name}</p>
              <p className="text-base-content/60 truncate text-sm">{user.email}</p>
              {user.division && (
                <p className="text-base-content/60 text-sm">{user.division.name}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {user.roles.map((role) => (
                  <span key={role} className="badge badge-sm badge-outline">
                    {ROLE_LABELS[role]}
                    {role === 'APPROVER' && user.approvalLevel
                      ? ` · ${APPROVAL_LEVEL_LABELS[user.approvalLevel] ?? `L${user.approvalLevel}`}`
                      : ''}
                  </span>
                ))}
              </div>
            </div>
            <ul className="menu w-full p-0">
              <li>
                <button type="button" onClick={() => void handleLogout()} className="text-error">
                  <LogOut className="size-4" />
                  Keluar
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
