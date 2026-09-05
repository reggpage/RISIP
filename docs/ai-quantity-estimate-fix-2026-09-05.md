# Specific-quantity estimate and scoped unit repair

The authorized St. Ritha WhatsApp follow-up, “na nikiuza viwili rejareja
nitapata kiasi gani?”, reached `ai_primary` and
`get_hypothetical_product_profit` with prompt `risip-agent-v3-active-question`.
The exposed tool accepted only product_name and the executor omitted its existing
askedQuantity parameter. The model therefore received an all-stock estimate.
This was a tool-contract/executor defect, not evidence that the AI was absent.

The tool now requires AI-interpreted quantity and price_band. The executor checks
quantity bounds and forwards both into backend arithmetic. A selected-band,
specific-quantity estimate reports revenue separately from gross profit, preserves
the requested quantity even above stock (with a warning), and never writes a sale.
Missing buying cost does not prevent reporting known revenue. Missing selected
selling price does not silently substitute another band. Structured unit fields
reject location labels such as stoo; ordinary language still goes through AI.

Expected regression: 2 at retail 10,600, cost 8,000, stock 3 yields revenue
21,200 and gross profit 5,200 before other expenses. It must not use quantity 3.

## Production data repair

`scripts/repair-st-ritha-stock-unit-2026-09-05.sql` was applied with explicit owner
authorization. Only the Nguvu ya sala line's unit and stock_base_unit changed from
stoo to null (unspecified); no invented replacement measure. The transaction
asserted every other line field unchanged and stock unchanged, and wrote an audit
event including the old/new values. Verified resulting on_hand=3, unit=null.
No migration history was changed and no stock count or sale was created.
Other products' historical metadata was not bulk-repaired.

## Verification and limits

- Full regression: 176 files / 2,588 tests passed; an additional contract test
  subsequently passed in the 44-test focused suite.
- Typecheck and 20 Edge Function entry checks passed.
- Production build passed; existing CSS and large-chunk warnings remain.
- Diff check passed.
- A declared portion's explicit-quantity estimate fails clearly rather than
  substituting all stock; full portion conversion is not implemented here.
- Legacy unspecified-band/all-stock estimate behavior remains. This is not a
  claim that all hypothetical questions or all natural-language routes are fixed.
- Actual WhatsApp retest of this fix is still required after deployment.
- Unit validation added here covers the AI structured-tool boundary, not every
  historical database import or write path.
