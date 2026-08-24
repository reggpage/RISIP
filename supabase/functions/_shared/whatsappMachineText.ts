// The backstop between the machine and the shopkeeper.
//
// Some strings in this system are written for the MODEL to read — the
// `business=… revenue=…` evidence a tool hands the model, the `ADVISER MODE`
// instruction block, the system prompt. They are data, not a reply. Twice now
// one of them has reached a real WhatsApp because a single branch read the
// wrong field, and each time it looked to the shopkeeper like Risip had broken
// open and spilled its insides.
//
// Fixing each branch is necessary and never sufficient: the next branch will do
// it again. So this sits at the one door every outgoing message passes through,
// and refuses to let machine text out — whatever branch built it.

/**
 * Is this text meant for the model rather than for a person?
 *
 * Deliberately narrow: it must never block a real answer. A shopkeeper's reply
 * can contain an `=` or a shout, so a single such line is fine — it is the
 * DENSITY of `key=value` lines, or an unmistakable internal heading, that gives
 * a machine payload away.
 */
export function looksLikeMachineText(text: string | null | undefined): boolean {
  const said = String(text ?? '').trim();
  if (!said) return false;

  // An evidence dump: several lines of `lower_snake_key=value`.
  const keyed = said.split('\n').filter((line) => /^[a-z][a-z_]+=/.test(line.trim())).length;
  if (keyed >= 3) return true;

  // A prompt fragment: an ALL-CAPS instruction heading no shopkeeper would type
  // and no answer would contain.
  return /\b(?:ADVISER MODE|BUSINESS RULES|ANSWER THE QUESTION|WHAT THIS SHOP CAN ASK|LIVE CONTEXT|GROUNDING AND TOOLS|WRITES AND HUMAN CONTROL)\b/
    .test(said);
}
