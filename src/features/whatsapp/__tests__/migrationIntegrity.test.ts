import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// MEASURED, and the first instance was mine.
//
// Two files claimed version 0142:
//
//   0142_historical_catalog_margin.sql   10:47, commit 979128b
//   0142_ai_interpretation_route.sql     15:50, commit 44648ab
//
// I read the highest number when that session started and did not read it again
// when I wrote the file; another session had landed 0142 in between. Mine was
// renamed to 0143 — safe, because this repo's numbered migrations are applied
// by `db query` and appear nowhere in supabase_migrations.schema_migrations, so
// no history row referenced either name.
//
// The audit that followed found something worse than the collision: the OTHER
// 0142 had never been applied at all. Production was still costing historical
// sales at today's buying price — the exact bug that file was written to fix —
// while the file sat in the repo looking done.
//
// It also found four older collisions nobody had noticed. Those are left alone
// deliberately: they are applied, they are live, and rewriting applied history
// to tidy a filename is how a working database gets broken. They are frozen
// below so the test can fail on a NEW one without demanding a rewrite of the
// old ones.

const DIR = resolve(process.cwd(), 'supabase/migrations');
const files = readdirSync(DIR).filter((name) => name.endsWith('.sql'));

/**
 * The version a file claims, INCLUDING a letter suffix.
 *
 * 0089, 0089b and 0089c are three deliberate follow-ups, not three copies of
 * one migration. A detector that strips the letter reports them as collisions
 * and buries the four real ones in noise — which is exactly what the first
 * version of this test did.
 */
const versionOf = (name: string) => name.match(/^(\d+[a-z]?)_/)?.[1] ?? null;

/** Collisions that predate this test, are applied, and are not being rewritten. */
const KNOWN_LEGACY_COLLISIONS = new Set(['0072', '0073', '0083', '0114']);

function collisions(): Map<string, string[]> {
  const byVersion = new Map<string, string[]>();
  for (const name of files) {
    const version = versionOf(name);
    if (!version) continue;
    byVersion.set(version, [...(byVersion.get(version) ?? []), name]);
  }
  return new Map([...byVersion].filter(([, names]) => names.length > 1));
}

describe('no NEW migration reuses a version', () => {
  it('adds no collision beyond the four already applied', () => {
    const found = [...collisions().keys()].filter((version) => !KNOWN_LEGACY_COLLISIONS.has(version));
    expect(found).toEqual([]);
  });

  it('still sees the legacy four, so the freeze cannot rot silently', () => {
    // If one of these is ever properly reconciled, this fails and the entry
    // comes out of the list — rather than the list quietly protecting nothing.
    const found = new Set(collisions().keys());
    for (const legacy of KNOWN_LEGACY_COLLISIONS) {
      expect(found.has(legacy), `${legacy} is no longer a collision — remove it from the freeze`).toBe(true);
    }
  });

  it('treats a letter suffix as a distinct version, not a duplicate', () => {
    expect(versionOf('0089_sale_line_units.sql')).toBe('0089');
    expect(versionOf('0089b_catalog_uses_sale_unit.sql')).toBe('0089b');
    expect(versionOf('20260824123000_whatsapp_notification_daily_schedule.sql')).toBe('20260824123000');
  });

  it('has exactly one file at the version I collided with', () => {
    expect(files.filter((name) => versionOf(name) === '0142')).toEqual(['0142_historical_catalog_margin.sql']);
    expect(files.filter((name) => versionOf(name) === '0143')).toEqual(['0143_ai_interpretation_route.sql']);
  });
});

describe('the historical margin migration says what it does', () => {
  const margin = readFileSync(resolve(DIR, '0142_historical_catalog_margin.sql'), 'utf8');

  it('costs a sale at the price effective when it happened', () => {
    // A sale from March priced against June's buying cost is not a margin. It
    // is a different number wearing the word.
    expect(margin).toContain('effective_from <= r.occurred_at');
    expect(margin).toContain('order by c.effective_from desc');
  });

  it('keeps the currently configured cost as its own separate thing', () => {
    expect(margin).toMatch(/latest_cost/);
  });
});
