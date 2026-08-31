import type { Lang } from './whatsappIntent.ts';

export type AccountDeletionState = {
  kind: 'account_delete';
  step: 'warning' | 'confirm';
  ownedCompanies: Array<{ id: string; name: string }>;
};

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

export function isAccountDeletionRequest(text: string | null | undefined): boolean {
  return /^(?:futa\s+(?:account|akaunti)\s+yangu|delete\s+(?:my\s+account|account\s+my))$/i.test(clean(text));
}

export function isAccountDeletionConfirmation(text: string | null | undefined): boolean {
  return /^(?:FUTA KABISA|DELETE PERMANENTLY)$/i.test(clean(text));
}

export function isAccountDeletionCancel(text: string | null | undefined): boolean {
  return /^(?:hapana|no|cancel|ghairi|sitisha|stop)$/i.test(clean(text));
}

export function accountDeletionWarning(
  companies: Array<{ id: string; name: string }>,
  lang: Lang,
): string {
  const names = companies.length ? companies.map((company) => `• ${company.name}`).join('\n') : '• Hakuna biashara unayomiliki';
  return lang === 'sw'
    ? 'Hii itafuta kabisa akaunti yako ya Risip, biashara unazomiliki, rekodi, stock, madeni, picha, history na link ya WhatsApp. Biashara unazofanyia kazi lakini humiliki zitaendelea kuwepo. Hii haiwezi kurudishwa.\n\nBiashara zitakazofutwa:\n'
      + `${names}\n\nAndika FUTA KABISA kuthibitisha, au *2* kughairi.`
    : 'This permanently deletes your Risip account, businesses you own, records, stock, debts, receipts, history and WhatsApp link. Businesses you only work in remain. This cannot be undone.\n\nBusinesses to delete:\n'
      + `${names}\n\nType DELETE PERMANENTLY to confirm, or NO to cancel.`;
}

export function accountDeletionDone(lang: Lang): string {
  return lang === 'sw'
    ? 'Akaunti yako ya Risip, biashara ulizomiliki na history yake imefutwa kabisa. Backup za provider zinaweza kuwa na muda wao wa kuhifadhi data.'
    : 'Your Risip account, owned businesses and their history were permanently deleted. Provider backups may follow their own retention period.';
}

export function accountDeletionReask(lang: Lang): string {
  return lang === 'sw'
    ? 'Sijaafuta chochote bado. Andika FUTA KABISA kuthibitisha, au *2* kughairi.'
    : 'Nothing has been deleted yet. Type DELETE PERMANENTLY to confirm, or NO to cancel.';
}
