import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import { setProductCost } from '@/features/products/products';

const lang = getLang();
const ui = lang === 'sw' ? {
  title: 'Ongeza bidhaa',
  intro: 'Kwa kitu unachouza lakini bado hujakiuza kupitia Risip. Kikishauzwa, mauzo yataungana nacho chenyewe.',
  name: 'Jina la bidhaa', namePlaceholder: 'Mfano: Sukari',
  cost: 'Ninanunua kwa', unit: 'Kipimo', unitHint: 'Mfano: kilo, kipande, lita. Si lazima.',
  add: 'Ongeza', adding: 'Inaongeza…', cancel: 'Ghairi',
  done: 'Bidhaa imeongezwa.',
  needName: 'Andika jina la bidhaa.',
  needCost: 'Andika bei ya kununua kubwa kuliko sifuri.',
  note: 'Bidhaa inatambulika kwa jina lake. Ukiiuza baadaye kwa jina lile lile, mauzo yataungana nayo bila kufanya kitu.',
} : {
  title: 'Add a product',
  intro: 'For something you sell but have not yet sold through Risip. Once you do, the sales join it on their own.',
  name: 'Product name', namePlaceholder: 'For example: Sugar',
  cost: 'I buy it for', unit: 'Unit', unitHint: 'For example: kilo, piece, litre. Optional.',
  add: 'Add', adding: 'Adding…', cancel: 'Cancel',
  done: 'Product added.',
  needName: 'Enter the product name.',
  needCost: 'Enter a buying price greater than zero.',
  note: 'A product is known by its name. Sell it later under the same name and the sales join it with nothing to do.',
};

/**
 * The catalogue is built from sales, so a product with no sales yet has no other
 * way in. Recording its buying price is what puts it on the list — and it is the
 * thing the trader would have had to enter anyway.
 */
export default function AddProductDialog({ onClose, onAdded }: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = Number(cost.replace(/,/g, ''));
  const valid = name.trim().length >= 2 && Number.isFinite(parsed) && parsed > 0;

  async function add() {
    if (name.trim().length < 2) { toast.error(ui.needName); return; }
    if (!Number.isFinite(parsed) || parsed <= 0) { toast.error(ui.needCost); return; }
    setBusy(true);
    try {
      await setProductCost(name.trim(), parsed, unit.trim() || null, null);
      toast.success(ui.done);
      onAdded();
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
          <label className="block">
            <span className="text-sm text-ink">{ui.name}</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={ui.namePlaceholder}
              autoFocus
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink">{ui.cost}</span>
            <Input value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" className="mt-1" />
          </label>
          <label className="block">
            <span className="text-sm text-ink">{ui.unit}</span>
            <Input value={unit} onChange={(event) => setUnit(event.target.value)} className="mt-1" />
            <span className="mt-1 block text-[11px] text-ink-muted">{ui.unitHint}</span>
          </label>
        </div>

        <p className="mt-3 text-[11px] leading-snug text-ink-muted">{ui.note}</p>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{ui.cancel}</Button>
          <Button onClick={() => void add()} disabled={busy || !valid}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{ui.adding}</> : ui.add}
          </Button>
        </div>
      </div>
    </div>
  );
}
