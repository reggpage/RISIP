import { useMemo, useState } from 'react';
import { Droplets, Loader2, Package, Scale } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import { configureProductUnits, setProductCost } from '@/features/products/products';

type ProductMode = 'standard' | 'weight' | 'liquid';
type PortionState = { enabled: boolean; price: string };

const PORTIONS = {
  weight: [
    { key: 'robo', sw: 'Robo kilo', en: 'Quarter kilo', size: 0.25 },
    { key: 'nusu', sw: 'Nusu kilo', en: 'Half kilo', size: 0.5 },
    { key: 'kilo', sw: 'Kilo moja', en: 'One kilo', size: 1 },
  ],
  liquid: [
    { key: 'robo', sw: 'Robo lita', en: 'Quarter litre', size: 0.25 },
    { key: 'nusu', sw: 'Nusu lita', en: 'Half litre', size: 0.5 },
    { key: 'lita', sw: 'Lita moja', en: 'One litre', size: 1 },
  ],
} as const;

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
  kind: 'Bidhaa hii inauzwaje?', standard: 'Kwa kipande', weight: 'Kwa uzito', liquid: 'Kimiminika',
  standardHint: 'Mfano daftari, kalamu au boksi.',
  weightHint: 'Mfano unga, sukari au mchele.', liquidHint: 'Mfano mafuta, maziwa au sabuni ya maji.',
  purchaseUnit: 'Unanunua kwa kipimo gani?', purchaseUnitHint: 'Mfano kilo, gunia, lita au ndoo.',
  purchaseSize: (unit: string) => `${unit || 'Kipimo hiki'} kina kiasi gani cha unit ya msingi?`,
  purchaseSizeHint: (base: string) => `Mfano: ndoo ya lita 20 = 20 ${base}. Usikisie; weka ukubwa halisi.`,
  portions: 'Chagua vipimo unavyouzia', portionsHint: 'Weka tiki kwa kila kipimo unachotumia, kisha bei yake.',
  salePrice: 'Bei ya kuuza', needPortion: 'Chagua angalau kipimo kimoja cha kuuza.',
  needPurchaseSize: 'Andika ukubwa halisi wa kipimo cha kununua.',
  needPortionPrices: 'Kila kipimo kilichochaguliwa lazima kiwe na bei kubwa kuliko sifuri.',
  measuredNote: 'Risip itahifadhi stock kwa unit ya msingi na itapunguza kiasi sahihi kila unapouza robo, nusu au unit nzima.',
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
  kind: 'How is this product sold?', standard: 'By piece', weight: 'By weight', liquid: 'Liquid',
  standardHint: 'For example a notebook, pen, or box.',
  weightHint: 'For example flour, sugar, or rice.', liquidHint: 'For example oil, milk, or liquid soap.',
  purchaseUnit: 'What unit do you buy it in?', purchaseUnitHint: 'For example kilo, sack, litre, or bucket.',
  purchaseSize: (unit: string) => `How many base units are in one ${unit || 'purchase unit'}?`,
  purchaseSizeHint: (base: string) => `Example: a 20-litre bucket = 20 ${base}. Enter the real size; do not guess.`,
  portions: 'Choose the portions you sell', portionsHint: 'Check every portion you use, then enter its selling price.',
  salePrice: 'Selling price', needPortion: 'Choose at least one selling portion.',
  needPurchaseSize: 'Enter the real size of the purchase unit.',
  needPortionPrices: 'Every selected portion needs a price greater than zero.',
  measuredNote: 'Risip keeps stock in the base unit and subtracts the correct amount whenever you sell a quarter, half, or whole unit.',
  note: 'A product is known by its name. Sell it later under the same name and the sales join it with nothing to do.',
};

