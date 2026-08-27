import { correctControlWords } from './whatsappSpelling.ts';
// Deterministic decision logic for the WhatsApp assistant.
//
// Everything here is pure and free of Deno globals so the same code runs in the
// edge functions and under vitest. Nothing in this file talks to Claude: language
// switching, cancel/confirm and project matching are all rule-based, which keeps
// them predictable, free, and impossible to steer with prompt injection.

export type Lang = 'sw' | 'en';

// ── Language ───────────────────────────────────────────────────────────────

const SWAHILI_MARKERS = [
  'hii', 'ni ', 'ya ', 'wa ', 'na ', 'kwa ', 'nime', 'nili', 'nina', 'yangu', 'yako',
  'mafuta', 'risiti', 'risit', 'pesa', 'fedha', 'mradi', 'ghairi', 'sawa', 'ndio', 'ndiyo',
  'hapana', 'asante', 'tafadhali', 'nunua', 'nimenunua', 'malipo', 'lipa', 'kampuni',
];

/** Best-effort guess. Only ever a fallback — a stored preference always wins. */
export function detectLanguage(text: string | null | undefined): Lang | null {
  const t = String(text ?? '').toLowerCase().trim();
  if (t.length < 3) return null;
  const hits = SWAHILI_MARKERS.filter((m) => t.includes(m)).length;
  return hits >= 2 ? 'sw' : null;
}

/**
 * Explicit language commands, handled without an AI call. Recognises the English
 * and Swahili phrasings plus the obvious short forms.
 */
export function parseLanguageCommand(text: string | null | undefined): Lang | null {
  const t = String(text ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!t) return null;
  // MEASURED FAILURE: "change to english" was refused with a paragraph telling
  // the owner to go and change it in the web app, because the pattern demanded
  // the exact words "change language to english". Nobody types the word
  // "language" when the whole message is about language. The verbs are what
  // matter; the noun is optional.
  const wantsSwahili = new RegExp(
    '(?:badili|badilisha|geuza|weka|tumia|switch|change|set|use)[^a-z]*'
    + '(?:lugha|language)?[^a-z]*(?:to |kuwa |kwenda |ya |kwa )?(?:kiswahili|swahili)'
    + '|(?:nijibu|jibu|ongea|sema)[^a-z]*(?:kwa|in)?[^a-z]*(?:kiswahili|swahili)'
    + '|(?:reply|respond|answer|talk|speak|write)[^a-z]*(?:to me )?(?:in|kwa)?[^a-z]*(?:kiswahili|swahili)'
    // "Kiswahili tafadhali" is the whole message and the politeness is not an
    // instruction, so the bare-word rule has to survive it.
    + '|^(?:naomba |please |tafadhali )?(?:kiswahili|swahili)( please| tafadhali| basi)?$',
  ).test(t);
  if (wantsSwahili) return 'sw';
  const wantsEnglish = new RegExp(
    '(?:badili|badilisha|geuza|weka|tumia|switch|change|set|use)[^a-z]*'
    + '(?:lugha|language)?[^a-z]*(?:to |kuwa |kwenda |ya |kwa )?(?:kiingereza|english)'
    + '|(?:nijibu|jibu|ongea|sema)[^a-z]*(?:kwa|in)?[^a-z]*(?:kiingereza|english)'
    + '|(?:reply|respond|answer|talk|speak|write)[^a-z]*(?:to me )?(?:in|kwa)?[^a-z]*(?:kiingereza|english)'
    + '|^(?:naomba |please |tafadhali )?(?:english|kiingereza)( please| tafadhali| basi)?$',
  ).test(t);
  if (wantsEnglish) return 'en';
  return null;
}

export function isCancel(text: string | null | undefined): boolean {
  // A mistyped "ghairi" left the draft standing while the shopkeeper believed
  // they had cancelled it. See whatsappSpelling.ts.
  const t = correctControlWords(text).toLowerCase().trim();
  return /^(cancel|ghairi|toka|futa|start over|anza upya|acha|sitisha)\b/.test(t);
}

/**
 * An explicit escape from a live pending question.
 *
 * This is intentionally a closed control vocabulary. It is not a general
 * sentence parser and it never decides which financial action to take.
 */
export function isPendingEscape(text: string | null | undefined): boolean {
  return isCancel(text);
}

export function pendingEscapeHint(lang: Lang): string {
  return lang === 'sw'
    ? 'Ukiamua kuacha, andika *GHAIRI*.'
    : 'If you want to stop, reply *CANCEL*.';
}

export function isConfirm(text: string | null | undefined): boolean {
  const t = correctControlWords(text).toLowerCase().trim();
  return /^(yes|ok|okay|confirm|sawa|ndio|ndiyo|thibitisha|hakika)\b/.test(t);
}

