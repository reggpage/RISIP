import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { getLang } from '@/lib/lang';
import {
  recordStockCount,
  setProductCost,
  type CatalogProduct,
  type StockLevel,
} from '@/features/products/products';

const lang = getLang();
const ui = lang === 'sw' ? {
  title: 'Hariri bidhaa',
  tabs: 'Chagua unachotaka kubadilisha',
  countTab: 'Hesabu stock', priceTab: 'Bei ya kununua',
  // Count
  countIntro: 'Andika ulizonazo rafuni sasa hivi. Kuanzia hapo Risip itafuatilia yenyewe.',
  quantity: 'Ninazo', zeroOk: 'Sifuri ni sawa — inamaanisha rafu ni tupu.',
  believed: 'Risip ilikuwa inadhani zipo', neverCounted: 'Bidhaa hii haijawahi kuhesabiwa.',
  unit: 'Kipimo',
  unitPieces: 'Vipande (kawaida)',
  unitHint: 'Vitu vinavyohesabiwa acha "Vipande". Chagua kingine tu kama unauza kwa uzito au ujazo.',
  unitGoverns: 'Hesabu na bei ya kununua zote zitakuwa kwa kipimo hiki.',
  note: 'Maelezo', noteHint: 'Si lazima. Mfano: kuhesabu mwisho wa mwezi.',
  saveCount: 'Hifadhi hesabu',
  countSaved: 'Hesabu imehifadhiwa.',
  countInvalid: 'Andika idadi, sifuri au zaidi.',
  supersedes: 'Hesabu hii inachukua nafasi ya iliyopita. Hesabu za zamani hazifutwi, na rekodi za mauzo hazibadiliki.',
  // Price
  priceIntro: 'Bei unayonunua kwayo kila kimoja. Ndiyo inayowezesha makisio ya faida.',
  cost: 'Ninanunua kwa', current: 'Bei ya sasa', since: 'Tangu',
  selling: 'Unauza kwa wastani', margin: 'Faida kwa kimoja itakuwa',
  aboveSelling: 'Bei hii ya kununua ni kubwa kuliko unavyouza. Hakikisha ni sahihi.',
  savePrice: 'Hifadhi bei',
  priceSaved: 'Bei ya kununua imehifadhiwa.',
  priceInvalid: 'Andika bei kubwa kuliko sifuri.',
  history: 'Bei ya zamani haitafutwa. Rekodi za nyuma zinabaki na bei zilizokuwa zikitumika siku hizo.',
  saving: 'Inahifadhi…', close: 'Funga', perUnit: (u: string) => ` — kwa ${u} moja`,
} : {
  title: 'Edit product',
  tabs: 'Choose what to change',
  countTab: 'Count stock', priceTab: 'Buying price',
  countIntro: 'Enter what is on the shelf right now. Risip keeps count from there.',
  quantity: 'I have', zeroOk: 'Zero is fine — it means the shelf is empty.',
  believed: 'Risip believed there were', neverCounted: 'This product has never been counted.',
  unit: 'Unit',
  unitPieces: 'Pieces (default)',
  unitHint: 'For things you count, leave it on "Pieces". Choose another only if you sell by weight or volume.',
  unitGoverns: 'The count and the buying price will both be in this unit.',
  note: 'Note', noteHint: 'Optional. For example: month-end count.',
  saveCount: 'Save count',
  countSaved: 'Count saved.',
  countInvalid: 'Enter a quantity, zero or more.',
  supersedes: 'This count replaces the previous one. Older counts are kept, and no sales record changes.',
  priceIntro: 'What you pay for one of these. It is what makes a profit estimate possible.',
  cost: 'I buy it for', current: 'Current price', since: 'Since',
  selling: 'You sell it for, on average', margin: 'Margin per unit would be',
  aboveSelling: 'This buying price is higher than what you sell for. Check that it is right.',
  savePrice: 'Save price',
  priceSaved: 'Buying price saved.',
  priceInvalid: 'Enter a price greater than zero.',
  history: 'The old price is not deleted. Past records keep the price that applied on their own day.',
  saving: 'Saving…', close: 'Close', perUnit: (u: string) => ` — per ${u}`,
};

/**
 * The unit, offered rather than typed.
 *
 * It was a free-text box, and the first person to use it typed "5555" into it —
 * which is exactly what an empty box labelled "Unit" invites when the thing you
 * are counting is just pieces. Most products have no unit worth naming, so the
 * honest default is named too: "Vipande", meaning leave it alone.
 */
