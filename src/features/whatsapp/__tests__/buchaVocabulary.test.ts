import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aliasConfirmation,
  parseVocabularyTeaching,
  semanticConfirmation,
  vocabularyConflict,
  vocabularyContext,
} from '../../../../supabase/functions/_shared/whatsappVocabulary';
import { parseStockLoss } from '../../../../supabase/functions/_shared/whatsappStockLoss';

// RISIP BUCHA, PHASE 3 — how THIS shop talks.
//
// A butcher says "za mbwa" and means Chakula cha mbwa. The shop across the road
// may use the same words for something else, so none of it belongs in a shipped
// dictionary. It is learned from the trader, confirmed before it is kept, and
// stored against their company alone.

const sql = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');
const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = sql('0124_business_vocabulary.sql');

describe('teaching, in the shapes a shop actually uses', () => {
  it.each([
    ['nikisema za mbwa namaanisha chakula cha mbwa', 'za mbwa', 'chakula cha mbwa'],
    ['kwetu za mbwa ni chakula cha mbwa', 'za mbwa', 'chakula cha mbwa'],
    ["nikisema nyama namaanisha nyama ya ng'ombe", 'nyama', "nyama ya ng'ombe"],
  ])('reads %s as a product alias', (said, term, product) => {
    expect(parseVocabularyTeaching(said)).toEqual({ kind: 'product_alias', term, product });
  });

  it('reads "we call maini liver" with the nickname second', () => {
    expect(parseVocabularyTeaching('huku tunaita maini liver'))
      .toEqual({ kind: 'product_alias', term: 'liver', product: 'maini' });
  });

  // A word explained as "meat that spoiled" describes an EVENT. Filing it as a
  // product alias would make "mzoga" a thing the shop sells.
  it('reads a spoilage word as a meaning, not a product', () => {
    expect(parseVocabularyTeaching('kwetu nikisema mzoga namaanisha nyama iliyoharibika'))
      .toEqual({ kind: 'semantic_term', term: 'mzoga', meaning: 'stock_loss', product: 'nyama' });
  });

  it('reads a request to forget a word', () => {
    expect(parseVocabularyTeaching('ondoa jina za mbwa')).toEqual({ kind: 'forget', term: 'za mbwa' });
  });

  it.each([
    'nimeuza nyama kilo 3 cash',
    'nyama kilo 3 imeharibika',
    'za mbwa kilo 3',
    'nimechukua nyama kilo 2 nyumbani',
    'habari za asubuhi',
  ])('does not mistake %s for a lesson', (said) => {
    expect(parseVocabularyTeaching(said)).toBeNull();
  });
});

describe('nothing is guessed before it is taught', () => {
  it('has no butcher slang in any shipped parser', () => {
    // Company A may use "za mbwa"; company B may use it for something else.
    for (const file of ['whatsappSpelling.ts', 'whatsappStock.ts', 'whatsappDailyRecords.ts']) {
      const source = src(`supabase/functions/_shared/${file}`).toLowerCase();
      expect(source, file).not.toContain('za mbwa');
      expect(source, file).not.toContain('chakula cha mbwa');
    }
  });

  it('keeps "mzoga" out of every dictionary and only ever asks', () => {
    expect(src('supabase/functions/_shared/whatsappSpelling.ts').toLowerCase()).not.toContain('mzoga');
    const reading = parseStockLoss('mzoga kilo 2');
    expect(reading?.kind).toBe('clarify_spoilage');
  });

  it('lets a taught word settle the question, but only with a product', () => {
    const webhook = src('supabase/functions/whatsapp-webhook/index.ts');
    expect(webhook).toContain("String(row.meaning ?? '') === 'stock_loss'");
    // Knowing a word means spoilage is not knowing WHAT spoiled.
    expect(webhook).toContain('if (taughtProduct) {');
  });
});

