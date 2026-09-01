import { describe, expect, it } from 'vitest';
import { advanceOnboarding, findInviteCode } from '../../../../supabase/functions/_shared/whatsappOnboarding';

// The registration menu used to accept a digit and little else, so anyone who
// answered it the way people actually talk was told "I did not understand".
describe('the menu understands sentences, not only digits', () => {
  const chose = (said: string) => advanceOnboarding('menu', said, 'sw').step;

  it('hears someone who wants to start a business', () => {
    for (const said of [
      '1',
      'nataka kufungua duka langu',
      'nataka kuanzisha biashara',
      'nianze biashara mpya',
      'I want to start a new business',
      'open a business',
    ]) {
      expect(chose(said), said).toBe('create_name');
    }
  });

  it('hears someone who was invited', () => {
    for (const said of [
      '2',
      'nataka kujiunga',
      'nimealikwa na bosi wangu',
      'nina kodi ya mwaliko',
      'I was invited',
      'join',
    ]) {
      expect(chose(said), said).toBe('join_code');
    }
  });

  it('does not let "biashara" pull a joining answer into creating one', () => {
    // Both menu answers contain the word, which is why joining is tested first.
    expect(chose('nataka kujiunga na biashara')).toBe('join_code');
    expect(chose('nataka kufungua biashara')).toBe('create_name');
  });

  it('hears someone who already has an account', () => {
    for (const said of ['3', 'nina akaunti tayari', 'nimesajili tayari', 'I already have an account']) {
      expect(advanceOnboarding('menu', said, 'sw').action.kind, said).toBe('explain_linking');
    }
  });

  it('skips the menu entirely when the person just pastes their code', () => {
    // They were sent a code and pasted it. Asking them to pick 1, 2 or 3 first
    // would be asking for something they have already given us.
    const next = advanceOnboarding('menu', 'KG4E94N6', 'sw');
    expect(next.step).toBe('join_person');
    expect(next.draft.code).toBe('KG4E94N6');
  });

  it('does not show the removed invite-introduction sentence', () => {
    const reply = advanceOnboarding('lang', 'KG4E94N6', 'sw').reply;
    expect(reply).toContain('Umealikwa kujiunga na biashara kwenye Risip');
    expect(reply).not.toContain('Nimepata namba yako ya mwaliko wa Risip');
  });

  it('goes from language to the invited person name, not the three-way menu', () => {
    const next = advanceOnboarding('lang', '2', 'en', { code: 'KG4E94N6' });
    expect(next.step).toBe('join_person');
    expect(next.action).toEqual({ kind: 'set_language', lang: 'en' });
    expect(next.reply).toMatch(/Your invite was found/i);
    expect(next.reply).toMatch(/What is your name/i);
    expect(next.reply).not.toMatch(/Start a new business|already have an account/i);
  });

  it('offers a way forward instead of only refusing', () => {
    const reply = advanceOnboarding('menu', 'sijui', 'sw').reply;
    expect(reply).toMatch(/mfano/);       // gives an example
    expect(reply).toMatch(/1[\s\S]*2/);   // and still shows the options
  });
});

describe('invite codes as they are really typed', () => {
  it('accepts an all-letter code', () => {
    // The generator draws from 23 letters and 8 digits, so roughly one code in
    // nine has no digit at all. Requiring one would reject real codes.
    expect(findInviteCode('KGDEZWNM')).toBe('KGDEZWNM');
  });

  it('accepts lowercase, spaced and hyphenated', () => {
    expect(findInviteCode('kg4e94n6')).toBe('KG4E94N6');
    expect(findInviteCode('KG4E 94N6')).toBe('KG4E94N6');
    expect(findInviteCode('kg4e-94n6')).toBe('KG4E94N6');
  });

  it('finds a code inside a sentence, but only once we have asked for one', () => {
    expect(findInviteCode('kodi yangu ni KG4E94N6', true)).toBe('KG4E94N6');
    expect(findInviteCode('kodi yangu ni KG4E94N6')).toBeNull();
  });

  it('does not mistake an ordinary eight-letter word for a code', () => {
    // O, I, L, 0 and 1 are not in the code alphabet, which is what most real
    // words trip over.
    for (const word of ['BOOKSHOP', 'DUKALANGU'.slice(0, 8), 'BIASHARA']) {
      expect(findInviteCode(word, true), word).toBeNull();
    }
  });

  it('rejects the wrong length rather than guessing', () => {
    expect(findInviteCode('KG4E94N')).toBeNull();
    expect(findInviteCode('KG4E94N67')).toBeNull();
  });

  it('names the format and the way out when a code is wrong', () => {
    const reply = advanceOnboarding('join_code', 'nope', 'sw').reply;
    expect(reply).toMatch(/8/);
    expect(reply).toMatch(/owner/);
  });
});

describe('asking for a name', () => {
  it('asks for a person by example, not for "a name"', () => {
    expect(advanceOnboarding('create_person', 'x', 'sw').reply).toMatch(/jina lako/);
    expect(advanceOnboarding('join_person', 'x', 'sw').reply).toMatch(/jina lako/);
  });

  it('still asks for a business name at the business step', () => {
    expect(advanceOnboarding('create_name', 'x', 'sw').reply).toMatch(/biashara/);
  });
});
