import { NavLink } from 'react-router-dom';
import { getVisibleNav } from '@/config/navigation';
import { usePendingApprovalCount } from '@/hooks/useApprovals';
import { usePermission } from '@/hooks/usePermission';

export function Sidebar() {
  const { roles } = usePermission();
  const sections = getVisibleNav(roles);
  const pendingApprovals = usePendingApprovalCount();
  const badges = { pendingApprovals: pendingApprovals.data ?? 0 };

  const closeDrawer = () => {
    const toggle = document.getElementById('app-drawer') as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  };

  return (
    <aside className="bg-base-200 flex min-h-full w-64 flex-col">
      <div className="border-base-300 flex h-16 items-center border-b px-6">
        <span className="text-primary text-xl font-bold">{import.meta.env.VITE_APP_NAME}</span>
      </div>
      <ul className="menu w-full flex-1 p-4">
        {sections.map((section) => (
          <li key={section.title}>
            <h2 className="menu-title">{section.title}</h2>
            <ul>
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    onClick={closeDrawer}
                    className={({ isActive }) => (isActive ? 'menu-active' : '')}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                    {item.badge && badges[item.badge] > 0 && (
                      <span className="badge badge-sm badge-error ml-auto">
                        {badges[item.badge]}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}
