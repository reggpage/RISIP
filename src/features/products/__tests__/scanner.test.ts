import { describe, expect, it } from 'vitest';
import { makeScanGate } from '../scanner';

// The rule that stands between a camera and the wrong product being registered.
const EAN13 = '6011040121093';
const OTHER = '5449000000996';

describe('a code has to be read twice before it counts', () => {
  it('ignores a single frame', () => {
    const seen: string[] = [];
    const gate = makeScanGate((found) => seen.push(found.code));
    gate(EAN13);
    expect(seen).toEqual([]);
  });

  it('accepts the second agreeing read', () => {
    const seen: string[] = [];
    const gate = makeScanGate((found) => seen.push(found.code));
    gate(EAN13);
    gate(EAN13);
    expect(seen).toEqual([EAN13]);
  });

  it('starts again when the reads disagree', () => {
    // A creased packet in poor light can produce a valid-looking number that
    // belongs to something else. Two disagreeing frames are not a scan.
    const seen: string[] = [];
    const gate = makeScanGate((found) => seen.push(found.code));
    gate(EAN13);
    gate(OTHER);
    expect(seen).toEqual([]);
    gate(OTHER);
    expect(seen).toEqual([OTHER]);
  });

  it('never registers the same packet twice while it sits in front of the lens', () => {
    let clock = 0;
    const seen: string[] = [];
    const gate = makeScanGate((found) => seen.push(found.code), () => clock);
    gate(EAN13); gate(EAN13);
    clock = 500;
    gate(EAN13); gate(EAN13);
    clock = 1200;
    gate(EAN13); gate(EAN13);
    expect(seen).toEqual([EAN13]);
  });

  it('takes the same product again once it has been taken away and brought back', () => {
    let clock = 0;
    const seen: string[] = [];
    const gate = makeScanGate((found) => seen.push(found.code), () => clock);
    gate(EAN13); gate(EAN13);
    clock = 3000;
    gate(EAN13); gate(EAN13);
    expect(seen).toEqual([EAN13, EAN13]);
  });

  it('drops what is not a barcode at all, however many times it arrives', () => {
    const seen: string[] = [];
    const gate = makeScanGate((found) => seen.push(found.code));
    // A failed checksum: the scanner half-read the packet.
    gate('6011040121094'); gate('6011040121094'); gate('6011040121094');
    gate('hello'); gate('hello');
    expect(seen).toEqual([]);
  });
});
