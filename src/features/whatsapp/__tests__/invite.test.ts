import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  inviteReady,
  inviteRoleQuestion,
  parseInviteRequest,
  parseInviteRole,
} from '../../../../supabase/functions/_shared/whatsappInvite';

describe('asking to bring somebody in', () => {
  it('takes the owner’s own words', () => {
    expect(parseInviteRequest('nataka kumuinvite mtu')).toBe(true);
    expect(parseInviteRequest('nataka kualika mfanyakazi')).toBe(true);
    expect(parseInviteRequest('invite someone')).toBe(true);
    expect(parseInviteRequest('add a worker')).toBe(true);
  });

  it('leaves ordinary messages alone', () => {
    expect(parseInviteRequest('nimeuza daftari 10')).toBe(false);
    expect(parseInviteRequest('faida ya leo ni ngapi')).toBe(false);
    expect(parseInviteRequest('')).toBe(false);
  });
});

describe('choosing the role, which is never guessed', () => {
  it('reads the number and the word', () => {
    expect(parseInviteRole('1')).toBe('worker');
    expect(parseInviteRole('2')).toBe('accountant');
    expect(parseInviteRole('mfanyakazi')).toBe('worker');
    expect(parseInviteRole('mhasibu')).toBe('accountant');
    expect(parseInviteRole('accountant')).toBe('accountant');
  });

  it('returns nothing when the answer is not a role', () => {
    // Better to ask again than to mint a code granting the wrong access.
    expect(parseInviteRole('sawa')).toBeNull();
    expect(parseInviteRole('3')).toBeNull();
    expect(parseInviteRole('')).toBeNull();
  });

  it('never offers owner, because a business has one', () => {
    expect(parseInviteRole('owner')).toBeNull();
    expect(parseInviteRole('mmiliki')).toBeNull();
    expect(inviteRoleQuestion('sw')).not.toMatch(/mmiliki|owner/i);
  });

  it('says what each role will actually see', () => {
    const question = inviteRoleQuestion('sw');
    expect(question).toMatch(/Mfanyakazi/);
    expect(question).toMatch(/Mhasibu/);
    expect(question).toMatch(/fedha zote/);
  });
});

describe('what the owner gets back', () => {
  const reply = inviteReady('KTM4PQ7X', 'worker', 'St. Ritha bookshop', '+255 700 000 000', 'sw');

  it('carries the code and what it costs to lose it', () => {
    expect(reply).toContain('KTM4PQ7X');
    expect(reply).toMatch(/mara moja tu/);
    expect(reply).toMatch(/siku 7/);
  });

  it('writes the forwardable half to the newcomer, not to the owner', () => {
    // It will be pasted into a chat with somebody who has never heard of Risip.
    expect(reply).toContain('Karibu St. Ritha bookshop');
    expect(reply).toContain('+255 700 000 000');
  });

  it('says plainly that Risip does not send it, and why', () => {
    expect(reply).toMatch(/Situmi mimi/);
    expect(reply).toMatch(/namba ikikosewa/);
  });

  it('names the role it was minted for', () => {
    expect(reply).toContain('Mfanyakazi');
    expect(inviteReady('KTM4PQ7X', 'accountant', 'X', '+255', 'sw')).toContain('Mhasibu');
  });
});

describe('when Meta will not say what the number is', () => {
  it('still produces a usable invite', () => {
    const reply = inviteReady('KTM4PQ7X', 'worker', 'St. Ritha bookshop', null, 'sw');
    expect(reply).toContain('KTM4PQ7X');
    expect(reply).toMatch(/namba hii ya Risip/);
    expect(reply).not.toMatch(/null|undefined/);
  });
});

describe('the object hiding inside the Swahili verb', () => {
  it('takes the phrasing the owner actually sent', () => {
    // "nataka kumualika mtu nafanyaje" — ku-MU-alika. The pattern knew
    // "kualika" and "kumuinvite" and missed the one a person typed.
    expect(parseInviteRequest('nataka kumualika mtu nafanyaje')).toBe(true);
  });

  it('takes the other infixes people use', () => {
    for (const said of [
      'nataka kumualika mtu', 'nataka kuwaalika watu', 'nimualike nani',
      'nataka kualika mfanyakazi', 'naomba kumuinvite mtu', 'nataka kuongeza mtu',
      'add a worker', 'invite someone', 'nataka mfanyakazi mpya',
    ]) {
      expect(parseInviteRequest(said), said).toBe(true);
    }
  });

  it('still leaves ordinary business messages alone', () => {
    for (const said of [
      'nimeuza daftari 10', 'faida ya leo ni ngapi', 'mauzo ya wiki hii',
      'nani ananidai', 'bei ya daftari rejareja 1500', 'habari za asubuhi',
    ]) {
      expect(parseInviteRequest(said), said).toBe(false);
    }
  });
});

describe('a pending question that knows when to let go', () => {
  const webhook = () => readFileSync(
    resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

  it('abandons the invite when the message starts another topic', () => {
    // MEASURED FAILURE: "change language to kiswahili" was answered by asking
    // "what will they be? Reply 1 or 2" a second time. Every message that was
    // not a role was treated as a wrong answer, which made the question a trap.
    const source = webhook();
    expect(source).toContain('if (invitePending && startsAnotherTopic(body)) {');
    expect(source).toMatch(/startsAnotherTopic\(body\)\) \{\s*\n\s*await clearConversation/);
  });

  it('counts only unmistakable topic changes, so a vague reply still re-asks', () => {
    const source = webhook();
    const helper = source.slice(source.indexOf('function startsAnotherTopic'));
    expect(helper).toContain('parseLanguageCommand(text)');
    expect(helper).toContain('parseQuantityOnlySale(text)');
    expect(helper).toContain('parseReadRequest(text)');
    // A bare word must not qualify: that is what re-asking is for.
    expect(helper).not.toContain('text.length');
  });
});

describe('every parked question lets go, not just some of them', () => {
  const webhook = () => readFileSync(
    resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

  it('guards all four confirmation states with the shared rule', () => {
    // MEASURED FAILURE four times over, in four different branches. Fixing them
    // one at a time was the mistake: a pending price list answered "duster ziko
    // ngapi stoo" with a price list, weeks after the invite had the same bug.
    const source = webhook();
    for (const name of [
      'stockBatchPending', 'newProductPending', 'sellingBatchPending', 'costBatchPending',
    ]) {
      expect(source, name).toContain(`if (${name} && releasesParkedQuestion(body)) {`);
    }
  });

  it('never lets an answer count as a change of subject', () => {
    const helper = webhook();
    const rule = helper.slice(helper.indexOf('function releasesParkedQuestion'));
    expect(rule).toContain('isDailyRecordConfirmation(text)');
    expect(rule).toContain('isDailyRecordRejection(text)');
    expect(rule).toContain('isCancel(text)');
  });
});
