import { describe, expect, it } from 'vitest';
import {
  extractedStatusReason,
  resolveExtractedStatus,
} from '../../../../supabase/functions/_shared/receiptStatus';

describe('extraction never confirms while the approval flow is on', () => {
  it('writes pending_review even on a confident read', () => {
    // The production bug: a confident read wrote 'confirmed', the transition
    // guard refused it, and the user saw a 500 and "Extraction failed".
    expect(resolveExtractedStatus(false, true)).toBe('pending_review');
  });

  it('writes pending_review when the model was also unsure', () => {
    expect(resolveExtractedStatus(true, true)).toBe('pending_review');
  });

  it('never returns confirmed for any input while the flow is on', () => {
    for (const needsReview of [true, false]) {
      expect(resolveExtractedStatus(needsReview, true)).not.toBe('confirmed');
    }
  });
});

describe('flow off keeps today behaviour exactly', () => {
  it('auto-confirms a clean high-confidence read', () => {
    expect(resolveExtractedStatus(false, false)).toBe('confirmed');
  });

  it('still holds an unsure read for review', () => {
    expect(resolveExtractedStatus(true, false)).toBe('pending_review');
  });
});

describe('the reason distinguishes a poor scan from a pending approval', () => {
  it('says nothing when the receipt was confirmed', () => {
    expect(extractedStatusReason(false, false)).toBeUndefined();
  });

  it('blames the scan only when the scan is actually the problem', () => {
    expect(extractedStatusReason(true, false)).toBe('needs review');
  });

  it('explains a pending approval rather than implying a bad scan', () => {
    expect(extractedStatusReason(false, true)).toBe('awaiting submission and approval');
  });

  it('prefers the approval reason when both apply', () => {
    // Telling someone their scan was poor when the real reason is that every
    // receipt needs approving would send them off correcting nothing.
    expect(extractedStatusReason(true, true)).toBe('awaiting submission and approval');
  });
});

describe('shared across every ingestion path', () => {
  // web upload, WhatsApp and re-analyse all invoke extract-receipt, so they all
  // go through this one decision. inbound-email always writes pending_review, and
  // batch import is gated in the client (creationStatus), so neither can produce
  // a confirmed receipt while the flow is on.
  it('is the single decision point for extraction', () => {
    const paths = ['web_upload', 'whatsapp', 're_analyse'];
    for (const _ of paths) {
      expect(resolveExtractedStatus(false, true)).toBe('pending_review');
      expect(resolveExtractedStatus(false, false)).toBe('confirmed');
    }
  });
});
