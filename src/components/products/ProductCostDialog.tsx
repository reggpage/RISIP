import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { getLang } from '@/lib/lang';
import { setProductCost, type CatalogProduct } from '@/features/products/products';

const lang = getLang();
const ui = lang === 'sw' ? {
  title: 'Bei ya kununua',
  intro: 'Bei unayonunua kwayo kila kimoja. Ndiyo inayowezesha makisio ya faida.',
  cost: 'Ninanunua kwa', unit: 'Kipimo', unitHint: 'Mfano: kilo, kipande, lita. Si lazima.',
  note: 'Maelezo', noteHint: 'Si lazima. Mfano: bei mpya kutoka kwa supplier.',
  selling: 'Unauza kwa wastani', current: 'Bei ya sasa', since: 'Tangu',
  save: 'Hifadhi', saving: 'Inahifadhi…', cancel: 'Ghairi',
  saved: 'Bei ya kununua imehifadhiwa.',
  invalid: 'Andika bei kubwa kuliko sifuri.',
  aboveSelling: 'Bei hii ya kununua ni kubwa kuliko unavyouza. Hakikisha ni sahihi.',
  history: 'Bei ya zamani haitafutwa. Rekodi za nyuma zinabaki na bei zilizokuwa zikitumika siku hizo.',
  margin: 'Faida kwa kimoja itakuwa',
} : {
  title: 'Buying price',
  intro: 'What you pay for one of these. It is what makes a profit estimate possible.',
  cost: 'I buy it for', unit: 'Unit', unitHint: 'For example: kilo, piece, litre. Optional.',
  note: 'Note', noteHint: 'Optional. For example: new price from the supplier.',
  selling: 'You sell it for, on average', current: 'Current price', since: 'Since',
  save: 'Save', saving: 'Saving…', cancel: 'Cancel',
  saved: 'Buying price saved.',
  invalid: 'Enter a price greater than zero.',
  aboveSelling: 'This buying price is higher than what you sell for. Check that it is right.',
  history: 'The old price is not deleted. Past records keep the price that applied on their own day.',
  margin: 'Margin per unit would be',
};

/**
 * Setting or changing a buying price.
 *
 * A price is never overwritten — set_product_cost appends a new row — so this
 * says so plainly. A trader who thinks changing sugar's price today rewrites
 * last month's profit will be reluctant to correct anything, and stale prices
 * are how a profit estimate quietly goes wrong.
 */
export default function ProductCostDialog({ product, onClose, onSaved }: {
  product: CatalogProduct;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [cost, setCost] = useState(product.unitCost === null ? '' : String(product.unitCost));
  const [unit, setUnit] = useState(product.unit ?? '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = Number(cost.replace(/,/g, ''));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const margin = valid && product.avgUnitPrice !== null ? product.avgUnitPrice - parsed : null;
  const aboveSelling = margin !== null && margin < 0;

  async function save() {
    if (!valid) { toast.error(ui.invalid); return; }
    setSaving(true);
    try {
      await setProductCost(product.productName, parsed, unit.trim() || null, note.trim() || null);
      toast.success(ui.saved);
      onSaved();
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-lg">
        <h2 className="text-base font-semibold text-ink">{ui.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{product.productName}</p>
        <p className="mt-2 text-xs text-ink-muted">{ui.intro}</p>

        {product.unitCost !== null ? (
          <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            {ui.current}: <span className="font-medium text-ink">{formatMoney(product.unitCost)}</span>
            {product.costEffectiveFrom
              ? ` · ${ui.since} ${new Date(product.costEffectiveFrom).toLocaleDateString('en-GB')}`
              : ''}
          </div>
        ) : null}

        {product.avgUnitPrice !== null ? (
          <div className="mt-2 text-xs text-ink-muted">
            {ui.selling}: <span className="font-medium text-ink">{formatMoney(product.avgUnitPrice)}</span>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm text-ink">{ui.cost}</span>
            <Input
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              inputMode="decimal"
              autoFocus
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink">{ui.unit}</span>
            <Input value={unit} onChange={(event) => setUnit(event.target.value)} className="mt-1" />
            <span className="mt-1 block text-[11px] text-ink-muted">{ui.unitHint}</span>
          </label>
          <label className="block">
            <span className="text-sm text-ink">{ui.note}</span>
            <Input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1" />
            <span className="mt-1 block text-[11px] text-ink-muted">{ui.noteHint}</span>
          </label>
        </div>

        {margin !== null ? (
          <p className={`mt-3 text-sm ${aboveSelling ? 'text-red-600' : 'text-emerald-600'}`}>
            {aboveSelling ? ui.aboveSelling : `${ui.margin} ${formatMoney(margin)}.`}
          </p>
        ) : null}

        <p className="mt-3 text-[11px] leading-snug text-ink-muted">{ui.history}</p>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>{ui.cancel}</Button>
          <Button onClick={() => void save()} disabled={saving || !valid}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{ui.saving}</> : ui.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
