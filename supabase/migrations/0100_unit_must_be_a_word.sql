-- A unit is a word, never a number.
--
-- Found in production, not in a test: 'Bibilia ndogo' had unit = '50'. Somebody
-- said something like "bibilia ndogo 50 zinanigharimu 8600" and the AI tool path
-- handed the 50 over as the unit of measure, because parseCostCandidate accepted
-- any string at all.
--
-- Left alone this is not cosmetic. one_unit_per_product (0095) refuses any later
-- count or price stated in a different unit, so a product whose unit is '50' can
-- never be counted again: every stock count would be told the product is
-- "measured in 50". A first bulk count would fail on that one line and, being
-- all-or-nothing, take the other thirty-five with it.
--
-- So: clear the nonsense value, then make it unrepresentable. The cost itself is
-- untouched — the number the trader gave was right, only the label was junk.

update public.product_costs
   set unit = null
 where unit is not null
   and unit !~ '[[:alpha:]]';

update public.stock_counts
   set unit = null
 where unit is not null
   and unit !~ '[[:alpha:]]';

update public.daily_record_lines
   set unit = null
 where unit is not null
   and unit !~ '[[:alpha:]]';

alter table public.product_costs
  add constraint product_costs_unit_is_a_word
  check (unit is null or unit ~ '[[:alpha:]]');

alter table public.stock_counts
  add constraint stock_counts_unit_is_a_word
  check (unit is null or unit ~ '[[:alpha:]]');

alter table public.daily_record_lines
  add constraint daily_record_lines_unit_is_a_word
  check (unit is null or unit ~ '[[:alpha:]]');
