import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { createManualReceipt, type ManualReceiptInput } from '@/features/receipts/manualEntry';
import { useProjects } from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { sw } from '@/i18n/sw';

const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent',
  'Communication', 'Consulting', 'Other',
] as const;

type FormFields = {
  project_id: string;
  vendor_name: string;
  receipt_date: string;
  total_amount: string;   // form values are strings; parsed below
  tax_amount: string;
  category: string;
  receipt_number?: string;
  verification_code?: string;
};

export default function ManualReceipt() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { state: projectsState } = useProjects();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormFields>({
    defaultValues: {
      receipt_date: new Date().toISOString().slice(0, 10),
      category: 'Other',
    },
  });

  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const activeProjects =
    projectsState.status === 'ready'
      ? projectsState.projects.filter((p) => p.status === 'active')
      : [];

  async function onSubmit(values: FormFields) {
    if (!profile) return;
    setSubmitError(null);
    const total = Number(values.total_amount);
    const tax = values.tax_amount ? Number(values.tax_amount) : undefined;
    if (!Number.isFinite(total) || total <= 0) {
      setSubmitError('Total amount must be a positive number.');
      return;
    }
    if (tax !== undefined && (!Number.isFinite(tax) || tax < 0)) {
      setSubmitError('Tax amount must be zero or positive.');
      return;
    }
    try {
      const input: ManualReceiptInput = {
        project_id: values.project_id,
        vendor_name: values.vendor_name,
        receipt_date: values.receipt_date,
        total_amount: total,
        tax_amount: tax,
        category: values.category,
        receipt_number: values.receipt_number,
        verification_code: values.verification_code,
      };
      await createManualReceipt(input, { user_id: profile.id });
      navigate('/receipts', { replace: true });
    } catch (err) {
      // 23505 = unique_violation on verification_code
      const msg = err instanceof Error ? err.message : sw.common.error;
      if (/duplicate|23505/i.test(msg)) {
        setSubmitError(sw.receipts.duplicate);
      } else {
        setSubmitError(msg);
      }
    }
  }

  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <Link to="/receipts" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <Card>
        <h1 className="mb-1 text-xl font-semibold text-ink">{sw.receipts.manualTitle}</h1>
        <p className="mb-5 text-sm text-ink-muted">{sw.receipts.manualHint}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink">{sw.receipts.fields.project}</label>
            <select
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
              {...register('project_id', { required: true })}
            >
              <option value="">—</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.project_id && <span className="text-xs text-red-600">{sw.common.error}</span>}
          </div>

          <Input
            label={sw.receipts.fields.vendor}
            {...register('vendor_name', { required: true })}
            error={errors.vendor_name && sw.common.error}
          />
          <Input
            type="date"
            label={sw.receipts.fields.date}
            {...register('receipt_date', { required: true })}
            error={errors.receipt_date && sw.common.error}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              label={sw.receipts.fields.total}
              {...register('total_amount', { required: true })}
              error={errors.total_amount && sw.common.error}
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              label={sw.receipts.fields.tax}
              {...register('tax_amount')}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink">{sw.receipts.fields.category}</label>
            <select
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
              {...register('category', { required: true })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={sw.receipts.fields.receiptNumber} {...register('receipt_number')} />
            <Input label={sw.receipts.fields.verification} {...register('verification_code')} />
          </div>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <div className="mt-2 flex gap-2">
            <Button type="submit" tint="admin" disabled={isSubmitting || activeProjects.length === 0}>
              {isSubmitting ? sw.common.loading : sw.receipts.manualSubmit}
            </Button>
            <Link to="/receipts">
              <Button type="button" variant="ghost">{sw.common.cancel}</Button>
            </Link>
          </div>

          {activeProjects.length === 0 && (
            <p className="text-xs text-ink-muted">{sw.receipts.noProjectsAssigned}</p>
          )}
        </form>
      </Card>
    </div>
  );
}
