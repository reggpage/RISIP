# Risip — handoff: portion selling, and the open work

You are taking over work on **Risip**, a multi-tenant SaaS for Tanzanian
businesses: AI receipt scanning, daily business records, and a WhatsApp
assistant. UI copy is Swahili. Repo: `C:\Users\HP\Documents\risip`. Read
`CLAUDE.md` first — it is short and accurate.

The owner is testing on a real shop, **St. Ritha bookshop**, roughly 39
products. Every defect named in this document was found in a real WhatsApp
conversation, not in a test.

---

## Standing constraints (do not violate)

- **Never** use, request, or print the production database password.
- **Never** print phone numbers, tokens, WAMIDs, service keys or customer data.
- Do not touch the "Mhandisi" company's data. Do not delete the test company.
- Migrations are `NNNN_name.sql` and **append-only**; never edit a pushed one.
  Test every migration inside `begin; … rollback;` against production **before**
  applying, and say that you did.
- Ledgers (`product_costs`, `product_selling_prices`, `stock_counts`,
  `daily_records`) are append-only. Never overwrite history; add a row.
- Reply to the owner in Swahili.

## How to work here

Audit → state the root cause **with evidence** → implement → verify against the
real database in a rolled-back transaction → deploy → say plainly what you did
not do.

Four lessons that were each paid for:

1. **A parser being correct is not the same as a parser being reached.** A
   multi-line fix shipped and changed nothing, because the call sat behind
   another parser that claimed the message first. Always trace the route.
2. **esbuild does not catch undefined identifiers.** A missing import took the
   whole WhatsApp product down for an hour, with esbuild, vitest and tsc all
   green — the webhook is not in the app's tsconfig project. Run
   `npx vite-node scripts/check-edge-functions.ts` before every deploy.
3. **Verify with the real input.** Twice I reported a defect that was my own
   test harness mis-reading the fixture. Run the owner's actual message through
   the actual parser.
4. **Shell one-liners mangle template literals and parentheses on this machine.**
   Use the editor tool for anything with backticks or `\n`.

## Verification

```bash
npx vite-node scripts/check-edge-functions.ts   # undefined names — run before deploying
npx vitest run                                   # 752 tests
npx vite-node scripts/run-evals.ts               # 135 of 240 eval cases checked, 135 pass
npx vite-node scripts/probe-router.ts            # routing regression corpus
npx tsc -b --noEmit && npx vite build
npx supabase functions deploy whatsapp-webhook --project-ref dsbplcqhlewxnivfwlcx
```

---

# Part 1 — The new feature: selling by portion

This is the owner's idea and it is the largest thing outstanding. Their words:

> "wazo langu la kurikodi vimiminika ambavyo watu huuza dukani, pia kuna sabuni
> za kupima — sabuni ya mche inauzwa kwa vipande au mche mzima"
>
> "mafuta ndoo 20,000 bei ya kununua, bei ya kuuza robo-700, nusu-1200,
> lita-2500"

## What is actually being described

A shop buys in one unit and sells in several smaller ones, each with its own
price that is **not** a fraction of the others.

| bought as | sold as | price |
|---|---|---|
| cooking oil, ndoo (bucket) @ 20,000 | robo (quarter litre) | 700 |
| | nusu (half litre) | 1,200 |
| | lita | 2,500 |
| bar soap, mche @ 3,000 | kipande (a cut piece) | 500 |
| | mche mzima | 3,000 |

Three things follow, and all three break the current model:

**The prices are not proportional.** Four robo cost 2,800; a litre costs 2,500.
That is deliberate — small portions carry a premium. So a portion price cannot
be derived; each is its own decision and must be stored.

**"Robo" is a quarter OF WHAT.** A quarter litre, not a quarter of a twenty-litre
bucket. The word alone does not say. This must be asked, never inferred, or the
shop's stock will be wrong by a factor of twenty.

