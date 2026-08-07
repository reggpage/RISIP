-- Earlier scans treated any verification-code collision as a duplicate. Keep a
-- duplicate only where the independent receipt identity also matches. Anything
-- else needs human review instead of silently being excluded from spend totals.
update public.receipts as duplicate_row
set status = 'pending_review',
    duplicate_of = null,
    verification_code = null,
    low_confidence_fields = array(select distinct unnest(duplicate_row.low_confidence_fields || array['verification_code']))
where duplicate_row.status = 'duplicate'
  and (
    duplicate_row.duplicate_of is null
    or not exists (
      select 1
      from public.receipts as original_row
      where original_row.id = duplicate_row.duplicate_of
        and nullif(regexp_replace(duplicate_row.vendor_tin, '\\D', '', 'g'), '') is not null
        and regexp_replace(duplicate_row.vendor_tin, '\\D', '', 'g') = regexp_replace(original_row.vendor_tin, '\\D', '', 'g')
        and duplicate_row.total_amount is not distinct from original_row.total_amount
        and nullif(trim(duplicate_row.receipt_number), '') is not null
        and trim(duplicate_row.receipt_number) = trim(original_row.receipt_number)
    )
  );
