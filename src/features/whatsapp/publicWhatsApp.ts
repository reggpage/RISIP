import { getLang, type LangCode } from '@/lib/lang';

const RISIP_PUBLIC_WHATSAPP_NUMBER = '255750513538';

/** Digits only: wa.me rejects a leading plus sign. */
export function risipWhatsAppNumber(): string {
  return RISIP_PUBLIC_WHATSAPP_NUMBER;
}

export function buildRisipWhatsAppUrl(
  intent: 'support' | 'register' | 'login' = 'support',
  lang: LangCode = getLang(),
): string | null {
  const number = risipWhatsAppNumber();
  if (!number) return null;

  const messages = {
    sw: {
      support: 'Habari Risip, nataka kuanza kutumia Risip kwa biashara yangu. Tafadhali nisaidie kuanza.',
      register: 'Habari Risip, nataka kusajili biashara yangu.',
      login: 'ingia',
    },
    en: {
      support: 'Hello Risip, I would like to start using Risip for my business. Please help me get started.',
      register: 'Hello Risip, I would like to register my business.',
      login: 'login',
    },
  } as const;

  return `https://wa.me/${number}?text=${encodeURIComponent(messages[lang][intent])}`;
}

/**
 * The link that finishes a web signup.
 *
 * The code comes from web-signup-draft; the number comes from here, so the one
 * public Risip number stays defined in exactly one place rather than being
 * duplicated into an edge function's environment.
 */
export function buildSignupConfirmUrl(code: string): string {
  const number = risipWhatsAppNumber();
  return `https://wa.me/${number}?text=${encodeURIComponent(`SAJILI ${code}`)}`;
}

/** The number as a person reads it, for copy that has to name it. */
export function risipWhatsAppNumberDisplay(): string {
  const digits = risipWhatsAppNumber();
  return digits ? `+${digits}` : '';
}

/**
 * A contact card named after the SHOP, so WhatsApp stops saying a number.
 *
 * WHY THIS EXISTS. WhatsApp labels a chat from the phone's contact book, and
 * from nothing else. A trader who messages the official number and never saves
 * it sees "+255750513538" forever, which reads as a stranger and not as the
 * business they registered — and it is also how you end up with three shops in
 * one person's chat list all called the same number. Saving a contact called
 * "Dickson Shop" fixes both: the name is right, and the second shop a different
 * contact rather than a duplicate.
 *
 * A vCard rather than a link because the name has to land in the phone's
 * CONTACTS, which is the only place WhatsApp reads it from. Handing the user a
 * wa.me link and a sentence of instructions puts that step in their hands and
 * it does not get done.
 */
export function buildRisipContactCard(shopName: string | null | undefined): string {
  const name = String(shopName ?? '').trim() || 'Risip';
  const number = risipWhatsAppNumberDisplay();
  // Escaped because a shop name is free text and a comma would split the field.
  const escaped = name.replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, ' ');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escaped}`,
    `N:${escaped};;;;`,
    `ORG:${escaped}`,
    `TEL;TYPE=CELL;WAID:${number.replace(/\D/g, '')}`,
    `TEL;TYPE=CELL:${number}`,
    'END:VCARD',
  ].join('\r\n');
}

/**
 * Puts the contact card in front of the user.
 *
 * A download on desktop, a share sheet on a phone — the same blob either way.
 * Returns false rather than throwing when the browser refuses both, so the
 * caller can fall back to showing the number instead of silently doing nothing.
 */
export function saveRisipContact(shopName: string | null | undefined): boolean {
  const vcard = buildRisipContactCard(shopName);
  const filename = `${(String(shopName ?? '').trim() || 'Risip').replace(/[^a-z0-9]+/gi, '-')}.vcf`;
  try {
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const file = new File([blob], filename, { type: 'text/vcard' });
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string }) => Promise<void>;
    };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      void nav.share({ files: [file], title: filename }).catch(() => undefined);
      return true;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on the next tick; revoking synchronously cancels the download in
    // Safari, which is the browser a shopkeeper is most likely holding.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