**Stock moves in the base unit.** Selling one robo removes 0.25 litres from a
bucket holding 20. The stock count is in buckets, or in litres, and the sale is
in quarters. Something has to convert, and it has to be a stored number rather
than a guess.

## What is in the way

`supabase/migrations/0095_one_unit_per_product.sql` enforces **one unit per
product** — `private.product_unit()` plus refusals inside `set_product_cost`,
`record_stock_count` and `wa_record_stock_count`. It exists for a good reason: a
product counted in kilos and priced per gunia produced a margin wrong by about
fifty times, and the owner saw it. **Do not simply delete it.** The rule needs
to become "one BASE unit per product, plus declared portions of it", and the
refusal should fire on an unknown unit rather than on any second unit.

`product_selling_prices` (migration 0098) holds `retail_price`,
`wholesale_price`, `wholesale_min_qty` — two prices per product, with no notion
of which unit they are for.

## Suggested shape

Design it yourself, but these are the constraints the data has to satisfy:

- A product has one **base unit** (litre, kipande, pcs) — the unit stock is
  counted in.
- A **purchase unit** with a stated size in base units: `ndoo = 20 litre`,
  `mche = 6 kipande`. This is what the buying price attaches to, and it is what
  lets cost-per-portion be computed.
- Zero or more **portions**, each with a name, a size in base units, and its own
  selling price: `robo = 0.25 litre @ 700`.
- `product_selling_prices` gains the portion name, so today's retail/wholesale
  becomes the price of the base or purchase unit and nothing already saved
  changes meaning.

Then:

- `nimeuza mafuta robo 3` → 3 × 700 = 2,100, and stock falls by 0.75 litres.
- `store mafuta ndoo 2` → 40 litres on hand.
- Margin per portion = portion price − (buying price ÷ purchase size in base
  units) × portion size. For a robo: 700 − (20,000 ÷ 20) × 0.25 = 450.

**Ask, never infer.** When a new portion word appears, ask what it is a portion
of and how many go into the base unit. A wrong conversion silently multiplies
every stock figure and every margin for that product. Follow the pattern in
`whatsappNewProduct.ts` — the offer that says plainly what it is about to create
and what happens if the name is wrong.

Swahili portion words worth recognising: `robo` (¼), `nusu` (½), `theluthi`
(⅓), `kipande`, `mche`, `debe`, `ndoo`, `gunia`, `rimu`, `dazeni`, `pakiti`,
`kifurushi`, `chupa`, `mfuko`.

## Where the code is

- `supabase/functions/_shared/whatsappQuantitySale.ts` — reads a sale of
  quantities with no prices and prices it from the shop's own list. Portion
  selling lands here: `mafuta robo 3` must resolve "robo" to a portion.
- `supabase/functions/_shared/whatsappNewProduct.ts` — reads
  `Kamusi @5000 nauza 10000` and `Sukari @2500 nauza 3500 kwa kilo`. Portions
  need a shape here too, e.g. `mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500`.
- `supabase/migrations/0093_stock_on_hand.sql` — on hand = last count + bought
  since − sold since. The conversion has to happen before the subtraction.
- `supabase/functions/_shared/whatsappStockBatch.ts` — bulk counts.

---

# Part 2 — Open work, in the order I would do it

## 1. Conversation memory (biggest, and it fixes two things at once)

The assistant does not carry the previous turns. A real exchange:

```
owner: kitabu cha hesabu 7, biblia 3, nguvu ya sala 20
Risip: is this a sale or a stock purchase? and what price each?
owner: ni mauzo
Risip: I still need the price of each one
```

The prices were already saved. Two failures in one: the follow-up "ni mauzo" was
not joined to the message before it, and the path that DOES know the price list
(`parseQuantityOnlySale` → `priceQuantitySale`) was never reached because the
first message had no verb.

