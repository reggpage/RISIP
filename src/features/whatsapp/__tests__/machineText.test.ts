import { describe, expect, it } from 'vitest';
import { looksLikeMachineText } from '../../../../supabase/functions/_shared/whatsappMachineText';

// The backstop at the one door every outgoing WhatsApp message passes through.
// Twice a machine payload reached a real shopkeeper — the adviser's evidence
// dump, and the ADVISER MODE prompt block — because a single branch read the
// wrong field. This guarantees that whatever branch grabs the wrong string, the
// shop never sees the machinery.

describe('catching text meant for the model, not the shop', () => {
  it('blocks the adviser evidence dump', () => {
    const evidence = [
      'business=St. Ritha bookshop',
      'period=mwezi huu',
      'revenue=2393250',
      'expenses=25700',
      'top_mover=nguvu ya sala|qty=55|revenue=542300|margin=102300',
      'out_of_stock=Birika',
    ].join('\n');
    expect(looksLikeMachineText(evidence)).toBe(true);
  });

  it('blocks a leaked prompt block', () => {
    expect(looksLikeMachineText('ADVISER MODE (get_business_advice)\n- Speak as a trusted MD…')).toBe(true);
    expect(looksLikeMachineText('BUSINESS RULES\n\nWHY SALES MOVED')).toBe(true);
  });

  // The whole point is that it must NEVER swallow a real answer. Every string
  // here is something Risip legitimately sends.
  it('lets every real answer through', () => {
    const real = [
      'Ndiyo — mwezi huu unaauza bidhaa 2 chini ya gharama:\n• Velvet napkin — −TSh 1,200\n• Sodaa — −TSh 100',
      'daftari: zimebaki 90.\nTangu ulipohesabu 15 Aug 2026: umeingiza 0, umeuza 10.',
      '✅ Bei za velvet napkin zimehifadhiwa.',
      'Mauzo ya leo: TSh 41,200',
      '📊 *Tathmini ya takwimu*\n• Mauzo mwezi huu: *TSh 2,393,250*',
      'Bei ya daftari: rejareja TSh 1,500, jumla TSh 1,300.',
      // A shopkeeper's own message shape — a stray "=" must not trip it.
      'ongeza daftari = 20',
    ];
    for (const text of real) {
      expect(looksLikeMachineText(text), text.slice(0, 40)).toBe(false);
    }
  });

  it('ignores empty and whitespace', () => {
    expect(looksLikeMachineText('')).toBe(false);
    expect(looksLikeMachineText('   \n  ')).toBe(false);
    expect(looksLikeMachineText(null)).toBe(false);
    expect(looksLikeMachineText(undefined)).toBe(false);
  });

  // One or two key=value lines can appear in ordinary text; it is the density
  // that gives a machine dump away.
  it('does not trip on one or two incidental key-value lines', () => {
    expect(looksLikeMachineText('bei=1500 ni sawa?')).toBe(false);
    expect(looksLikeMachineText('unit=kilo\nbei ni 2800')).toBe(false);
  });
});
