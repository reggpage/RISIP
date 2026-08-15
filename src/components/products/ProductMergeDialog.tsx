import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { getLang } from '@/lib/lang';
import { mergeCandidates, mergeProducts, type CatalogProduct } from '@/features/products/products';

const lang = getLang();
const ui = lang === 'sw' ? {
  title: 'Unganisha bidhaa',
  intro: 'Majina mawili, kitu kimoja. Mauzo ya jina la kwanza yatahamia la pili.',
  from: 'Jina la kuondoa', into: 'Jina la kubaki',
  choose: 'Chagua bidhaa…',
  reason: 'Sababu', reasonHint: 'Si lazima. Mfano: kistari cha ziada mwanzoni.',
  result: 'Baada ya kuunganisha',
  sold: 'Imeuzwa', revenue: 'Mapato',
  safety: 'Hakuna pesa inayohama. Mauzo yanapewa jina moja tu; jumla ya mapato yako inabaki ile ile hasa, na seva inakataa kuunganisha kama itabadilika.',
  merge: 'Unganisha', merging: 'Inaunganisha…', cancel: 'Ghairi',
  done: 'Bidhaa zimeunganishwa.',
  pickOne: 'Chagua jina la kubaki.',
  bothPriced: 'Bidhaa zote mbili zina bei ya kununua. Ondoa bei ya moja kwanza, vinginevyo faida ya nyuma ingebadilika.',
} : {
  title: 'Merge products',
  intro: 'Two names, one thing. Sales from the first name move to the second.',
  from: 'Name to remove', into: 'Name to keep',
  choose: 'Choose a product…',
  reason: 'Reason', reasonHint: 'Optional. For example: stray dash at the start.',
  result: 'After merging',
  sold: 'Sold', revenue: 'Revenue',
  safety: 'No money moves. The sales are simply given one name; your total revenue stays exactly the same, and the server refuses the merge if it would change.',
  merge: 'Merge', merging: 'Merging…', cancel: 'Cancel',
  done: 'Products merged.',
  pickOne: 'Choose the name to keep.',
  bothPriced: 'Both products have a buying price. Remove one of them first, otherwise past profit would change.',
};

/**
 * Merging is the honest answer to "this product should not be here". Deleting a
 * product that carries confirmed sales would change a month already reported;
 * merging re-labels the sales and leaves every total exactly where it was.
 */
export default function ProductMergeDialog({ product, all, onClose, onDone }: {
  product: CatalogProduct;
  all: CatalogProduct[];
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const candidates = useMemo(() => mergeCandidates(product, all), [product, all]);
  const [intoKey, setIntoKey] = useState(candidates[0]?.productKey ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const into = candidates.find((candidate) => candidate.productKey === intoKey) ?? null;
  const bothPriced = product.unitCost !== null && into?.unitCost != null;

  async function run() {
    if (!into) { toast.error(ui.pickOne); return; }
    setBusy(true);
    try {
      await mergeProducts(product.productKey, into.productKey, reason.trim() || null);
      toast.success(ui.done);
      onDone();
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-lg">
        <h2 className="text-base font-semibold text-ink">{ui.title}</h2>
        <p className="mt-1 text-xs text-ink-muted">{ui.intro}</p>

        <div className="mt-4 space-y-3">
          <div>
            <span className="text-sm text-ink">{ui.from}</span>
            <div className="mt-1 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
              {product.productName}
              <span className="ml-2 text-xs text-ink-muted">
                {product.quantitySold.toLocaleString('en-US')} · {formatMoney(product.revenue)}
              </span>
            </div>
          </div>

          <label className="block">
            <span className="text-sm text-ink">{ui.into}</span>
            <Select
              value={intoKey}
              onChange={setIntoKey}
              placeholder={ui.choose}
              options={candidates.map((candidate) => ({
                value: candidate.productKey, label: candidate.productName,
              }))}
              className="mt-1"
            />
          </label>

          <label className="block">
            <span className="text-sm text-ink">{ui.reason}</span>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1" />
            <span className="mt-1 block text-[11px] text-ink-muted">{ui.reasonHint}</span>
          </label>
        </div>

        {into ? (
          <div className="mt-3 rounded-lg border border-surface-border p-3">
            <div className="text-[11px] uppercase tracking-wide text-ink-muted">{ui.result}</div>
            <div className="mt-1 text-sm font-medium text-ink">{into.productName}</div>
            <div className="mt-0.5 text-xs text-ink-muted">
              {ui.sold} {(product.quantitySold + into.quantitySold).toLocaleString('en-US')}
              {' · '}
              {ui.revenue} {formatMoney(product.revenue + into.revenue)}
            </div>
          </div>
        ) : null}

        {bothPriced ? (
          <p className="mt-3 text-sm text-red-600">{ui.bothPriced}</p>
        ) : (
          <p className="mt-3 text-[11px] leading-snug text-ink-muted">{ui.safety}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{ui.cancel}</Button>
          <Button onClick={() => void run()} disabled={busy || !into || bothPriced}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{ui.merging}</> : ui.merge}
          </Button>
        </div>
      </div>
    </div>
  );
}
