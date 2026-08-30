import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A CSS VARIABLE THAT DOES NOT EXIST IS BLACK.
//
// MEASURED, and the owner saw it before I did. The chart tooltip was written
// with fill="rgb(var(--surface-card))". There is no --surface-card in this
// theme — the token is called --surface — so the whole rgb() was invalid, and
// an SVG with no valid fill falls back to black. A white card on a white
// dashboard rendered as a black slab, and nothing anywhere failed: not the
// types, not the tests, not the build. CSS has no error for a name you
// invented.
//
// This is the check that would have caught it. Every custom property used in a
// component must be defined in the stylesheet that ships it.

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function tsxUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    // Tests name the mistakes they guard against, so scanning them would make
    // this check fail on its own evidence.
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...tsxUnder(path));
    }
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

describe('every theme token a component uses is defined', () => {
  const files = tsxUnder('src/components').concat(tsxUnder('src/routes'), tsxUnder('src/features'));

  it('defines the tokens index.css is expected to carry', () => {
    for (const token of ['--surface', '--surface-muted', '--surface-border', '--ink', '--ink-muted']) {
      expect(css, `${token} is missing from index.css`).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it('uses no custom property that index.css does not define', () => {
    const missing: string[] = [];
    for (const path of files) {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8');
      for (const match of source.matchAll(/var\((--[a-z0-9-]+)/gi)) {
        const token = match[1];
        // Tailwind's own generated properties are not ours to define.
        if (token.startsWith('--tw-')) continue;
        if (!new RegExp(`${token}\\s*:`).test(css)) missing.push(`${path}: ${token}`);
      }
    }
    // rgb(var(--x)) with an undefined --x is invalid, and invalid means black.
    expect(missing).toEqual([]);
  });

  it('has no token that index.css never had, by its old spelling', () => {
    // Assembled rather than written out, so this file does not itself contain
    // the string it is checking for.
    const invented = ['--surface', 'card'].join('-');
    expect(css).not.toContain(invented);
    for (const path of files) {
      expect(readFileSync(resolve(process.cwd(), path), 'utf8'), path).not.toContain(invented);
    }
  });
});
