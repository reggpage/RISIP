import { Link } from 'react-router-dom';
import { sw } from '@/i18n/sw';
import '@/routes/legal/legal.css';
export default function LegalCheckbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <div><label className="legal-check"><input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{sw.legal.agree}</span></label><nav className="flex gap-5 text-xs underline"><Link to="/terms" target="_blank" rel="noopener">{sw.legal.terms}</Link><Link to="/privacy" target="_blank" rel="noopener">{sw.legal.privacy}</Link></nav></div>;
}
