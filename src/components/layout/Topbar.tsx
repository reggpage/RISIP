import {
  Bell, ChevronLeft, ClipboardList, CreditCard, FilePlus2, FileText, FolderKanban,
  HandCoins, LayoutDashboard, MessageCircle, Package, Receipt, ScanLine, Settings, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotifications } from '@/features/notifications/notifications';
import { roleColorClass, roleLabel, shortName, type UserRole } from '@/lib/roles';
import { getLang } from '@/lib/lang';
import { sw } from '@/i18n/sw';

// App header.
//   - Home (/dashboard): a time-of-day greeting ("Good morning") with a
//     one-line welcome beneath it ("Welcome back, {firstName}").
//   - Every other screen: the title of the screen (Products, Records, …),
//     with a leading icon in front of it.
//   - Chat, Billing and Notifications sit under Settings, so their heading
//     swaps the icon for a back arrow that returns to Settings.
//   - Right: user identity (desktop) + notifications bell.

const HOME = '/dashboard';

// Chat, Billing and Notifications live in Settings now; their header keeps a
// back arrow instead of the usual leading icon.
const BACK_TO_SETTINGS = ['/chat', '/billing', '/notifications'];

type Entry = { icon: LucideIcon; label: string };

// Route prefixes -> the title and leading icon the header should show.
// Longest prefix wins, so /receipts/new gets its own label before falling
// back to /receipts.
function buildRoutes(): Array<[string, Entry]> {
  const isSw = getLang() === 'sw';
  return [
    ['/receipts/new', { icon: FilePlus2, label: sw.receipts.manualTitle }],
    ['/projects/new', { icon: FolderKanban, label: isSw ? 'Mradi Mpya' : 'New Project' }],
    ['/products', { icon: Package, label: isSw ? 'Bidhaa' : 'Products' }],
    ['/daily-records', { icon: ClipboardList, label: isSw ? 'Rekodi za Siku' : 'Daily Records' }],
    ['/sell', { icon: ScanLine, label: isSw ? 'Uza kwa scan' : 'Sell by scan' }],
    ['/scan', { icon: ScanLine, label: 'Scan barcode' }],
    ['/settings', { icon: Settings, label: sw.nav.settings }],
    ['/billing', { icon: CreditCard, label: isSw ? 'Bili' : 'Billing' }],
    ['/chat', { icon: MessageCircle, label: sw.chat.nav }],
    ['/notifications', { icon: Bell, label: isSw ? 'Taarifa' : 'Notifications' }],
    ['/receipts', { icon: Receipt, label: sw.nav.receipts }],
    ['/projects', { icon: FolderKanban, label: sw.nav.projects }],
    ['/invoices', { icon: FileText, label: sw.nav.invoices }],
    ['/claims', { icon: HandCoins, label: isSw ? 'Madai ya Suppliers' : 'Supplier claims' }],
    ['/petty-cash', { icon: Wallet, label: 'Petty cash' }],
    ['/retirements', { icon: Wallet, label: 'Retirements' }],
    ['/reimbursements', { icon: Wallet, label: 'Reimbursements' }],
  ];
}

function screenEntry(path: string): Entry | null {
  let best: Entry | null = null;
  let bestLen = -1;
  for (const [prefix, entry] of buildRoutes()) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      if (prefix.length > bestLen) {
        best = entry;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

export default function Topbar({
  fullName,
  role,
  userId,
}: {
  fullName: string;
  role: UserRole | undefined;
  userId: string | undefined;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications(userId);
  const isSw = getLang() === 'sw';
  const home = location.pathname === HOME;
  const isBackRoute = BACK_TO_SETTINGS.some((prefix) => location.pathname === prefix || location.pathname.startsWith(prefix + '/'));

  let title: string;
  let sub: string | null = null;
  let Icon: LucideIcon | null = null;
  if (home) {
    const h = new Date().getHours();
    title = isSw
      ? h < 12 ? 'Habari za asubuhi' : h < 17 ? 'Habari za mchana' : h < 21 ? 'Habari za jioni' : 'Usiku mwema'
      : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
    const first = shortName(fullName).split(' ')[0] ?? fullName;
    sub = isSw ? `Karibu tena, ${first}` : `Welcome back, ${first}`;
    Icon = LayoutDashboard;
  } else {
    const entry = screenEntry(location.pathname);
    title = entry?.label ?? '';
    Icon = entry?.icon ?? null;
  }

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-surface-border bg-surface px-3 sm:px-5">
      {/* Leading (back arrow or screen icon) + title / greeting block */}
      <div className="flex min-w-0 items-center gap-3">
        {isBackRoute ? (
          <button
            type="button"
            aria-label={isSw ? 'Rudi kwa Mipangilio' : 'Back to Settings'}
            onClick={() => navigate('/settings')}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink transition hover:bg-surface-muted active:scale-95"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : Icon ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-role-admin/10 text-role-admin">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-tight text-ink sm:text-xl">{title}</h1>
          {sub && <p className="truncate text-xs text-ink-muted sm:text-sm">{sub}</p>}
        </div>
      </div>

      {/* Right: user identity (desktop) + notifications bell */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right text-sm text-ink-muted md:block">
          <span className="font-medium text-ink">{shortName(fullName)}</span>
          {role && <span className={`ml-2 ${roleColorClass[role]}`}>· {roleLabel[role]}</span>}
        </div>
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface-muted"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-role-admin px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}