const modeCards: { value: ProductMode; icon: typeof Package }[] = [
  { value: 'standard', icon: Package },
  { value: 'weight', icon: Scale },
  { value: 'liquid', icon: Droplets },
];

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
  const [mode, setMode] = useState<ProductMode>('standard');
  const [purchaseUnit, setPurchaseUnit] = useState('');
  const [purchaseSize, setPurchaseSize] = useState('');
  const [portionState, setPortionState] = useState<Record<string, PortionState>>({
    robo: { enabled: false, price: '' },
    nusu: { enabled: false, price: '' },
    kilo: { enabled: true, price: '' },
    lita: { enabled: true, price: '' },
  });
  const [busy, setBusy] = useState(false);

  const parsed = Number(cost.replace(/,/g, ''));
  const measured = mode !== 'standard';
  const baseUnit = mode === 'liquid' ? 'lita' : 'kilo';
  const portions = measured ? PORTIONS[mode] : [];
  const selected = useMemo(() => portions.filter((portion) => portionState[portion.key]?.enabled), [portions, portionState]);
  const parsedPurchaseSize = purchaseUnit.trim().toLowerCase() === baseUnit
    ? 1
    : Number(purchaseSize.replace(/,/g, ''));
  const portionsValid = selected.length > 0 && selected.every((portion) => {
    const price = Number(portionState[portion.key]?.price.replace(/,/g, ''));
    return Number.isFinite(price) && price > 0;
  });
  const valid = name.trim().length >= 2 && Number.isFinite(parsed) && parsed > 0
    && (!measured || (purchaseUnit.trim().length > 0 && Number.isFinite(parsedPurchaseSize)
      && parsedPurchaseSize > 0 && portionsValid));

  function changeMode(next: ProductMode) {
    setMode(next);
    if (next === 'standard') return;
    const nextBase = next === 'liquid' ? 'lita' : 'kilo';
    setPurchaseUnit(nextBase);
    setPurchaseSize('1');
    setPortionState((current) => ({
      ...current,
      robo: { ...current.robo, enabled: false },
      nusu: { ...current.nusu, enabled: false },
      kilo: { ...current.kilo, enabled: next === 'weight' },
      lita: { ...current.lita, enabled: next === 'liquid' },
    }));
  }

  async function add() {
    if (name.trim().length < 2) { toast.error(ui.needName); return; }
    if (!Number.isFinite(parsed) || parsed <= 0) { toast.error(ui.needCost); return; }
    setBusy(true);
    try {
      if (measured) {
        if (!purchaseUnit.trim() || !Number.isFinite(parsedPurchaseSize) || parsedPurchaseSize <= 0) {
          toast.error(ui.needPurchaseSize); return;
        }
        if (selected.length === 0) { toast.error(ui.needPortion); return; }
        if (!portionsValid) { toast.error(ui.needPortionPrices); return; }
        await configureProductUnits({
          name: name.trim(),
          baseUnit,
          purchaseUnit: purchaseUnit.trim(),
          purchaseSize: parsedPurchaseSize,
          purchaseCost: parsed,
          saleUnits: selected.map((portion) => ({
            unit: portion.key,
            baseQuantity: portion.size,
            retail: Number(portionState[portion.key].price.replace(/,/g, '')),
          })),
        });
      } else {
        await setProductCost(name.trim(), parsed, unit.trim() || null, null);
      }
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
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-surface p-5 shadow-lg">
        <h2 className="text-base font-semibold text-ink">{ui.title}</h2>
        <p className="mt-1 text-xs text-ink-muted">{ui.intro}</p>

        <div className="mt-4 space-y-4">
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

          <fieldset>
            <legend className="text-sm font-medium text-ink">{ui.kind}</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {modeCards.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => changeMode(value)}
                  className={`rounded-lg border p-3 text-left transition ${mode === value
                    ? 'border-role-admin bg-role-admin/5 text-role-admin ring-1 ring-role-admin/20'
                    : 'border-surface-border text-ink hover:border-role-admin/40'}`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="mt-1 block text-sm font-medium">{ui[value]}</span>
                  <span className="mt-0.5 hidden text-[10px] leading-snug text-ink-muted sm:block">{ui[`${value}Hint` as 'standardHint']}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm text-ink">{ui.cost}</span>
            <NumberInput value={cost} onChange={setCost} className="mt-1" />
          </label>

          {measured ? (
            <>
              <label className="block">
                <span className="text-sm text-ink">{ui.purchaseUnit}</span>
                <Input value={purchaseUnit} onChange={(event) => {
                  setPurchaseUnit(event.target.value);
                  if (event.target.value.trim().toLowerCase() === baseUnit) setPurchaseSize('1');
                }} className="mt-1" placeholder={mode === 'liquid' ? 'ndoo' : 'gunia'} />
                <span className="mt-1 block text-[11px] text-ink-muted">{ui.purchaseUnitHint}</span>
              </label>
              {purchaseUnit.trim().toLowerCase() !== baseUnit ? (
                <NumberInput
                  label={ui.purchaseSize(purchaseUnit.trim())}
                  value={purchaseSize}
                  onChange={setPurchaseSize}
                  hint={ui.purchaseSizeHint(baseUnit)}
                />
              ) : null}

              <fieldset>
                <legend className="text-sm font-medium text-ink">{ui.portions}</legend>
                <p className="mt-0.5 text-[11px] text-ink-muted">{ui.portionsHint}</p>
                <div className="mt-2 space-y-2">
                  {portions.map((portion) => {
                    const state = portionState[portion.key];
                    return (
                      <div key={portion.key} className="rounded-lg border border-surface-border p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-ink">
                          <input
                            type="checkbox"
                            checked={state.enabled}
                            onChange={(event) => setPortionState((current) => ({
                              ...current,
                              [portion.key]: { ...current[portion.key], enabled: event.target.checked },
                            }))}
                            className="h-4 w-4 accent-role-admin"
                          />
                          {lang === 'sw' ? portion.sw : portion.en}
                          <span className="font-normal text-ink-muted">({portion.size} {baseUnit})</span>
                        </label>
                        {state.enabled ? (
                          <NumberInput
                            aria-label={`${ui.salePrice}: ${lang === 'sw' ? portion.sw : portion.en}`}
                            value={state.price}
                            onChange={(price) => setPortionState((current) => ({
                              ...current,
                              [portion.key]: { ...current[portion.key], price },
                            }))}
                            placeholder={ui.salePrice}
                            className="mt-2"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            </>
          ) : (
            <label className="block">
              <span className="text-sm text-ink">{ui.unit}</span>
              <Input value={unit} onChange={(event) => setUnit(event.target.value)} className="mt-1" />
              <span className="mt-1 block text-[11px] text-ink-muted">{ui.unitHint}</span>
            </label>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-snug text-ink-muted">{measured ? ui.measuredNote : ui.note}</p>

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
