import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type EvalCase = {
  id: string;
  block: string;
  say?: string;
  lang?: string;
  fixture?: string;
  expectTool?: string | null;
  simulate?: string;
};

const evalRoot = resolve(process.cwd(), 'evals');

function readEval(name: string): string {
  return readFileSync(resolve(evalRoot, name), 'utf8');
}

function extractCases(source: string): EvalCase[] {
  const starts = [...source.matchAll(/^\s+- id:\s*([^\s#]+).*$/gm)];
  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? source.length;
    const block = source.slice(start, end);
    const say = block.match(/^\s+say:\s*["']([^"']*)["']/m)?.[1];
    const lang = block.match(/^\s+lang:\s*(sw|en)\s*$/m)?.[1];
    const fixture = block.match(/^\s+fixture:\s*([^\s#]+)\s*(?:#.*)?$/m)?.[1];
    const toolMatch = block.match(/^\s+expect_tool:\s*(null|[^\s#]+)\s*.*$/m)?.[1];
    const simulate = block.match(/^\s+simulate:\s*([^\s#]+)\s*(?:#.*)?$/m)?.[1];
    return {
      id: match[1],
      block,
      say,
      lang,
      fixture,
      expectTool: toolMatch === 'null' ? null : toolMatch,
      simulate,
    };
  });
}

function hasLine(testCase: EvalCase, key: string): boolean {
  return new RegExp(`^\\s+${key}:`, 'm').test(testCase.block);
}

const files = ['debtors.yaml', 'profit.yaml', 'products.yaml'];

describe('AI evaluation coverage', () => {
  it('keeps every eval case structurally complete and uniquely identified', () => {
    const allCases = files.flatMap((file) => {
      const cases = extractCases(readEval(file));
      expect(cases.length, file).toBeGreaterThan(0);
      return cases.map((testCase) => ({ file, testCase }));
    });

    const keys = allCases.map(({ file, testCase }) => `${file}:${testCase.id}`);
    expect(new Set(keys).size).toBe(keys.length);

    for (const { file, testCase } of allCases) {
      expect(testCase.say, `${file}:${testCase.id} say`).toBeTruthy();
      expect(testCase.lang, `${file}:${testCase.id} lang`).toMatch(/^(sw|en)$/);
      expect(testCase.fixture, `${file}:${testCase.id} fixture`).toBeTruthy();
      const hasExpectedTool = hasLine(testCase, 'expect_tool');
      const isFailureSimulation = testCase.simulate === 'tool_error';
      expect(hasExpectedTool || isFailureSimulation, `${file}:${testCase.id} expect_tool/simulate`).toBe(true);
      expect(testCase.expectTool === null || Boolean(testCase.expectTool) || isFailureSimulation, `${file}:${testCase.id} tool value`).toBe(true);
    }
  });

  it('covers the planned A0 groups and all product cases 89–96', () => {
    const debtors = extractCases(readEval('debtors.yaml'));
    const profit = extractCases(readEval('profit.yaml'));
    const products = extractCases(readEval('products.yaml'));

    expect(debtors).toHaveLength(27);
    expect(profit).toHaveLength(18);
    expect(products).toHaveLength(14);
    expect(new Set(products.map((testCase) => testCase.id))).toEqual(new Set([
      '89', '90', '91', '92', '93', '94', '95', '96',
      '401', '402', '403', '404', '405', '406',
    ]));
  });

  it('requires explicit confirmation or a reason gate for every write tool case', () => {
    const writeTools = new Set([
      'ai_record_debt_issued',
      'ai_record_customer_payment',
      'ai_void_daily_record',
      'set_product_cost',
    ]);

    for (const file of files) {
      for (const testCase of extractCases(readEval(file))) {
        if (!testCase.expectTool || !writeTools.has(testCase.expectTool)) continue;
        const confirmation = hasLine(testCase, 'must_confirm');
        const reasonGate = hasLine(testCase, 'must_require_reason');
        expect(confirmation || reasonGate, `${file}:${testCase.id} write safety`).toBe(true);
      }
    }
  });

  it('keeps tool-error cases honest instead of permitting invented answers', () => {
    const toolErrorCases = files
      .flatMap((file) => extractCases(readEval(file)).map((testCase) => ({ file, testCase })))
      .filter(({ testCase }) => testCase.simulate === 'tool_error');

    expect(toolErrorCases.length).toBeGreaterThan(0);
    for (const { file, testCase } of toolErrorCases) {
      expect(testCase.block, `${file}:${testCase.id}`).toMatch(/must_not:\s*\[[^\]]*(invent_numbers|answer_from_memory)/);
      expect(testCase.block, `${file}:${testCase.id}`).toMatch(/must_contain:/);
    }
  });
});
