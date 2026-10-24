import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NotificationDto } from '@sipita/shared';
import {
  useNotificationActions,
  useRecentNotifications,
  useUnreadNotificationCount,
} from '@/hooks/useApprovals';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/formatDate';

/** Navbar bell: unread badge (polled) and a dropdown with the latest notifications. */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotificationCount();
  const recent = useRecentNotifications(open);
  const { markRead, markAllRead } = useNotificationActions();
  const count = unread.data ?? 0;

  const openNotification = (n: NotificationDto) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
    if (n.link) navigate(n.link);
  };

  return (
    <div className="dropdown dropdown-end">
      <button
        type="button"
        className="btn btn-ghost btn-square btn-sm"
        aria-label={count > 0 ? `Notifikasi, ${count} belum dibaca` : 'Notifikasi'}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
      >
        <div className="indicator">
          <Bell className="size-5" />
          {count > 0 && (
            <span className="badge badge-xs badge-error indicator-item rounded-full">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </div>
      </button>
      <div className="dropdown-content card card-sm border-base-300 z-20 mt-3 w-80 border shadow-lg">
        <div className="card-body gap-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Notifikasi</h3>
            {count > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => markAllRead.mutate()}
              >
                <CheckCheck className="size-3" /> Tandai semua dibaca
              </button>
            )}
          </div>
          {recent.isPending ? (
            <span className="loading loading-dots loading-sm" />
          ) : recent.data?.data.length === 0 ? (
            <p className="text-base-content/60 text-sm">Belum ada notifikasi.</p>
          ) : (
            <ul className="-mx-2 max-h-96 overflow-y-auto">
              {recent.data?.data.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn(
                      'hover:bg-base-200 rounded-box w-full px-2 py-2 text-left',
                      !n.isRead && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.isRead && (
                        <span
                          className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                          aria-label="Belum dibaca"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{n.title}</div>
                        <div className="text-base-content/70 line-clamp-2 text-xs">{n.message}</div>
                        <div className="text-base-content/50 mt-0.5 text-xs">
                          {formatDateTime(n.createdAt)}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
