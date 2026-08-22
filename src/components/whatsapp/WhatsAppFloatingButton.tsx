import WhatsAppIcon from '@/components/ui/WhatsappIcon';
import { buildRisipWhatsAppUrl } from '@/features/whatsapp/publicWhatsApp';
import { getLang } from '@/lib/lang';

export default function WhatsAppFloatingButton() {
  const lang = getLang();
  const url = buildRisipWhatsAppUrl('support', lang);
  if (!url) return null;

  const label = lang === 'sw' ? 'Ongea na Risip kupitia WhatsApp' : 'Chat with Risip on WhatsApp';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#20bd5a] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/30 sm:bottom-7 sm:right-7 sm:h-16 sm:w-16"
    >
      <WhatsAppIcon className="h-8 w-8 sm:h-9 sm:w-9" />
      <span className="sr-only">{label}</span>
    </a>
  );
}
