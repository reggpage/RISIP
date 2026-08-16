import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import NumberInput from '@/components/ui/NumberInput';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { getLang } from '@/lib/lang';
import {
  fetchCurrentProductCost,
  fetchCurrentSellingPrices,
  fetchProductUnits,
  previewProductRename,
  recordStockCount,
  renameProduct,
  setProductCost,
  setSellingPrice,
  type CatalogProduct,
  type ProductUnitRow,
  type ProductCostSnapshot,
  type SellingPriceRow,
  type ProductRenamePreview,
  type StockLevel,
} from '@/features/products/products';

const lang = getLang();
const ui = lang === 'sw' ? {
  title: 'Hariri bidhaa',
  tabs: 'Chagua unachotaka kubadilisha',
  countTab: 'Hesabu stock', priceTab: 'Bei ya kununua', sellTab: 'Bei ya kuuza',
  renameTab: 'Badilisha jina', newName: 'Jina jipya', renameReason: 'Sababu (si lazima)',
  previewRename: 'Kagua mabadiliko', confirmRename: 'Thibitisha jina jipya',
  renameWarning: 'Hii haitabadilisha pesa, idadi au historia. Itaweka jina jipya kwenye rekodi zilizoonyeshwa na kuacha audit.',
  renameSaved: 'Jina la bidhaa limebadilishwa.', recordsMove: 'Rekodi zitakazopewa jina jipya',
  // Count
  countIntro: 'Hesabu zilizopo dukani sasa hivi, kisha andika idadi hapa chini. Baada ya hapo Risip itapunguza kila unapouza na kuongeza kila unaponunua.',
  quantity: 'Zilizopo sasa', zeroOk: 'Ukiandika 0 inamaanisha zimeisha.',
  believed: 'Hesabu ya sasa', countedOn: 'Ilihesabiwa',
  neverCounted: 'Bidhaa hii haijawahi kuhesabiwa. Hesabu ya kwanza ndiyo itakayoanzisha ufuatiliaji.',
  unit: 'Kipimo',
  unitPieces: 'Vipande (kawaida)',
  unitHint: 'Kama unauza kwa idadi, acha "Vipande". Badilisha tu kama unauza kwa uzito au ujazo.',
  unitGoverns: 'Hesabu na bei zote zitakuwa kwa kipimo hiki.',
  saveCount: 'Hifadhi hesabu',
  countSaved: 'Hesabu imehifadhiwa.',
  countInvalid: 'Andika idadi — 0 au zaidi.',
  supersedes: 'Hesabu mpya inachukua nafasi ya ya zamani. Hesabu za zamani hazifutwi, wala rekodi za mauzo hazibadiliki.',
  // Price
  priceIntro: 'Kiasi unacholipa wewe kununua kimoja. Ndicho kinachotumika kupima faida.',
  cost: 'Ninanunua kwa', current: 'Bei ya sasa', since: 'Tangu',
  selling: 'Umekuwa ukiuza kwa wastani wa', margin: 'Faida kwa kimoja itakuwa',
  aboveSelling: 'Bei hii ya kununua ni kubwa kuliko unavyouza — kila mauzo yatakuwa hasara. Hakiki tena.',
  savePrice: 'Hifadhi bei',
  priceSaved: 'Bei ya kununua imehifadhiwa.',
  priceInvalid: 'Andika bei zaidi ya 0.',
  history: 'Bei ya zamani haifutwi. Rekodi za siku zilizopita zinabaki na bei iliyokuwa ikitumika siku hiyo.',
  // Selling
  sellIntro: 'Kiasi unachomuuzia mteja. Ukituma mauzo WhatsApp bila kutaja bei, Risip itatumia hizi.',
  retail: 'Bei ya rejareja', retailHint: 'Bei ya mteja wa kawaida.',
  wholesale: 'Bei ya jumla', wholesaleHint: 'Si lazima. Bei ya mteja wa mara kwa mara au anayenunua nyingi.',
  minQty: 'Bei ya jumla ianze idadi gani', minQtyHint: 'Acha wazi kama bei ya jumla ni ya mteja maalum, si ya idadi.',
  saveSelling: 'Hifadhi bei ya kuuza',
  sellingSaved: 'Bei ya kuuza imehifadhiwa.',
  sellingUnit: 'Kipimo cha kuuza', conversion: 'Sawa na', portionPrices: 'Bei kwa kila kipimo',
  retailInvalid: 'Andika bei ya rejareja zaidi ya 0.',
  wholesaleTooHigh: 'Bei ya jumla haiwezi kuwa kubwa kuliko ya rejareja.',
  minQtyNeedsWholesale: 'Ili kuweka idadi ya kuanzia, lazima uweke bei ya jumla.',
  noSelling: 'Bidhaa hii bado haina bei ya kuuza.',
  marginAtRetail: 'Ukiuza kwa rejareja, faida kwa kimoja',
  saving: 'Inahifadhi…', close: 'Funga', perUnit: (u: string) => ` — kwa ${u} moja`,
} : {
  title: 'Edit product',
  tabs: 'Choose what to change',
  countTab: 'Count stock', priceTab: 'Buying price', sellTab: 'Selling price',
  renameTab: 'Rename', newName: 'New name', renameReason: 'Reason (optional)',
  previewRename: 'Review change', confirmRename: 'Confirm new name',
  renameWarning: 'This does not change money, quantities or history. It relabels the shown records and leaves an audit event.',
  renameSaved: 'Product renamed.', recordsMove: 'Records that will receive the new name',
  countIntro: 'Enter what is on the shelf right now. Risip keeps count from there.',
  quantity: 'On the shelf now', zeroOk: 'Entering 0 means they have run out.',
  believed: 'Current count', countedOn: 'Counted',
  neverCounted: 'This product has never been counted. The first count is what starts the tracking.',
  unit: 'Unit',
  unitPieces: 'Pieces (default)',
  unitHint: 'For things you count, leave it on "Pieces". Choose another only if you sell by weight or volume.',
  unitGoverns: 'The count and the buying price will both be in this unit.',
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
  sellIntro: 'What you charge. When a WhatsApp sale names no price, I use these.',
  retail: 'Retail', retailHint: 'The ordinary customer price.',
  wholesale: 'Wholesale', wholesaleHint: 'Optional. For a regular customer, or a bulk buyer.',
  minQty: 'From quantity', minQtyHint: 'Leave empty if the trade price is by customer, not by quantity.',
  saveSelling: 'Save selling price',
  sellingSaved: 'Selling price saved.',
  sellingUnit: 'Selling unit', conversion: 'Equals', portionPrices: 'Prices by selling unit',
  retailInvalid: 'Enter a retail price greater than zero.',
  wholesaleTooHigh: 'The wholesale price cannot be above the retail one.',
  minQtyNeedsWholesale: 'A starting quantity needs a wholesale price.',
  noSelling: 'You have not set a selling price for this product yet.',
  marginAtRetail: 'Margin per item (retail)',
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

type Tab = 'count' | 'price' | 'selling' | 'rename';

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

  // Count. Pre-filled with the figure Risip currently holds: the common edit is
  // a correction of one or two, and starting from an empty box makes somebody
  // re-derive a number the screen already knows.
  const [quantity, setQuantity] = useState(level?.hasCount ? String(level.onHand) : '');
  const [countUnit, setCountUnit] = useState(
    UNIT_OPTIONS.some((option) => option.value === (product.unit ?? '')) ? (product.unit ?? '') : '',
  );
  const [costUnit, setCostUnit] = useState(
    UNIT_OPTIONS.some((option) => option.value === (product.unit ?? '')) ? (product.unit ?? '') : '',
  );
  const [declaredUnits, setDeclaredUnits] = useState<ProductUnitRow[]>([]);
  const [costSnapshot, setCostSnapshot] = useState<ProductCostSnapshot | null>(null);
  const parsedQuantity = Number(quantity.replace(/,/g, ''));
  const countValid = quantity.trim() !== '' && Number.isFinite(parsedQuantity) && parsedQuantity >= 0;

  // Price
  const [cost, setCost] = useState(product.unitCost === null ? '' : String(product.unitCost));
  const parsedCost = Number(cost.replace(/,/g, ''));
  const priceValid = Number.isFinite(parsedCost) && parsedCost > 0;
  const margin = declaredUnits.length === 0 && priceValid && product.avgUnitPrice !== null
    ? product.avgUnitPrice - parsedCost
    : null;
  const aboveSelling = margin !== null && margin < 0;

  // Selling price. Loaded on open rather than carried on the catalogue row: the
  // row is built from what happened, and this is a decision that lives apart
  // from it.
  const [retail, setRetail] = useState('');
  const [wholesale, setWholesale] = useState('');
  const [minQty, setMinQty] = useState('');
  const [sellingLoaded, setSellingLoaded] = useState(false);
  const [hasSelling, setHasSelling] = useState(false);
  const [sellingRows, setSellingRows] = useState<SellingPriceRow[]>([]);
  const [selectedSaleUnit, setSelectedSaleUnit] = useState('');
  const [newName, setNewName] = useState('');
  const [renameReason, setRenameReason] = useState('');
  const [renamePreview, setRenamePreview] = useState<ProductRenamePreview | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchCurrentSellingPrices(product.productKey),
      fetchProductUnits(product.productKey),
      fetchCurrentProductCost(product.productKey),
    ]).then(([rows, units, costSnapshot]) => {
        if (!alive) return;
        setDeclaredUnits(units);
        setSellingRows(rows);
        const countDefault = units.find((item) => item.isBase && item.canCount)
          ?? units.find((item) => item.canCount);
        const purchaseDefault = units.find((item) => item.canPurchase);
        if (countDefault) setCountUnit(countDefault.unitName);
        if (purchaseDefault) setCostUnit(purchaseDefault.unitName);
        if (costSnapshot) {
          setCostSnapshot(costSnapshot);
          setCost(String(costSnapshot.unitCost));
          if (costSnapshot.unit) setCostUnit(costSnapshot.unit);
        }
        const saleDefault = rows[0] ?? null;
        if (saleDefault) {
          setSelectedSaleUnit(saleDefault.saleUnitKey ?? '');
          setRetail(String(saleDefault.retailPrice));
          setWholesale(saleDefault.wholesalePrice === null ? '' : String(saleDefault.wholesalePrice));
          setMinQty(saleDefault.wholesaleMinQty === null ? '' : String(saleDefault.wholesaleMinQty));
          setHasSelling(true);
        }
        setSellingLoaded(true);
      })
      .catch(() => { if (alive) setSellingLoaded(true); });
    return () => { alive = false; };
  }, [product.productKey]);

  useEffect(() => {
    if (!sellingLoaded) return;
    const row = sellingRows.find((item) => (item.saleUnitKey ?? '') === selectedSaleUnit);
    if (!row) return;
    setRetail(String(row.retailPrice));
    setWholesale(row.wholesalePrice === null ? '' : String(row.wholesalePrice));
    setMinQty(row.wholesaleMinQty === null ? '' : String(row.wholesaleMinQty));
  }, [selectedSaleUnit, sellingLoaded, sellingRows]);

  const parsedRetail = Number(retail.replace(/,/g, ''));
  const parsedWholesale = wholesale.trim() === '' ? null : Number(wholesale.replace(/,/g, ''));
  const parsedMinQty = minQty.trim() === '' ? null : Number(minQty.replace(/,/g, ''));
  const retailValid = Number.isFinite(parsedRetail) && parsedRetail > 0;
  const selectedSellingRow = sellingRows.find((item) => (item.saleUnitKey ?? '') === selectedSaleUnit) ?? null;
  const retailMargin = retailValid && product.unitCost !== null
    ? parsedRetail - product.unitCost * (selectedSellingRow?.unitBaseQuantity ?? 1)
    : null;
  const countOptions = declaredUnits.length > 0
    ? declaredUnits.filter((item) => item.canCount).map((item) => ({ value: item.unitName, label: item.unitName }))
    : UNIT_OPTIONS;
  const costOptions = declaredUnits.length > 0
    ? declaredUnits.filter((item) => item.canPurchase).map((item) => ({ value: item.unitName, label: item.unitName }))
    : UNIT_OPTIONS;
  const sellingOptions = sellingRows.map((item) => ({
    value: item.saleUnitKey ?? '',
    label: item.saleUnit ?? (product.unit || ui.unitPieces),
  }));

  async function saveSelling() {
    if (!retailValid) { toast.error(ui.retailInvalid); return; }
    if (parsedWholesale !== null && (!Number.isFinite(parsedWholesale) || parsedWholesale > parsedRetail)) {
      toast.error(ui.wholesaleTooHigh); return;
    }
    if (parsedMinQty !== null && parsedWholesale === null) { toast.error(ui.minQtyNeedsWholesale); return; }
    setBusy(true);
    try {
      const selected = sellingRows.find((item) => (item.saleUnitKey ?? '') === selectedSaleUnit);
      const name = selected?.saleUnit ? `${product.productName} ${selected.saleUnit}` : product.productName;
      await setSellingPrice(name, parsedRetail, parsedWholesale, parsedMinQty);
      toast.success(ui.sellingSaved);
      onSaved();
    } catch (error) { toast.error(friendlyError(error)); } finally { setBusy(false); }
  }

  async function saveCount() {
    if (!countValid) { toast.error(ui.countInvalid); return; }
    setBusy(true);
    try {
      await recordStockCount(product.productName, parsedQuantity, countUnit || null, null);
      toast.success(ui.countSaved);
      onSaved();
    } catch (error) { toast.error(friendlyError(error)); } finally { setBusy(false); }
  }

  async function savePrice() {
    if (!priceValid) { toast.error(ui.priceInvalid); return; }
    setBusy(true);
    try {
      await setProductCost(product.productName, parsedCost, costUnit || null, null);
      toast.success(ui.priceSaved);
      onSaved();
    } catch (error) { toast.error(friendlyError(error)); } finally { setBusy(false); }
  }

  async function reviewRename() {
    setBusy(true);
    try { setRenamePreview(await previewProductRename(product.productName, newName)); }
    catch (error) { setRenamePreview(null); toast.error(friendlyError(error)); }
    finally { setBusy(false); }
  }

  async function applyRename() {
    if (!renamePreview) return;
    setBusy(true);
    try {
      await renameProduct(product.productName, renamePreview.to_name, renameReason.trim() || null);
      toast.success(ui.renameSaved);
      onSaved();
      onClose();
    } catch (error) { toast.error(friendlyError(error)); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-surface p-5 shadow-lg">
        {/* The only way out. Saving used to close the dialog, which made filling
            in a count, a buying price and a selling price for one product three
            separate trips back to the row. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={ui.close}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <h2 className="pr-8 text-base font-semibold text-ink">{ui.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{product.productName}</p>

        <UnderlineTabs
          className="mt-4"
          label={ui.tabs}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'count', label: ui.countTab },
            { value: 'price', label: ui.priceTab },
            { value: 'selling', label: ui.sellTab },
            { value: 'rename', label: ui.renameTab },
          ]}
        />

        {tab === 'count' ? (
          <>
            <p className="mt-3 text-xs text-ink-muted">{ui.countIntro}</p>
            <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
              {level?.hasCount ? (
                <>
                  {ui.believed}: <span className="font-medium tabular-nums text-ink">
                    {level.onHand.toLocaleString('en-US', { maximumFractionDigits: level.measured ? 2 : 0 })}
                    {countUnit ? ` ${countUnit}` : ''}
                  </span>
                  {level.countedAt
                    ? ` · ${ui.countedOn} ${new Date(level.countedAt).toLocaleDateString('en-GB')}`
                    : ''}
                </>
              ) : ui.neverCounted}
            </div>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-sm text-ink">{ui.unit}</span>
                <Select value={countUnit} onChange={setCountUnit} options={countOptions} className="mt-1" />
                <span className="mt-1 block text-[11px] leading-snug text-ink-muted">{ui.unitHint}</span>
              </label>
              <label className="block">
                <span className="text-sm text-ink">{ui.quantity}{countUnit ? ` (${countUnit})` : ``}</span>
                <NumberInput value={quantity} onChange={setQuantity} autoFocus className="mt-1" />
                <span className="mt-1 block text-[11px] text-ink-muted">{ui.zeroOk}</span>
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
        ) : null}

        {tab === 'price' ? (
          <>
            <p className="mt-3 text-xs text-ink-muted">{ui.priceIntro}</p>
            {costSnapshot || product.unitCost !== null ? (
              <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                {ui.current}: <span className="font-medium text-ink">{formatMoney(costSnapshot?.unitCost ?? product.unitCost ?? 0)}</span>
                {costSnapshot?.unit ? ` ${ui.perUnit(costSnapshot.unit)}` : ''}
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
                <span className="text-sm text-ink">{ui.unit}</span>
                <Select value={costUnit} onChange={setCostUnit} options={costOptions} className="mt-1" />
                <span className="mt-1 block text-[11px] leading-snug text-ink-muted">{ui.unitGoverns}</span>
              </label>
              <label className="block">
                <span className="text-sm text-ink">{ui.cost}{costUnit ? ui.perUnit(costUnit) : ``}</span>
                <NumberInput value={cost} onChange={setCost} allowDecimal={false} autoFocus className="mt-1" />
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
        ) : null}

        {tab === 'selling' ? (
          <>
            <p className="mt-3 text-xs text-ink-muted">{ui.sellIntro}</p>
            {sellingLoaded && !hasSelling ? (
              <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">{ui.noSelling}</div>
            ) : null}
            <div className="mt-3 space-y-3">
              {sellingOptions.length > 1 ? (
                <label className="block">
                  <span className="text-sm text-ink">{ui.sellingUnit}</span>
                  <Select value={selectedSaleUnit} onChange={setSelectedSaleUnit} options={sellingOptions} className="mt-1" />
                </label>
              ) : null}
              {sellingRows.length > 1 ? (
                <div className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                  <div className="font-medium text-ink">{ui.portionPrices}</div>
                  {sellingRows.map((row) => (
                    <div key={row.saleUnitKey ?? 'base'} className="mt-1 flex justify-between gap-3">
                      <span>{row.saleUnit ?? product.unit ?? ui.unitPieces} · {ui.conversion} {row.unitBaseQuantity.toLocaleString('en-US', { maximumFractionDigits: 6 })} {product.unit ?? ''}</span>
                      <strong className="text-ink">{formatMoney(row.retailPrice)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              <label className="block">
                <span className="text-sm text-ink">{ui.retail}{selectedSellingRow?.saleUnit ? ui.perUnit(selectedSellingRow.saleUnit) : ``}</span>
                <NumberInput value={retail} onChange={setRetail} allowDecimal={false} className="mt-1" />
                <span className="mt-1 block text-[11px] text-ink-muted">{ui.retailHint}</span>
              </label>
              <label className="block">
                <span className="text-sm text-ink">{ui.wholesale}</span>
                <NumberInput value={wholesale} onChange={setWholesale} allowDecimal={false} className="mt-1" />
                <span className="mt-1 block text-[11px] text-ink-muted">{ui.wholesaleHint}</span>
              </label>
              <label className="block">
                <span className="text-sm text-ink">{ui.minQty}</span>
                <NumberInput value={minQty} onChange={setMinQty} className="mt-1" />
                <span className="mt-1 block text-[11px] text-ink-muted">{ui.minQtyHint}</span>
              </label>
            </div>
            {retailMargin !== null ? (
              <p className={`mt-3 text-sm ${retailMargin < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {ui.marginAtRetail} {formatMoney(retailMargin)}.
              </p>
            ) : null}
            <p className="mt-3 text-[11px] leading-snug text-ink-muted">{ui.history}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>{ui.close}</Button>
              <Button onClick={() => void saveSelling()} disabled={busy || !retailValid}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />{ui.saving}</> : ui.saveSelling}
              </Button>
            </div>
          </>
        ) : null}

        {tab === 'rename' ? (
          <>
            <p className="mt-3 text-xs text-ink-muted">{ui.renameWarning}</p>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-sm text-ink">{ui.newName}</span>
                <Input value={newName} onChange={(event) => { setNewName(event.target.value); setRenamePreview(null); }} className="mt-1" />
              </label>
              <label className="block">
                <span className="text-sm text-ink">{ui.renameReason}</span>
                <Input value={renameReason} onChange={(event) => setRenameReason(event.target.value)} className="mt-1" />
              </label>
            </div>
            {renamePreview ? (
              <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
                <div>{product.productName} → <strong>{renamePreview.to_name}</strong></div>
                <div className="mt-1 text-xs text-ink-muted">{ui.recordsMove}: {renamePreview.records.toLocaleString('en-US')}</div>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>{ui.close}</Button>
              {renamePreview ? (
                <Button onClick={() => void applyRename()} disabled={busy}>{ui.confirmRename}</Button>
              ) : (
                <Button onClick={() => void reviewRename()} disabled={busy || newName.trim().length < 2}>{ui.previewRename}</Button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
