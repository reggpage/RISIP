/**
 * Cross-shop restocking over WhatsApp.
 *
 * A shop owner who has run out writes "Nimeishiwa Sabuni". Risip answers with
 * the shops that currently hold it, the owner replies "2 x 50", and an order
 * lands in that shop with contact details going both ways.
 *
 * Every figure here comes from a scoped RPC. Nothing in this file computes a
 * quantity, a price or a match: the database ranks the candidates and this
 * renders them. The model never sees a shop's stock except through these
 * tools, and never invents one.
 *
 * Tenant note: this is the only path in Risip that shows one company another
 * company's data. It is gated on mutual opt-in in
 * company_marketplace_settings — a shop that does not publish its own stock
 * cannot see anyone else's, and the default is off.
 */

// Same specifier the webhook pins, so this matches its `Admin` exactly rather
// than relying on a structural type that happens to line up.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type Db = SupabaseClient;

export type MarketplaceLang = 'sw' | 'en';

export type MarketplaceOption = {
  supplier_company_id: string;
  supplier_name: string;
  supplier_product_key: string;
  product_name: string;
  quantity: number;
  unit: string | null;
  stock_counted_at: string | null;
  stock_age_days: number | null;
  unit_price: number | null;
  min_quantity: number | null;
  currency: string | null;
  match_basis: 'barcode' | 'exact_name' | 'prefix_name' | 'fuzzy_name';
  match_confidence: number;
};

type SelectionResult = {
  selectionId: string | null;
  query: string;
  options: MarketplaceOption[];
};

type ContactCard = {
  companyId: string;
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  whatsapp: string | null;
};

const errorMessage = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message)
    : 'unknown_error';

/**
 * How old a stock count is, in words.
 *
 * Always rendered, never omitted. stock_counts is a periodic count, not a live
 * balance: a nine-day-old figure is a legitimate answer but presenting it as
 * current produces orders for goods that sold out last week.
 */
function ageWording(days: number | null, lang: MarketplaceLang): string {
  if (days === null) return lang === 'sw' ? 'tarehe haijulikani' : 'date unknown';
  if (days <= 0) return lang === 'sw' ? 'leo' : 'today';
  if (days === 1) return lang === 'sw' ? 'jana' : 'yesterday';
  if (days === 2) return lang === 'sw' ? 'juzi' : '2 days ago';
  return lang === 'sw' ? `siku ${days} zilizopita` : `${days} days ago`;
}

function priceWording(option: MarketplaceOption, lang: MarketplaceLang): string {
  // unit_price is null whenever the supplier shares stock but not prices.
  // Saying so plainly beats implying the goods are free.
  if (option.unit_price === null) return lang === 'sw' ? 'bei kwa mazungumzo' : 'price on request';
  const amount = Math.round(option.unit_price).toLocaleString('en-US');
  return `${amount}/=`;
}

function contactLines(card: ContactCard | null, lang: MarketplaceLang): string {
  if (!card) return lang === 'sw' ? 'Mawasiliano hayapatikani.' : 'No contact available.';
  const who = card.contactName || card.companyName || (lang === 'sw' ? 'Duka' : 'Shop');
  const numbers = [card.phone, card.whatsapp && card.whatsapp !== card.phone ? `WhatsApp: ${card.whatsapp}` : null]
    .filter(Boolean).join('\n');
  return numbers ? `${who}\n${numbers}` : who;
}

/** The numbered list the owner picks from. */
export function renderOptions(result: SelectionResult, lang: MarketplaceLang): string {
  const head = lang === 'sw'
    ? `Maduka yenye *${result.query}*:`
    : `Shops with *${result.query}*:`;
  const rows = result.options.map((option, index) => {
    const qty = `${Math.round(option.quantity).toLocaleString('en-US')}${option.unit ? ` ${option.unit}` : ''}`;
    return `${index + 1}. ${option.supplier_name} — ${qty} · ${priceWording(option, lang)} · ${ageWording(option.stock_age_days, lang)}`;
  });
  const foot = lang === 'sw'
    ? 'Jibu namba na kiasi. Mf: "2 x 50"'
    : 'Reply with the number and quantity. E.g. "2 x 50"';
  return [head, '', ...rows, '', foot].join('\n');
}

