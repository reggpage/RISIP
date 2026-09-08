import { readFileSync, writeFileSync } from 'node:fs';
import { legalDocuments, LEGAL_VERSION } from '../supabase/functions/_shared/risipLegal';
const path = 'supabase/migrations/0176_legal_acceptance.sql';
const marker = '-- The exact bilingual publication is appended below by scripts/snapshot-legal.ts.';
const source = readFileSync(path, 'utf8');
const documents = JSON.stringify(legalDocuments).replace(/'/g, "''");
const publication = `insert into public.legal_policy_versions(version,documents,active) values('${LEGAL_VERSION}','${documents}'::jsonb,true);`;
if (!source.includes(marker)) throw new Error('Publication marker missing');
if (source.includes('insert into public.legal_policy_versions')) {
  if (!source.includes(publication)) throw new Error('Published document changed: create a new policy version and migration instead of rewriting acceptance history');
  console.log('Policy snapshot matches the shared publication.');
} else {
  writeFileSync(path, source.slice(0, source.indexOf(marker)) + marker + `\n${publication}\n`);
}
