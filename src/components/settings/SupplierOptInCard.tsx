import { useEffect, useState } from 'react';
import { Loader2, Store } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { getLang } from '@/lib/lang';
import { supabase } from '@/lib/supabase';
import { sw } from '@/i18n/sw';

// Owner-only card. The RPC set_company_supplier enforces the role underneath;
// this surface just renders the toggle for everyone signed in, and the server
// turns a non-owner away if they race it.
const ui = sw.shopOrders;

export default function SupplierOptInCard() {
  const lang = getLang();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSupplier, setIsSupplier] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (supabase as any).rpc('my_supplier_status').then(({ data, error }: { data: unknown; error: unknown }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast.error(friendlyError(error, lang === 'sw' ? ui.loadError : ui.loadError));
        return;
      }
      const value = (data ?? {}) as { is_supplier?: boolean };
      setIsSupplier(Boolean(value.is_supplier));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle() {
    if (saving) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc('set_company_supplier', {
      p_active: !isSupplier,
    });
    setSaving(false);
    if (error) {
      toast.error(friendlyError(error, ui.supplierToggleError));
      return;
    }
    setIsSupplier(!isSupplier);
    toast.success(isSupplier ? ui.supplierOff : ui.supplierOn);
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-ink-muted" />
            <h3 className="text-sm font-semibold text-ink">{ui.supplierOptIn}</h3>
          </div>
          <p className="mt-1 text-xs text-ink-muted">{ui.supplierOptInDesc}</p>
          <p className="mt-2 text-xs font-medium text-ink-muted">
            {loading ? ui.supplierToggleSaving : isSupplier ? ui.supplierOn : ui.supplierOff}
          </p>
        </div>
        <Button
          variant={isSupplier ? 'secondary' : 'primary'}
          tint="admin"
          disabled={loading || saving}
          onClick={() => void toggle()}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSupplier ? (lang === 'sw' ? 'Zima' : 'Turn off') : (lang === 'sw' ? 'Washa' : 'Turn on')}
        </Button>
      </div>
    </Card>
  );
}