-- Let the uploader correct AI mistakes on their OWN receipts (any status), not just while
-- processing. Finance keeps the broader company-wide edit via receipts_update_finance.
create policy receipts_update_own_any on receipts
  for update to authenticated
  using (uploaded_by = auth.uid() and company_id = private.auth_company_id())
  with check (uploaded_by = auth.uid() and company_id = private.auth_company_id());
