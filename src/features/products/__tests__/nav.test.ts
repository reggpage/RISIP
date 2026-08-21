import { describe, expect, it } from 'vitest';
import { HIDDEN_NAV, VISIBLE_NAV, navVisible } from '../../../lib/nav';

// What the app offers a shopkeeper, and what it keeps out of their way.
//
// The owner's instruction: "vitu vyote vinavyohusiana na kampuni vi-comment
// kwanza… tunafocus na biashara kwanza." These tests exist so that turning a
// contractor section back on is a deliberate act rather than a side effect.

describe('the side panel a shopkeeper sees', () => {
  it('offers selling, products and the day\'s records', () => {
    expect(navVisible('sell')).toBe(true);
    expect(navVisible('products')).toBe(true);
    expect(navVisible('daily-records')).toBe(true);
    expect(navVisible('dashboard')).toBe(true);
    expect(navVisible('settings')).toBe(true);
  });

  it('leads with selling, because that is what a shop does all day', () => {
    expect(VISIBLE_NAV[0]).toBe('dashboard');
    expect(VISIBLE_NAV[1]).toBe('sell');
  });

  it('keeps the contractor half out of the way', () => {
    for (const key of ['projects', 'receipts', 'retirements', 'reimbursements',
      'claims', 'invoices', 'petty-cash'] as const) {
      expect(navVisible(key), key).toBe(false);
    }
  });

  it('says why each hidden section is hidden, so nobody has to guess', () => {
    for (const key of Object.keys(HIDDEN_NAV)) {
      expect(navVisible(key as never), key).toBe(false);
      expect(HIDDEN_NAV[key].length, key).toBeGreaterThan(20);
    }
  });

  it('never lists the same section twice', () => {
    expect(new Set(VISIBLE_NAV).size).toBe(VISIBLE_NAV.length);
  });

  it('hides nothing it also shows', () => {
    for (const key of VISIBLE_NAV) {
      expect(HIDDEN_NAV[key], key).toBeUndefined();
    }
  });
});
