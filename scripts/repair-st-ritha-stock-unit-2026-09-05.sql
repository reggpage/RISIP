-- User-authorized metadata repair. No quantity, amount, date or status changes.
-- Null restores the original unspecified count unit; do not invent a new unit.
begin;
do $$
declare
  before_line jsonb;
  after_line jsonb;
  before_stock numeric;
  after_stock numeric;
begin
  select to_jsonb(l) into strict before_line
  from public.daily_record_lines l
  join public.daily_records d on d.id = l.daily_record_id
  where l.id = '721c0f31-fa21-4baf-97db-89b3a51446a9'
    and d.company_id = 'ad3d77a0-0ee2-4ec1-a487-6737612bfc88'
  for update of l;
  if before_line->>'unit' is null and before_line->>'stock_base_unit' is null then return; end if;
  if before_line->>'unit' is distinct from 'stoo'
     or before_line->>'stock_base_unit' is distinct from 'stoo'
     or (before_line->>'unit_base_quantity')::numeric <> 1 then
    raise exception 'Unit repair precondition changed';
  end if;
  select on_hand into strict before_stock from public.wa_stock_on_hand(
    'ad3d77a0-0ee2-4ec1-a487-6737612bfc88', 'nguvu ya sala');
  update public.daily_record_lines set unit = null, stock_base_unit = null
  where id = '721c0f31-fa21-4baf-97db-89b3a51446a9'
  returning to_jsonb(daily_record_lines) into after_line;
  if (before_line - 'unit' - 'stock_base_unit') is distinct from
     (after_line - 'unit' - 'stock_base_unit') then raise exception 'Unexpected line change'; end if;
  select on_hand into strict after_stock from public.wa_stock_on_hand(
    'ad3d77a0-0ee2-4ec1-a487-6737612bfc88', 'nguvu ya sala');
  if before_stock is distinct from after_stock then raise exception 'Stock changed'; end if;
  insert into public.whatsapp_audit_log(company_id, profile_id, intent, action, outcome, message_text)
  values ('ad3d77a0-0ee2-4ec1-a487-6737612bfc88','04d71cfe-430d-4da2-9474-86a833b05762',
    'authorized_data_repair','remove_location_from_stock_unit','applied',
    jsonb_build_object('line_id',before_line->>'id','old_unit','stoo','new_unit',null,
      'old_stock_base_unit','stoo','new_stock_base_unit',null,'unchanged_on_hand',after_stock,
      'reason','Owner requested correction: stoo is a location, not a measurement unit')::text);
end $$;
commit;
select product_name,unit,on_hand from public.wa_stock_on_hand(
  'ad3d77a0-0ee2-4ec1-a487-6737612bfc88', 'nguvu ya sala');