`whatsapp_conversations` already stores per-identity state with a 30-minute
expiry — it is used for confirmations. Extend it to hold the last few turns, and
when a message is only an answer ("ni mauzo", "rejareja", "ndiyo ya jumla"),
apply it to the parked message rather than starting again.

Note the trap already fixed once: a pending question must **yield when the
person changes topic** — see `startsAnotherTopic()` in the webhook. Memory makes
that trap easier to fall into, not harder.

## 2. Products page: selling price, and the row menu

The owner asked for three changes on `src/routes/products/ProductsPage.tsx`:

- Show the **selling price** where the product has one. It exists in
  `product_selling_prices`; the page currently shows `avgUnitPrice` labelled
  "Selling", which is the average actually achieved — the owner reasonably read
  it as a price they had set, and it is not.
- Move **Edit** into the three-dot menu and drop the pencil button, to free the
  space for the selling price.
- Confirm the loading skeleton still appears on Daily Records after the
  day-grouping change.

## 3. Renaming a product (app and WhatsApp)

A product name is the key joining sales, costs, prices and stock counts.
Renaming is therefore **a merge with one target**, and
`merge_products` (migration 0090) already does that safely: it moves everything,
compares revenue before and after, and raises if the figure changed.

Build `rename_product(p_from, p_to)` on the same footing, refusing when the new
name already exists — that is a merge and should be asked about separately. Then
a tab in the Edit dialog, and on WhatsApp
`badilisha jina la biblia kuwa Bibilia ndogo`, with a confirmation that states
**how many records will move** before NDIYO.

## 4. Eval coverage

`npx vite-node scripts/run-evals.ts` — 135 of 240 checked, all passing. The
remaining 105 are honestly reported as unchecked, by reason:

- 35 expect no tool to fire — checkable by asserting nothing is written
- 37 need the model to choose a tool — needs a real model run, which costs money
- 19 need a prior turn — unlocked by conversation memory above
- 13 need a role (owner/worker) — these are the security cases and are worth it
- 1 disputed, marked in the YAML with the reason

`must_not` (113 cases) is not checked at all. Those are the "AI must not say
this" rules — e.g. must not reuse a selling price as a buying cost. For the
deterministic paths the reply can be generated and asserted for free.

---

## Facts that cost real time — do not rediscover them

- Supabase Edge Function **HTTP 546 = worker resource limit** (CPU as well as
  wall clock). A killed worker writes **nothing**. That is why QR decoding and
  TRA verification live in `whatsapp-worker` **after** `extract-receipt` saves.
- `verify.tra.go.tz` sets **no cookie**. `GET /<CODE>` then
  `GET /Verify/Verified?Secret=HH:MM:SS`; the portal keys the session by caller.
- `now()` is frozen per transaction; `clock_timestamp()` advances. This caused
  ordering ties twice.
- WhatsApp is **not Markdown**. `**bold**` arrives as a literal asterisk. All
  outbound text passes through `whatsappMarkdown.ts`; keep it that way.
- WhatsApp drops the typing indicator after ~25s and clears it when a message
  lands. Raise it again before slow work.
- Meta will not deliver a free-form message to a number that has not written to
  you first. That is why Risip does not send invites — it writes them for the
  owner to forward. See `whatsappInvite.ts`.
- This Tailwind theme has **no `brand` token**; semantic red is `red-600`. Role
  colours are CSS vars only. All UI copy lives in `src/i18n/sw.ts` and the page
  `ui` blocks.
- `overflow-x-auto` alone gives an element a vertical scrollbar too — CSS
  promotes the other axis to `auto`. This put arrows on every tab bar in the app.

## Known data problems in the test company

- `karatasi a4` and `karatasi a4 rimu` are two catalogue rows for one product —
  the stock-count parser peeled the unit off the name. Needs `merge_products`.
- One `product_selling_prices` row has a mangled name from an early parse:
  "nguvu ya sala ya biblia kwa ya kalamu ya daftari nguvu ya sala". Harmless but
  should go.