export function isHelp(text: string | null | undefined): boolean {
  const t = String(text ?? '').toLowerCase().trim();
  // Greetings are conversation, not a request for a static command menu. A
  // linked user saying “mambo vipi?” must reach Risip AI so it can respond
  // naturally and retain the turn in conversation memory.
  return /^(help|msaada|saidia|nisaidie|start|menu)\b/.test(t);
}

export type Intent =
  | 'link_account'
  | 'change_language'
  | 'submit_receipt'
  | 'clarification_reply'
  | 'confirm_action'
  | 'cancel_action'
  | 'help'
  | 'unknown';

/**
 * Deterministic-first router. Only classifies; it never performs an action, and
 * it never consults a model. `awaitingClarification` lets a plain "2" be read as
 * an answer to the question we just asked rather than as noise.
 */
export function routeIntent(input: {
  messageType: string;
  text?: string | null;
  hasLinkToken?: boolean;
  awaitingClarification?: boolean;
}): Intent {
  if (input.messageType === 'image') return 'submit_receipt';
  const text = input.text ?? '';
  if (input.hasLinkToken) return 'link_account';
  if (parseLanguageCommand(text)) return 'change_language';
  if (isCancel(text)) return 'cancel_action';
  if (input.awaitingClarification) return 'clarification_reply';
  if (isConfirm(text)) return 'confirm_action';
  if (isHelp(text)) return 'help';
  return 'unknown';
}

// ── Project matching ───────────────────────────────────────────────────────

export type ProjectRef = { id: string; name: string };

export type ProjectResolution =
  | { kind: 'resolved'; projectId: string; reason: 'sole_project' | 'caption_match' }
  | { kind: 'unassigned'; reason: 'no_projects' | 'ambiguous' | 'no_context' | 'not_found' };

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Decide which project a receipt belongs to, from the caption alone.
 *
 * Hard rules, in this order:
 *   - Only projects the sender is authorised to use are ever considered; an
 *     unauthorised name is indistinguishable from a name that does not exist.
 *   - Exactly one authorised project → that is genuinely theirs, so propose it.
 *   - A caption naming exactly one authorised project → propose it.
 *   - Anything else (several projects and no caption, several name matches, a
 *     name we cannot find) → leave it unassigned and ask.
 *
 * There is deliberately no "first project" fallback: guessing silently is what
 * put a fuel receipt on the wrong project in production.
 */
export function resolveProject(
  caption: string | null | undefined,
  authorized: ProjectRef[],
): ProjectResolution {
  if (authorized.length === 0) return { kind: 'unassigned', reason: 'no_projects' };
  if (authorized.length === 1) return { kind: 'resolved', projectId: authorized[0].id, reason: 'sole_project' };

  const text = normalise(String(caption ?? ''));
  if (!text) return { kind: 'unassigned', reason: 'no_context' };

  // A project matches when its full name appears verbatim, or when every
  // significant word of a multi-word name appears. A single common word is never
  // enough: a project called "Site A" must not swallow "…from the site today".
  const matches = authorized.filter((p) => {
    const name = normalise(p.name);
    if (!name) return false;
    if (text.includes(name)) return true;
    const words = name.split(' ').filter((w) => w.length >= 4);
    return words.length >= 2 && words.every((w) => text.includes(w));
  });

  if (matches.length === 1) return { kind: 'resolved', projectId: matches[0].id, reason: 'caption_match' };
  if (matches.length > 1) return { kind: 'unassigned', reason: 'ambiguous' };
  return { kind: 'unassigned', reason: 'no_context' };
}

// ── Payment source ─────────────────────────────────────────────────────────

export type PaymentGuess = 'cash_personal' | 'petty_cash' | 'company_card' | null;

/**
 * Read the payment source from a caption. Returns null when the caption does not
 * say — the app then asks rather than assuming, because this decides whether the
 * employee gets their money back.
 *
 * The three are financially distinct and must not be collapsed:
 *   cash_personal  the employee's own money  → may become a reimbursement
 *   petty_cash     drawn from a petty-cash float → reduces that float
 *   company_card   company card/bank funds → neither of the above
 */
export function resolvePaymentSource(caption: string | null | undefined): PaymentGuess {
  const t = normalise(String(caption ?? ''));
  if (!t) return null;

  // Personal first: "my own card" must not be read as a company card.
  if (/(pesa|fedha) (yangu|zangu)|mfuko(ni)? wangu|my own money|own money|personal money|personal card|my own card|kadi yangu|nimelipa mimi|nililipa mwenyewe/.test(t)) {
    return 'cash_personal';
  }
  // A petty-cash float is money already issued to the employee.
  if (/petty cash|pettycash|hela ndogo|pesa ndogo/.test(t)) {
    return 'petty_cash';
  }
  // Company-funded card or bank payment: touches no float.
  if (/company (card|bank|account)|kadi ya kampuni|akaunti ya kampuni|hela ya kampuni|pesa ya kampuni|company (money|funds|cash)/.test(t)) {
    return 'company_card';
  }
  return null;
}

