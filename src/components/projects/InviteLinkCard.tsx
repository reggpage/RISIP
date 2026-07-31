import { useState } from 'react';
import { Copy, Check, MessageCircle, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
}: {
  link: InviteLink;
  projectName: string;
  canRevoke: boolean;
  onRevoke: (id: string) => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const url = inviteJoinUrl(link.token);
  const revoked = !!link.revoked_at;
  const roleName = roleLabel[link.role];

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
    const msg = `${sw.projects.shareMessage(projectName, roleName)} ${url}`;
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
      </div>

      <div className="mb-3 truncate rounded bg-surface-muted px-3 py-2 font-mono text-xs text-ink">
        {url}
      </div>

      {!revoked && (
        <div className="flex gap-2">
          <Button variant="secondary" tint="admin" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? sw.common.copied : sw.common.copy}
          </Button>
          <Button variant="secondary" tint="worker" onClick={shareWhatsapp}>
            <MessageCircle className="h-4 w-4" />
            {sw.common.shareWhatsapp}
          </Button>
        </div>
      )}
    </Card>
  );
}
