// Catch the error that took Risip off the air.
//
// MEASURED FAILURE. A branch was added to whatsapp-webhook that calls
// parseInviteRequest, and the import line was never added. Everything passed:
//
//   esbuild --bundle          — clean. It does not resolve free identifiers;
//                               an unknown name is assumed to be a global.
//   npx vitest run            — 720 passing. The suite tests shared modules,
//                               and the webhook is not one.
//   npx tsc -b --noEmit       — clean. supabase/functions is not in the app's
//                               tsconfig project, so it is never looked at.
//
// It deployed, and every incoming WhatsApp message returned 500 with
// "ReferenceError: parseInviteRequest is not defined" until somebody noticed
// the silence. Three green checks and a dead product.
//
// This runs the type-checker over the edge functions and fails on the one class
// of error that matters most here: a name used and never defined. Deno globals
// and remote imports are not resolvable from Node, so everything else is
// tolerated on purpose — a check nobody can keep green gets switched off.
//
//   npx vite-node scripts/check-edge-functions.ts

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'supabase', 'functions');

const entrypoints = readdirSync(root)
  .filter((name) => !name.startsWith('_'))
  .map((name) => resolve(root, name, 'index.ts'))
  .filter((path) => { try { return statSync(path).isFile(); } catch { return false; } });

let output = '';
try {
  execFileSync('npx', [
    'tsc', '--noEmit', '--skipLibCheck',
    '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler',
    '--allowImportingTsExtensions', '--allowJs', '--checkJs', 'false',
    ...entrypoints,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true });
} catch (error) {
  const failure = error as { stdout?: string; stderr?: string };
  output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
}

// TS2304: Cannot find name 'x'.  TS2552: Cannot find name 'x'. Did you mean…?
const undefinedNames = output
  .split(/\r?\n/)
  .filter((line) => /error TS(?:2304|2552):/.test(line))
  // Deno is a runtime global and is expected to be unknown to the Node compiler.
  .filter((line) => !/Cannot find name 'Deno'/.test(line));

/**
 * A name imported twice.
 *
 * MEASURED FAILURE, the second time this file has been extended by an outage.
 * Two sessions added `cataloguePrefixResolution` to the same import block, and
 * Deno refused to boot the worker: "Identifier has already been declared".
 * Every WhatsApp message returned 503 for seven minutes until somebody said
 * Risip had gone quiet.
 *
 * TypeScript does NOT report this — a duplicate import specifier is legal
 * enough for tsc when the module resolves, so the check above stayed green all
 * the way to production. Deno is stricter, and Deno is what runs.
 *
 * Read straight out of the source rather than from the compiler, because the
 * compiler is exactly what missed it.
 */
const duplicateImports: string[] = [];
for (const path of entrypoints) {
  const source = readFileSync(path, 'utf8');
  const seen = new Map<string, number>();
  for (const block of source.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const raw of block[1].split(',')) {
      // "type Foo", "Foo as Bar" — the binding is what must be unique.
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
      if (!name) continue;
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
  }
  for (const [name, count] of seen) {
    if (count > 1) duplicateImports.push(`${path.split(/[\\/]/).slice(-2).join('/')}: ${name} imported ${count} times`);
  }
}

if (undefinedNames.length > 0 || duplicateImports.length > 0) {
  if (undefinedNames.length > 0) {
    console.error(`\n${undefinedNames.length} name(s) used but never defined:\n`);
    for (const line of undefinedNames) console.error(`  ${line.trim()}`);
    console.error('\nAlmost always a missing import. This is what returns 500 to Meta.\n');
  }
  if (duplicateImports.length > 0) {
    console.error(`\n${duplicateImports.length} duplicate import(s):\n`);
    for (const line of duplicateImports) console.error(`  ${line}`);
    console.error('\nDeno refuses to boot on these. This is what returns 503 to Meta.\n');
  }
  process.exit(1);
}

console.log(`\n${entrypoints.length} edge functions checked. No undefined names, no duplicate imports.\n`);
