import { describe, expect, it } from 'vitest';
import {
  advanceOnboarding,
  businessList,
  isLoginRequest,
  isSwitchRequest,
  parseBusinessChoice,
  startOnboarding,
  type OnboardingStep,
} from '../../../../supabase/functions/_shared/whatsappOnboarding';

// The sign-up conversation for a number Risip has never seen. Pure, so it can be
// walked end to end here; the database rules it eventually calls are tested
// separately in SQL.

describe('an unknown number is met with a language question, not a dead end', () => {
  it('opens bilingually, because we do not know them yet', () => {
    const r = startOnboarding();
    expect(r.step).toBe('lang');
    expect(r.reply).toMatch(/Chagua lugha \/ Choose a language/);
    expect(r.action.kind).toBe('none');
  });

  it('accepts a number or the language name', () => {
    expect(advanceOnboarding('lang', '1', 'en').action).toEqual({ kind: 'set_language', lang: 'sw' });
    expect(advanceOnboarding('lang', '2', 'en').action).toEqual({ kind: 'set_language', lang: 'en' });
    expect(advanceOnboarding('lang', 'kiswahili', 'en').action).toEqual({ kind: 'set_language', lang: 'sw' });
  });

  it('re-asks rather than guessing', () => {
    const r = advanceOnboarding('lang', 'nini?', 'en');
    expect(r.step).toBe('lang');
    expect(r.action.kind).toBe('none');
  });
});

describe('the three ways in', () => {
  it('1 starts a business', () => {
    expect(advanceOnboarding('menu', '1', 'sw').step).toBe('create_name');
  });

  it('2 joins one with a code', () => {
    const menu = advanceOnboarding('lang', '1', 'en');
    expect(menu.reply).toContain('Jiunge na biashara niliyoalikwa');
    expect(advanceOnboarding('menu', '2', 'sw').step).toBe('join_code');
  });

  it('3 sends an existing user to the web to link, never asks for a password', () => {
    const r = advanceOnboarding('menu', '3', 'sw');
    expect(r.action.kind).toBe('explain_linking');
    expect(r.reply).toMatch(/Settings/);
    expect(r.reply).not.toMatch(/password|nywila/i);
  });

  it('takes the description as given and goes straight to the name', () => {
    // The owner's instruction: "mwache mtu tu ajielezee, akituma mjibu sawa
    // nimekuelewa na swali wewe unaitwa nani?". Nobody is asked to agree with a
    // label they did not choose — a wholesaler was being asked to confirm it
    // was "Rejareja", and saying no to that is not onboarding, it is an
    // argument.
    const sw = advanceOnboarding('create_name', 'Duka la Asha', 'sw');
    expect(sw.step).toBe('create_description');
    expect(sw.reply).toContain('inauza nini');
    const said = advanceOnboarding(sw.step, 'Nauza daftari, kalamu na photocopy', 'sw', sw.draft);
    expect(said.step).toBe('create_person');
    expect(said.reply).toBe('Sawa, nimekuelewa.\n\nWewe unaitwa nani?');
    // Kept for the AI and for the welcome examples, never read back at them.
    expect(said.draft.businessDescription).toBe('Nauza daftari, kalamu na photocopy');
    expect(said.draft.businessSubCategory).toBe('Stationery na Fedha');

    const en = advanceOnboarding('create_name', 'Asha Shop', 'en');
    const enSaid = advanceOnboarding(en.step, 'I sell clothes and shoes', 'en', en.draft);
    expect(enSaid.reply).toBe('Got it, thank you.\n\nWhat is your name?');
  });

  it('does not guess at anything else', () => {
    expect(advanceOnboarding('menu', 'labda', 'sw').action.kind).toBe('none');
  });
});

