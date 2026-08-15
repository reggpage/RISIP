import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import { recordStockCount, type CatalogProduct, type StockLevel } from '@/features/products/products';

const lang = getLang();
const ui = lang === 'sw' ? {
  title: 'Hesabu stock',
  intro: 'Andika ulizonazo rafuni sasa hivi. Kuanzia hapo Risip itafuatilia yenyewe kadri unavyouza na kuingiza.',
  quantity: 'Ninazo', unit: 'Kipimo', unitHint: 'Mfano: kilo, kipande, lita. Si lazima.',
  note: 'Maelezo', noteHint: 'Si lazima. Mfano: kuhesabu mwisho wa mwezi.',
  believed: 'Risip ilikuwa inadhani zipo',
  neverCounted: 'Bidhaa hii haijawahi kuhesabiwa.',
  save: 'Hifadhi hesabu', saving: 'Inahifadhi…', cancel: 'Ghairi',
  done: 'Hesabu imehifadhiwa.',
  invalid: 'Andika idadi, sifuri au zaidi.',
  zeroOk: 'Sifuri ni sawa — inamaanisha rafu ni tupu.',
  supersedes: 'Hesabu hii inachukua nafasi ya iliyopita. Hesabu za zamani hazifutwi, na rekodi za mauzo hazibadiliki.',
} : {
  title: 'Count stock',
  intro: 'Enter what is on the shelf right now. Risip keeps count from there as you sell and restock.',
  quantity: 'I have', unit: 'Unit', unitHint: 'For example: kilo, piece, litre. Optional.',
  note: 'Note', noteHint: 'Optional. For example: month-end count.',
  believed: 'Risip believed there were',
  neverCounted: 'This product has never been counted.',
  save: 'Save count', saving: 'Saving…', cancel: 'Cancel',
  done: 'Count saved.',
  invalid: 'Enter a quantity, zero or more.',
  zeroOk: 'Zero is fine — it means the shelf is empty.',
  supersedes: 'This count replaces the previous one. Older counts are kept, and no sales record changes.',
};

/**
 * A count states what is there. It is never an adjustment entry, because that is
 * how real shops reconcile — stock is lost, broken and miscounted, and the
 * answer is to walk the shelf, not to reason about the difference.
 */
export default function StockCountDialog({ product, level, onClose, onSaved }: {
  product: CatalogProduct;
  level: StockLevel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(product.unit ?? level?.unit ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = Number(quantity.replace(/,/g, ''));
  const valid = quantity.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;

  async function save() {
    if (!valid) { toast.error(ui.invalid); return; }
    setBusy(true);
    try {
      await recordStockCount(product.productName, parsed, unit.trim() || null, note.trim() || null);
      toast.success(ui.done);
      onSaved();
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
        <p className="mt-1 text-sm text-ink-muted">{product.productName}</p>
        <p className="mt-2 text-xs text-ink-muted">{ui.intro}</p>

        <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          {level?.hasCount
            ? <>{ui.believed}: <span className="font-medium tabular-nums text-ink">{level.onHand}</span></>
            : ui.neverCounted}
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm text-ink">{ui.quantity}</span>
            <Input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="decimal"
              autoFocus
              className="mt-1"
            />
            <span className="mt-1 block text-[11px] text-ink-muted">{ui.zeroOk}</span>
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

        <p className="mt-3 text-[11px] leading-snug text-ink-muted">{ui.supersedes}</p>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{ui.cancel}</Button>
          <Button onClick={() => void save()} disabled={busy || !valid}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{ui.saving}</> : ui.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
