-- Run this AFTER schema.sql in Supabase SQL Editor

-- Stock decrement (called from webhook)
create or replace function decrement_stock(p_id uuid, qty int)
returns void language plpgsql as $$
begin
  update products set stock = greatest(0, stock - qty) where id = p_id;
end;$$;

-- Make a user admin (run manually when needed)
-- update profiles set role = 'admin' where id = 'your-user-uuid';
