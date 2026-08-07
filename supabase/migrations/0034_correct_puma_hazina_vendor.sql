-- Correct earlier scans that flattened the printed merchant name to the Puma
-- brand. This TIN belongs to Puma Hazina Service Station.
update public.receipts
set vendor_name = 'Puma Hazina Service Station',
    category = 'Fuel'
where vendor_tin = '100260085'
  and lower(coalesce(vendor_name, '')) in ('puma', 'puma energy', 'puma hazina');
