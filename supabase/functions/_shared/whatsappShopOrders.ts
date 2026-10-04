/**
 * B2B inter-shop ordering ("Agizo la bidhaa") — WhatsApp-side state and reply
 * builders. No business logic: validation, pricing and status transitions live
 * entirely in the Postgres RPCs (0180_shop_orders.sql).
 */
import type { Lang } from './whatsappDailyRecords.ts';

export type ShopOrderLine = {
  product_key: string;
  product_name: string;
  unit?: string | null;
  quantity: number;
  wholesale_unit_price: number;
  line_total: number;
};

export type ShopOrderProposal = {
  order_id?: string;
  order_no?: string;
  buyer_company_id: string;
  supplier_company_id: string;
  supplier_company_name?: string;
  status: string;
  currency: string;
  total_wholesale: number;
  note?: string | null;
  supplier_phone_e164?: string | null;
  lines: ShopOrderLine[];
  dry_run?: boolean;
};

export type ShopOrderConfirmationPending = {
  kind: 'shop_order_confirmation';
  supplier_company_id: string;
  supplier_company_name?: string;
  lines: Array<{ product_key: string; quantity: number }>;
  note: string | null;
  proposal: ShopOrderProposal;
  sourceMessageId: string;
};

export type ShopOrderActionPending = {
  kind: 'shop_order_action';
  order_id: string;
  order_no: string;
  action: 'accept' | 'reject' | 'deliver' | 'verify' | 'cancel';
  note: string | null;
};

export type ShopOrderPending = ShopOrderConfirmationPending | ShopOrderActionPending;

const money = (value: number): string =>
  `TSh ${Math.round(value).toLocaleString('en-US')}`;

const qty = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: 3 });

// ── Proposal (parked before NDIYO) ──────────────────────────────────────────

const ACTION_WORD: Record<ShopOrderActionPending['action'], Record<Lang, string>> = {
  accept:  { sw: 'Kukubali agizo',   en: 'Accept order' },
  reject:  { sw: 'Kukataa agizo',    en: 'Reject order' },
  deliver: { sw: 'Kuashiria umeleta', en: 'Mark delivered' },
  verify:  { sw: 'Kuthibitisha umepokea', en: 'Verify receipt' },
  cancel:  { sw: 'Kughairi agizo',   en: 'Cancel order' },
};

export function buildShopOrderProposalReply(
  proposal: ShopOrderProposal,
  supplierName: string | null,
  lang: Lang,
): string {
  const name = supplierName ?? 'muuzaji';
  const lines = (proposal.lines ?? [])
    .map((l) => {
      const unit = l.unit ? ` ${l.unit}` : '';
      return lang === 'sw'
        ? `• ${qty(l.quantity)}${unit} ${l.product_name} × ${money(l.wholesale_unit_price)} = *${money(l.line_total)}*`
        : `• ${qty(l.quantity)}${unit} ${l.product_name} × ${money(l.wholesale_unit_price)} = *${money(l.line_total)}*`;
    })
    .join('\n');

  const phone = proposal.supplier_phone_e164
    ? (lang === 'sw'
      ? `\nLipa *${name}* kwa namba yake ya simu: *${proposal.supplier_phone_e164}*`
      : `\nPay *${name}* via their mobile number: *${proposal.supplier_phone_e164}*`)
    : '';

  const note = proposal.note
    ? (lang === 'sw' ? `\nUjumbe: _${proposal.note}_` : `\nNote: _${proposal.note}_`)
    : '';

  return lang === 'sw'
    ? `*AGIZO* — kwa *${name}*\n${lines}\nJumla: *${money(proposal.total_wholesale)}*${phone}${note}\n\nJibu *1* Ndiyo · *2* Hapana`
    : `*ORDER* — to *${name}*\n${lines}\nTotal: *${money(proposal.total_wholesale)}*${phone}${note}\n\nReply *YES* to confirm · *NO* to cancel`;
}

// ── Placed (after NDIYO on a proposal) ──────────────────────────────────────

export function buildShopOrderPlacedReply(
  data: ShopOrderProposal,
  supplierName: string | null,
  lang: Lang,
): string {
  const name = supplierName ?? 'muuzaji';
  const phone = data.supplier_phone_e164 ? ` kwa namba *${data.supplier_phone_e164}*` : '';
  const no = data.order_no ? ` *${data.order_no}*` : '';

  return lang === 'sw'
    ? `✅ Agizo${no} limewekwa. Jumla *${money(data.total_wholesale)}*.\nLipa${phone} ili muuzaji alete bidhaa.\nMuuzaji atathibitisha baada ya kuona agizo.`
    : `✅ Order${no} has been placed. Total *${money(data.total_wholesale)}*.\nPay${phone} so the supplier can deliver.\nThe supplier will confirm once they see the order.`;
}

// ── Action ask (parked before NDIYO) ────────────────────────────────────────

export function buildShopOrderActionAsk(
  orderNo: string,
  action: ShopOrderActionPending['action'],
  lang: Lang,
): string {
  const label = ACTION_WORD[action][lang];
  return lang === 'sw'
    ? `*${label}* — agizo *${orderNo}*\n\nJibu *1* Ndiyo · *2* Hapana`
    : `*${label}* — order *${orderNo}*\n\nReply *YES* to confirm · *NO* to cancel`;
}

