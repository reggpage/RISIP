import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// PHASE 5 PART 3 — the parser's linguistic output wired to the deterministic
// unit and pricing engine proven in phase 4.
//
// Proven end to end against production in a rolled-back transaction:
//
//   alias resolves                Chakula cha mbwa test | alias
//   price 4 kifuko                base 4.000000 kilo @2000.00 (derived) = 8000.00
//   draft                         8000.00 | cash | pending_confirmation
//   line stored canonically       Chakula cha mbwa test | 4.000 kifuko | base 4.000000 kilo
//   stock while pending           0 (was 0)
//   stock after confirm           -4.000000

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const webhook = src('supabase/functions/whatsapp-webhook/index.ts');

describe('a measure the trader said out loud', () => {
  it('resolves the wording, then finds the measure with the existing matcher', () => {
    // No second lookup and no Bucha branch: the same matcher that has always
    // handled "nyama ya ngombe mishikaki".
    expect(webhook).toContain('if (item.spokenUnit && item.productWithoutUnit) {');
    expect(webhook).toContain('await resolveProductForRead(db, identity, item.productWithoutUnit)');
    expect(webhook).toContain('`${canonical.productName} ${item.spokenUnit}`, declaredUnits)');
  });
});

describe('no measure stated', () => {
  it('uses the only configured one, and asks when there are several', () => {
    expect(webhook).toContain('const forProduct = declaredUnits.filter(');
    expect(webhook).toContain('if (!item.spokenUnit && forProduct.length > 1) {');
    expect(webhook).toContain('portionUnitRequired(');
    expect(webhook).toContain('if (!item.spokenUnit && forProduct.length === 1) {');
  });

  it('infers from what THIS shop configured, never from the kind of business', () => {
    const branch = webhook.slice(webhook.indexOf('const forProduct = declaredUnits.filter('));
    expect(branch.slice(0, 900)).not.toMatch(/business_category|subcategory|bucha/i);
  });
});

describe('where the money comes from', () => {
  it('asks the database what a measure is worth instead of multiplying', () => {
    // A kifuko that holds a kilo carries no price, because the kilo has one.
    expect(webhook).toContain("await db.rpc('wa_price_sale_unit', {");
    expect(webhook).toContain('p_quantity: item.quantity,');
    expect(webhook).toContain('retail: unitPrice,');
    expect(webhook).toContain("...(occurredAt ? { p_priced_at: occurredAt } : {}),");
  });

  it('only derives for a declared measure that has no price of its own', () => {
    expect(webhook).toContain(
      'if (!item.declared || (occurredAt === null && item.declared.retail !== null)) continue;',
    );
  });
});

describe('the catalogue agrees with itself', () => {
  const migration = src('supabase/migrations/0127_a_configured_product_is_a_product.sql');

  // MEASURED while proving the chain: a product created with a base unit and a
  // price was visible to company_product_catalog and invisible to
  // company_product_names, so an alias could not be attached to it.
  it('counts a configured product as a product', () => {
    expect(migration).toContain('configured as (');
    expect(migration).toContain('where u.company_id = p_company_id and u.is_base');
    expect(migration).toContain('union select name from configured');
  });
});
