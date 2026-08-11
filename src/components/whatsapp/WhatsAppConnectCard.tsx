import { useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  createWhatsAppLinkUrl,
  maskPhone,
  revokeWhatsApp,
  useWhatsAppLink,
} from '@/features/whatsapp/useWhatsAppLink';

// Connect / show / revoke the employee's WhatsApp number. Deliberately small:
// this MVP only lets WhatsApp deliver a receipt photo, and everything else still
// happens in the app.
export default function WhatsAppConnectCard() {
  const { identity, loading, refresh, configured } = useWhatsAppLink();
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function connect() {
    setBusy(true);
    try {
      const url = await createWhatsAppLinkUrl();
      // Opening wa.me hands the prefilled "LINK <token>" message to WhatsApp; the
      // user just presses send. The token is single-use and expires in 15 minutes.
      window.open(url, '_blank', 'noopener,noreferrer');
      toast.info('Send the pre-filled WhatsApp message to finish connecting, then refresh this page.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the connection.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await revokeWhatsApp();
      toast.success('WhatsApp disconnected. Receipts can no longer be sent from that number.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disconnect.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">Send receipts on WhatsApp</h3>
            <p className="mt-1 max-w-prose text-sm text-ink-muted">
              Connect your WhatsApp number, then photograph a receipt and send it to the official Risip
              number. Risip reads it and replies with a link to confirm the project, category and payment
              source here in the app.
            </p>
          </div>
        </div>

        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        ) : identity ? (
          <Button variant="secondary" tint="neutral" disabled={busy} onClick={() => void disconnect()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Disconnect
          </Button>
        ) : (
          <Button tint="admin" disabled={busy || !configured} onClick={() => void connect()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Connect WhatsApp
          </Button>
        )}
      </div>

      {!loading && identity && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50/70 px-3 py-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="text-ink">
            Connected as <span className="font-semibold tabular-nums">{maskPhone(identity.phone_e164)}</span>
          </span>
        </p>
      )}

      {!loading && !configured && (
        <p className="mt-4 text-sm text-ink-muted">
          The Risip WhatsApp number is not configured for this deployment yet.
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-muted">
        Privacy: receipt photos you send to the official Risip number are stored in your company's Risip
        workspace and are visible to your company's finance team, exactly like receipts uploaded in the app.
        Receipts arrive as <span className="font-medium">pending review</span> and do not count towards
        approved project spend until they are confirmed. Disconnecting stops any future submissions from
        this number.
      </p>
    </Card>
  );
}