describe('creating a business', () => {
  it('asks for the business, keeps what they said, then asks the person and acts', () => {
    const a = advanceOnboarding('create_name', 'Duka la Asha', 'sw');
    expect(a.step).toBe('create_description');
    expect(a.draft.businessName).toBe('Duka la Asha');

    const b = advanceOnboarding(a.step, 'Nauza daftari, kalamu na kutoa photocopy', 'sw', a.draft);
    expect(b.step).toBe('create_person');
    expect(b.draft.businessSubCategory).toBe('Stationery na Fedha');
    const c = advanceOnboarding(b.step, 'Asha Mwinyi', 'sw', b.draft);
    expect(c.action).toMatchObject({
      kind: 'create_business', businessName: 'Duka la Asha', fullName: 'Asha Mwinyi',
      category: 'Services & Micro-Manufacturing', subCategory: 'Stationery na Fedha',
      description: 'Nauza daftari, kalamu na kutoa photocopy',
    });
  });

  it('finishes signup even when the trade cannot be named', () => {
    // A classification we cannot make is not a reason to refuse somebody a
    // business. The description is kept; the welcome falls back to general
    // examples.
    const a = advanceOnboarding('create_name', 'Kwa Mzee', 'sw');
    const b = advanceOnboarding(a.step, 'nafanya vitu vingi vya hapa mtaani', 'sw', a.draft);
    expect(b.step).toBe('create_person');
    const c = advanceOnboarding(b.step, 'Mzee Juma', 'sw', b.draft);
    expect(c.action).toMatchObject({
      kind: 'create_business', category: null, subCategory: null,
      description: 'nafanya vitu vingi vya hapa mtaani',
    });
  });

  it('refuses a name too short to be one', () => {
    expect(advanceOnboarding('create_name', 'D', 'sw').step).toBe('create_name');
    expect(advanceOnboarding('create_person', '', 'sw').action.kind).toBe('none');
  });

  it('keeps a description it cannot classify, without labelling the shop', () => {
    const named = advanceOnboarding('create_name', 'Asha Ventures', 'sw');
    const vague = advanceOnboarding(named.step, 'nafanya biashara', 'sw', named.draft);
    expect(vague.step).toBe('create_person');
    expect(vague.draft.businessDescription).toBe('nafanya biashara');
    // No guess is stored, so the welcome shows the general examples rather than
    // somebody else's trade.
    expect(vague.draft.businessCategory).toBeUndefined();

    const clear = advanceOnboarding(named.step, 'saluni ya nywele', 'sw', named.draft);
    expect(clear.draft.businessSubCategory).toBe('Saluni');
  });

  it('trims runaway input rather than storing it whole', () => {
    const long = 'x'.repeat(300);
    const r = advanceOnboarding('create_name', long, 'en');
    expect(r.draft.businessName).toHaveLength(80);
  });
});

describe('joining with a code', () => {
  it('normalises what people actually type', () => {
    expect(advanceOnboarding('join_code', 'kg4e-94n6', 'sw').draft.code).toBe('KG4E94N6');
    expect(advanceOnboarding('join_code', ' kg4e 94n6 ', 'sw').draft.code).toBe('KG4E94N6');
  });

  it('refuses anything that is not eight characters', () => {
    expect(advanceOnboarding('join_code', 'ABC', 'sw').step).toBe('join_code');
    expect(advanceOnboarding('join_code', 'ABCDEFGHIJ', 'sw').step).toBe('join_code');
  });

  it('asks who they are before joining them to anything', () => {
    const a = advanceOnboarding('join_code', 'KG4E94N6', 'sw');
    expect(a.step).toBe('join_person');
    const b = advanceOnboarding('join_person', 'Juma', 'sw', a.draft);
    expect(b.action).toEqual({ kind: 'join_business', code: 'KG4E94N6', fullName: 'Juma' });
  });
});

describe('a whole conversation, start to finish', () => {
  it('walks from stranger to business owner', () => {
    let step: OnboardingStep = startOnboarding().step;
    let draft: Record<string, string> = {};

    const r1 = advanceOnboarding(step, '1', 'en', draft);          // Kiswahili
    expect(r1.action).toEqual({ kind: 'set_language', lang: 'sw' });
    step = r1.step;

    const r2 = advanceOnboarding(step, '1', 'sw', draft);           // new business
    step = r2.step; draft = r2.draft;

    const r3 = advanceOnboarding(step, 'Duka la Asha', 'sw', draft);
    step = r3.step; draft = r3.draft;

    const r4 = advanceOnboarding(step, 'Nauza daftari na kutoa photocopy', 'sw', draft);
    step = r4.step; draft = r4.draft;

    const r5 = advanceOnboarding(step, 'ndiyo', 'sw', draft);
    step = r5.step; draft = r5.draft;

    const r6 = advanceOnboarding(step, 'Asha', 'sw', draft);
    expect(r6.action).toMatchObject({
      kind: 'create_business', businessName: 'Duka la Asha', fullName: 'Asha',
      subCategory: 'Stationery na Fedha',
    });
  });
});

