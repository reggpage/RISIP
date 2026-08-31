import type { Lang } from './whatsappIntent.ts';

export type KnowledgeChunk = {
  id: string;
  topic: 'product' | 'permissions' | 'receipts' | 'daily_records' | 'projects' | 'debts' | 'payments' | 'onboarding' | 'security' | 'retirements' | 'supplier_claims' | 'invoices' | 'notifications' | 'audit' | 'errors' | 'faq';
  keywords: string[];
  sw: string;
  en: string;
};

// Small, versioned retrieval corpus for WhatsApp help. It is intentionally local
// and deterministic in this phase: no user data is sent to a model to answer FAQs.
export const RISIP_KNOWLEDGE: KnowledgeChunk[] = [
  { id: 'product-overview', topic: 'product', keywords: ['risip', 'help', 'msaada', 'feature', 'what'], sw: 'Risip inasaidia kurekodi mauzo, matumizi, madeni na malipo ya wateja.', en: 'Risip helps you record sales, expenses, debts, and customer payments.' },
  { id: 'receipts', topic: 'receipts', keywords: ['receipt', 'risiti', 'photo', 'scan', 'ai', 'resiti', 'picha'], sw: 'Tuma picha ya rekodi. Risip itaisoma na kuiweka kwenye project inayoruhusiwa.', en: 'Send a photo of a record. Risip reads it and files it to an authorised project.' },
  { id: 'daily-records', topic: 'daily_records', keywords: ['daily', 'record', 'rekodi', 'sale', 'mauzo', 'expense', 'matumizi'], sw: 'Kwa rekodi za siku, tuma mauzo au matumizi. Risip itaonyesha draft; jibu *1* Ndiyo · *2* Hapana', en: 'For daily records, send a sale or expense. Risip shows a draft; reply YES to confirm or NO to cancel.' },
  { id: 'projects', topic: 'projects', keywords: ['project', 'mradi'], sw: 'Rekodi huhifadhiwa kwenye project hai. Kama hakuna project, owner au accountant anaweza kuanzisha ya kwanza.', en: 'Receipts are filed into an active project. If there is none, an owner or accountant can create the first one.' },
  { id: 'permissions', topic: 'permissions', keywords: ['permission', 'role', 'worker', 'owner', 'accountant', 'ruhusa'], sw: 'Worker anaweza kutuma picha na kuandaa draft za rekodi. Owner/accountant ndiye anayethibitisha rekodi zenye athari ya ledger.', en: 'Workers can send photos and create record drafts. Owners/accountants confirm ledger-impacting records.' },
  { id: 'debts', topic: 'debts', keywords: ['debt', 'deni', 'loan', 'mkopo', 'anadaiwa', 'ananidai', 'wadeni', 'mdaiwa'], sw: 'Tuma mfano: “Asha amechukua kwa mkopo 24000”. Risip itatengeneza draft ya deni kwa uthibitisho.', en: 'Send for example: “Asha took goods on credit for 24000”. Risip creates a debt draft for confirmation.' },
  { id: 'payments', topic: 'payments', keywords: ['payment', 'malipo', 'amelipa', 'paid'], sw: 'Tuma mfano: “Asha amelipa 10000”. Malipo ya mteja hayaundi mauzo mapya.', en: 'Send for example: “Asha paid 10000”. A customer payment does not create a new sale.' },
  { id: 'faq-confirmation', topic: 'faq', keywords: ['yes', 'no', 'ndiyo', 'hapana', 'confirm', 'cancel'], sw: '*1* inathibitisha draft ikiwa role yako inaruhusiwa; *2* inaghairi draft bila kubadilisha rekodi nyingine.', en: 'YES confirms a draft when your role permits it; NO cancels the draft without changing other records.' },
  { id: 'whatsapp-registration', topic: 'onboarding', keywords: ['register', 'registration', 'signup', 'sajili', 'jisajili', 'akaunti', 'account', 'biashara', 'jiunge', 'jiunga', 'nafanyaje', 'anza'], sw: 'Kwa namba mpya, tuma “Hi”, chagua lugha, kisha chagua kufungua biashara mpya au kujiunga na biashara uliyoalikwa. Risip haitakuomba password kwenye WhatsApp.', en: 'From a new number, send “Hi”, choose a language, then start a new business or join one you were invited to. Risip will not ask for your password on WhatsApp.' },
  { id: 'whatsapp-login', topic: 'onboarding', keywords: ['login', 'ingia', 'kuingia', 'dashboard', 'link', 'kiungo'], sw: 'Andika “ingia” au omba link ya login. Risip itakutumia link ya dashboard inayotumika mara moja tu ndani ya dakika 5. Usimpe mtu mwingine.', en: 'Send “login” or ask for a login link. Risip sends a dashboard link that works once within 5 minutes. Do not share it.' },
  { id: 'whatsapp-invites', topic: 'permissions', keywords: ['invite', 'mwaliko', 'code', 'kodi', 'worker', 'mfanyakazi', 'accountant', 'mhasibu', 'jiunge', 'jiunga', 'alika', 'kualika'], sw: 'Owner anaweza kualika hapa hapa WhatsApp: andika “nataka kumualika mtu”, chagua Mfanyakazi au Mhasibu, na Risip itakupa kodi pamoja na nakala tayari ya kutuma. Wewe ndiye unayemtumia kutoka contacts zako. Mfanyakazi mpya atume kodi hiyo kwenye namba ya Risip. Pia inawezekana kupitia Settings → WhatsApp kwenye app.', en: 'An owner can invite from WhatsApp itself: say “I want to invite someone”, choose Worker or Accountant, and Risip returns a code with a ready-to-forward message. You send it yourself, from your own contacts. The new staff member sends that code to the Risip number. Settings → WhatsApp in the app also works.' },
  { id: 'whatsapp-logout', topic: 'onboarding', keywords: ['logout', 'log', 'signout', 'ondoa', 'kutoka', 'toka', 'jiondoe', 'unlink', 'kuondoa', 'namba'], sw: 'Andika “logout” au “ondoa namba hii”. Risip itakuuliza uhakika, kisha itaondoa namba yako. Rekodi zako zote zitabaki salama; kurudi utahitaji kodi mpya kutoka kwa owner.', en: 'Send “logout” or “remove this number”. Risip asks you to confirm, then unlinks your number. All your records stay safe; to come back you need a fresh code from the owner.' },
  { id: 'whatsapp-link-security', topic: 'security', keywords: ['password', 'security', 'usalama', 'share', 'token', 'secret'], sw: 'Risip haiombi password kupitia WhatsApp. Login link na linking code ni siri, zina muda mfupi na hazipaswi kutumwa kwa mtu mwingine.', en: 'Risip never asks for a password on WhatsApp. Login links and linking codes are private, short-lived, and must not be shared.' },
  { id: 'receipt-approval', topic: 'receipts', keywords: ['approve', 'approval', 'thibitisha', 'idhinisha', 'submit', 'wasilisha'], sw: 'Rekodi huwasilishwa na kukaguliwa kwa maker-checker. Uidhinishaji, malipo, reversal na correction hazifanywi kwa ujumbe wa kawaida wa WhatsApp; fungua Risip.', en: 'Receipts follow a maker-checker submission and review flow. Approval, payment, reversal, and correction are not performed through ordinary WhatsApp text; open Risip.' },
  { id: 'receipt-counting', topic: 'receipts', keywords: ['total', 'jumla', 'counted', 'expense', 'confirmed'], sw: 'Rekodi iliyothibitishwa ndiyo huhesabiwa kwenye matumizi. Payout, retirement au supplier claim haipaswi kuongeza matumizi yale yale mara ya pili.', en: 'A confirmed receipt is counted as an expense. A payout, retirement, or supplier claim must not add the same expense a second time.' },
  { id: 'receipt-correction', topic: 'receipts', keywords: ['reverse', 'reversal', 'correct', 'correction', 'rekebisha', 'geuza'], sw: 'Reversal na correction hufanywa ndani ya Risip kwa ruhusa, sababu yenye maana na audit. Rekodi iliyofungwa kwenye workflow haiwezi kubadilishwa kimya.', en: 'Reversal and correction happen inside Risip with permission, a meaningful reason, and audit history. A receipt locked by a workflow cannot be silently changed.' },
  { id: 'petty-cash', topic: 'payments', keywords: ['petty', 'float', 'salio', 'cash', 'hela'], sw: 'Rekodi ya petty cash iliyothibitishwa hupunguza float ya mfanyakazi. Haiwezi pia kulipwa kama matumizi ya pesa binafsi.', en: 'A confirmed petty-cash receipt reduces the worker’s float. It cannot also be reimbursed as a personal-money expense.' },
  { id: 'reimbursements', topic: 'payments', keywords: ['reimbursement', 'refund', 'reimbursed', 'payout', 'madai', 'malipo'], sw: 'Reimbursement hulipa rekodi za pesa binafsi ambazo tayari zimehesabiwa kama matumizi. Payout haiundi matumizi mapya na kiasi chake huhifadhiwa kama snapshot.', en: 'A reimbursement pays personal-money records already counted as expenses. A payout does not create a new expense and its amount is stored as a snapshot.' },
  { id: 'retirements-overview', topic: 'retirements', keywords: ['retirement', 'retire', 'staafu', 'masurufu'], sw: 'Staff retirement ni workflow ya kuwasilisha na kulipwa rekodi zilizothibitishwa; si matumizi mapya. Finance hukagua, kuidhinisha, kuweka paid, na mfanyakazi kuthibitisha kupokea.', en: 'A staff retirement is a workflow over confirmed records; it is not a new expense. Finance reviews, approves, marks paid, and the worker confirms receipt.' },
  { id: 'retirements-freeze', topic: 'retirements', keywords: ['retirement', 'freeze', 'edit', 'reverse', 'correct', 'locked'], sw: 'Rekodi iliyo kwenye retirement hai haiwezi kuwekwa kwenye retirement nyingine, kureimbursed, kuhaririwa kwa money fields, kureverse au kurekebishwa mpaka retirement iachiliwe kwa status inayoruhusiwa.', en: 'A receipt in a live retirement cannot join another retirement, be reimbursed, have money fields edited, or be reversed/corrected until the retirement is released by an allowed status.' },
  { id: 'supplier-claims-overview', topic: 'supplier_claims', keywords: ['supplier', 'claim', 'vendor', 'msambazaji', 'dai'], sw: 'Supplier claims ni AP inbox ya copied data kwa sasa. Hazijaunganishwa na internal receipts na haziathiri receipt totals, petty cash, reimbursement, retirement au invoices.', en: 'Supplier claims are a copied-data AP inbox for now. They are not linked to internal receipts and do not affect receipt totals, petty cash, reimbursements, retirements, or invoices.' },
  { id: 'supplier-claims-actions', topic: 'supplier_claims', keywords: ['supplier', 'dispute', 'paid', 'received', 'approved'], sw: 'Finance hutumia status zilizodhibitiwa: viewed, approved for payment, disputed, paid na received confirmed. Payment huhifadhi amount, method na reference snapshot; dispute huhitaji sababu.', en: 'Finance uses controlled statuses: viewed, approved for payment, disputed, paid, and received confirmed. Payment stores amount, method, and reference snapshots; disputes require a reason.' },
  { id: 'invoices', topic: 'invoices', keywords: ['invoice', 'ankara', 'bill'], sw: 'Invoices ni module tofauti na daily records na supplier claims. Risip haitadai invoice imebadilisha receipt au daily-record totals bila data ya module husika.', en: 'Invoices are separate from daily records and supplier claims. Risip must not claim an invoice changed receipt or daily-record totals without module-specific data.' },
  { id: 'notifications', topic: 'notifications', keywords: ['notification', 'notify', 'taarifa', 'ujumbe'], sw: 'Maamuzi ya finance yanayotakiwa hutengeneza notification server-side; client pekee si chanzo cha kuaminika cha notification.', en: 'Required finance decisions generate notifications server-side; the client alone is not the authoritative notification source.' },
  { id: 'audit-history', topic: 'audit', keywords: ['audit', 'history', 'historia', 'timeline', 'decision', 'uamuzi'], sw: 'Risip huhifadhi audit/history kwa maamuzi muhimu. Void au reversal haiifuti rekodi ya awali; status, actor, muda na sababu hubaki kwenye historia.', en: 'Risip preserves audit history for important decisions. A void or reversal does not delete the original record; status, actor, time, and reason remain in history.' },
  { id: 'daily-record-separation', topic: 'daily_records', keywords: ['daily', 'receipt', 'double', 'count', 'rekodi', 'risiti'], sw: 'Matumizi ya rekodi za siku na ya picha huonyeshwa tofauti. Risip haipaswi kuzichanganya au kuhesabu matumizi mara mbili bila label na rule iliyo wazi.', en: 'Daily-record expenses and photo expenses are shown separately. Risip must not combine or double-count them without an explicit label and rule.' },
  { id: 'product-costs', topic: 'product', keywords: ['cost', 'buying', 'gharama', 'kununua', 'cogs', 'coverage', 'faida', 'hasara', 'profit', 'faidha', 'nafaida'], sw: 'Profit ni makisio yanayotegemea buying cost iliyohifadhiwa. Kama gharama ya bidhaa haipo, Risip hutaja taarifa iliyokosekana badala ya kubuni faida.', en: 'Profit is an estimate based on saved buying costs. If a product cost is missing, Risip reports the missing information rather than inventing profit.' },
  { id: 'stock-boundary', topic: 'product', keywords: ['stock', 'inventory', 'level', 'quantity', 'on hand'], sw: 'Risip inaweza kurekodi stock purchase, lakini bado haina stock-on-hand ledger kamili. Haitakiwi kudai quantity iliyopo bila module hiyo.', en: 'Risip can record a stock purchase, but it does not yet have a complete stock-on-hand ledger. It must not claim current stock quantity without that module.' },
  { id: 'failure-honesty', topic: 'errors', keywords: ['error', 'failed', 'shindwa', 'tatizo', 'haifanyi'], sw: 'Tool au database ikishindwa, Risip inasema haikuweza kupata taarifa na kuomba ujaribu tena. Haitumii chat memory kama chanzo cha namba za sasa.', en: 'If a tool or database call fails, Risip says it could not retrieve the information and asks the user to retry. It does not use chat memory as the source of current figures.' },
  { id: 'protected-actions', topic: 'security', keywords: ['pay', 'approve', 'reverse', 'void', 'delete', 'lipa', 'futa'], sw: 'AI haiidhinishi, hailipi, haireverse, haivoid wala haifuti kwa ujumbe wa kawaida. Actions zinazolindwa hufanywa ndani ya Risip kwa role, confirmation na audit.', en: 'AI does not approve, pay, reverse, void, or delete through ordinary text. Protected actions happen inside Risip with role checks, confirmation, and audit.' },
];