/**
 * Nothing found — and why.
 *
 * A bare "hakuna" makes the owner retype the same word five times. The two
 * real causes are a stale count and a narrower name than anyone stocks, so
 * both are named.
 */
export function renderNoResults(query: string, lang: MarketplaceLang): string {
  return lang === 'sw'
    ? `Hakuna duka lenye *${query}* kwa sasa.\n\n`
      + 'Sababu: hakuna aliye na kiasi, au hesabu ya mzigo ni ya zamani.\n'
      + 'Jaribu jina fupi, mf. "sabuni" badala ya "sabuni ya unga".'
    : `No shop currently has *${query}*.\n\n`
      + 'Either nobody holds any, or their stock count is too old to trust.\n'
      + 'Try a shorter name, e.g. "soap" rather than "soap powder 500g".';
}

/** Step one: find the shops, and remember the list so a numeric reply resolves. */
export async function marketplaceSearch(
  db: Db,
  companyId: string,
  profileId: string,
  query: string,
  lang: MarketplaceLang,
): Promise<{ content: string; terminalReply: string; isError?: boolean; errorCode?: string }> {
  const { data, error } = await db.rpc('marketplace_create_selection', {
    p_buyer_company_id: companyId,
    p_query: query,
    p_buyer_profile_id: profileId,
    p_limit: 5,
  });

  if (error) {
    const code = errorMessage(error);
    // The shop has not joined. This is consent, not a fault, so it is said
    // plainly rather than dressed as a system error.
    if (/marketplace_not_opted_in|not joined/i.test(code)) {
      const reply = lang === 'sw'
        ? 'Biashara yako haijajiunga na mtandao wa kubadilishana mzigo.\n\n'
          + 'Ukijiunga, maduka mengine yataona una nini na wewe utaona wana nini. Wasiliana na Risip kujiunga.'
        : 'Your business has not joined the restock network.\n\n'
          + 'Joining means other shops can see what you hold, and you can see theirs. Contact Risip to join.';
      return { content: 'marketplace_not_opted_in', terminalReply: reply, isError: true, errorCode: 'marketplace_not_opted_in' };
    }
    return {
      content: `marketplace_search_failed: ${code}`,
      terminalReply: lang === 'sw'
        ? 'Sijaweza kutafuta maduka kwa sasa. Jaribu tena baadaye.'
        : 'I could not search other shops just now. Try again shortly.',
      isError: true,
      errorCode: 'marketplace_search_failed',
    };
  }

  const result = data as SelectionResult;
  const options = result?.options ?? [];
  if (!options.length) {
    const reply = renderNoResults(query, lang);
    return { content: 'marketplace_no_results', terminalReply: reply };
  }

  const reply = renderOptions({ ...result, query }, lang);
  // The model is told what was shown so it does not re-answer or invent a row,
  // but the shopkeeper sees the server-built list verbatim.
  return {
    content: `marketplace_options_shown=${options.length} selection_id=${result.selectionId}`,
    terminalReply: reply,
  };
}

/**
 * Step two, part one: show what is about to be committed.
 *
 * Nothing is written here. The model read "2 x 50" and could have read it
 * wrong, and the far side of this is another business expecting to be paid,
 * so the shopkeeper confirms the draft before anything moves — the same
 * contract every other write in Risip follows.
 */
