-- Link duplicate receipts that were already present before duplicate_of existed.
update receipts as duplicate_row
set duplicate_of = original_row.id
from receipts as original_row
where duplicate_row.status = 'duplicate'
  and duplicate_row.duplicate_of is null
  and duplicate_row.verification_code is not null
  and original_row.id <> duplicate_row.id
  and original_row.company_id = duplicate_row.company_id
  and original_row.verification_code = duplicate_row.verification_code
  and original_row.status <> 'duplicate';