describe('the alias model', () => {
  it('scopes every word to one company', () => {
    expect(migration).toContain('company_id   uuid not null references public.companies(id) on delete cascade');
    expect(migration).toContain('business_vocabulary_company_term_idx');
    expect(migration).toContain('on public.business_vocabulary (company_id, term_key)');
  });

  it('normalises with the same helper product identity uses', () => {
    // A second normalisation algorithm would drift from the first, and every
    // vocabulary list in this codebase that drifted cost a real shop a bug.
    expect(migration).toContain('private.product_key(p_term)');
  });

  it('keeps product aliases and taught meanings apart by an explicit kind', () => {
    expect(migration).toContain("kind in ('product_alias', 'semantic_term', 'unit_alias')");
    expect(migration).toContain("kind <> 'product_alias' or product_key is not null");
    expect(migration).toContain("kind <> 'semantic_term' or meaning is not null");
  });

  it('does not accept a unit alias yet, because a bag of one kilo is a conversion', () => {
    expect(migration).toContain("if v_kind not in ('product_alias', 'semantic_term') then");
  });

  it('refuses to let a word shadow a real product', () => {
    expect(migration).toContain("hint = 'shadows_product'");
  });

  it('never silently remaps a word that already means something', () => {
    expect(migration).toContain("'conflict', true");
    expect(migration).toContain("'existing_product', v_existing.product_key");
  });

  it('is owner and accountant only, like every other pricing setting', () => {
    expect(migration).toContain('only an owner or accountant may teach business vocabulary');
    expect(migration).toContain('only an owner or accountant may change business vocabulary');
  });

  it('denies table writes outright, leaving the RPC as the only door', () => {
    expect(migration).toContain('alter table public.business_vocabulary enable row level security');
    expect(migration).toMatch(/create policy business_vocabulary_read[\s\S]*?for select to authenticated/);
    expect(migration).not.toMatch(/for (insert|update|delete) to authenticated/);
  });

  it('keeps a record of what was taught and what was forgotten', () => {
    expect(migration).toContain('business_vocabulary_audit_log');
    expect(migration).toContain("'forgotten', v_term_key");
  });
});

describe('resolution order', () => {
  it('consults aliases only when no real product matched exactly', () => {
    // Second, never first: a real product can then never be shadowed at read
    // time either, which is the same rule the save path enforces at write time.
    expect(migration).toContain('if not v_exact then');
    expect(migration).toContain("'alias'::text");
  });

  it('leaves the existing fuzzy resolver untouched', () => {
    // Every other vertical keeps resolving exactly as it did.
    expect(migration).toContain('return query select * from private.resolve_company_product_read(v_key);');
    expect(migration).not.toContain('create or replace function private.resolve_company_product_read');
  });

  it('scopes the alias lookup by the company resolved from the caller', () => {
    expect(migration).toContain('where v.company_id = p_company_id');
    expect(migration).toContain('WhatsApp identity is not active in this company');
  });
});

describe('what the shop is told', () => {
  it('previews an alias before saving it', () => {
    const preview = aliasConfirmation('za mbwa', 'Chakula cha mbwa', 'sw');
    expect(preview).toContain('za mbwa');
    expect(preview).toContain('Chakula cha mbwa');
    expect(preview).toContain('*1*');
  });

  it('admits when a taught meaning still will not know the product', () => {
    expect(semanticConfirmation('mzoga', null, 'sw')).toContain('Sitajua ni bidhaa gani');
    expect(semanticConfirmation('mzoga', 'Nyama ya ng’ombe', 'sw')).toContain('Nyama ya ng’ombe');
  });

  it('names the current meaning instead of overwriting it', () => {
    const clash = vocabularyConflict('nyama',
      { kind: 'product_alias', productName: 'Nyama ya mbuzi', meaning: null }, 'sw');
    expect(clash).toContain('tayari inatumika');
    expect(clash).toContain('Nyama ya mbuzi');
    expect(clash).toContain('Sitabadilisha kimya');
  });
});

describe('what Claude is given', () => {
  const rows = [
    { kind: 'product_alias', term: 'za mbwa', productName: 'Chakula cha mbwa', meaning: null },
    { kind: 'semantic_term', term: 'mzoga', productName: 'Nyama ya ng’ombe', meaning: 'stock_loss' },
  ];

  it('sends the shop’s words', () => {
    const block = vocabularyContext(rows);
    expect(block).toContain('za mbwa = Chakula cha mbwa');
    expect(block).toContain('mzoga = stock_loss');
  });

  it('sends no money at all', () => {
    const block = vocabularyContext(rows);
    // A price in a prompt is a price the model can restate wrongly.
    expect(block).not.toMatch(/[0-9]{3,}/);
    expect(block.toLowerCase()).not.toContain('tsh');
    expect(block).toContain('every figure still comes from a tool');
  });

  it('is bounded, and empty when the shop has taught nothing', () => {
    expect(vocabularyContext([])).toBe('');
    const many = Array.from({ length: 500 }, (_, index) => ({
      kind: 'product_alias', term: `t${index}`, productName: 'X', meaning: null,
    }));
    expect(vocabularyContext(many).split('\n').length).toBeLessThan(70);
  });
});
