-- What TRA says about a receipt, kept beside what the model read.
--
-- Measured on a real receipt: five of seven fields were misread, including the
-- total (8,000 short on 58,000) and the verification code — which is the GLOBAL
-- duplicate key from 0041. A misread code means the same receipt can be claimed
-- twice, which is the fraud that index exists to stop.
--
-- verified        the portal answered and its figures are now the stored ones
-- not_found       the portal does not know this code — almost always a misread
-- unreachable     the portal was down, slow or has changed; nothing was checked
-- not_applicable  no code or no time to look up (handwritten, foreign, faded)
--
-- The differences are KEPT, not discarded, so a person can see what changed and
-- the reading quality can be measured over time rather than assumed.

alter table public.receipts
  add column if not exists tra_status text,
  add column if not exists tra_verified_at timestamptz,
  add column if not exists tra_differences jsonb;

alter table public.receipts
  drop constraint if exists receipts_tra_status_check;
alter table public.receipts
  add constraint receipts_tra_status_check
  check (tra_status is null or tra_status in
    ('verified', 'not_found', 'unreachable', 'not_applicable'));

comment on column public.receipts.tra_status is
  'Result of the verify.tra.go.tz lookup. "verified" means the stored figures are TRA''s own.';
comment on column public.receipts.tra_differences is
  'Fields where the model disagreed with TRA, as [{field, extracted, official}].';

create index if not exists receipts_tra_status_idx
  on public.receipts (company_id, tra_status)
  where tra_status is not null;