export async function marketplaceDraftOrder(
  db: Db,
  companyId: string,
  optionIndex: number,
  quantity: number,
  lang: MarketplaceLang,
): Promise<{ ok: false; reply: string } | { ok: true; reply: string; option: MarketplaceOption }> {
  const { data, error } = await db.rpc('marketplace_open_selection', {
    p_buyer_company_id: companyId,
  });
  const selection = data as { options?: MarketplaceOption[] } | null;
  if (error || !selection?.options?.length) {
    return {
      ok: false,
      reply: lang === 'sw'
        ? 'Orodha imeisha muda. Andika tena unachohitaji, mf. "Nimeishiwa sabuni".'
        : 'That list has expired. Say what you need again, e.g. "I have run out of soap".',
    };
  }

  const option = selection.options[optionIndex - 1];
  if (!option) {
    return {
      ok: false,
      reply: lang === 'sw'
        ? `Chagua namba kati ya 1 na ${selection.options.length}.`
        : `Pick a number between 1 and ${selection.options.length}.`,
    };
  }

  const qty = `${Math.round(quantity).toLocaleString('en-US')}${option.unit ? ` ${option.unit}` : ''}`;
  const cost = option.unit_price === null
    ? (lang === 'sw' ? 'bei kwa mazungumzo' : 'price on request')
    : `${Math.round(option.unit_price * quantity).toLocaleString('en-US')}/=`;
  // The supplier's own product name, not the trader's wording: a fuzzy match
  // is visible here, while it is still a draft.
  const warn = option.match_basis === 'fuzzy_name'
    ? (lang === 'sw'
      ? `\n\n⚠️ Jina lilifanana tu. Wameiandika kama "${option.product_name}".`
      : `\n\n⚠️ The names only resembled each other. They list it as "${option.product_name}".`)
    : '';

  const reply = lang === 'sw'
    ? `Thibitisha oda:\n\n${qty} ${option.product_name}\nKutoka: ${option.supplier_name}\nJumla: ${cost}${warn}\n\nNituma? *1* Ndiyo · *2* Hapana`
    : `Confirm this order:\n\n${qty} ${option.product_name}\nFrom: ${option.supplier_name}\nTotal: ${cost}${warn}\n\nSend it? *1* Yes · *2* No`;

  return { ok: true, reply, option };
}

/** Step two, part two: the shopkeeper said NDIYO. Place it and hand over contacts. */
export async function marketplaceOrder(
  db: Db,
  companyId: string,
  profileId: string,
  optionIndex: number,
  quantity: number,
  lang: MarketplaceLang,
): Promise<{ content: string; terminalReply: string; isError?: boolean; errorCode?: string }> {
  // The selection id comes from the server's own record of what was last shown
  // to THIS company, never from the model: a model-supplied id would let a
  // crafted message order against another shop's list.
  const { data: pending, error: pendingError } = await db.rpc('marketplace_last_selection', {
    p_buyer_company_id: companyId,
  });
  if (pendingError || !pending) {
    const reply = lang === 'sw'
      ? 'Orodha imeisha muda. Andika tena unachohitaji, mf. "Nimeishiwa sabuni".'
      : 'That list has expired. Say what you need again, e.g. "I have run out of soap".';
    return { content: 'marketplace_selection_expired', terminalReply: reply, isError: true, errorCode: 'marketplace_selection_expired' };
  }

  const { data, error } = await db.rpc('marketplace_place_order', {
    p_selection_id: String(pending),
    p_option_index: optionIndex,
    p_quantity: quantity,
    p_buyer_profile_id: profileId,
  });

  if (error) {
    const code = errorMessage(error);
    const expired = /selection_expired|selection_not_found|expired/i.test(code);
    const badIndex = /bad_option_index|pick a number/i.test(code);
    const reply = expired
      ? (lang === 'sw'
        ? 'Orodha imeisha muda. Andika tena unachohitaji.'
        : 'That list has expired. Say what you need again.')
      : badIndex
        ? (lang === 'sw'
          ? 'Chagua namba iliyoko kwenye orodha, mf. "2 x 50".'
          : 'Pick a number from the list, e.g. "2 x 50".')
        : (lang === 'sw'
          ? 'Sijaweza kutuma oda kwa sasa. Jaribu tena baadaye.'
          : 'I could not place that order just now. Try again shortly.');
    return { content: `marketplace_order_failed: ${code}`, terminalReply: reply, isError: true, errorCode: 'marketplace_order_failed' };
  }

  const order = data as {
    orderId: string; productName: string; quantity: number; unit: string | null;
    supplierContact: ContactCard | null;
  };
  const qty = `${Math.round(order.quantity).toLocaleString('en-US')}${order.unit ? ` ${order.unit}` : ''}`;
  const contact = contactLines(order.supplierContact, lang);
  const supplierName = order.supplierContact?.companyName ?? (lang === 'sw' ? 'duka' : 'the shop');

  const reply = lang === 'sw'
    ? `✅ Oda imetumwa ${supplierName}.\n${qty} ${order.productName}\n\nMwasiliane:\n${contact}`
    : `✅ Order sent to ${supplierName}.\n${qty} ${order.productName}\n\nContact:\n${contact}`;

  return { content: `marketplace_order_placed=${order.orderId}`, terminalReply: reply };
}