describe('switching business', () => {
  const rows = [
    { company_name: 'Duka la Asha', role: 'owner', is_active: true },
    { company_name: 'Mhandisi Consultancy', role: 'worker', is_active: false },
  ];

  it('is asked for in either language', () => {
    for (const s of [
      'biashara', 'business', 'switch', 'badilisha',
      'nataka kubadilisha biashara',
      'nipe orodha ya biashara zangu',
      'switch to another business',
      'which company am I currently using?',
    ]) {
      expect(isSwitchRequest(s)).toBe(true);
    }
    expect(isSwitchRequest('nimeuza unga')).toBe(false);
    expect(isSwitchRequest('biashara yangu imefanyaje leo?')).toBe(false);
    expect(isSwitchRequest('business sales today')).toBe(false);
  });

  it('shows which one is active', () => {
    const list = businessList(rows, 'sw');
    expect(list).toMatch(/1\. Duka la Asha ✅/);
    expect(list).toMatch(/2\. Mhandisi Consultancy/);
  });

  it('reads only an index into the list we just sent', () => {
    expect(parseBusinessChoice('2', 2)).toBe(1);
    expect(parseBusinessChoice('1', 2)).toBe(0);
  });

  it('refuses anything outside that list, including a pasted id', () => {
    expect(parseBusinessChoice('3', 2)).toBeNull();
    expect(parseBusinessChoice('0', 2)).toBeNull();
    expect(parseBusinessChoice('f605c3d3-b9a4-49bd-9937-5ca456de54f9', 2)).toBeNull();
  });
});

describe('asking for a way in to the web', () => {
  it('recognises the request in either language', () => {
    for (const s of [
      'ingia',
      'login',
      'log in',
      'link',
      'Nipe link yakulogin nichek dashboard',
      'naomba link ya kuingia',
      'nataka kuingia kwenye dashboard',
      'send me a login link',
      'how can I login?',
      'open the dashboard login link',
    ]) {
      expect(isLoginRequest(s)).toBe(true);
    }
  });

  it('does not fire on ordinary talk', () => {
    expect(isLoginRequest('nimelipa boda 5000')).toBe(false);
    expect(isLoginRequest('nitumie link ya invoice')).toBe(false);
    expect(isLoginRequest('dashboard ya mauzo inaonyesha nini?')).toBe(false);
  });
});

describe('the guess is never argued about', () => {
  it('never asks the Bakery question that started the loop', () => {
    // "Allen's cake" + "I sell food" was classified Bakery, refused, and
    // classified Bakery again. The fix that survived is not a better guess —
    // it is not asking. The label is ours; the description is theirs.
    let step = 'create_name';
    let draft: Record<string, string> = {};
    const say = (text: string) => {
      const next = advanceOnboarding(step as never, text, 'en', draft);
      step = next.step;
      draft = next.draft ?? draft;
      return next.reply;
    };
    say("Allen's cake");
    const after = say('I sell food');
    expect(after).not.toMatch(/Bakery/);
    expect(after).not.toMatch(/Is that right|YES or NO/i);
    expect(after).toBe('Got it, thank you.\n\nWhat is your name?');
    expect(step).toBe('create_person');
  });

  it('lets a conversation parked on the old question through', () => {
    // Somebody was mid-signup when the question was removed. Whatever they
    // answer, they move on; nobody is asked it a second time.
    for (const answer of ['ndiyo', 'hapana', 'sijui']) {
      const next = advanceOnboarding('create_category_confirm' as never, answer, 'sw', {
        businessName: 'X', businessSubCategory: 'Bakery',
      });
      expect(next.step, answer).toBe('create_person');
      expect(next.reply, answer).toBe('Wewe unaitwa nani?');
    }
  });
});

describe('the words the welcome teaches all work', () => {
  it('opens the web app for every word it offers', () => {
    for (const word of ['ingia', 'login', 'dashboard', 'dashbodi', 'nataka dashboard', 'nionyeshe dashboard']) {
      expect(isLoginRequest(word), word).toBe(true);
    }
  });

  it('does not read a sale as a request for a link', () => {
    for (const other of ['nimeuza daftari 5', 'faida ya leo', 'naongeza sukari 20']) {
      expect(isLoginRequest(other), other).toBe(false);
    }
  });
});
