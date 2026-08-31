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
/**
 * MESSAGE 6 — what Risip is for, before anything is asked of them.
 *
 * MEASURED: businessWelcome below is 899 characters over 30 lines, and it
 * arrives the second somebody finishes signing up. Everything in it is true and
 * almost none of it is read — a person who has answered five questions is not
 * about to study a manual, and teaching everything on day one is how nothing is
 * learned.
 *
 * So the wall becomes three messages, and this is the first: five things Risip
 * does, no syntax, no commands, no question. The owner asked for exactly this —
 * "kazi yake kwa bullets yani kitu kiwe proffessional and simple to use".
 */
export function businessReady(person: string, businessName: string, lang: 'sw' | 'en'): string {
  return lang === 'sw'
    ? `✅ *${businessName}* limefunguliwa. Karibu, ${person}.\n\n`
      + 'Ninachoweza kukufanyia:\n'
      + '• Kurekodi mauzo ya kila siku\n'
      + '• Kuhesabu bidhaa zilizopo\n'
      + '• Kufuatilia madeni ya wateja\n'
      + '• Kukuambia faida yako\n'
      + '• Kufunga siku na kukupa ripoti'
    : `✅ *${businessName}* is open. Welcome, ${person}.\n\n`
      + 'What I can do for you:\n'
      + '• Record every day’s sales\n'
      + '• Count the stock on hand\n'
      + '• Follow customer debts\n'
      + '• Tell you your profit\n'
      + '• Close the day and report it';
}

/**
 * MESSAGE 7 — asked now, because later means never.
 *
 * The owner: "ai lazima imuulize mtu baada ya usajili kama anataka kumwalika
 * mfanyakazi wake." Waiting for somebody to remember the word "mualike" is
 * waiting for a thing that does not happen.
 *
 * Numbered, per his rule: a choice with two answers needs no spelling.
 */
export function workerOffer(lang: 'sw' | 'en'): string {
  return lang === 'sw'
    ? 'Una mfanyakazi wa kumualika?\n\n'
      + '*1* Ndiyo, nimualike sasa\n'
      + '*2* Baadaye'
    : 'Do you have a worker to invite?\n\n'
      + '*1* Yes, invite them now\n'
      + '*2* Later';
}

/**
 * MESSAGE 8 — the one thing to do next.
 *
 * A new shop has no products, so nothing else is possible yet: there is nothing
 * to sell and no shelf to count. This is not a restriction, it is the only door
 * that is open — and the moment three products exist, selling works the same
 * minute.
 *
 * Wholesale is mentioned in ONE line, after the simple form, and not explained.
 * The full syntax lesson belongs where it is needed, which is the first time a
 * product genuinely has two prices.
 */
export function firstProductsPrompt(
  category: string | null | undefined,
  subCategory: string | null | undefined,
  lang: 'sw' | 'en',
): string {
  const eg = starterExample(category, subCategory);
  const italic = (lines: string[]) => lines.map((line) => `_${line}_`).join('\n');
  const twoLines = italic(eg.register.slice(0, 2));
  return lang === 'sw'
    ? 'Tuanze na bidhaa zako. Andika hivi, moja kwa mstari:\n\n'
      + `${twoLines}\n\n`
      + '*@* ni bei ya kununua, *nauza* ni bei ya kuuza.\n\n'
      + '_Bidhaa ikiwa na bei ya jumla, ongeza: jumla 900 kuanzia 12._\n'
      + 'Ukikwama tuma *msaada*.'
    : 'Let us start with your products. Write them like this, one per line:\n\n'
      + `${twoLines}\n\n`
      + '*@* is the buying price, *nauza* is the selling price.\n\n'
      + '_If a product has a wholesale price, add: jumla 900 kuanzia 12._\n'
      + 'Send *msaada* if you get stuck.';
}

export function businessWelcome(
  person: string,
  businessName: string,
  category: string | null | undefined,
  subCategory: string | null | undefined,
  lang: 'sw' | 'en',
): string {
  const eg = starterExample(category, subCategory);
  const italic = (lines: string[]) => lines.map((line) => `_${line}_`).join('\n');
  // Registering products, sales, and a physical shelf count are different
  // things. "Naongeza bidhaa" was removed here because it does not say whether
  // the listed number is newly arrived stock or the full count now on hand.
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
      + '3️⃣ *hesabu bidhaa* — kisha orodha ya idadi zote zilizopo sasa:\n'
      + `_hesabu bidhaa_\n${italic(eg.onShelf)}\n\n`
      + 'Ukinunua bidhaa mpya, taja idadi na gharama, mfano: '
      + '_nimenunua sabuni 20 kila moja TSh 1,500_.\n\n'
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
      + '3️⃣ *stock count* — then list every quantity currently on hand:\n'
      + `_stock count_\n${italic(eg.onShelf)}\n\n`
      + 'When you buy new stock, include the quantity and cost, for example: '
      + '_I bought soap 20 each TSh 1,500_.\n\n'
      + 'I will not ask for prices again — I use the ones you registered.\n\n'
      + 'To log in on the web app send *ingia*.\n'
      + 'To see the dashboard send *dashboard*.\n'
      + 'To invite a co-worker send *mualike*.\n'
      + 'If you get stuck send *msaada*.';
}
