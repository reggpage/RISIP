// Does this shop plausibly already stock this?
//
// A DELIBERATELY LOOSER TEST than the one that writes money, and the looseness
// is the point. Choosing WHICH product a sale is against must be exact, because
// getting it wrong puts a figure on the wrong line of somebody's books. This
// question is only ever used to decide what to SAY: whether to tell the trader
// a name looks new and offer to register it. A false "known" costs nothing but
// a missing offer; a false "new" tells a shopkeeper he does not sell something
// he has sold for months.
//
// MEASURED, and it is why this exists. The owner sent eleven products, two of
// them genuinely new, and was told SEVEN were new:
//
//   Puch     -> punch                     one missing letter
//   rosali   -> Rosali ya Maria           the short name everyone actually says
//   kitabu   -> kitabu cha hesabu AND
//               Kitabu cha Tenzi za Rohoni  two registered books, not zero
//   kofia, shuka                          genuinely new
//
// The exact resolver is right to refuse all five — it is being asked which one
// product to bill, and for three of them there is no honest single answer. This
// is a different question, so it gets a different test.

import { withinOneEdit } from './whatsappSpelling.ts';
import { productKey } from './whatsappProductNames.ts';

const words = (name: string) => productKey(name).split(' ').filter(Boolean);

/**
 * True when the catalogue plausibly already contains what the trader typed.
 *
 * Three ways in, cheapest first: the same name, a name one keystroke away, or
 * the opening words of a longer registered name. The last is how shops really
 * talk — nobody standing at a counter says "Rosali ya Maria".
 */
export function shopMayAlreadyStock(asked: string, catalogue: string[]): boolean {
  const wanted = productKey(asked);
  if (!wanted) return false;
  const wantedWords = words(asked);

  for (const entry of catalogue) {
    const known = productKey(entry);
    if (!known) continue;
    if (known === wanted) return true;

    // "Puch" for punch, "altasi" for atlasi. One keystroke, and only on names
    // long enough that a single edit is not most of the word.
    if (wanted.length >= 4 && withinOneEdit(wanted, known)) return true;

    // "rosali" for Rosali ya Maria, "kitabu" for kitabu cha hesabu. The asked
    // name must be the OPENING of the registered one, whole words only, so
    // "sala" does not quietly match "nguvu ya sala" — that is a different
    // product and a shop saying it means something else.
    const knownWords = words(entry);
    if (wantedWords.length > 0 && wantedWords.length < knownWords.length) {
      const opensIt = wantedWords.every((word, index) => knownWords[index] === word);
      if (opensIt) return true;
    }
  }
  return false;
}
