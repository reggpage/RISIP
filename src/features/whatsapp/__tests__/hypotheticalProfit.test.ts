import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildHypotheticalProfitReply,
  parseHypotheticalProfitRequest,
} from '../../../../supabase/functions/_shared/whatsappHypotheticalProfit';

describe('deterministic hypothetical product profit', () => {
  it('claims the exact failed live question without claiming ordinary period profit', () => {
    expect(parseHypotheticalProfitRequest('zikiuza atlasi zote nitakuwa na faida ya shingapi')).toBe('atlasi');
    expect(parseHypotheticalProfitRequest('If I sell all the atlases, what profit will I make?')).toBe('atlases');
    expect(parseHypotheticalProfitRequest('faida ya leo ni ngapi')).toBeNull();
  });

  it('calculates retail and wholesale scenarios from server-provided pieces', () => {
    const reply = buildHypotheticalProfitReply({
      productName: 'Atlasi', onHand: 14, hasCount: true, unit: null,
      unitCost: 10_000, retailPrice: 15_000, wholesalePrice: 13_000,
    }, 'sw');
    expect(reply).toContain('14 × (TSh 15,000 − TSh 10,000) = *TSh 70,000*');
    expect(reply).toContain('14 × (TSh 13,000 − TSh 10,000) = *TSh 42,000*');
    expect(reply).toContain('hayajaandika mauzo mapya');
  });

  it('names every missing piece instead of returning a retry-later error', () => {
    const reply = buildHypotheticalProfitReply({
      productName: 'Atlasi', onHand: null, hasCount: false, unit: null,
      unitCost: null, retailPrice: null, wholesalePrice: null,
    }, 'sw');
    expect(reply).toContain('stock count ya kuanzia');
    expect(reply).toContain('bei ya kununua');
    expect(reply).toContain('bei ya kuuza');
    expect(reply).not.toContain('jaribu tena');
  });

  it('does not claim stock or cost is missing when only the selling price is absent', () => {
    const reply = buildHypotheticalProfitReply({
      productName: 'Atlasi', onHand: 14, hasCount: true, unit: null,
      unitCost: 10_000, retailPrice: null, wholesalePrice: null,
    }, 'sw');
    expect(reply).toContain('bei ya kuuza');
    expect(reply).not.toContain('stock count ya kuanzia');
    expect(reply).not.toContain('- bei ya kununua');
  });

  it('routes the deterministic read before the conversational model', () => {
    const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    const deterministic = webhook.indexOf('parseHypotheticalProfitRequest(body)');
    const assistant = webhook.indexOf('const aiEligible = Boolean(body?.trim())');
    expect(deterministic).toBeGreaterThan(-1);
    expect(deterministic).toBeLessThan(assistant);
    expect(webhook).toContain("if (name === 'get_hypothetical_product_profit')");
    expect(webhook).toContain('return { content, terminalReply: content };');
  });
});