function normalize(value: string): string[] {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

// Kiswahili builds words with affixes: deni \u2192 madeni, jiunge \u2192 kujiunga,
// sajili \u2192 kujisajili. Exact token equality cannot see through any of that, and
// production proved it: "nataka kujiunga nafanyaje" matched nothing and the user
// was told how to register a brand-new business instead of how to join one.
//
// Stripping the common noun-class and infinitive prefixes turns most inflections
// back into their stem. Only applied when enough word is left to stay meaningful.
// Kept deliberately short. "ji" and "ki" were tried and removed: they turn
// "jiunga" into "unga" and "kitabu" into "tabu", which is how a question about
// joining a business would start matching flour.
const PREFIXES = ['ku', 'ma', 'mi', 'vi', 'wa', 'ya', 'za'];

function stem(token: string): string {
  for (const prefix of PREFIXES) {
    if (token.length >= prefix.length + 4 && token.startsWith(prefix)) {
      return token.slice(prefix.length);
    }
  }
  return token;
}

/**
 * Typo and inflection tolerance: risit/risiti, jiunga/jiunge. Requires five
 * shared leading characters so short words cannot collide by accident, and a
 * length gap of at most two so unrelated long words stay apart.
 */
function nearlyEqual(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  return a.slice(0, 5) === b.slice(0, 5);
}

export function retrieveRisipKnowledge(query: string | null | undefined, _lang: Lang, limit = 3): KnowledgeChunk[] {
  const raw = normalize(String(query ?? ''));
  const tokens = new Set(raw);
  const stems = new Set(raw.map(stem));

  // Exact beats stem beats near-miss, so a precise word still wins the ranking.
  const scoreKeyword = (keyword: string): number => {
    if (tokens.has(keyword)) return 3;
    const keywordStem = stem(keyword);
    if (stems.has(keywordStem) || tokens.has(keywordStem)) return 2;
    for (const token of stems) if (nearlyEqual(token, keywordStem)) return 1;
    return 0;
  };

  return RISIP_KNOWLEDGE
    .map((chunk, index) => ({
      chunk,
      score: chunk.keywords.reduce((total, keyword) => total + scoreKeyword(keyword), 0),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.chunk);
}

export function buildKnowledgeReply(query: string | null | undefined, lang: Lang): string {
  const chunks = retrieveRisipKnowledge(query, lang);
  if (chunks.length === 0) return lang === 'sw' ? 'Risip husaidia na mauzo, matumizi, madeni, malipo na bidhaa.' : 'Risip helps with sales, expenses, debts, payments, and products.';
  return chunks.map((chunk) => lang === 'sw' ? chunk.sw : chunk.en).join('\n\n');
}
