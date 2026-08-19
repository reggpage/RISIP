import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classifyBusinessDescription,
  RISIP_BUSINESS_TAXONOMY,
  validateBusinessClassification,
} from '../../../../supabase/functions/_shared/whatsappBusinessClassifier';

describe('bounded WhatsApp business classification', () => {
  it('classifies a mixed-language stationery and mobile-money shop', () => {
    expect(classifyBusinessDescription('St. Ritha bookshop, nauza daftari na kalamu, photocopy na M-Pesa')).toMatchObject({
      category: 'Services & Micro-Manufacturing',
      sub_category: 'Stationery na Fedha',
    });
  });

  it('understands common Tanzanian slang without an AI call', () => {
    expect(classifyBusinessDescription('kijiwe chetu tunauza zege chipsi na kuku')).toMatchObject({
      category: 'Food & Beverages', sub_category: 'Kijiwe cha Chips',
    });
    expect(classifyBusinessDescription('nina duka la mafuta ya kula ya kupima kwa lita')).toMatchObject({
      category: 'Liquid & Bulk Refills', sub_category: 'Mafuta ya Kula ya Kupima',
    });
  });

  it('asks instead of guessing from a generic description', () => {
    expect(classifyBusinessDescription('nafanya biashara mbalimbali')).toBeNull();
    expect(classifyBusinessDescription('shop')).toBeNull();
  });

  it('accepts only the fixed category/subcategory mapping from untrusted structured output', () => {
    const valid = validateBusinessClassification({
      category: 'Retail & General Stores',
      sub_category: 'Hardware',
      confidence: 0.92,
      detected_keywords: ['hardware', 'mabati'],
      swahili_confirmation_message: 'Nimeelewa kuwa una hardware.',
    });
    expect(valid?.sub_category).toBe('Hardware');
    expect(validateBusinessClassification({ ...valid, sub_category: 'Stationery na Fedha' })).toBeNull();
    expect(validateBusinessClassification({ ...valid, category: 'Made up category' })).toBeNull();
    expect(validateBusinessClassification({ ...valid, confidence: 1.5 })).toBeNull();
  });

  it('keeps the approved taxonomy exact and finite', () => {
    expect(Object.keys(RISIP_BUSINESS_TAXONOMY)).toHaveLength(4);
    expect(RISIP_BUSINESS_TAXONOMY['Services & Micro-Manufacturing']).toContain('Stationery na Fedha');
  });

  it('keeps database persistence bounded and the old webhook signature compatible', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0112_business_classification.sql'), 'utf8');
    expect(migration).toContain('companies_business_subcategory_check');
    expect(migration).toContain('private.wa_create_business_classified');
    expect(migration).toContain('business_classification_confidence between 0 and 1');
    expect(migration).toContain('p_category text');
    expect(migration).toContain('p_subcategory text');
    expect(migration).toContain('Retain the old five-argument entry point');
    expect(migration).not.toMatch(/insert into (receipts|daily_records|invoices|reimbursement_payouts)/i);
  });
});
