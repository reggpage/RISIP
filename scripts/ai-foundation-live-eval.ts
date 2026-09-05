/** Isolated first-tool-choice smoke test. No merchant data, tools or WhatsApp sends.
 * Run with: vite-node scripts/ai-foundation-live-eval.ts
 * Requires the updated stage-a-ai-eval deployment and existing CLI login.
 * Temporary evaluation credential is removed in finally; never logged.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const project = 'dsbplcqhlewxnivfwlcx';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const at = line.indexOf('=');
    return [line.slice(0, at), line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
  }));
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error('Missing evaluator gateway credential; no test run.');

function cli(args: string[]) {
  const result = spawnSync('supabase', args, { encoding: 'utf8', windowsHide: true });
  // Do not echo CLI stderr/args: a failing command may include its secret.
  if (result.status !== 0) throw new Error(`Supabase ${args[0]} ${args[1]} failed; credentials not printed.`);
  return result.stdout;
}
const secretName = 'RISIP_FOUNDATION_EVAL_TOKEN';
const existing = JSON.parse(cli(['secrets', 'list', '--project-ref', project, '--output', 'json']));
if (!Array.isArray(existing)) throw new Error('Unexpected secret metadata; refusing to overwrite.');
if (existing.some((item: { name?: string }) => item.name === secretName)) {
  throw new Error('Temporary evaluation credential already exists; investigate its owner before retrying.');
}
const token = randomBytes(32).toString('hex');
const cases = [
  { id: 'retail', say: 'nimeuza vest 2 rejareja', tool: 'propose_business_event', kind: 'sale', direction: 'sale' },
  { id: 'supplier-payment', say: 'nimemlipa Musa 300000 cash', tool: 'propose_money_event', kind: 'supplier_payment' },
  { id: 'customer-credit-animal-sale', say: 'nimeuza ng’ombe mmoja kwa Musa kwa deni', tool: 'propose_business_event', kind: 'credit_sale', direction: 'sale' },
  { id: 'supplier-credit-purchase', say: 'nimenunua nyama kilo 20 kwa Musa kwa deni', tool: 'propose_business_event', kind: 'supplier_credit_purchase', direction: 'purchase' },
  { id: 'mixed-bands', say: 'Mauzo\nNguvu ya sala 2 rejareja\nPrinter 3\nBiblia 4 jumla', tool: 'propose_business_event', kind: 'sale', direction: 'sale' },
  { id: 'typo-payment', say: 'nmemlpa musa laki tatu mpsa', tool: 'propose_money_event', kind: 'supplier_payment' },
  { id: 'yesterday-incomplete', say: 'jana nilifanya mauzo', tool: 'propose_money_event', kind: 'sale' },
  { id: 'quantity-followup', say: 'vest tano', tool: 'resolve_pending_clarification', pendingClarification: 'Active question: new_product_quantity. Register vest and belt. Both products are sold in pieces. Prices are already collected. Still need opening quantities. Original request: sajili vest na belt. User has not confirmed any write. Ask only for missing quantities; retain each answered product.' },
  { id: 'oil-followup', say: 'mafuta ya taa', tool: 'resolve_pending_clarification', pendingClarification: 'Active question: product_choice. Original intent sale: nimeuza mafuta 2. Offered products: mafuta ya taa (litre), mafuta ya kula (litre), mafuta ya kujipaka (piece). Resolve the selected product without changing quantity 2 or sale intent. No record confirmed.' },
];
const results: unknown[] = [];
let failed = 0;
let credentialAttempted = false;
try {
  credentialAttempted = true;
  cli(['secrets', 'set', `${secretName}=${token}`, '--project-ref', project]);
  for (const testCase of cases) {
    const response = await fetch(`https://${project}.supabase.co/functions/v1/stage-a-ai-eval`, {
      method: 'POST', headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ token, force_tool_choice: true, context: { companyName: 'Synthetic AI Test Shop', userName: 'Test', role: 'owner',
        vocabulary: 'Products: vest, belt, Nguvu ya sala, Printer, Biblia, nyama, ng’ombe, mafuta ya taa, mafuta ya kula, mafuta ya kujipaka. Suppliers: Musa. No prices, stock or balances supplied; backend tools must retrieve those.',
      }, cases: [testCase] }),
    });
    if (!response.ok) throw new Error(`Evaluator HTTP ${response.status}; no merchant request was sent.`);
    const payload = await response.json();
    const result = payload.results?.[0];
    const valid = result && !result.error && !result.schemaError && result.tools?.[0] === testCase.tool
      && (!testCase.kind || result.input?.kind === testCase.kind)
      && (!testCase.direction || result.input?.direction === testCase.direction)
      && (testCase.id !== 'retail' || result.input?.lines?.[0]?.price_band_wording === 'rejareja')
      && (testCase.id !== 'mixed-bands' || (result.input?.lines?.length === 3
        && result.input.lines[0].price_band_wording === 'rejareja'
        && result.input.lines[1].price_band_wording === null
        && result.input.lines[2].price_band_wording === 'jumla'
        && result.input.price_band_wording === null));
    if (!valid) failed++;
    results.push({ id: testCase.id, model: payload.model, passed: Boolean(valid), result });
    console.log(`${testCase.id}: ${valid ? 'PASS' : 'FAIL'} (${result?.tools?.join(',') || 'no tool'}; ${result?.error || result?.schemaError || 'schema valid'})`);
  }
} finally {
  writeFileSync('tmp/ai-foundation-live-eval.json', JSON.stringify({ scope: 'synthetic first-tool choice only; no tools executed', failed, results }, null, 2));
  if (credentialAttempted) cli(['secrets', 'unset', secretName, '--project-ref', project, '--yes']);
}
console.log(`First-tool-choice checks: ${cases.length - failed}/${cases.length}. Not an end-to-end WhatsApp or accounting test.`);
if (failed) process.exitCode = 1;
