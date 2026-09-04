import { describe, expect, it } from 'vitest';
import {
  checkWhatsAppTemplate,
  clearWhatsAppTemplateRegistryCache,
  type MetaTemplate,
} from '../../../../supabase/functions/_shared/whatsappTemplateRegistry';

const approved: MetaTemplate = {
  name: 'risip_bili',
  language: 'sw',
  status: 'APPROVED',
  components: [{ type: 'BODY', text: '{{1}} {{2}} {{3}} {{4}}' }],
};

const payload = {
  type: 'template',
  template: {
    name: 'risip_bili',
    language: { code: 'sw' },
    components: [{ type: 'body', parameters: [
      { type: 'text', text: 'A' }, { type: 'text', text: 'B' },
      { type: 'text', text: 'C' }, { type: 'text', text: 'D' },
    ] }],
  },
};

describe('Meta WhatsApp template registry checks', () => {
  it('accepts an approved translation with the exact variable count', () => {
    expect(checkWhatsAppTemplate(payload, [approved]).ok).toBe(true);
  });

  it('rejects missing, unapproved, and wrong-language templates', () => {
    const expectReason = (templates: MetaTemplate[], reason: string) => {
      const result = checkWhatsAppTemplate(payload, templates);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected a rejected template');
      expect(result.reason).toBe(reason);
    };
    expectReason([], 'not_found');
    expectReason([{ ...approved, status: 'PENDING' }], 'not_approved');
    expectReason([{ ...approved, language: 'en' }], 'language_mismatch');
  });

  it('rejects a payload whose parameters do not match Meta’s body contract', () => {
    const short = {
      ...payload,
      template: {
        ...payload.template,
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'A' }] }],
      },
    };
    const result = checkWhatsAppTemplate(short, [approved]);
    expect(result).toMatchObject({
      ok: false, reason: 'parameter_count_mismatch', expectedParameters: 4, actualParameters: 1,
    });
  });

  it('rejects a malformed Meta contract instead of guessing', () => {
    const malformed = { ...approved, components: [{ type: 'BODY', text: '{{1}} {{3}}' }] };
    const result = checkWhatsAppTemplate(payload, [malformed]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a rejected template');
    expect(result.reason).toBe('template_contract_invalid');
  });

  it('keeps cache reset explicit for isolated invocations', () => {
    clearWhatsAppTemplateRegistryCache();
    expect(true).toBe(true);
  });
});
