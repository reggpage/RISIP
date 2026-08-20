-- What the shopkeeper said their business does, in their own words.
--
-- Onboarding used to end the description step by asking them to agree with OUR
-- label for their shop — "Nimeelewa kuwa biashara yako ni Duka la Mang'aa /
-- Rejareja. Je, nimepata sawa?" — and a shop that sells wholesale quite
-- reasonably said no to a question that was never worth asking. The owner's
-- instruction: "mwache mtu tu ajielezee, akituma mjibu sawa nimekuelewa … haya
-- maelezo tutatumia kuelewesha ai nyuma ya pazia."
--
-- So the sentence itself is kept. The bounded classification stays exactly as
-- it was — still descriptive metadata, still touching no finance, no ledger, no
-- permissions — and is now allowed to be null, because a trade we cannot name
-- is not a reason to refuse somebody a business.
--
-- ROLLBACK: alter table companies drop column business_description;

alter table companies
  add column if not exists business_description text;

comment on column companies.business_description is
  'Free text from WhatsApp onboarding, in the owner''s own words. Descriptive only: never used for finance, permissions or stock.';
