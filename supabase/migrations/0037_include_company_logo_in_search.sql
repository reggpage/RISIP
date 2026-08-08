-- Public company search is used before authentication, so return the public
-- company logo alongside the name for an identifiable, trustworthy join flow.
drop function if exists search_companies(text);

create function search_companies(q text)
returns table (id uuid, name text, logo_url text)
language sql stable security definer
set search_path = public
as $$
  select c.id, c.name, c.logo_url
  from companies c
  where c.name ilike '%' || q || '%'
  order by c.name
  limit 20;
$$;

revoke all on function search_companies(text) from public;
grant execute on function search_companies(text) to anon, authenticated;
