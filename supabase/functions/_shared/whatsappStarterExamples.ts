// The examples in the welcome message, drawn from the trade the person is in.
//
// MEASURED FAILURE. A bakery called "Allen's cake" was welcomed with an example
// about a dictionary, a notebook and a kilo of sugar. The owner's words:
// "mifano haiendani na biashara kabisa". A worked example is only worth
// printing if the reader recognises the goods in it — otherwise it reads as
// instructions for somebody else's shop, and the first thing they have to do is
// translate it.
//
// The classifier already knows the trade by the time this is sent. Nothing here
// is written to the database: these are illustrations, never a starter
// catalogue. A shop's products are its own, and inventing them would put names
// in the ledger that nobody sold.

export type StarterExample = {
  /** Registering a product: name, buying price, selling price. */
  register: string[];
  /**
   * One registration line that carries BOTH prices.
   *
   * A shop shown only retail examples never registers a wholesale price, and
   * then gets asked "rejareja au jumla?" on every sale it makes. One worked
   * line in the welcome is cheaper than that question, for ever.
   */
  bulk: string;
  /** Two goods for the sale example. */
  sold: string[];
  /** Two goods for the stock example, with plausible shelf quantities. */
  onShelf: string[];
};

const GENERAL: StarterExample = {
  register: ['Sukari @2500 nauza 3500 kwa kilo', 'Sabuni @900 nauza 1200'],
  bulk: 'Soda @700 nauza rejareja 1000 jumla 900 kuanzia 12',
  sold: ['sukari 2', 'soda 5'],
  onShelf: ['sukari 40', 'soda 24'],
};

const BY_SUBCATEGORY: Record<string, StarterExample> = {
  'Kijiwe cha Chips': {
    register: ['Chips kavu @1500 nauza 2500', 'Chips mayai @2000 nauza 3500'],
    bulk: 'Soda @700 nauza rejareja 1000 jumla 900 kuanzia 12',
    sold: ['zege 8', 'kavu 5'],
    onShelf: ['viazi gunia 2', 'mayai treya 6'],
  },
  'Mama Lishe': {
    register: ['Wali maharage @1200 nauza 2000', 'Chai @300 nauza 500'],
    bulk: 'Maandazi @150 nauza rejareja 300 jumla 250 kuanzia 10',
    sold: ['wali maharage 12', 'chai 20'],
    onShelf: ['mchele kilo 25', 'maharage kilo 15'],
  },
  Bakery: {
    register: ['Keki kipande @800 nauza 1500', 'Mkate @1800 nauza 2500'],
    bulk: 'Maandazi @150 nauza rejareja 300 jumla 250 kuanzia 10',
    sold: ['keki 6', 'mkate 4'],
    onShelf: ['unga kilo 25', 'sukari kilo 10'],
  },
  'Genge la Mboga na Matunda': {
    register: ['Nyanya @400 nauza 700 kwa kilo', 'Vitunguu @1200 nauza 1800 kwa kilo'],
    bulk: 'Ndizi @300 nauza rejareja 500 jumla 400 kuanzia 12',
    sold: ['nyanya kilo 4', 'ndizi 12'],
    onShelf: ['nyanya kilo 20', 'vitunguu kilo 15'],
  },
  'Duka la Vinywaji na Grocery': {
    register: ['Maji @400 nauza 600', 'Juice @1000 nauza 1500'],
    bulk: 'Soda @700 nauza rejareja 1000 jumla 900 kuanzia 12',
    sold: ['soda 12', 'maji 8'],
    onShelf: ['soda kreti 6', 'maji kreti 4'],
  },
  "Duka la Mang'aa / Rejareja": GENERAL,
};

const BY_CATEGORY: Record<string, StarterExample> = {
  'Food & Beverages': BY_SUBCATEGORY['Mama Lishe'],
  'Retail & General Stores': GENERAL,
};

/**
 * The closest example set for this trade, falling back to a general shop.
 *
 * Sub-category first because it is the specific answer; the category is the
 * safety net when a sub-category has no examples of its own yet.
 */
