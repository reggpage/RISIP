import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stockCountBatchConfirmation } from '../../../../supabase/functions/_shared/whatsappStockBatch';

// A CONFIRMATION IS NOT EVIDENCE.
//
// MEASURED, from the owner's own screen. He counted nine products and sent:
//
//   Nguvu ya sala 9
//   Puch 17
//   Dasan 7 biblia 30 rosali 7 kitabu 20 atlas 8 kikokoto 13 chaki 60
//
// and got back, in full:
//
//   "Tafadhali thibitisha hesabu hii kwa kujibu NDIYO ili niiweke, au
//    HAPANA/GHAIRI kama si sahihi."
//
// No list. Nine products, nine numbers, none of them shown. Telemetry confirms
// the draft was created correctly — propose_business_event, stock_count,
// drafted — and stockCountBatchConfirmation had built all nine lines. The
// server handed that text to the model as `content` with no `terminalReply`,
// so the model treated it as evidence, summarised it, and the list was gone.
//
// Thirteen return sites in the webhook had that shape. Every one of them is a
// message a shopkeeper reads immediately before money is written to their
// books.
//
// Being asked to approve a figure you cannot see is worse than not being asked
// at all, because it manufactures the feeling of having checked. The rule now
// is simple: the server writes the confirmation, and the person sees exactly
// what the server wrote.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('nothing the shopkeeper must approve can be rewritten on the way out', () => {
  it('leaves no confirmation as evidence for the model', () => {
    // The exact shape of the bug: content + fallbackReply, no terminalReply.
    const rewritable = webhook.match(
      /return \{ content: confirmation, fallbackReply: confirmation \};/g,
    ) ?? [];
    expect(rewritable).toHaveLength(0);
  });

  it('keeps all thirteen of them terminal', () => {
    // The count is the point. One missed site is one shopkeeper approving a
    // figure they were never shown.
    const terminal = webhook.match(/terminalReply: confirmation/g) ?? [];
    expect(terminal.length).toBeGreaterThanOrEqual(13);
  });

  it('still gives the model something to fall back on', () => {
    // Terminal is not the same as silent: if the model cannot finish, the
    // server's own text is what goes out.
    const first = webhook.indexOf('terminalReply: confirmation');
    expect(webhook.slice(first, first + 90)).toContain('fallbackReply: confirmation');
  });

  it('records why, at the site the owner actually hit', () => {
    const at = webhook.indexOf('const confirmation = stockCountBatchConfirmation(');
    expect(webhook.slice(Math.max(0, at - 900), at))
      .toContain('A confirmation is not evidence.');
  });
});

describe('the count he sent, shown back the way it should have been', () => {
  const batch = {
    kind: 'stock_count_batch' as const,
    counts: [
      { product: 'Nguvu ya sala', quantity: 9, unit: null },
      { product: 'Puch', quantity: 17, unit: null },
      { product: 'Dasan', quantity: 7, unit: null },
      { product: 'biblia', quantity: 30, unit: null },
      { product: 'rosali', quantity: 7, unit: null },
      { product: 'kitabu', quantity: 20, unit: null },
      { product: 'atlas', quantity: 8, unit: null },
      { product: 'kikokoto', quantity: 13, unit: null },
      { product: 'chaki', quantity: 60, unit: null },
    ],
    unreadable: [],
  };
  const reply = stockCountBatchConfirmation(batch, 'sw');

  it('shows every single product he counted', () => {
    for (const item of batch.counts) expect(reply).toContain(item.product);
    expect(reply).toContain('bidhaa 9');
  });

  it('bolds every quantity, because that is what he is checking', () => {
    expect(reply).toContain('1. Nguvu ya sala — *9*');
    expect(reply).toContain('9. chaki — *60*');
  });

  it('bolds the words he has to type back', () => {
    expect(reply).toContain('*1*');
    expect(reply).toContain('*2*');
  });

  it('says what the count will DO before he agrees to it', () => {
    // A count overwrites what Risip believed. That is not the same as a sale
    // or a purchase and he must be told which one he is about to do.
    expect(reply).toContain('si mauzo na si manunuzi mapya');
  });
});
