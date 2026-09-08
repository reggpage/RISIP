import { useState } from 'react';
import { sw } from '@/i18n/sw';
import type { LegalKind } from '../../../supabase/functions/_shared/risipLegal';
import LegalModal from './LegalModal';
import '@/routes/legal/legal.css';

export default function LegalCheckbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  // The terms and privacy notice open in a dialog over the accept screen, not
  // a new page, so nobody leaves the agreement to read it.
  const [open, setOpen] = useState<LegalKind | null>(null);
  return (
    <div>
      <label className="legal-check">
        <input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{sw.legal.agree}</span>
      </label>
      <nav className="legal-links flex gap-5 text-xs underline">
        <button type="button" onClick={() => setOpen('terms')}>{sw.legal.terms}</button>
        <button type="button" onClick={() => setOpen('privacy')}>{sw.legal.privacy}</button>
      </nav>
      {open && <LegalModal kind={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
