import type { Lang } from './whatsappIntent.ts';

export type KnowledgeChunk = {
  id: string;
  topic: 'product' | 'permissions' | 'receipts' | 'daily_records' | 'projects' | 'debts' | 'payments' | 'faq';
  keywords: string[];
  sw: string;
  en: string;
};

// Small, versioned retrieval corpus for WhatsApp help. It is intentionally local
// and deterministic in this phase: no user data is sent to a model to answer FAQs.
export const RISIP_KNOWLEDGE: KnowledgeChunk[] = [
  { id: 'product-overview', topic: 'product', keywords: ['risip', 'help', 'msaada', 'feature', 'what'], sw: 'Risip inasaidia kurekodi risiti, mauzo, matumizi, madeni na malipo ya wateja.', en: 'Risip helps you record receipts, sales, expenses, debts, and customer payments.' },
  { id: 'receipts', topic: 'receipts', keywords: ['receipt', 'risiti', 'photo', 'scan', 'ai'], sw: 'Tuma picha ya risiti. Risip itaisoma na kuiweka kwenye project inayoruhusiwa.', en: 'Send a receipt photo. Risip reads it and files it to an authorised project.' },
  { id: 'daily-records', topic: 'daily_records', keywords: ['daily', 'record', 'rekodi', 'sale', 'mauzo', 'expense', 'matumizi'], sw: 'Kwa rekodi za siku, tuma mauzo au matumizi. Risip itaonyesha draft; jibu NDIYO kuthibitisha au HAPANA kughairi.', en: 'For daily records, send a sale or expense. Risip shows a draft; reply YES to confirm or NO to cancel.' },
  { id: 'projects', topic: 'projects', keywords: ['project', 'mradi'], sw: 'Risiti huhifadhiwa kwenye project hai. Kama hakuna project, owner au accountant anaweza kuanzisha ya kwanza.', en: 'Receipts are filed into an active project. If there is none, an owner or accountant can create the first one.' },
  { id: 'permissions', topic: 'permissions', keywords: ['permission', 'role', 'worker', 'owner', 'accountant', 'ruhusa'], sw: 'Worker anaweza kutuma risiti na kuandaa draft za rekodi. Owner/accountant ndiye anayethibitisha rekodi zenye athari ya ledger.', en: 'Workers can send receipts and create record drafts. Owners/accountants confirm ledger-impacting records.' },
  { id: 'debts', topic: 'debts', keywords: ['debt', 'deni', 'loan', 'mkopo'], sw: 'Tuma mfano: “Asha amechukua kwa mkopo 24000”. Risip itatengeneza draft ya deni kwa uthibitisho.', en: 'Send for example: “Asha took goods on credit for 24000”. Risip creates a debt draft for confirmation.' },
  { id: 'payments', topic: 'payments', keywords: ['payment', 'malipo', 'amelipa', 'paid'], sw: 'Tuma mfano: “Asha amelipa 10000”. Malipo ya mteja hayaundi mauzo mapya.', en: 'Send for example: “Asha paid 10000”. A customer payment does not create a new sale.' },
  { id: 'faq-confirmation', topic: 'faq', keywords: ['yes', 'no', 'ndiyo', 'hapana', 'confirm', 'cancel'], sw: 'NDIYO inathibitisha draft ikiwa role yako inaruhusiwa; HAPANA inaghairi draft bila kubadilisha rekodi nyingine.', en: 'YES confirms a draft when your role permits it; NO cancels the draft without changing other records.' },
];

function normalize(value: string): string[] {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

export function retrieveRisipKnowledge(query: string | null | undefined, _lang: Lang, limit = 3): KnowledgeChunk[] {
  const tokens = new Set(normalize(String(query ?? '')));
  return RISIP_KNOWLEDGE
    .map((chunk, index) => ({ chunk, score: chunk.keywords.reduce((score, keyword) => score + (tokens.has(keyword) ? 2 : 0), 0), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.chunk);
}

export function buildKnowledgeReply(query: string | null | undefined, lang: Lang): string {
  const chunks = retrieveRisipKnowledge(query, lang);
  if (chunks.length === 0) return lang === 'sw' ? 'Risip husaidia na risiti, mauzo, matumizi, madeni, malipo na projects.' : 'Risip helps with receipts, sales, expenses, debts, payments, and projects.';
  return chunks.map((chunk) => lang === 'sw' ? chunk.sw : chunk.en).join('\n\n');
}
