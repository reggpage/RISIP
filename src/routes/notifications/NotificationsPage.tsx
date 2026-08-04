import { Bell, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { markNotificationRead, useNotifications } from '@/features/notifications/notifications';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';

export default function NotificationsPage() {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const { state, unreadCount, refresh } = useNotifications(profile?.id);
  const notifications = state.notifications;

  async function markRead(id: string) {
    await markNotificationRead(id);
    await refresh();
  }

  async function markAllRead() {
    await Promise.all(notifications.filter((n) => !n.read_at).map((n) => markNotificationRead(n.id)));
    await refresh();
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Notifications</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Company updates, access changes, and claim activity appear here.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" tint="admin" onClick={() => void markAllRead()}>
            <CheckCircle2 className="h-4 w-4" />
            Mark all read
          </Button>
        )}
      </header>

      {state.status === 'loading' ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-muted" />
      ) : notifications.length === 0 ? (
        <Card className="flex min-h-56 flex-col items-center justify-center text-center">
          <Bell className="h-10 w-10 text-ink-muted" />
          <h2 className="mt-3 text-base font-semibold text-ink">No notifications yet</h2>
          <p className="mt-1 max-w-sm text-sm text-ink-muted">
            When something important happens in your company, it will show here.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => (
            <Card key={n.id} className={!n.read_at ? 'border-role-admin/40 bg-role-admin/5' : undefined}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-ink">{n.title}</h2>
                    {!n.read_at && (
                      <span className="rounded-full bg-role-admin px-2 py-0.5 text-[11px] font-semibold text-white">
                        New
                      </span>
                    )}
                  </div>
                  {n.body && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{n.body}</p>}
                  <p className="mt-2 text-xs text-ink-muted">{formatDateTime(n.created_at)}</p>
                </div>
                {!n.read_at && (
                  <Button variant="ghost" className="shrink-0 !px-2 !py-1" onClick={() => void markRead(n.id)}>
                    Mark read
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
