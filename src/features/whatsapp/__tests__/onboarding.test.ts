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
    expect(advanceOnboarding('menu', '2', 'sw').step).toBe('join_code');
  });

  it('3 sends an existing user to the web to link, never asks for a password', () => {
    const r = advanceOnboarding('menu', '3', 'sw');
    expect(r.action.kind).toBe('explain_linking');
    expect(r.reply).toMatch(/Settings/);
    expect(r.reply).not.toMatch(/password|nywila/i);
  });

  it('does not guess at anything else', () => {
    expect(advanceOnboarding('menu', 'labda', 'sw').action.kind).toBe('none');
  });
});

describe('creating a business', () => {
  it('asks for the business, then the person, then acts', () => {
    const a = advanceOnboarding('create_name', 'Duka la Asha', 'sw');
    expect(a.step).toBe('create_person');
    expect(a.draft.businessName).toBe('Duka la Asha');

    const b = advanceOnboarding('create_person', 'Asha Mwinyi', 'sw', a.draft);
    expect(b.action).toEqual({ kind: 'create_business', businessName: 'Duka la Asha', fullName: 'Asha Mwinyi' });
  });

  it('refuses a name too short to be one', () => {
    expect(advanceOnboarding('create_name', 'D', 'sw').step).toBe('create_name');
    expect(advanceOnboarding('create_person', '', 'sw').action.kind).toBe('none');
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

    const r4 = advanceOnboarding(step, 'Asha', 'sw', draft);
    expect(r4.action).toEqual({ kind: 'create_business', businessName: 'Duka la Asha', fullName: 'Asha' });
  });
});

describe('switching business', () => {
  const rows = [
    { company_name: 'Duka la Asha', role: 'owner', is_active: true },
    { company_name: 'Mhandisi Consultancy', role: 'worker', is_active: false },
  ];

  it('is asked for in either language', () => {
    for (const s of ['biashara', 'business', 'switch', 'badilisha']) {
      expect(isSwitchRequest(s)).toBe(true);
    }
    expect(isSwitchRequest('nimeuza unga')).toBe(false);
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
    for (const s of ['ingia', 'login', 'log in', 'link']) {
      expect(isLoginRequest(s)).toBe(true);
    }
  });

  it('does not fire on ordinary talk', () => {
    expect(isLoginRequest('nimelipa boda 5000')).toBe(false);
  });
});
