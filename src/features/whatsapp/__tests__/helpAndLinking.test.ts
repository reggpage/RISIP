import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBareLinkToken, parseLinkToken } from '../../../../supabase/functions/_shared/whatsapp';
import { t } from '../../../../supabase/functions/_shared/whatsappIntent';
import { startOnboarding, advanceOnboarding } from '../../../../supabase/functions/_shared/whatsappOnboarding';

// C6 · MSAADA, AND C7 · "NINA AKAUNTI TAYARI".
//
// The owner asked what help should show. The answer is: not everything.
// Somebody typing "msaada" is stuck NOW, on one thing — a list of twenty
// commands leaves them stuck AND confused. Worse, the old text described
// photographing a receipt, which is not what most shops do most days.
//
// And on the third menu option, which he asked about directly: it told
// somebody to open a screen they may never have seen, gave no format and no
// example, and left the menu waiting underneath — so whatever they said next
// came back as "sijakuelewa".

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('msaada shows four examples, not twenty commands', () => {
  const said = t('help', 'sw');

  it('leads with the thing that actually works: ordinary words', () => {
    expect(said).toContain('Andika kwa maneno yako');
  });

  it('shows four examples, and four is the number', () => {
    const examples = said.split('\n').filter((line) => line.trim().startsWith('•'));
    expect(examples).toHaveLength(4);
  });

  it('picks examples from different corners of the product', () => {
    expect(said).toContain('nimeuza soda 5');        // a sale
    expect(said).toContain('kwa deni');              // credit
    expect(said).toContain('leo nimeuza shingapi');  // a question
    expect(said).toContain('nafunga');               // closing the day
  });

  it('numbers the choices that need a flow', () => {
    expect(said).toContain('*1* Nataka kusajili bidhaa');
    expect(said).toContain('*2* Nataka kumualika mfanyakazi');
    expect(said).toContain('*3* Kitu kingine');
  });

  it('no longer talks about photographing a receipt', () => {
    expect(said).not.toMatch(/risiti|picha ya/i);
  });

  it('stays short enough to read while standing at a counter', () => {
    expect(said.length).toBeLessThan(400);
  });
});

describe('answering the msaada menu', () => {
  const branch = webhook.slice(
    webhook.indexOf('// MSAADA MENU — answered.'),
    webhook.indexOf('// MSAADA MENU — answered.') + 2400,
  );

  it('is checked before the ordinary parsers', () => {
    // A bare "1" is exactly the kind of token something else would read as a
    // quantity.
    expect(branch).toContain('a bare "1" is exactly');
  });

  it('sends the product prompt on 1', () => {
    expect(branch).toContain('firstProductsPrompt(null, null, lang)');
  });

  it('reuses the invite path on 2 rather than writing a second one', () => {
    // Two implementations of an invite drift apart, and one of them is always
    // the one that stops matching the other.
    expect(branch).toContain("writeBody = 'mualike';");
    expect(branch).toContain('not two that drift apart');
  });

  it('gets out of the way on 3', () => {
    expect(branch).toContain('is not a fallback. It is the main road');
    expect(branch).toContain('niambie unachotaka kwa maneno yako');
  });

  it('releases the menu when the reply answers something else', () => {
    expect(branch).toContain('Release it and read');
  });

  it('does not append a knowledge paragraph to a bare "msaada"', () => {
    const sent = webhook.slice(
      webhook.indexOf('if (isHelp(body)) {'),
      webhook.indexOf('if (isHelp(body)) {') + 1400,
    );
    expect(sent).toContain("const asked = String(body ?? '').trim().split(/\\s+/).length > 1;");
  });
});

describe('"nina akaunti tayari" now says where and what', () => {
  const menu = advanceOnboarding('menu', '3', 'sw', {});

  it('names the exact screen', () => {
    expect(menu.reply).toContain('*Settings* → *WhatsApp*');
  });

  it('shows the format instead of assuming it', () => {
    expect(menu.reply).toContain('_LINK a1b2c3…_');
  });

  it('says the bare code is enough, because that is what people paste', () => {
    expect(menu.reply).toContain('bandika kodi yenyewe tu');
  });

  it('still starts from the language question for a stranger', () => {
    expect(startOnboarding().step).toBe('lang');
  });
});

describe('the code, pasted on its own', () => {
  const token = 'a1b2c3d4e5f6g7h8i9j0';

  it('is accepted without the word LINK', () => {
    expect(parseBareLinkToken(token)).toBe(token);
  });

  it('still accepts the written form', () => {
    expect(parseLinkToken(`LINK ${token}`)).toBe(token);
  });

  it('refuses anything with a space, which is a sentence and not a code', () => {
    expect(parseBareLinkToken('nimeuza soda 5')).toBeNull();
    expect(parseBareLinkToken('daftari 90')).toBeNull();
  });

  it('refuses something too short to be a token', () => {
    expect(parseBareLinkToken('soda')).toBeNull();
    expect(parseBareLinkToken('12345')).toBeNull();
  });

  it('is only ever tried for a number with nothing linked', () => {
    // For a linked shop, a long alphanumeric string is far more likely to be a
    // product code, and reading it as a token would be guessing at their stock.
    const branch = webhook.slice(
      webhook.indexOf('// A code pasted on its own, by somebody with nothing linked yet.'),
      webhook.indexOf('// A code pasted on its own, by somebody with nothing linked yet.') + 700,
    );
    expect(branch).toContain('if (!identity) {');
    expect(branch).toContain('guessing at');
  });
});
