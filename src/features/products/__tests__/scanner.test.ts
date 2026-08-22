import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import {
  createMagnifierControls,
  makeScanGate,
  preferredFocusMode,
  zoomFromCapabilities,
} from '../scanner';

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

describe('camera magnifier capabilities', () => {
  it('prefers macro focus and falls back to continuous focus', () => {
    expect(preferredFocusMode({ focusMode: ['manual', 'continuous', 'macro'] })).toBe('macro');
    expect(preferredFocusMode({ focusMode: ['single-shot', 'continuous'] })).toBe('continuous');
    expect(preferredFocusMode({ focusMode: ['manual'] })).toBeNull();
  });

  it('starts hardware zoom at 2x and respects the camera range', () => {
    expect(zoomFromCapabilities({ zoom: { min: 1, max: 8, step: 0.1 } })).toEqual({
      min: 1, max: 8, step: 0.1, value: 2,
    });
    expect(zoomFromCapabilities({ zoom: { min: 3, max: 10, step: 0.5 } })).toEqual({
      min: 3, max: 10, step: 0.5, value: 3,
    });
  });

  it('uses the camera setting for the slider and hides it when unsupported', () => {
    expect(zoomFromCapabilities({ zoom: { min: 1, max: 5 } }, 3.5)).toEqual({
      min: 1, max: 5, step: 0.1, value: 3.5,
    });
    expect(zoomFromCapabilities({}, 2)).toBeNull();
    expect(zoomFromCapabilities({ zoom: { min: 1, max: 1 } }, 1)).toBeNull();
  });

  it('applies macro focus and a safe 2x default only when supported', async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      readyState: 'live',
      getCapabilities: () => ({ focusMode: ['continuous', 'macro'], zoom: { min: 1, max: 5, step: 0.1 } }),
      getSettings: () => ({ zoom: 1 }),
      applyConstraints,
    };
    const controls = createMagnifierControls({ getVideoTracks: () => [track] } as unknown as MediaStream);

    await controls.initialize();

    expect(applyConstraints).toHaveBeenNthCalledWith(1, { advanced: [{ focusMode: 'macro' }] });
    expect(applyConstraints).toHaveBeenNthCalledWith(2, { advanced: [{ zoom: 2 }] });
    expect(controls.zoom()?.value).toBe(2);
  });

  it('falls back without applying constraints on a camera with no magnifier capabilities', async () => {
    const applyConstraints = vi.fn();
    const controls = createMagnifierControls({
      getVideoTracks: () => [{
        readyState: 'live',
        getCapabilities: () => ({}),
        getSettings: () => ({}),
        applyConstraints,
      }],
    } as unknown as MediaStream);

    await expect(controls.initialize()).resolves.toBeUndefined();
    expect(controls.zoom()).toBeNull();
    expect(applyConstraints).not.toHaveBeenCalled();
  });
});
