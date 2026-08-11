-- A receipt captured outside the app arrives with nobody having chosen its
-- project, category or payment source. Those three are what make it a real
-- project expense, so track explicitly whether a human has confirmed them.
--
-- Note on project_id: it stays NOT NULL because RLS visibility is derived from
-- the project (a null-project receipt would be invisible even to its uploader).
-- The worker therefore still files WhatsApp receipts against a provisional
-- project, but details_confirmed = false means the UI never presents that as a
-- decision and the receipt cannot be approved until someone picks one.

alter table receipts
  add column if not exists details_confirmed boolean not null default true;

-- Everything captured so far went through a form where these were chosen.
update receipts set details_confirmed = true where details_confirmed is null;

-- Anything still awaiting review that came from WhatsApp needs confirming.
update receipts
   set details_confirmed = false
 where source = 'whatsapp' and status = 'pending_review';

comment on column receipts.details_confirmed is
  'False until a human has chosen project, category and payment source. Receipts '
  'with false must not be approved or counted as project spend.';
