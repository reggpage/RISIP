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
  /** Two goods for the sale example. */
  sold: string[];
  /** Two goods for the stock example, with plausible shelf quantities. */
  onShelf: string[];
};

const GENERAL: StarterExample = {
  register: ['Sukari @2500 nauza 3500 kwa kilo', 'Sabuni @900 nauza 1200', 'Soda @700 nauza 1000'],
  sold: ['sukari 2', 'soda 5'],
  onShelf: ['sukari 40', 'soda 24'],
};

const BY_SUBCATEGORY: Record<string, StarterExample> = {
  'Kijiwe cha Chips': {
    register: ['Chips kavu @1500 nauza 2500', 'Chips mayai @2000 nauza 3500', 'Soda @700 nauza 1000'],
    sold: ['zege 8', 'kavu 5'],
    onShelf: ['viazi gunia 2', 'mayai treya 6'],
  },
  'Mama Lishe': {
    register: ['Wali maharage @1200 nauza 2000', 'Chai @300 nauza 500', 'Maandazi @150 nauza 300'],
    sold: ['wali maharage 12', 'chai 20'],
    onShelf: ['mchele kilo 25', 'maharage kilo 15'],
  },
  Bakery: {
    register: ['Keki kipande @800 nauza 1500', 'Mkate @1800 nauza 2500', 'Maandazi @150 nauza 300'],
    sold: ['keki 6', 'mkate 4'],
    onShelf: ['unga kilo 25', 'sukari kilo 10'],
  },
  'Genge la Mboga na Matunda': {
    register: ['Nyanya @400 nauza 700 kwa kilo', 'Vitunguu @1200 nauza 1800 kwa kilo', 'Ndizi @300 nauza 500'],
    sold: ['nyanya kilo 4', 'ndizi 12'],
    onShelf: ['nyanya kilo 20', 'vitunguu kilo 15'],
  },
  'Duka la Vinywaji na Grocery': {
    register: ['Soda @700 nauza 1000', 'Maji @400 nauza 600', 'Juice @1000 nauza 1500'],
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
  return lang === 'sw'
    ? `Sawa ${person}, karibu ${businessName} 🎉\n\n`
      + 'Anza kwa kusajili bidhaa zako. Nitumie orodha yako ikiwa na bei ya '
      + 'kununua na bei ya kuuza, mstari mmoja kwa kila bidhaa:\n\n'
      + `${italic(eg.register)}\n\n`
      + 'Baada ya hapo, maneno mawili ndiyo yanatosha:\n\n'
      + '*mauzo* — kisha orodha ya vilivyouzwa\n'
      + `_mauzo_\n${italic(eg.sold)}\n\n`
      + '*naongeza bidhaa* — kisha orodha ya vilivyoingia dukani\n'
      + `_naongeza bidhaa_\n${italic(eg.onShelf)}\n\n`
      + 'Bei sitakuuliza tena — nitatumia zile ulizosajili mwenyewe.\n'
      + 'Ukitaka kuingia kwenye webapp andika *ingia*.\n'
      + 'Ukitaka kumualika mfanyakazi andika *mualike*.\n'
      + 'Ukikwama andika *msaada*.'
    : `Okay ${person}, welcome to ${businessName} 🎉\n\n`
      + 'Start by registering your products. Send me your list with the buying '
      + 'price and the selling price, one line per product:\n\n'
      + `${italic(eg.register)}\n\n`
      + 'After that, two words are all you need:\n\n'
      + '*mauzo* — then the list of what sold\n'
      + `_mauzo_\n${italic(eg.sold)}\n\n`
      + '*add product* — then the list of what came into the shop\n'
      + `_add product_\n${italic(eg.onShelf)}\n\n`
      + 'I will not ask for prices again — I use the ones you registered.\n'
      + 'If you want to log in on the web app send *login*.\n'
      + 'If you want to invite a co-worker send *invite*.\n'
      + 'If you get stuck send *help*.';
}
