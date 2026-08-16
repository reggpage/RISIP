import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Merge, MoreVertical, Pencil } from 'lucide-react';
import { getLang } from '@/lib/lang';
import type { CatalogProduct } from '@/features/products/products';

const lang = getLang();
const ui = lang === 'sw'
  ? { more: 'Vitendo vingine', edit: 'Hariri', merge: 'Unganisha', archive: 'Ficha', restore: 'Rudisha',
      editHint: 'Hesabu, gharama na bei', mergeHint: 'Majina mawili, kitu kimoja', archiveHint: 'Siuzi tena', restoreHint: 'Rudisha kwenye orodha' }
  : { more: 'More actions', edit: 'Edit', merge: 'Merge', archive: 'Hide', restore: 'Restore',
      editHint: 'Count, cost and prices', mergeHint: 'Two names, one thing', archiveHint: 'No longer sold', restoreHint: 'Put it back on the list' };

/**
 * The actions a trader reaches for rarely, kept out of the row until asked for.
 *
 * Merging and hiding are both deliberate, occasional decisions — putting them
 * beside the everyday buttons made a busy row busier and invited a mis-tap on
 * the one action that re-labels real sales.
 */
export default function ProductRowMenu({ product, onEdit, onMerge, onArchive, onRestore }: {
  product: CatalogProduct;
  onEdit: (product: CatalogProduct) => void;
  onMerge: (product: CatalogProduct) => void;
  onArchive: (product: CatalogProduct) => void;
  onRestore: (product: CatalogProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm text-ink hover:bg-surface-muted';

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        aria-label={`${ui.more} — ${product.productName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-surface-border text-ink-muted transition hover:bg-surface-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-role-admin"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {/* Anchored to whichever side the button is actually on. The row is a
          COLUMN on a phone, so the action button sits at the LEFT edge there —
          and right-0 hung the menu off the left of the screen, cutting the first
          few letters off every item. Right-anchored only from sm upwards, where
          the row becomes horizontal and the button moves to the right. */}
      {open ? (
        <div
          role="menu"
          className="absolute left-0 z-30 mt-1 w-[min(14rem,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-surface-border bg-surface py-1 shadow-lg sm:left-auto sm:right-0"
        >
          {product.archived ? (
            <button type="button" role="menuitem" className={item}
              onClick={() => { setOpen(false); onRestore(product); }}>
              <ArchiveRestore className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              <span>
                {ui.restore}
                <span className="block text-[11px] text-ink-muted">{ui.restoreHint}</span>
              </span>
            </button>
          ) : (
            <>
              <button type="button" role="menuitem" className={item}
                onClick={() => { setOpen(false); onEdit(product); }}>
                <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span>
                  {ui.edit}
                  <span className="block text-[11px] text-ink-muted">{ui.editHint}</span>
                </span>
              </button>
              <button type="button" role="menuitem" className={item}
                onClick={() => { setOpen(false); onMerge(product); }}>
                <Merge className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span>
                  {ui.merge}
                  <span className="block text-[11px] text-ink-muted">{ui.mergeHint}</span>
                </span>
              </button>
              <button type="button" role="menuitem" className={item}
                onClick={() => { setOpen(false); onArchive(product); }}>
                <Archive className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span>
                  {ui.archive}
                  <span className="block text-[11px] text-ink-muted">{ui.archiveHint}</span>
                </span>
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
