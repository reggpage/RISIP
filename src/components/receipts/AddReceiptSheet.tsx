import { useRef, useState } from 'react';
import { Camera, Loader2, PencilLine, Upload, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import Select from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { createManualReceipt } from '@/features/receipts/manualEntry';
import { uploadReceipt } from '@/features/receipts/uploadReceipt';
import { useMyPettyCashAccount } from '@/features/pettyCash/pettyCash';
import { formatMoney } from '@/lib/format';
import { sw } from '@/i18n/sw';
import type { PaymentMethod } from '@/types/db';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash_personal', label: 'Cash / Personal' },
  { value: 'petty_cash', label: 'Petty cash' },
];

// Categories mirror the enum baked into the extract-receipt edge function so manual
// entries land in the same buckets AI-extracted ones do (dashboard rollups stay clean).
const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent',
  'Communication', 'Consulting', 'Other',
] as const;

type Mode = 'choose' | 'manual';

// Floating add-receipt modal with three routes:
//   1. Take a photo (mobile camera or webcam) → AI extraction
//   2. Upload an image → AI extraction
//   3. Enter manually → straight to `confirmed` with no AI
export default function AddReceiptSheet({
  projectId,
  userId,
  onClose,
}: {
  projectId: string;
  userId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState(false);
  // Payment method is chosen ONCE at the top of the sheet — carries through to
  // whichever path (photo / upload / manual) the user picks.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_personal');

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      await uploadReceipt(file, {
        project_id: projectId,
        user_id: userId,
        payment_method: paymentMethod,
      });
      toast.success('Receipt uploaded — extracting…');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <h2 className="text-base font-semibold text-ink">
            {mode === 'manual' ? 'Enter receipt details' : 'Add a receipt'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'choose' ? (
          <div className="flex flex-col gap-3 p-5">
            <Select
              label="Payment method"
              value={paymentMethod}
              onChange={(v) => setPaymentMethod(v as PaymentMethod)}
              options={PAYMENT_OPTIONS}
            />
            <OptionRow
              icon={<Camera className="h-5 w-5" />}
              title="Take a photo"
              hint="Snap a receipt with your camera. AI extracts the details."
              disabled={busy}
              onClick={() => cameraInput.current?.click()}
            />
            <OptionRow
              icon={<Upload className="h-5 w-5" />}
              title="Upload image"
              hint="Pick an existing photo from your device."
              disabled={busy}
              onClick={() => galleryInput.current?.click()}
            />
            <OptionRow
              icon={<PencilLine className="h-5 w-5" />}
              title="Enter manually"
              hint="No image needed — type the amount and vendor yourself."
              disabled={busy}
              onClick={() => setMode('manual')}
            />

            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
            <input
              ref={galleryInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
            {busy && (
              <div className="mt-2 flex items-center justify-center gap-2 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading…
              </div>
            )}
          </div>
        ) : (
          <ManualForm
            projectId={projectId}
            userId={userId}
            paymentMethod={paymentMethod}
            onDone={onClose}
            onBack={() => setMode('choose')}
          />
        )}
      </div>
    </div>
  );
}

function OptionRow({
  icon,
  title,
  hint,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-surface-border p-3 text-left transition hover:border-role-admin/40 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-role-admin/10 text-role-admin">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>
      </div>
    </button>
  );
}

function ManualForm({
  projectId,
  userId,
  paymentMethod,
  onDone,
  onBack,
}: {
  projectId: string;
  userId: string;
  paymentMethod: PaymentMethod;
  onDone: () => void;
  onBack: () => void;
}) {
  const toast = useToast();
  const account = useMyPettyCashAccount();
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [total, setTotal] = useState('');
  const [tax, setTax] = useState('');
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('Other');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const totalNum = Number(total);
    const taxNum = tax.trim() ? Number(tax) : 0;
    if (!vendor.trim() || !date || Number.isNaN(totalNum) || totalNum <= 0) {
      toast.error('Vendor, date and a positive total are required.');
      return;
    }
    // VAT can never exceed the receipt total — that's a data-entry error that would
    // cause problems during a TRA audit. Message follows the active language.
    if (taxNum > totalNum) {
      toast.error(sw.receipts.vatExceedsTotal);
      return;
    }
    // Client-side petty-cash guard so we can show a friendly toast instead of
    // waiting for the DB trigger to throw. The DB check is still authoritative.
    if (paymentMethod === 'petty_cash') {
      const balance = account?.current_balance ?? 0;
      if (totalNum > balance) {
        toast.error(
          `That exceeds your petty cash balance (${formatMoney(balance)}). Ask your admin for a top-up.`,
        );
        return;
      }
    }
    setSaving(true);
    try {
      await createManualReceipt(
        {
          project_id: projectId,
          vendor_name: vendor,
          receipt_date: date,
          total_amount: totalNum,
          tax_amount: tax.trim() ? Number(tax) : undefined,
          category,
          receipt_number: receiptNumber.trim() || undefined,
          payment_method: paymentMethod,
        },
        { user_id: userId },
      );
      toast.success('Receipt added.');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-5">
      <Input label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <Input type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as typeof CATEGORIES[number])}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Total (TSh)" value={total} onChange={setTotal} placeholder="0" />
        <NumberInput label="Tax / VAT (TSh)" value={tax} onChange={setTax} placeholder="Optional" />
      </div>
      <Input
        label="Receipt number"
        value={receiptNumber}
        onChange={(e) => setReceiptNumber(e.target.value)}
        placeholder="Optional"
      />
      <div className="mt-2 flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button type="submit" tint="admin" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Saving…' : 'Add receipt'}
        </Button>
      </div>
    </form>
  );
}
