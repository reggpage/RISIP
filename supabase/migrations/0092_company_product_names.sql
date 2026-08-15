create or replace function public.company_product_names(p_company_id uuid)
returns table (product_name text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with sold as (
    select (array_agg(l.description order by r.occurred_at desc))[1] as name
      from daily_record_lines l
      join daily_records r on r.id = l.daily_record_id
     where r.company_id = p_company_id
       and r.kind = 'sale'
       and r.status = 'confirmed'
       and private.product_key(l.description) is not null
     group by private.product_key(l.description)
  ),
  priced as (
    select distinct on (private.product_key(c.product_key)) c.product_name as name
      from product_costs c
     where c.company_id = p_company_id
     order by private.product_key(c.product_key), c.effective_from desc, c.created_at desc
  ),
  everything as (
    select name from sold
    union
    select name from priced
  )
  select distinct on (private.product_key(name)) name
    from everything
   where private.product_key(name) is not null
   order by private.product_key(name), name
   limit 500;
$$;

revoke execute on function public.company_product_names(uuid) from public, anon, authenticated;

