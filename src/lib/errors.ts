// Turning database errors into sentences a person can act on.
//
// Every RPC in the expense module raises P0001 with a message written for the
// reader ("This receipt is on an invoice that has already left draft…"), so those
// pass through whole. Anything else is a shape the user did not cause and cannot
// fix from a toast, so it gets a plain sentence and the detail goes to the
// console for us.

type MaybePostgrest = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const BY_CODE: Record<string, string> = {
  '23505': 'That already exists. Refresh the page and check before trying again.',
  '23503': 'Something else is still using this, so it cannot be changed here.',
  '42501': 'You do not have permission to do that.',
  '40001': 'Somebody else changed this at the same moment. Try again.',
  '55P03': 'This record is busy right now. Try again in a moment.',
  PGRST301: 'Your session has expired. Sign in again.',
};

/**
 * P0001 is our own `raise exception` — the message is already the sentence we
 * want shown. Everything else is unexpected.
 */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as MaybePostgrest | null;
  if (!e || typeof e !== 'object') return fallback;

  if (e.code === 'P0001' && e.message) return e.message;
  if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];

  // Raw Postgres text should never reach a person: these are the giveaways.
  const raw = e.message ?? '';
  const looksRaw = /row-level security|violates|constraint|relation ".*" does not exist|syntax error|function .* does not exist/i
    .test(raw);
  if (raw && !looksRaw) return raw;

  if (raw) console.error('[risip] unexpected database error:', raw, e.details ?? '');
  return fallback;
}
