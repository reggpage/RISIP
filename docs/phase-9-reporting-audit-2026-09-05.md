# Phase 9 reporting and UI audit — 2026-09-05

## Scope and source of truth

Phase 9 integrates reporting into WhatsApp and the owner/accountant dashboard. It does not redesign accounting. The only source records are `daily_records` with `status = 'confirmed'`; a voided or pending record has no reporting effect. Tanzania calendar boundaries use `Africa/Dar_es_Salaam`.

## Evidence-based flow audit

| User message / flow | Route and components | Context / RAG | Backend validation | Failure found | Correction and priority |
|---|---|---|---|---|---|
| `leo mauzo ni shingapi?` / `jana biashara ilikuwaje?` | AI selects `get_business_summary` in `whatsappAssistant.ts`; webhook calls `readOnlyToolReply`; SQL calls `wa_bucha_reporting_snapshot`; model explains returned facts | AI gets recent conversation context; report range is resolved in Tanzania time; facts come from live ledger | Owner/accountant gate; confirmed-only range; sales are `sale + debt_issued`; payment methods come only from stored values | `cash_sales` previously meant every non-credit sale, even when payment method was mobile/unknown; summary facts omitted debt/stock context | P0: separate `settled_sales` from actual `cash_sales`; expose complete grounded facts |
| `nani ananidai?` / customer receivables | AI selects customer-debt read; snapshot groups confirmed `debt_issued - customer_payment` by normalized party | Live DB balance; no chat balance is trusted | Positive balances only; customer ledger is separate from supplier ledger | Swahili dashboard wording reversed the direction | P0: label as `Madeni ya Wateja` / `Madeni ya wateja kwa biashara` |
| `nadaiwa na supplier kiasi gani?` | AI selects `get_supplier_payables`; supplier RPC reads confirmed supplier liability | Live DB supplier balance | `supplier_payable` and unpaid whole-animal procurement increase liability; `supplier_payment` decreases it | UI label said `Unawadai Suppliers`, the opposite direction | P0: label as `Madeni kwa Suppliers`; keep role gate |
| `stock gani imeisha?` | AI selects `get_stock_on_hand`; dashboard reads the same stock function through reporting snapshot | Live products, units and confirmed movements | Stock uses confirmed purchase/credit purchase/production minus sale/credit sale/loss/owner-use | Dashboard had no drill-down and no period controls | P1: show low/out stock detail and today/yesterday/week/month controls |
| `nyama gani iliharibika jana?` | AI selects new `get_stock_loss_report`; webhook maps it to `ai_stock_loss`; snapshot returns item lines and reasons | Conversation resolves time; live loss rows and lines supply facts | Confirmed losses only; value remains incomplete when amount is unknown | Record amount was joined to every line and could be counted more than once | P0: aggregate record money separately from line quantity/details |
| `nilichukua nini nyumbani wiki hii?` | AI selects new `get_owner_use_report`; snapshot returns confirmed owner-use details | Live ledger facts | Owner-use remains separate from expense, sale and loss | Record amount could be multiplied by line count | P0: separate record and line aggregates |
| `ng'ombe wangapi nimenunua?` / `ng'ombe wa jana alitoa nini?` | AI selects new `get_whole_animal_report`; snapshot joins procurement to confirmed breakdown and actual outputs | Live procurement/breakdown/output tables | Procurement does not create meat stock; only confirmed breakdown outputs do | Count used procurement rows, pending breakdown counted as complete, and actual outputs were not returned | P0: sum `animal_count`; require confirmed breakdown; return output details and allocation status |
| Profit question | AI uses `get_business_summary` or product-performance tool; snapshot calls deterministic `daily_profit_estimate` | Historical product cost at sale time, matched to live product key | Backend computes COGS; missing costs and unvalued losses remain explicit | COGS multiplied selling quantity by unit cost and ignored base-unit conversion | P0: multiply `stock_base_quantity` by historical `base_unit_cost`; expose coverage and incomplete valuation |
| Dashboard owner/accountant | React calls `bucha_reporting_snapshot` with a selected period | Same server snapshot as WhatsApp | RPC role gate and RLS-backed identity | Only six totals, no range selector, reversed debt labels | P1: responsive period controls and drill-down lists |
| Dashboard worker | Worker is routed to `ShopDashboard`; ordinary daily-record RLS limits records to their own | No company reporting snapshot is called | DB restricts company financial snapshot to owner/accountant | Code helper previously claimed workers could read company financial reports while the DB function rejected them | P0: one owner/accountant reporting matrix in app, webhook and SQL |

## Integrity decisions

- Sales include confirmed `sale` and confirmed `debt_issued`. Customer payments reduce receivables and are not sales.
- `settled_sales` means sales not issued as customer debt. It does not identify cash. `cash_sales` includes only rows whose stored payment method is `cash`.
- Current receivables and supplier payables are balance-sheet positions and are not limited to the selected activity window.
- Profit is an estimate when historical cost coverage or stock-loss valuation is incomplete. Missing cost is never silently treated as a known zero cost.
- Whole-animal purchase cost is not allocated to outputs unless the stored breakdown says allocation is complete.

## Verification contract

The release must pass TypeScript checks, all application tests, Edge Function checks, production build, the transactional SQL rollback proof, migration/version verification and live WhatsApp checks. Any remaining limitation must be reported rather than hidden.