const UNIT_OPTIONS = [
  { value: '', label: ui.unitPieces },
  { value: 'kilo', label: 'kilo' },
  { value: 'gramu', label: 'gramu' },
  { value: 'lita', label: 'lita' },
  { value: 'mita', label: 'mita' },
  { value: 'futi', label: 'futi' },
  { value: 'gunia', label: 'gunia' },
  { value: 'debe', label: 'debe' },
  { value: 'ndoo', label: 'ndoo' },
  { value: 'pakiti', label: 'pakiti' },
  { value: 'boksi', label: 'boksi' },
  { value: 'rimu', label: 'rimu' },
  { value: 'dazeni', label: 'dazeni' },
];

type Tab = 'count' | 'price';

export default function ProductEditDialog({ product, level, initialTab = 'count', onClose, onSaved }: {
  product: CatalogProduct;
  level: StockLevel | null;
  initialTab?: Tab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState(false);

  // Count
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(
    UNIT_OPTIONS.some((option) => option.value === (product.unit ?? '')) ? (product.unit ?? '') : '',
  );
  const [note, setNote] = useState('');
  const parsedQuantity = Number(quantity.replace(/,/g, ''));
  const countValid = quantity.trim() !== '' && Number.isFinite(parsedQuantity) && parsedQuantity >= 0;

  // Price
  const [cost, setCost] = useState(product.unitCost === null ? '' : String(product.unitCost));
  const parsedCost = Number(cost.replace(/,/g, ''));
  const priceValid = Number.isFinite(parsedCost) && parsedCost > 0;
  const margin = priceValid && product.avgUnitPrice !== null ? product.avgUnitPrice - parsedCost : null;
  const aboveSelling = margin !== null && margin < 0;

  async function saveCount() {
    if (!countValid) { toast.error(ui.countInvalid); return; }
    setBusy(true);
    try {
      await recordStockCount(product.productName, parsedQuantity, unit || null, note.trim() || null);
      toast.success(ui.countSaved);
      onSaved();
    } catch (error) { toast.error(friendlyError(error)); } finally { setBusy(false); }
  }

  async function savePrice() {
    if (!priceValid) { toast.error(ui.priceInvalid); return; }
    setBusy(true);
    try {
      await setProductCost(product.productName, parsedCost, unit || null, null);
      toast.success(ui.priceSaved);
      onSaved();
    } catch (error) { toast.error(friendlyError(error)); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-lg">
        <h2 className="text-base font-semibold text-ink">{ui.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{product.productName}</p>

        {/* The unit belongs to the PRODUCT, not to the count or the price, so
            it sits above the tabs where it governs both. It was one box per tab,
            which let somebody count Unga in kilo and price it per gunia — the
            products page then said gunia, the stock page said kilo, and the
            margin multiplied a sack price by a kilo quantity. The server
            refuses a mismatch now; this is the half that stops it being asked. */}
        <div className="mt-3">
          <span className="text-sm text-ink">{ui.unit}</span>
          <Select value={unit} onChange={setUnit} options={UNIT_OPTIONS} className="mt-1" />
          <span className="mt-1 block text-[11px] leading-snug text-ink-muted">
            {ui.unitHint} {unit ? ui.unitGoverns : ''}
          </span>
        </div>

        <UnderlineTabs
          className="mt-4"
          label={ui.tabs}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'count', label: ui.countTab },
            { value: 'price', label: ui.priceTab },
          ]}
        />

        {tab === 'count' ? (
          <>
            <p className="mt-3 text-xs text-ink-muted">{ui.countIntro}</p>
            <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
              {level?.hasCount
                ? <>{ui.believed}: <span className="font-medium tabular-nums text-ink">{level.onHand}</span></>
                : ui.neverCounted}
            </div>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-sm text-ink">{ui.quantity}{unit ? ` (${unit})` : ``}</span>
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
                <span className="text-sm text-ink">{ui.note}</span>
                <Input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1" />
                <span className="mt-1 block text-[11px] text-ink-muted">{ui.noteHint}</span>
              </label>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-ink-muted">{ui.supersedes}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>{ui.close}</Button>
              <Button onClick={() => void saveCount()} disabled={busy || !countValid}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{ui.saving}</> : ui.saveCount}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-xs text-ink-muted">{ui.priceIntro}</p>
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
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-sm text-ink">{ui.cost}{unit ? ui.perUnit(unit) : ``}</span>
                <Input
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  inputMode="decimal"
                  autoFocus
                  className="mt-1"
                />
              </label>
            </div>
            {margin !== null ? (
              <p className={`mt-3 text-sm ${aboveSelling ? 'text-red-600' : 'text-emerald-600'}`}>
                {aboveSelling ? ui.aboveSelling : `${ui.margin} ${formatMoney(margin)}.`}
              </p>
            ) : null}
            <p className="mt-3 text-[11px] leading-snug text-ink-muted">{ui.history}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>{ui.close}</Button>
              <Button onClick={() => void savePrice()} disabled={busy || !priceValid}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{ui.saving}</> : ui.savePrice}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
