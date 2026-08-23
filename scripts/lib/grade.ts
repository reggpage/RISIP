// Turning a pile of right and wrong answers into one number somebody can act on.
//
// The number has to be blunt enough to gate a deploy and honest enough that
// nobody learns to ignore it. Two rules keep it honest:
//
//   · The BAND is fixed and stated here, in one place, so it cannot drift to
//     meet a bad run.
//   · A regression on a topic that used to pass is reported by name even when
//     the overall score still lands in the top band. An average is very good at
//     hiding one broken thing among two hundred working ones, and the one
//     broken thing is usually somebody's money.

export type Grade = 'A' | 'B' | 'F';

export type Band = {
  grade: Grade;
  /** Lowest score, as a percentage, that still earns this grade. */
  floor: number;
  label: string;
  /** False means a deploy should not go out on this result. */
  deployable: boolean;
};

export const BANDS: Band[] = [
  { grade: 'A', floor: 98, label: 'Production Ready — Highly Capable', deployable: true },
  { grade: 'B', floor: 90, label: 'Stable with minor edge-case risks', deployable: true },
  { grade: 'F', floor: 0, label: 'Failed — Block Deployment', deployable: false },
];

/**
 * The score, rounded the way a person reads it but never rounded UP across a
 * band edge.
 *
 * 97.6% is not an A. Rounding it to 98 and printing "Production Ready" would be
 * the harness lying to protect its own score, so the band is decided on the
 * exact ratio and only the DISPLAY is rounded.
 */
export function score(correct: number, total: number): number {
  if (total <= 0) return 0;
  return (correct / total) * 100;
}

export function bandFor(exactScore: number): Band {
  return BANDS.find((band) => exactScore >= band.floor) ?? BANDS[BANDS.length - 1];
}

/** One decimal, and never a decimal that crosses a band edge upward. */
export function displayScore(exactScore: number): string {
  const shown = Math.floor(exactScore * 10) / 10;
  return shown.toFixed(1);
}

export type TopicScore = { topic: string; ok: number; total: number };

export type RunRecord = {
  /** ISO instant, so a history file reads in order without a separate index. */
  at: string;
  shop: string;
  seeds: number[];
  asked: number;
  correct: number;
  score: number;
  grade: Grade;
  topics: TopicScore[];
  /** Short commit id, when the run knows one. */
  commit?: string;
};

export type Change = {
  topic: string;
  before: string;
  after: string;
  direction: 'improved' | 'regressed' | 'new' | 'gone';
};

/**
 * What moved since the last run.
 *
 * Compared per TOPIC rather than per question, because the questions are
 * generated fresh from a seed and no two runs ask exactly the same thing. A
 * topic is stable across runs; an individual sentence is not.
 *
 * Rates are compared, not counts: a topic that was asked 18 times yesterday and
 * 23 times today has not "improved by five".
 */
export function changesSince(previous: RunRecord | null, current: RunRecord): Change[] {
  if (!previous) return [];
  const before = new Map(previous.topics.map((topic) => [topic.topic, topic]));
  const after = new Map(current.topics.map((topic) => [topic.topic, topic]));
  const rate = (topic: TopicScore | undefined) =>
    topic && topic.total > 0 ? topic.ok / topic.total : null;
  const asPercent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

  const changes: Change[] = [];
  for (const [name, row] of after) {
    const was = rate(before.get(name));
    const now = rate(row);
    if (was === null) {
      // A brand-new topic is only worth naming when it is not already perfect;
      // otherwise every added template would announce itself forever.
      if (now !== null && now < 1) {
        changes.push({ topic: name, before: '—', after: asPercent(now), direction: 'new' });
      }
      continue;
    }
    if (now === null || Math.abs(now - was) < 0.005) continue;
    changes.push({
      topic: name,
      before: asPercent(was),
      after: asPercent(now),
      direction: now > was ? 'improved' : 'regressed',
    });
  }
  for (const [name] of before) {
    if (!after.has(name)) {
      changes.push({ topic: name, before: '', after: '', direction: 'gone' });
    }
  }
  // Regressions first: they are the reason anybody reads this line.
  const order: Record<Change['direction'], number> = { regressed: 0, new: 1, gone: 2, improved: 3 };
  return changes.sort((a, b) => order[a.direction] - order[b.direction] || a.topic.localeCompare(b.topic));
}

/** The one line a person reads, and the one a CI log greps for. */
export function summaryLine(current: RunRecord, changes: Change[]): string {
  const registered = changes.length === 0
    ? 'none since last run'
    : changes.map((change) => {
      if (change.direction === 'gone') return `${change.topic} (no longer asked)`;
      if (change.direction === 'new') return `${change.topic} (new, ${change.after})`;
      const arrow = change.direction === 'improved' ? '↑' : '↓';
      return `${change.topic} ${change.before}${arrow}${change.after}`;
    }).join('; ');
  return `Risip AI Current Capability Score: ${displayScore(current.score)}% `
    + `| Grade: ${current.grade} `
    + `| Registered Changes: [${registered}]`;
}
