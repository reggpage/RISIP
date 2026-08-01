import { useState } from 'react';
import { Copy, Check, X, RefreshCw, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import WhatsappIcon from '@/components/ui/WhatsappIcon';
import { inviteJoinUrl } from '@/lib/tokens';
import { roleColorClass, roleLabel } from '@/lib/roles';
import { formatDateTime } from '@/lib/format';
import { sw } from '@/i18n/sw';
import type { InviteLink } from '@/types/db';

export default function InviteLinkCard({
  link,
  projectName,
  canRevoke,
  onRevoke,
  onRegenerate,
}: {
  link: InviteLink;
  projectName: string;
  canRevoke: boolean;
  onRevoke: (id: string) => void | Promise<void>;
  // Only meaningful for revoked cards — spins up a fresh token for the same role.
  onRegenerate?: (role: InviteLink['role']) => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const url = inviteJoinUrl(link.token);
  const revoked = !!link.revoked_at;
  const roleName = roleLabel[link.role];

  async function handleRegenerate() {
    if (!onRegenerate) return;
    setRegenerating(true);
    try {
      await onRegenerate(link.role);
    } finally {
      // Component will unmount once the fresh link replaces this revoked card, so
      // resetting is only relevant if the parent failed to swap us out.
      setRegenerating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Older browsers / insecure contexts — fall back to a prompt.
      window.prompt(sw.common.copy, url);
    }
  }

  function shareWhatsapp() {
    // Put the URL on its own line surrounded by whitespace — WhatsApp's URL
    // autolinker skips inline URLs adjacent to text, especially IP/port dev URLs.
    const msg = `${sw.projects.shareMessage(projectName, roleName)}\n\n${url}\n`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <Card className={revoked ? 'opacity-60' : ''}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className={`text-sm font-semibold ${roleColorClass[link.role]}`}>{roleName}</div>
          <div className="text-xs text-ink-muted">
            {revoked ? `${sw.projects.revoked} · ${formatDateTime(link.revoked_at)}` : formatDateTime(link.created_at)}
          </div>
        </div>
        {canRevoke && !revoked && (
          <button
            type="button"
            onClick={() => void onRevoke(link.id)}
            className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-red-600"
            aria-label={sw.projects.revoke}
            title={sw.projects.revoke}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {canRevoke && revoked && onRegenerate && (
          <button
            type="button"
            onClick={() => void handleRegenerate()}
            disabled={regenerating}
            className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-role-admin disabled:cursor-not-allowed"
            aria-label={sw.projects.regenerate}
            title={sw.projects.regenerate}
          >
            {regenerating
              ? <Loader2 className="h-4 w-4 animate-spin text-role-admin" />
              : <RefreshCw className="h-4 w-4" />}
          </button>
        )}
      </div>

      <div className="mb-3 break-all rounded bg-surface-muted px-3 py-2 font-mono text-xs text-ink">
        {url}
      </div>

      {!revoked && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" tint="admin" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? sw.common.copied : sw.common.copy}
          </Button>
          <Button
            variant="secondary"
            className="!border-[#25D366] !text-[#25D366] hover:!bg-[#25D366]/10"
            onClick={shareWhatsapp}
          >
            <WhatsappIcon />
            {sw.common.shareWhatsapp}
          </Button>
        </div>
      )}
    </Card>
  );
}