/** The supplier's side: "1" accepts the oldest order waiting on them. */
export async function marketplaceConfirm(
  db: Db,
  companyId: string,
  accept: boolean,
  reason: string | null,
  lang: MarketplaceLang,
): Promise<{ content: string; terminalReply: string; isError?: boolean; errorCode?: string }> {
  const { data: waiting } = await db.rpc('marketplace_pending_confirmation', {
    p_supplier_company_id: companyId,
  });
  if (!waiting) {
    const reply = lang === 'sw'
      ? 'Hakuna oda inayosubiri jibu lako.'
      : 'No order is waiting for your answer.';
    return { content: 'marketplace_no_pending_order', terminalReply: reply, isError: true, errorCode: 'marketplace_no_pending_order' };
  }

  const pending = waiting as { productName: string; quantity: number; unit: string | null; buyerName: string };
  const { error } = await db.rpc('marketplace_confirm_by_reply', {
    p_supplier_company_id: companyId,
    p_accept: accept,
    p_reason: reason,
  });
  if (error) {
    return {
      content: `marketplace_confirm_failed: ${errorMessage(error)}`,
      terminalReply: lang === 'sw'
        ? 'Sijaweza kuthibitisha oda kwa sasa. Jaribu tena baadaye.'
        : 'I could not confirm that order just now. Try again shortly.',
      isError: true,
      errorCode: 'marketplace_confirm_failed',
    };
  }

  const qty = `${Math.round(pending.quantity).toLocaleString('en-US')}${pending.unit ? ` ${pending.unit}` : ''}`;
  const reply = accept
    ? (lang === 'sw'
      ? `✅ Umekubali oda ya ${pending.buyerName}.\n${qty} ${pending.productName}\n\nWasiliana nao kupanga upelekaji.`
      : `✅ You accepted ${pending.buyerName}'s order.\n${qty} ${pending.productName}\n\nContact them to arrange delivery.`)
    : (lang === 'sw'
      ? `Umekataa oda ya ${pending.buyerName} ya ${qty} ${pending.productName}.`
      : `You declined ${pending.buyerName}'s order for ${qty} ${pending.productName}.`);

  return { content: `marketplace_order_${accept ? 'accepted' : 'rejected'}`, terminalReply: reply };
}

/**
 * The bare-choice fast path.
 *
 * "2 x 50", "namba 2 nipe 50", "3". Matching here means the common reply costs
 * no model call at all. Returns null when the message is anything else, and a
 * null must fall through to the model rather than guess.
 */
export function parseBareChoice(text: string): { optionIndex: number; quantity: number | null } | null {
  const said = text.trim().toLowerCase();
  const match = said.match(/^(?:namba\s*|no\.?\s*|#)?(\d{1,2})\s*(?:[x×*]\s*(\d{1,6})|\s+(?:nipe|pcs?|piece)\s*(\d{1,6}))?$/);
  if (!match) return null;
  const optionIndex = Number(match[1]);
  if (!Number.isInteger(optionIndex) || optionIndex < 1 || optionIndex > 10) return null;
  const rawQty = match[2] ?? match[3];
  const quantity = rawQty ? Number(rawQty) : null;
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) return null;
  return { optionIndex, quantity };
}

/** "1"/"0"/"ndio"/"hapana" from a supplier with an order waiting. */
export function parseBareConfirmation(text: string): boolean | null {
  const said = text.trim().toLowerCase();
  if (/^(1|ndio|ndiyo|sawa|naikubali|nakubali|yes|ok)$/.test(said)) return true;
  if (/^(0|hapana|sina|siwezi|nakataa|no)$/.test(said)) return false;
  return null;
}
