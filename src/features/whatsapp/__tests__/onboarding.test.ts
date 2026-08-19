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

  it('asks what the business does before asking the polished person-name question', () => {
    const sw = advanceOnboarding('create_name', 'Duka la Asha', 'sw');
    expect(sw.step).toBe('create_description');
    expect(sw.reply).toContain('inauza nini');
    const classified = advanceOnboarding(sw.step, 'Nauza daftari, kalamu na photocopy', 'sw', sw.draft);
    expect(classified.step).toBe('create_category_confirm');
    expect(advanceOnboarding(classified.step, 'ndiyo', 'sw', classified.draft).reply).toBe('Wewe unaitwa nani?');

    const en = advanceOnboarding('create_name', 'Asha Shop', 'en');
    const enClassified = advanceOnboarding(en.step, 'I sell clothes and shoes', 'en', en.draft);
    expect(advanceOnboarding(enClassified.step, 'yes', 'en', enClassified.draft).reply).toBe('What is your name?');
  });

  it('does not guess at anything else', () => {
    expect(advanceOnboarding('menu', 'labda', 'sw').action.kind).toBe('none');
  });
});

describe('creating a business', () => {
  it('asks for the business, classifies it with confirmation, then asks the person and acts', () => {
    const a = advanceOnboarding('create_name', 'Duka la Asha', 'sw');
    expect(a.step).toBe('create_description');
    expect(a.draft.businessName).toBe('Duka la Asha');

    const b = advanceOnboarding(a.step, 'Nauza daftari, kalamu na kutoa photocopy', 'sw', a.draft);
    expect(b.step).toBe('create_category_confirm');
    expect(b.draft.businessSubCategory).toBe('Stationery na Fedha');
    const c = advanceOnboarding(b.step, 'NDIYO', 'sw', b.draft);
    expect(c.step).toBe('create_person');
    const d = advanceOnboarding(c.step, 'Asha Mwinyi', 'sw', c.draft);
    expect(d.action).toMatchObject({
      kind: 'create_business', businessName: 'Duka la Asha', fullName: 'Asha Mwinyi',
      category: 'Services & Micro-Manufacturing', subCategory: 'Stationery na Fedha',
    });
  });

  it('refuses a name too short to be one', () => {
    expect(advanceOnboarding('create_name', 'D', 'sw').step).toBe('create_name');
    expect(advanceOnboarding('create_person', '', 'sw').action.kind).toBe('none');
  });

  it('does not guess a category from a vague description and lets the person correct it', () => {
    const named = advanceOnboarding('create_name', 'Asha Ventures', 'sw');
    const vague = advanceOnboarding(named.step, 'nafanya biashara', 'sw', named.draft);
    expect(vague.step).toBe('create_description');
    expect(vague.reply).toContain('Sijaweza kutambua');

    const classified = advanceOnboarding(named.step, 'saluni ya nywele', 'sw', named.draft);
    const corrected = advanceOnboarding(classified.step, 'hapana', 'sw', classified.draft);
    expect(corrected.step).toBe('create_description');
    expect(corrected.draft.businessName).toBe('Asha Ventures');
    expect(corrected.draft.businessCategory).toBeUndefined();
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
