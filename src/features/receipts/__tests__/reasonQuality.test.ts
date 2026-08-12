import { describe, expect, it } from 'vitest';
import { isMeaningfulReason, meaningfulWords, reasonProblem } from '../reasonQuality';

// The same corpus is run against private.is_meaningful_reason in the database,
// which is what actually enforces this. If the two ever disagree, the database
// wins and this file is the bug.
//
// Why it exists: the old rule was "10 characters", and production already holds
// `rgdrhthtrhtjyyrjyt` as the recorded reason for a real petty-cash reversal.

const REAL = [
  'hii risit inabidi ikaguliwe upya sielewi hapo',
  'kunashida sikupata hela leo',
  'amount ilikuwa imekosewa na mfanyakazi',
  'The AI read 400,000 but the paper says 300,000',
  'Risiti hii ni ya mradi mwingine kabisa',
  'tumeamua kurudisha fedha kwenye float ya mfanyakazi',
  'Mfanyakazi alipiga picha risiti isiyo sahihi',
  'wrong project was chosen when this was filed',
  'Fedha hii ilirudishwa dukani baada ya kubadilisha bidhaa',
];

const JUNK = [
  'rgdrhthtrhtjyyrjyt',          // the one that actually got through
  'rgdrhthtrhtjyyrjytdfgh',
  'sdfg hjkl qwrt zxcv bnm',     // no vowels anywhere
  'test test test',
  'test test test test test',
  'aaaa bbbb cccc',
  'aaaaaaaaaaaaaaaaaaaaaaaa',
  'asdf asdf asdf asdf asdf',
  'oops',
  'wrong amount',
  'ni sawa',
  '.................................',
  '1234567890 1234567890',
  '',
  '                              ',
];

describe('a reason has to mean something', () => {
  it.each(REAL)('accepts ordinary Swahili and English: %s', (s) => {
    expect(isMeaningfulReason(s)).toBe(true);
  });

  it.each(JUNK)('rejects junk: %s', (s) => {
    expect(isMeaningfulReason(s)).toBe(false);
  });
});

describe('what makes a word count', () => {
  it('needs a vowel, so keyboard mashing does not qualify', () => {
    expect(meaningfulWords('sdfg hjkl qwrt')).toEqual([]);
  });

  it('ignores repeats, which is what kills "test test test"', () => {
    expect(meaningfulWords('test test test')).toEqual(['test']);
  });

  it('ignores single letters and one-character repeats', () => {
    expect(meaningfulWords('a b cc ddd hela')).toEqual(['hela']);
  });

  it('keeps numbers attached to real words', () => {
    expect(meaningfulWords('risiti ni 400000 shilingi')).toContain('shilingi');
  });
});

describe('what the person is told', () => {
  it('says nothing at all before they have typed', () => {
    expect(reasonProblem('')).toBeNull();
  });

  it('counts down while the sentence is still short', () => {
    expect(reasonProblem('hela')).toMatch(/more characters/);
  });

  it('explains the real rule once it is long enough but still junk', () => {
    expect(reasonProblem('aaaa bbbb cccc dddd eeee')).toMatch(/meaningful words/);
  });

  it('goes quiet once the reason is good', () => {
    expect(reasonProblem('amount ilikuwa imekosewa na mfanyakazi')).toBeNull();
  });
});