// ── Action result (after NDIYO on an action) ────────────────────────────────

export function buildShopOrderActionResult(
  data: { order_id?: string; status?: string; order_no?: string },
  action: ShopOrderActionPending['action'],
  lang: Lang,
): string {
  const statusLabel: Record<string, Record<Lang, string>> = {
    accepted: { sw: 'imekubaliwa', en: 'accepted' },
    rejected: { sw: 'imekataliwa', en: 'rejected' },
    delivered: { sw: 'imetolewa', en: 'marked delivered' },
    verified: { sw: 'imethibitishwa', en: 'verified' },
    cancelled: { sw: 'imeghairiwa', en: 'cancelled' },
  };
  const no = data.order_no ? ` *${data.order_no}*` : '';
  const st = statusLabel[data.status ?? action] ?? statusLabel[action];

  return lang === 'sw'
    ? `✅ Agizo${no} ${st?.sw ?? st?.en ?? 'imebadilika'}.`
    : `✅ Order${no} has been ${st?.en ?? 'updated'}.`;
}

// ── RPC error into a user-facing message ────────────────────────────────────

export function shopOrderRpcError(lang: Lang, error: unknown): string {
  const raw = String(
    (error as { message?: string })?.message
    ?? (error as { hint?: string })?.hint
    ?? error
  ).toLowerCase();

  const pick = (...tokens: string[]): boolean => tokens.some((t) => raw.includes(t));

  if (pick('stock_insufficient', 'on hand at the supplier')) {
    return lang === 'sw'
      ? 'Muuzaji hana bidhaa za kutosha kwa kiasi unachotaka. Punguza kiasi na jaribu tena.'
      : 'The supplier does not have enough stock for the quantity you requested. Reduce the quantity and try again.';
  }
  if (pick('wholesale catalogue', 'product_unpriced_or_unknown', 'not in the supplier')) {
    return lang === 'sw'
      ? 'Bidhaa hiyo haipatikani kwenye orodha ya jumla ya muuzaji.'
      : 'That product is not in the supplier\'s wholesale catalogue.';
  }
  if (pick('supplier_not_active', 'not available for ordering')) {
    return lang === 'sw'
      ? 'Muuzaji huyu hajiaminisha kuuza kwa sasa, au ameondolewa.'
      : 'This supplier is not available for ordering right now.';
  }
  if (pick('not_party', 'order not found')) {
    return lang === 'sw'
      ? 'Agizo hilo halikupatikana au si la kampuni yako.'
      : 'That order was not found or does not belong to your company.';
  }
  if (pick('bad_transition', 'only a placed or accepted', 'only the supplier may', 'only the buyer may')) {
    return lang === 'sw'
      ? 'Kitendo hiki hakiwezi kufanywa kwa hali ya agizo sasa.'
      : 'That action cannot be taken on this order in its current state.';
  }
  if (pick('not_authenticated', 'not authenticated')) {
    return lang === 'sw'
      ? 'Kuna hitaji la kuthibitisha ndani ya Risip.'
      : 'You need to be signed in to Risip.';
  }
  if (pick('not_authorized', 'owner or accountant')) {
    return lang === 'sw'
      ? 'Agizo linahitaji mwenye biashara au mhasibu.'
      : 'Orders require an owner or accountant.';
  }
  return lang === 'sw'
    ? 'Sikuweza kufanya hivyo sasa. Tafadhali jaribu tena.'
    : 'I could not do that right now. Please try again.';
}

/** The same shape the dry-run returns, with the RPC fields that carry over. */
export function fromRpcProposal(
  rpcResult: Record<string, unknown>,
): ShopOrderProposal {
  return {
    order_id: typeof rpcResult.order_id === 'string' ? rpcResult.order_id : undefined,
    order_no: typeof rpcResult.order_no === 'string' ? rpcResult.order_no : undefined,
    buyer_company_id: String(rpcResult.buyer_company_id ?? ''),
    supplier_company_id: String(rpcResult.supplier_company_id ?? ''),
    status: String(rpcResult.status ?? 'placed'),
    currency: String(rpcResult.currency ?? 'TZS'),
    total_wholesale: Number(rpcResult.total_wholesale ?? 0),
    note: typeof rpcResult.note === 'string' ? rpcResult.note : null,
    supplier_phone_e164: typeof rpcResult.supplier_phone_e164 === 'string' ? rpcResult.supplier_phone_e164 : null,
    lines: Array.isArray(rpcResult.lines)
      ? (rpcResult.lines as Array<Record<string, unknown>>).map((l) => ({
          product_key: String(l.product_key ?? ''),
          product_name: String(l.product_name ?? ''),
          unit: typeof l.unit === 'string' ? l.unit : null,
          quantity: Number(l.quantity ?? 0),
          wholesale_unit_price: Number(l.wholesale_unit_price ?? 0),
          line_total: Number(l.line_total ?? 0),
        }))
      : [],
    dry_run: Boolean(rpcResult.dry_run),
  };
}