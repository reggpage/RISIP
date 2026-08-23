import { describe, expect, it } from 'vitest';
import {
  bandFor,
  changesSince,
  displayScore,
  score,
  summaryLine,
  type RunRecord,
} from '../../../../scripts/lib/grade';

const run = (over: Partial<RunRecord>): RunRecord => ({
  at: '2026-08-23T09:00:00.000Z',
  shop: 'St. Ritha bookshop',
  seeds: [1, 2],
  asked: 100,
  correct: 100,
  score: 100,
  grade: 'A',
  topics: [],
  ...over,
});

describe('the band', () => {
  it('puts each score where the rule says', () => {
    expect(bandFor(100).grade).toBe('A');
    expect(bandFor(98).grade).toBe('A');
    expect(bandFor(97.9).grade).toBe('B');
    expect(bandFor(90).grade).toBe('B');
    expect(bandFor(89.9).grade).toBe('F');
    expect(bandFor(0).grade).toBe('F');
  });

  it('blocks a deploy only at F', () => {
    expect(bandFor(99).deployable).toBe(true);
    expect(bandFor(92).deployable).toBe(true);
    expect(bandFor(50).deployable).toBe(false);
  });

  // A harness that rounds its own score up across a band edge is a harness
  // lying to protect itself. 97.96% is not an A, however it prints.
  it('never rounds up into a better grade', () => {
    const exact = score(2449, 2500); // 97.96
    expect(bandFor(exact).grade).toBe('B');
    expect(displayScore(exact)).toBe('97.9');
  });

  it('reads an empty run as zero rather than dividing by nothing', () => {
    expect(score(0, 0)).toBe(0);
    expect(bandFor(score(0, 0)).grade).toBe('F');
  });
});

describe('what moved since last time', () => {
  const before = run({
    topics: [
      { topic: 'madeni', ok: 20, total: 20 },
      { topic: 'mauzo', ok: 18, total: 20 },
      { topic: 'stoko', ok: 10, total: 10 },
    ],
  });

  it('names a topic that fell, even when the total still looks fine', () => {
    const after = run({
      topics: [
        { topic: 'madeni', ok: 15, total: 20 },
        { topic: 'mauzo', ok: 20, total: 20 },
        { topic: 'stoko', ok: 10, total: 10 },
      ],
    });
    const changes = changesSince(before, after);
    // Regressions first: they are the reason anybody reads the line.
    expect(changes[0]).toEqual({ topic: 'madeni', before: '100%', after: '75%', direction: 'regressed' });
    expect(changes).toContainEqual({ topic: 'mauzo', before: '90%', after: '100%', direction: 'improved' });
    expect(changes.some((change) => change.topic === 'stoko')).toBe(false);
  });

  // Runs ask different numbers of questions per topic, so counts cannot be
  // compared — only rates can.
  it('compares rates, not counts', () => {
    const after = run({
      topics: [
        { topic: 'madeni', ok: 40, total: 40 },
        { topic: 'mauzo', ok: 9, total: 10 },
        { topic: 'stoko', ok: 10, total: 10 },
      ],
    });
    expect(changesSince(before, after)).toEqual([]);
  });

  it('announces a new topic only when it is not already perfect', () => {
    const after = run({
      topics: [
        ...before.topics,
        { topic: 'kelele', ok: 10, total: 10 },
        { topic: 'fedha kwa maneno', ok: 3, total: 10 },
      ],
    });
    const changes = changesSince(before, after);
    expect(changes).toContainEqual({ topic: 'fedha kwa maneno', before: '—', after: '30%', direction: 'new' });
    expect(changes.some((change) => change.topic === 'kelele')).toBe(false);
  });

  it('has nothing to say about the very first run', () => {
    expect(changesSince(null, before)).toEqual([]);
  });
});

describe('the line a person reads', () => {
  it('states the score, the grade and what changed', () => {
    const line = summaryLine(
      run({ score: 99.125, grade: 'A' }),
      [{ topic: 'madeni', before: '100%', after: '75%', direction: 'regressed' }],
    );
    expect(line).toBe(
      'Risip AI Current Capability Score: 99.1% | Grade: A '
      + '| Registered Changes: [madeni 100%↓75%]',
    );
  });

  it('says so plainly when nothing moved', () => {
    expect(summaryLine(run({}), [])).toContain('Registered Changes: [none since last run]');
  });
});