// ── Replies, in the user's language ────────────────────────────────────────

const T = {
  chooseLanguage: {
    en: 'Karibu Risip. Choose your language:\n\nReply *1* for Kiswahili\nReply *2* for English',
    sw: 'Karibu Risip. Chagua lugha:\n\nJibu *1* kwa Kiswahili\nJibu *2* kwa English',
  },
  languageSet: { en: 'Done. I will reply in English.', sw: 'Sawa. Nitakujibu kwa Kiswahili.' },
  cancelled: { en: 'Cancelled. Send a new receipt photo whenever you are ready.', sw: 'Imeghairiwa. Tuma picha nyingine ya risiti wakati wowote.' },
  help: {
    en: 'Send a photo of a receipt and I will read it and file it in Risip.\n\nYou can add a note with the photo, for example: "Fuel for Dodoma, I paid with my own money."\n\nCommands: *cancel* to stop, *change language to Kiswahili*.',
    sw: 'Tuma picha ya risiti nami nitaisoma na kuiweka kwenye Risip.\n\nUnaweza kuandika maelezo pamoja na picha, mfano: "Mafuta ya Dodoma, nimelipa pesa yangu."\n\nAmri: *ghairi* kusitisha, *change language to English*.',
  },
  onlyRisip: {
    en: 'I can help with Risip and your business records, including receipts, sales, expenses, debts, payments, products and projects. Ask me naturally, or reply *help* for commands.',
    sw: 'Naweza kukusaidia kuhusu Risip na rekodi za biashara yako—risiti, mauzo, matumizi, madeni, malipo, bidhaa na projects. Niulize kwa kawaida, au andika *msaada* kuona amri.',
  },
  notLinked: {
    en: 'This number is not connected to a Risip account.\n\nOpen Risip on the web, go to Settings → WhatsApp and tap "Connect WhatsApp".',
    sw: 'Namba hii haijaunganishwa na akaunti ya Risip.\n\nFungua Risip kwenye tovuti, nenda Settings → WhatsApp, bonyeza "Connect WhatsApp".',
  },
  photoOnly: {
    en: 'Please send the receipt as a photo. Documents, voice notes and videos are not supported yet.',
    sw: 'Tafadhali tuma risiti kama picha. Nyaraka, sauti na video hazitumiki bado.',
  },
} as const;

export function t(key: keyof typeof T, lang: Lang): string {
  return T[key][lang];
}

function money(amount: number | null | undefined, lang: Lang): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;
  return `${lang === 'sw' ? 'TSh' : 'TZS'} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * The single reply after a receipt is filed.
 *
 * Wording note: this deliberately says "review and submit", never "approve".
 * Risip has no separate submitted/approved lifecycle yet (that is Phase 1b), so
 * promising one here would describe behaviour that does not exist.
 */
export function buildReceiptReplyV2(input: {
  lang: Lang;
  vendor?: string | null;
  total?: number | null;
  projectName?: string | null;
  needsProject: boolean;
  projectOptions?: ProjectRef[];
  reviewUrl: string;
}): string {
  const { lang } = input;
  const lines: string[] = [];
  lines.push(lang === 'sw' ? 'Risiti imepokelewa.' : 'Receipt received.');
  lines.push('');
  if (input.vendor) lines.push(`${lang === 'sw' ? 'Muuzaji' : 'Merchant'}: ${input.vendor}`);
  const total = money(input.total, lang);
  if (total) lines.push(`${lang === 'sw' ? 'Kiasi' : 'Amount'}: ${total}`);
  if (input.projectName) lines.push(`${lang === 'sw' ? 'Mradi' : 'Project'}: ${input.projectName}`);
  lines.push('');

  if (input.needsProject) {
    lines.push(
      lang === 'sw'
        ? 'Sijajua mradi wa risiti hii. Jibu na namba ya mradi:'
        : 'I do not know which project this belongs to. Reply with the number:',
    );
    (input.projectOptions ?? []).slice(0, 9).forEach((p, i) => lines.push(`${i + 1}. ${p.name}`));
    lines.push('');
  }

  lines.push(
    lang === 'sw'
      ? 'Kagua taarifa, chagua mradi na chanzo cha malipo, kisha uwasilishe kwa timu ya fedha:'
      : 'Review the details, choose the project and payment source, then submit it to your finance team:',
  );
  lines.push(input.reviewUrl);
  return lines.join('\n');
}

/** Turn a reply like "2" or a project name into a choice from the options shown. */
export function parseProjectChoice(text: string | null | undefined, options: ProjectRef[]): ProjectRef | null {
  const raw = String(text ?? '').trim();
  if (!raw || options.length === 0) return null;
  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
    return options[asNumber - 1];
  }
  const resolution = resolveProject(raw, options);
  if (resolution.kind === 'resolved') {
    return options.find((p) => p.id === resolution.projectId) ?? null;
  }
  return null;
}
