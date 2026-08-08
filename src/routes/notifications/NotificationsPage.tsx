import { Bell, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListItemSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { markNotificationRead, respondToPettyCashRequest, useNotifications } from '@/features/notifications/notifications';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

export default function NotificationsPage() {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const { state, unreadCount, refresh } = useNotifications(profile?.id);
  const notifications = state.notifications;
  const toast = useToast();
  const [respondingId, setRespondingId] = useState<string | null>(null);

  async function markRead(id: string) {
    await markNotificationRead(id);
    await refresh();
  }

  async function markAllRead() {
    await Promise.all(notifications.filter((n) => !n.read_at).map((n) => markNotificationRead(n.id)));
    await refresh();
  }

  async function respond(notificationId: string, transactionId: string, accept: boolean) {
    setRespondingId(notificationId);
    try {
      await respondToPettyCashRequest(transactionId, accept);
      await markNotificationRead(notificationId);
      toast.success(accept ? 'Top-up accepted. The cash is now available.' : 'Top-up declined.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not respond to the top-up request.');
    } finally {
      setRespondingId(null);
    }
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
        <div className="flex flex-col gap-3">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          </Card>
          <ListItemSkeleton lines={3} />
          <ListItemSkeleton lines={2} />
        </div>
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
              {(() => {
                const metadata = n.metadata && typeof n.metadata === 'object'
                  ? n.metadata as { transaction_id?: string }
                  : {};
                const needsResponse = n.type === 'petty_cash_request' && !!metadata.transaction_id && !n.read_at;
                return (
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
                  {needsResponse && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        tint="admin"
                        disabled={respondingId === n.id}
                        onClick={() => void respond(n.id, metadata.transaction_id!, true)}
                      >
                        {respondingId === n.id && <Loader2 className="h-4 w-4 animate-spin" />}
                        Accept top-up
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={respondingId === n.id}
                        onClick={() => void respond(n.id, metadata.transaction_id!, false)}
                        className="!border-red-300 !text-red-600 hover:!bg-red-50"
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </div>
                {!n.read_at && !needsResponse && (
                  <Button variant="ghost" className="shrink-0 !px-2 !py-1" onClick={() => void markRead(n.id)}>
                    Mark read
                  </Button>
                )}
              </div>
                );
              })()}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
