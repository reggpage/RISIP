// Where a freshly-extracted receipt lands.
//
// Pure and free of Deno globals so the same function runs in extract-receipt and
// under vitest. Extracted from the edge function precisely because this decision
// is what broke browser testing: with the approval flow on, a confident read was
// still writing 'confirmed', which the transition guard refused, surfacing as a
// 500 and "Extraction failed".

export type ExtractedStatus = 'pending_review' | 'confirmed';

/**
 * @param needsReview   the model was unsure, or a field failed validation
 * @param approvalFlow  the company runs the submit → approve lifecycle
 *
 * A company running the approval flow never lets extraction confirm anything,
 * however confident the model is — confirming is a human decision that has to be
 * submitted and approved. With the flow off, behaviour is unchanged: a clean,
 * high-confidence read still auto-confirms.
 */
export function resolveExtractedStatus(
  needsReview: boolean,
  approvalFlow: boolean,
): ExtractedStatus {
  return needsReview || approvalFlow ? 'pending_review' : 'confirmed';
}

/**
 * Why it is not confirmed, so the reply can say "waiting for you to submit it"
 * rather than implying the scan was poor.
 */
export function extractedStatusReason(
  needsReview: boolean,
  approvalFlow: boolean,
): 'needs review' | 'awaiting submission and approval' | undefined {
  if (!needsReview && !approvalFlow) return undefined;
  // Approval is the stronger reason: with the flow on it applies regardless.
  return approvalFlow ? 'awaiting submission and approval' : 'needs review';
}
