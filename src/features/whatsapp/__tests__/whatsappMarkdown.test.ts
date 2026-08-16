import { describe, expect, it } from 'vitest';
import { toWhatsAppText } from '../../../../supabase/functions/_shared/whatsappMarkdown';

describe('the stars the owner could see', () => {
  it('turns Markdown bold into WhatsApp bold', () => {
    // What actually arrived: "· *Record transactions* — sales, expenses…"
    expect(toWhatsAppText('**Record transactions** — sales'))
      .toBe('*Record transactions* — sales');
  });

  it('leaves WhatsApp bold exactly as it is', () => {
    expect(toWhatsAppText('Jibu *NDIYO* kuthibitisha')).toBe('Jibu *NDIYO* kuthibitisha');
  });

  it('leaves WhatsApp italic alone, because it is already correct', () => {
    expect(toWhatsAppText('_Bei ni zile ulizoziweka mwenyewe._'))
      .toBe('_Bei ni zile ulizoziweka mwenyewe._');
  });

  it('handles bold-italic and underscore bold', () => {
    expect(toWhatsAppText('***muhimu***')).toBe('*muhimu*');
    expect(toWhatsAppText('__muhimu__')).toBe('*muhimu*');
  });

  it('turns a heading into bold on its own line', () => {
    expect(toWhatsAppText('## Muhtasari wa leo\nMauzo 5,000'))
      .toBe('*Muhtasari wa leo*\nMauzo 5,000');
  });

  it('turns a Markdown link into a tappable one', () => {
    expect(toWhatsAppText('[rekodi zako](https://risip.online/daily-records)'))
      .toBe('rekodi zako (https://risip.online/daily-records)');
  });

  it('turns list markers into bullets a phone renders', () => {
    expect(toWhatsAppText('* daftari\n- kalamu')).toBe('• daftari\n• kalamu');
  });

  it('drops code fences and backticks, which WhatsApp shows raw', () => {
    expect(toWhatsAppText('```\nnimeuza daftari 10\n```')).toBe('nimeuza daftari 10');
    expect(toWhatsAppText('andika `nimeuza daftari 10`')).toBe('andika nimeuza daftari 10');
  });
});

describe('what it must not damage', () => {
  it('leaves multiplication signs and money alone', () => {
    const line = '  • daftari: 10 × TSh 1,500 = TSh 15,000';
    expect(toWhatsAppText(line)).toBe(line);
  });

  it('leaves an ordinary sentence untouched', () => {
    expect(toWhatsAppText('Kwa wiki hii bado hakuna mauzo yaliyorekodiwa.'))
      .toBe('Kwa wiki hii bado hakuna mauzo yaliyorekodiwa.');
  });

  it('does not turn a lone asterisk into bold', () => {
    expect(toWhatsAppText('bei ni 5000 * 3')).toBe('bei ni 5000 * 3');
  });

  it('keeps an invite code readable', () => {
    expect(toWhatsAppText('Namba ya siri: **U7F5A7Z5**')).toBe('Namba ya siri: *U7F5A7Z5*');
  });
});
