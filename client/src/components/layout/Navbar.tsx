import { LogOut, Menu, Moon, Search, ShieldCheck, Sun } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { JOB_LEVEL_LABELS } from '@sipita/shared';
import { getVisibleNav } from '@/config/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePermission } from '@/hooks/usePermission';
import { useThemeStore } from '@/stores/themeStore';
import { NotificationBell } from './NotificationBell';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Quick jump to any menu page the user can open. */
function MenuSearch() {
  const navigate = useNavigate();
  const { subject } = usePermission();
  const [query, setQuery] = useState('');
  const items = getVisibleNav(subject).flatMap((s) => s.items);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    const match = q ? items.find((item) => item.label.toLowerCase().includes(q)) : undefined;
    if (match) {
      navigate(match.path);
      setQuery('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="hidden md:block">
      <label className="input input-sm bg-base-200 w-60 border-0">
        <Search className="size-4 opacity-50" />
        <input
          type="search"
          list="menu-search-options"
          placeholder="Cari menu..."
          aria-label="Cari menu"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <datalist id="menu-search-options">
        {items.map((item) => (
          <option key={item.path} value={item.label} />
        ))}
      </datalist>
    </form>
  );
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
    <header className="navbar bg-base-100 border-base-300 sticky top-0 z-10 min-h-16 gap-3 border-b px-4 py-0">
      <label
        htmlFor="app-drawer"
        className="btn btn-ghost btn-square btn-sm lg:hidden"
        aria-label="Buka menu"
      >
        <Menu className="size-5" />
      </label>
      <MenuSearch />
      <div className="flex-1" />

      <button
        type="button"
        className="btn btn-ghost btn-square btn-sm"
        onClick={toggleTheme}
        aria-label={theme === 'velzon' ? 'Aktifkan mode gelap' : 'Aktifkan mode terang'}
      >
        {theme === 'velzon' ? <Moon className="size-5" /> : <Sun className="size-5" />}
      </button>

      <NotificationBell />

      {user && (
        <div className="dropdown dropdown-end -me-4 self-stretch">
          <button
            type="button"
            className="bg-base-200 flex h-full cursor-pointer items-center gap-2 px-4"
            aria-label="Menu profil"
          >
            <div className="avatar avatar-placeholder">
              <div className="bg-primary text-primary-content w-9 rounded-full">
                <span className="text-xs">{initials(user.name)}</span>
              </div>
            </div>
            <div className="hidden text-left leading-tight sm:block">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-base-content/60 text-xs">{JOB_LEVEL_LABELS[user.jobLevel]}</div>
            </div>
          </button>
          <div className="dropdown-content bg-base-100 rounded-box border-base-300 z-20 w-64 border p-2 shadow-lg">
            <div className="px-3 py-2">
              <p className="font-semibold">{user.name}</p>
              <p className="text-base-content/60 truncate text-sm">{user.email}</p>
              {user.department && (
                <p className="text-base-content/60 text-sm">{user.department.name}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="badge badge-sm badge-soft badge-primary">
                  {JOB_LEVEL_LABELS[user.jobLevel]}
                </span>
                {user.isAdmin && (
                  <span className="badge badge-sm badge-soft badge-secondary">
                    <ShieldCheck className="size-3" />
                    Admin
                  </span>
                )}
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
    </header>
  );
}
