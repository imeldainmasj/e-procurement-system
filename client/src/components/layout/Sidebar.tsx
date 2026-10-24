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
    <aside className="bg-base-100 border-base-300 flex min-h-full w-60 flex-col border-r">
      <div className="flex h-16 shrink-0 items-center justify-center">
        <span className="text-2xl font-bold tracking-wider">{import.meta.env.VITE_APP_NAME}</span>
      </div>
      <ul className="menu menu-velzon w-full flex-1 px-2 pb-4">
        {sections.map((section) => (
          <li key={section.title}>
            <h2 className="menu-title">{section.title}</h2>
            <ul className="ms-0 ps-0 before:hidden">
              {section.items.map((item) => (
                // NavLink adds `.active`, styled by `.menu-velzon` in index.css.
                <li key={item.path}>
                  <NavLink to={item.path} end={item.path === '/'} onClick={closeDrawer}>
                    <item.icon className="size-[18px]" />
                    {item.label}
                    {item.badge && badges[item.badge] > 0 && (
                      <span className="badge badge-xs badge-error ml-auto">
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
