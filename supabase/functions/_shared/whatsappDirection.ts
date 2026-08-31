// Did the trader say what happened to these goods?
//
// THE OWNER'S RULE, given twice and the second time in anger: "kila record
// yenye idadi ya bidhaa ai inabidi iulize swali kwanza". Every record carrying
// product quantities asks first — sales, purchase, or count — unless the
// message itself already said which.
//
// MEASURED, why this is a server gate and not a model instruction. The tool
// was given a `direction` field in missing_fields and a description explaining
// that a bare list is three messages wearing the same clothes. The model was
// handed nine products with no verb anywhere and still chose stock_count and
// drafted it. Telemetry, 14:35:49: propose_business_event, stock_count,
// drafted. The guard that depended on the model saying "I don't know" never
// fired, because the model did not think it did not know.
//
// So this is decided here. It is not the parser reading intent — the model
// still resolves every product, quantity and unit. This asks one narrow
// question about the raw message: is there a word in it that states a
// direction? If there is not, the server refuses to pick one.
//
// THE ASYMMETRY DECIDES THE WORD LIST. Asking when we did not need to costs a
// tap. Not asking when we should have erases a day's takings and overwrites
// the shelf in the same stroke. So the list holds only words that are
// unmistakable, and anything doubtful is left out — leaving it out means we
// ask, which is the safe direction to be wrong in.

const DIRECTION = new RegExp(
  '(?:'
  // Sold. The verb stem is uza; every person and tense of it counts.
  + '\\buza\\w*|\\w*meuza\\b|\\w*liuza\\b|\\bmauzo\\b|\\bsold\\b|\\bsales?\\b'
  // Bought, brought in, added to the shelf.
  + '|\\bnunua\\w*|\\w*menunua\\b|\\w*linunua\\b|\\bmanunuzi\\b|\\bununuzi\\b'
  + '|\\bongeza\\w*|\\w*meongeza\\b|\\w*meleta\\b|\\bbought\\b|\\bbuy\\b|\\bpurchase\\w*\\b'
  // Counted, or on the shelf right now.
  + '|\\bhesabu\\w*|\\w*mehesabu\\b|\\bnilizonazo\\b|\\bninazo\\b|\\bnilizo\\w*'
  + '|\\bzilizopo\\b|\\bziwe\\b|\\biwe\\b|\\bzibaki\\b|\\bibaki\\b'
  + '|\\bstoo\\b|\\bstore\\b|\\bstock\\b|\\bcount\\w*\\b'
  // On credit is a sale, and says so.
  + '|\\bdeni\\b|\\bmkopo\\b|\\bsijalipa\\b|\\batalipa\\b|\\bnitalipa\\b'
  // Gone, one way or another. Not a count and not a sale, but stated.
  + '|\\w*meoza\\b|\\w*meharibika\\b|\\w*mepotea\\b|\\w*mechukua\\b|\\w*metumia\\b|\\w*mekula\\b'
  + ')',
  'iu',
);

/**
 * True when the message itself says what happened to the goods.
 *
 * False means the server must ask rather than choose, however confident the
 * model was about which of the three it meant.
 */
export function messageStatesDirection(said: string | null | undefined): boolean {
  const text = String(said ?? '');
  if (!text.trim()) return false;
  return DIRECTION.test(text);
}
