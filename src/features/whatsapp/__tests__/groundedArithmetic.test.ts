import { describe, expect, it } from 'vitest';
import { buildAssistantSystemPrompt, findUngroundedNumbers } from '../../../../supabase/functions/_shared/whatsappAssistant';
import { buildReceiptsReply } from '../../../../supabase/functions/_shared/whatsappReadTools';

// What the server hands the model for "expenses za risiti wiki hii".
const RECEIPTS = [
  'Risiti zako za karibuni:',
  '1. Duka la Asha — TSh 30,000 — confirmed',
  '2. Mama Ntilie — TSh 12,000 — confirmed',
  '3. Kariakoo — TSh 8,500 — pending_review',
].join('\n');

describe('adding up what the server returned', () => {
  it('allows a total the user actually asked for', () => {
    // 30,000 + 12,000. This was rejected, so the person got a list back and had
    // to add it up themselves — which is not an answer to "what is my total?".
    expect(findUngroundedNumbers('Zilizothibitishwa ni TSh 42,000.', [RECEIPTS])).toEqual([]);
  });

  it('allows the total of all three as well', () => {
    expect(findUngroundedNumbers('Jumla ya zote ni 50,500.', [RECEIPTS])).toEqual([]);
  });

  it('allows confirmed and pending stated separately', () => {
    const answer = 'Zilizothibitishwa: TSh 42,000. Bado inasubiri: TSh 8,500.';
    expect(findUngroundedNumbers(answer, [RECEIPTS])).toEqual([]);
  });

  it('still rejects a figure that was simply made up', () => {
    expect(findUngroundedNumbers('Jumla yako ni TSh 99,999.', [RECEIPTS])).toEqual(['99999']);
  });

  it('rejects a total that is close but wrong', () => {
    // 30,000 + 12,000 = 42,000, not 43,000. A near miss is the dangerous kind.
    expect(findUngroundedNumbers('Jumla ni 43,000.', [RECEIPTS])).toEqual(['43000']);
  });

  it('does not let subtraction through', () => {
    // 30,000 − 12,000. Profit is a server estimate built from buying costs and
    // coverage; sales minus expenses is a different number and must never be
    // dressed up as profit.
    expect(findUngroundedNumbers('Faida yako ni 18,000.', [RECEIPTS])).toEqual(['18000']);
  });

  it('does not invent a total out of an empty result', () => {
    const empty = ['Sina risiti zako zilizoonekana kwa sasa.'];
    expect(findUngroundedNumbers('Jumla ni 42,000.', empty)).toEqual(['42000']);
  });
});

describe('numbered lists are not claims about money', () => {
  it('does not throw away an answer for numbering its points', () => {
    // These markers were read as figures, so the whole reply was discarded and
    // replaced with the raw tool output. That is a large part of why replies
    // read like a machine.
    const answer = 'Salio lako ni TSh 45,000. Unaweza:\n1. Kutuma risiti\n2. Kuangalia dashboard';
    expect(findUngroundedNumbers(answer, ['Salio lako la petty cash ni TSh 45,000.'])).toEqual([]);
  });

  it('still checks a number that only looks like a marker', () => {
    // Mid-sentence, "5." is not a list marker.
    expect(findUngroundedNumbers('Nimeona risiti 7 hapa.', ['Salio ni TSh 45,000.'])).toEqual(['7']);
  });
});

describe('receipt links', () => {
  const receipts = [
    { id: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa', status: 'pending_review', amount: 8500, vendor: 'Kariakoo', createdAt: '2026-08-14' },
    { id: 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb', status: 'confirmed', amount: 30000, vendor: 'Duka la Asha', createdAt: '2026-08-13' },
  ];

  it('gives a link to the receipt that still needs finishing', () => {
    // The id was always fetched and never shown, so the assistant said it could
    // not send a link when one existed all along.
    const reply = buildReceiptsReply(receipts, 'sw', 'https://risip.online');
    expect(reply).toContain('https://risip.online/receipts?receipt=aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('links a confirmed receipt too', () => {
    // Asked for the link to a confirmed receipt, the assistant said it had none
    // and offered the whole list — which is not the receipt that was asked for.
    const reply = buildReceiptsReply(receipts, 'sw', 'https://risip.online');
    expect(reply).toContain('receipt=bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('always offers the receipts page itself', () => {
    expect(buildReceiptsReply(receipts, 'en', 'https://risip.online/')).toContain('https://risip.online/receipts');
  });

  it('says nothing about links when there is no app url', () => {
    expect(buildReceiptsReply(receipts, 'sw')).not.toContain('http');
  });

  it('tells the model a link is not a protected action', () => {
    const prompt = buildAssistantSystemPrompt({
      identityId: 'id', profileId: 'pid', companyId: 'cid',
      lang: 'sw', userName: 'Asha', companyName: 'St. Ritha bookshop', role: 'owner',
      approvalFlowEnabled: false, reversalEnabled: false, payoutsEnabled: false,
    });
    expect(prompt).toMatch(/Sending a link is not a protected action/);
    expect(prompt).toMatch(/You MAY add up figures/);
    expect(prompt).toMatch(/Do not subtract your way to profit/);
    expect(prompt).toMatch(/Keep confirmed and pending apart/);
  });
});
