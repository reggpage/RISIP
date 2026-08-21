import type { UserRole } from './roles';

// What the app shows a shopkeeper today.
//
// Risip started for a civil-engineering firm, and it still carries everything
// that shape of business needs: projects, receipts to approve, retirements,
// reimbursements, supplier claims, invoices, petty cash. A duka has none of
// those. The owner's instruction, in their words: "vitu vyote vinavyohusiana na
// kampuni vi-comment kwanza… tunafocus na biashara kwanza."
//
// So this is a list of what is SWITCHED ON, not a deletion. Every route still
// exists, every page still works, and anyone with the URL can reach it — a
// contractor's data is untouched and turning a section back on is one line
// here. Hiding is reversible; deleting is a decision that would have to be
// unpicked from thirty files.
//
// The test of whether something belongs on this list: would a woman running a
// duka open it in the same week she signed up?

export type NavKey =
  | 'dashboard' | 'daily-records' | 'products' | 'sell' | 'notifications' | 'settings'
  // Off for now — the contractor half of the product.
  | 'projects' | 'receipts' | 'retirements' | 'reimbursements' | 'claims' | 'invoices' | 'petty-cash';

/** In the side panel, in this order. */
export const VISIBLE_NAV: readonly NavKey[] = [
  'dashboard',
  'sell',
  'products',
  'daily-records',
  'notifications',
  'settings',
];

/**
 * Off, with the reason, so the next person to read this knows it was a choice.
 *
 * Turning one back on means adding its key to VISIBLE_NAV. Nothing else.
 */
export const HIDDEN_NAV: Readonly<Record<string, string>> = {
  projects: 'A duka has no projects. Built for the engineering firm.',
  receipts: 'Supplier receipt capture and approval — the contractor workflow.',
  retirements: 'Advances retired against receipts. Contractor workflow.',
  reimbursements: 'Staff paid back for spending. Contractor workflow.',
  claims: 'Supplier claims portal. Contractor workflow.',
  invoices: 'Category-grouped invoices for a client. Contractor workflow.',
  'petty-cash': 'Per-person cash floats. Contractor workflow.',
};

export function navVisible(key: NavKey): boolean {
  return VISIBLE_NAV.includes(key);
}

export type NavItem = {
  key: NavKey;
  to: string;
  label: string;
  allowed: readonly UserRole[];
};