export function starterExample(
  category: string | null | undefined,
  subCategory: string | null | undefined,
): StarterExample {
  return BY_SUBCATEGORY[String(subCategory ?? '')]
    ?? BY_CATEGORY[String(category ?? '')]
    ?? GENERAL;
}

/**
 * The first message a new business receives, in its own trade's words.
 *
 * Lives here rather than inline in the webhook because it is the single most
 * read message in the product — it is what a shopkeeper is looking at while
 * they decide whether this thing is worth their time — and it has to be
 * reviewable, quotable and testable on its own.
 *
 * The old version ended at "send login for a link", and somebody who had just
 * answered four questions still had no idea what to type next. These are the
 * first three things worth doing, in the order that makes each one useful: a
 * price list makes a sale priceable, a count makes stock answerable.
 */
export function businessWelcome(
  person: string,
  businessName: string,
  category: string | null | undefined,
  subCategory: string | null | undefined,
  lang: 'sw' | 'en',
): string {
  const eg = starterExample(category, subCategory);
  const italic = (lines: string[]) => lines.map((line) => `_${line}_`).join('\n');
  // Three words, not two. Registering a product and putting stock on the shelf
  // are different things and the owner asked for a word for each: *nasajili
  // bidhaa* sets the prices once, *naongeza bidhaa* is how many arrived.
  //
  // The registration example carries BOTH prices, because a shop that only ever
  // sees a retail example never tells us its wholesale price and then gets
  // asked about it on every sale. Where nothing says which, retail is what is
  // used — so the example says that too, in one line.
  return lang === 'sw'
    ? `Sawa ${person}, karibu ${businessName} 🎉\n\n`
      + 'Maneno matatu ndiyo yanatosha kuendesha duka lako hapa.\n\n'
      + '1️⃣ *nasajili bidhaa* — bei ya kununua na ya kuuza, mstari mmoja kwa kila bidhaa:\n'
      + `_nasajili bidhaa_\n${italic(eg.register)}\n`
      + `_${eg.bulk}_\n`
      + 'Ukiuza kwa vipimo, sema hivi: _kwa kilo_, _nusu_, _robo_.\n'
      + 'Usipotaja rejareja au jumla, natumia rejareja.\n\n'
      + '2️⃣ *mauzo* — kisha orodha ya vilivyouzwa:\n'
      + `_mauzo_\n${italic(eg.sold)}\n\n`
      + '3️⃣ *naongeza bidhaa* — kisha orodha ya vilivyoingia dukani:\n'
      + `_naongeza bidhaa_\n${italic(eg.onShelf)}\n\n`
      + 'Bei sitakuuliza tena — nitatumia zile ulizosajili mwenyewe.\n\n'
      + 'Ukitaka kuingia kwenye webapp tuma *ingia*.\n'
      + 'Ukitaka kuona dashboard tuma *dashboard*.\n'
      + 'Ukitaka kumualika mfanyakazi tuma *mualike*.\n'
      + 'Ukikwama tuma *msaada*.'
    : `Okay ${person}, welcome to ${businessName} 🎉\n\n`
      + 'Three words are all you need to run your shop here.\n\n'
      + '1️⃣ *nasajili bidhaa* — the buying and selling price, one line per product:\n'
      + `_nasajili bidhaa_\n${italic(eg.register)}\n`
      + `_${eg.bulk}_\n`
      + 'If you sell by measure, say so: _kwa kilo_, _nusu_, _robo_.\n'
      + 'If a sale names neither retail nor wholesale, I use retail.\n\n'
      + '2️⃣ *mauzo* — then the list of what sold:\n'
      + `_mauzo_\n${italic(eg.sold)}\n\n`
      + '3️⃣ *naongeza bidhaa* — then the list of what came into the shop:\n'
      + `_naongeza bidhaa_\n${italic(eg.onShelf)}\n\n`
      + 'I will not ask for prices again — I use the ones you registered.\n\n'
      + 'To log in on the web app send *ingia*.\n'
      + 'To see the dashboard send *dashboard*.\n'
      + 'To invite a co-worker send *mualike*.\n'
      + 'If you get stuck send *msaada*.';
}
