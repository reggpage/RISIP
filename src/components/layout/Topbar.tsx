import { Building2, Menu } from 'lucide-react';
import { useCompany } from '@/features/company/useCompany';
import { roleColorClass, roleLabel, shortName, titleCase, type UserRole } from '@/lib/roles';

// Header:
//   - Left: circular company logo (or Building2 fallback) + company name.
//   - Right (desktop): user's title-cased name + role tag.
//   - Right (mobile): hamburger — user's name is inside the drawer instead so we
//     can keep the mobile header short.
export default function Topbar({
  fullName,
  role,
  onOpenMenu,
}: {
  fullName: string;
  role: UserRole | undefined;
  onOpenMenu: () => void;
}) {
  const company = useCompany();

  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-border bg-surface px-3 sm:px-4">
      {/* Left: company identity */}
      <div className="flex min-w-0 items-center gap-2.5">
        <CompanyBadge logoUrl={company?.logo_url ?? null} />
        <span className="truncate text-sm font-semibold text-ink sm:text-base">
          {titleCase(company?.name) || '—'}
        </span>
      </div>

      {/* Right: user identity (desktop) + hamburger (mobile) */}
      <div className="flex items-center gap-3">
        <div className="hidden text-right text-sm text-ink-muted md:block">
          <span className="font-medium text-ink">{shortName(fullName)}</span>
          {role && <span className={`ml-2 ${roleColorClass[role]}`}>· {roleLabel[role]}</span>}
        </div>
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface-muted md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}

function CompanyBadge({ logoUrl }: { logoUrl: string | null }) {
  // Bumped from h-8 to h-10 so the logo carries more weight in the header, matching
  // the sidebar mark and the "standard website logo" size the user asked for.
  const base = 'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full';
  if (logoUrl) {
    return (
      <div className={`${base} border border-surface-border bg-surface`}>
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${base} bg-role-admin/10 text-role-admin`}>
      <Building2 className="h-5 w-5" />
    </div>
  );
}
