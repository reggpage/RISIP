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
import { readdirSync, statSync } from 'node:fs';
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

if (undefinedNames.length > 0) {
  console.error(`\n${undefinedNames.length} name(s) used but never defined:\n`);
  for (const line of undefinedNames) console.error(`  ${line.trim()}`);
  console.error('\nAlmost always a missing import. This is what returns 500 to Meta.\n');
  process.exit(1);
}

console.log(`\n${entrypoints.length} edge functions checked. No undefined names.\n`);
