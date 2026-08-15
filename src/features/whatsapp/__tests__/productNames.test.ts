import { describe, expect, it } from 'vitest';
import {
  findNameWarnings,
  findNearProduct,
  isNearName,
  nameWarningText,
  productKey,
} from '../../../../supabase/functions/_shared/whatsappProductNames';

// What the shop already sells, as the catalogue holds it.
const EXISTING = [
  'Biblia', 'Biblia Kubwa', 'Daftari', 'Daftari Kubwa', 'Kalamu', 'Kalamu za rangi',
  'Nguvu ya Sala', 'Rosali ya Maria', 'Kikokotoo', 'Rula', 'Chaki', 'Manila',
];

describe('the key both sides agree on', () => {
  it('matches what private.product_key does in Postgres', () => {
    // Verified against the database with the same eleven cases.
    expect(productKey('- nguvu ya sala')).toBe('nguvu ya sala');
    expect(productKey('  Nguvu Ya Sala. ')).toBe('nguvu ya sala');
    expect(productKey('daftari  kubwa')).toBe('daftari kubwa');
    expect(productKey('• Biblia')).toBe('biblia');
    expect(productKey('---')).toBe('');
    expect(productKey('Karatasi A4 rimu')).toBe('karatasi a4 rimu');
  });

  it('does not fold a real difference in letters', () => {
    expect(productKey('Bibilia')).not.toBe(productKey('Biblia'));
  });
});

describe('asking about a name that is nearly one you have', () => {
  it('spots the misspelling that started this', () => {
    // Typed on the live number: "Bibilia ndogo ninazo ngapi?"
    expect(isNearName('Bibilia', 'Biblia')).toBe(true);
    expect(findNearProduct('Bibilia', EXISTING)).toBe('Biblia');
  });

  it('spots a letter dropped or doubled', () => {
    expect(isNearName('kikokoto', 'Kikokotoo')).toBe(true);
    expect(isNearName('rosali ya mariaa', 'Rosali ya Maria')).toBe(true);
  });

  it('never suggests when the name already exists exactly', () => {
    expect(isNearName('Biblia', 'Biblia')).toBe(false);
    expect(findNearProduct('daftari', EXISTING)).toBeNull();
  });
});

describe('what it must not ask about', () => {
  it('leaves a genuine variant alone', () => {
    // A shop really does sell both. Asking here would be wrong, and merging
    // them would move money between two different products.
    expect(isNearName('Biblia Kubwa', 'Biblia')).toBe(false);
    expect(isNearName('Daftari Kubwa', 'Daftari')).toBe(false);
    expect(isNearName('Kalamu za rangi', 'Kalamu')).toBe(false);
  });

  it('leaves short names alone, where one letter often means another thing', () => {
    expect(isNearName('rula', 'Rula')).toBe(false);  // identical anyway
    expect(isNearName('chai', 'Chaki')).toBe(false);
    expect(isNearName('mali', 'Manila')).toBe(false);
  });

  it('does not connect two plainly different products', () => {
    expect(isNearName('Sukari', 'Biblia')).toBe(false);
    expect(isNearName('Mkoba wa shule', 'Nguvu ya Sala')).toBe(false);
    expect(findNearProduct('Sukari', EXISTING)).toBeNull();
  });

  it('says nothing about an empty or junk name', () => {
    expect(findNearProduct('', EXISTING)).toBeNull();
    expect(findNearProduct('---', EXISTING)).toBeNull();
  });
});

describe('warning on a whole record', () => {
  it('flags only the lines worth flagging', () => {
    const warnings = findNameWarnings(['Bibilia', 'Daftari', 'Kalamu za rangi'], EXISTING);
    expect(warnings).toEqual([{ said: 'Bibilia', existing: 'Biblia' }]);
  });

  it('does not repeat the same name twice in one message', () => {
    expect(findNameWarnings(['Bibilia', 'bibilia'], EXISTING)).toHaveLength(1);
  });

  it('is silent when everything is already known', () => {
    expect(findNameWarnings(['Biblia', 'Daftari'], EXISTING)).toEqual([]);
    expect(nameWarningText([], 'sw')).toBe('');
  });

  it('explains the consequence rather than just naming the pair', () => {
    const text = nameWarningText([{ said: 'Bibilia', existing: 'Biblia' }], 'sw');
    expect(text).toContain('Bibilia');
    expect(text).toContain('Biblia');
    expect(text).toMatch(/bidhaa mbili tofauti/);
    expect(nameWarningText([{ said: 'Bibilia', existing: 'Biblia' }], 'en'))
      .toMatch(/two separate products/);
  });
});
