import { describe, expect, it } from 'vitest';
import {
  logoutConfirmation,
  logoutDisambiguation,
  logoutDone,
  logoutFailed,
  logoutNotLinked,
  logoutReask,
  parseDisambiguationChoice,
  parseLogoutIntent,
} from '../../../../supabase/functions/_shared/whatsappLogout';
import { retrieveRisipKnowledge } from '../../../../supabase/functions/_shared/risipKnowledge';

// The stop command as the webhook defines it. Copied rather than imported
// because the webhook is a Deno entrypoint; the point of the copy is to prove
// the two matchers agree about who owns "toka".
const isStopCommand = (text: string) =>
  /^(?:toka|futa|cancel|ghairi|start over|anza upya|acha|sitisha)\b/i.test(text.trim());

describe('logout intent', () => {
  it('recognises the plain ways people ask to leave', () => {
    for (const said of [
      'logout', 'log out', 'Logout', 'sign out', 'nataka kulogout',
      'ondoa namba hii', 'ondoa hii namba', 'toa namba yangu',
      'jiondoe', 'niondoe kwenye risip', 'unlink', 'disconnect',
    ]) {
      expect(parseLogoutIntent(said), said).toBe('explicit');
    }
  });

  it('treats bare "toka" as ambiguous rather than guessing', () => {
    expect(parseLogoutIntent('toka')).toBe('ambiguous');
    expect(parseLogoutIntent('nataka kutoka')).toBe('ambiguous');
    expect(parseLogoutIntent('nataka kuondoka')).toBe('ambiguous');
  });

  it('leaves ordinary business talk alone', () => {
    for (const said of [
      'mauzo ya leo ni ngapi',
      'Asha amelipa 10000',
      'nimeuza sukari 5 kwa 12000',
      'nipe link ya login',
      'nani ananidai',
    ]) {
      expect(parseLogoutIntent(said), said).toBeNull();
    }
  });

  it('does not steal the words that only ever mean cancel', () => {
    // These stay with the stop command; logout must not claim them.
    for (const said of ['futa', 'ghairi', 'cancel', 'acha', 'sitisha']) {
      expect(parseLogoutIntent(said), said).toBeNull();
      expect(isStopCommand(said), said).toBe(true);
    }
  });

  it('is the only matcher that disagrees with the stop command, and only on "toka"', () => {
    // "toka" is genuinely two words in one. Everything the stop command claims
    // is either unambiguous cancel, or this one word we now ask about.
    const contested = ['toka', 'futa', 'cancel', 'ghairi', 'anza upya', 'acha', 'sitisha']
      .filter((word) => parseLogoutIntent(word) !== null);
    expect(contested).toEqual(['toka']);
  });
});

describe('disambiguation', () => {
  it('reads a numeric choice', () => {
    expect(parseDisambiguationChoice('1')).toBe('cancel');
    expect(parseDisambiguationChoice('2')).toBe('logout');
    expect(parseDisambiguationChoice('2 tafadhali')).toBe('logout');
  });

  it('returns null for an answer it cannot read, so the caller re-asks', () => {
    expect(parseDisambiguationChoice('sijui')).toBeNull();
    expect(parseDisambiguationChoice('')).toBeNull();
    expect(parseDisambiguationChoice('ndiyo')).toBeNull();
  });
});

describe('what the person is told', () => {
  it('says what survives before asking them to confirm', () => {
    const sw = logoutConfirmation('St. Ritha bookshop', 'sw');
    expect(sw).toContain('St. Ritha bookshop');
    expect(sw).toMatch(/zitabaki salama/);
    expect(sw).toContain('*1*');
    const en = logoutConfirmation('St. Ritha bookshop', 'en');
    expect(en).toMatch(/stay safe/);
    expect(en).toMatch(/YES/);
  });

  it('tells them how to come back', () => {
    expect(logoutDone('St. Ritha bookshop', 'sw')).toMatch(/kodi/);
    expect(logoutDone('St. Ritha bookshop', 'en')).toMatch(/code/);
  });

  it('says the number is still connected when the unlink did not happen', () => {
    // The one thing somebody must not be left guessing about after a failure.
    expect(logoutFailed('sw')).toMatch(/bado imeunganishwa/);
    expect(logoutFailed('en')).toMatch(/still connected/);
    expect(logoutNotLinked('sw')).toMatch(/haijaunganishwa/);
    expect(logoutNotLinked('en')).toMatch(/not connected/);
  });

  it('re-asks without scolding', () => {
    for (const lang of ['sw', 'en'] as const) {
      for (const step of ['disambiguate', 'confirm'] as const) {
        expect(logoutReask(step, lang)).not.toMatch(/invalid|error|wrong|makosa/i);
      }
    }
    expect(logoutDisambiguation('sw')).toMatch(/1[\s\S]*2/);
  });
});

// Every one of these was typed by a real person into the live number. The four
// marked below returned the generic fallback before this change.
describe('phrases from the production transcript', () => {
  const asked = (text: string) => retrieveRisipKnowledge(text, 'sw').map((chunk) => chunk.id);

  it('answers "how do I join" with joining, not with registering a new business', () => {
    expect(asked('nataka kujiunga nafanyaje')).toContain('whatsapp-invites'); // was a MISS
  });

  it('answers a question about receipts despite the typo', () => {
    expect(asked('Expenses za risit ni shingapi so far?')).toContain('receipts'); // was a MISS
  });

  it('answers both ways of asking to leave', () => {
    expect(asked('nataka kutoka')).toContain('whatsapp-logout'); // was a MISS
    expect(asked('logout')).toContain('whatsapp-logout'); // was a MISS
  });

  it('still answers the ones that already worked', () => {
    expect(asked('nipe link yakulogin nichek dashboard')).toContain('whatsapp-login');
    expect(asked('nani anadaiwa')).toContain('debts');
  });

  it('knows the word for profit at all', () => {
    // "faida" appeared in no keyword list, so the most common finance question
    // in the language the app is written in could not be retrieved.
    expect(asked('faida yangu ni ngapi').length).toBeGreaterThan(0);
  });

  it('does not answer a joining question with flour', () => {
    // Stemming "jiunga" too aggressively yields "unga". Guard the boundary.
    expect(asked('nataka kujiunga')).not.toContain('stock-boundary');
  });
});
