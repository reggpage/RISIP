import { describe, expect, it } from 'vitest';
import { toWhatsAppText } from '../../../../supabase/functions/_shared/whatsappMarkdown';
import { periodDates } from '../../../../supabase/functions/_shared/whatsappReadTools';

// FOUR THINGS THE OWNER PHOTOGRAPHED, in his own order.
//
// "ai inatumia kiswahili kibovu sana", "rosali ya maria sio kitabu",
// "haijui hata tarehe exactly", "no stars". Three are rules in the prompt and
// are asserted where the prompt is asserted. The two with real logic behind
// them are here.

describe('a star the reader can see is worse than no emphasis', () => {
  it('unwraps emphasis WhatsApp will not render', () => {
    // MEASURED: "Harakati: *+43%*." arrived with both stars visible. WhatsApp
    // turns *...* bold only when letters or digits hug the markers, and a
    // leading "+" kills it.
    expect(toWhatsAppText('Harakati: *+43%*.')).toBe('Harakati: +43%.');
    expect(toWhatsAppText('Ongezeko la *+12,500* leo.')).toBe('Ongezeko la +12,500 leo.');
  });

  it('keeps the bold that does render', () => {
    expect(toWhatsAppText('**Feni hisens** imeuza vizuri.')).toBe('*Feni hisens* imeuza vizuri.');
    expect(toWhatsAppText('*Restock haraka* — Birika.')).toBe('*Restock haraka* — Birika.');
    expect(toWhatsAppText('Mauzo *TSh 727,900* leo.')).toBe('Mauzo *TSh 727,900* leo.');
  });

  it('never lets an orphaned marker through', () => {
    // An unpaired marker hugging a word can only ever render as itself.
    expect(toWhatsAppText('Faida *ni kubwa sana')).toBe('Faida ni kubwa sana');
    expect(toWhatsAppText('Mauzo yamepanda* leo')).toBe('Mauzo yamepanda leo');
  });

  it('leaves the trader’s multiplication sign alone', () => {
    // Space on both sides is arithmetic, not a broken bold marker, and the
    // shop writes it that way when working out a price.
    expect(toWhatsAppText('bei ni 5000 * 3')).toBe('bei ni 5000 * 3');
  });

  it('still turns a star bullet into a bullet', () => {
    expect(toWhatsAppText('* Birika\n* Sodaa')).toBe('• Birika\n• Sodaa');
  });
});

describe('a figure has to belong to a day the shop can check', () => {
  const at = (iso: string) => new Date(iso);

  it('names one day when the window is one day', () => {
    // 09:00 EAT on the 28th.
    expect(periodDates('today', null, at('2026-08-28T06:00:00Z'))).toBe('2026-08-28');
  });

  it('names both ends when the window is longer', () => {
    const span = periodDates('month', null, at('2026-08-28T06:00:00Z'));
    expect(span).toBe('2026-08-01..2026-08-28');
  });

  it('reads a resolved range from its own dates, not its label', () => {
    // `to` is exclusive: the last real day is the instant before it.
    const range = {
      from: at('2026-08-26T21:00:00Z'), to: at('2026-08-27T21:00:00Z'),
      timeOfDay: null, sw: 'juzi', en: 'the day before yesterday',
    };
    expect(periodDates('today', range, at('2026-08-28T06:00:00Z'))).toBe('2026-08-27');
  });

  it('is what the summary hands the model', async () => {
    const { businessSummaryFacts, calculateBusinessSummary } =
      await import('../../../../supabase/functions/_shared/whatsappReadTools');
    const facts = businessSummaryFacts(calculateBusinessSummary([]), 'month', 'sw', null);
    // "wiki hii" alone is what the owner objected to: "inasema juma, sasa hii
    // ndio nini". The label stays; the dates travel with it.
    expect(facts).toContain('period=mwezi huu');
    expect(facts).toMatch(/period_dates=\d{4}-\d{2}-\d{2}/);
  });
});
