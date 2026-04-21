-- ═══════════════════════════════════════════════════════
-- LUXIVEN — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── PROFILES ───────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text,
  last_name   text,
  phone       text,
  role        text not null default 'customer' check (role in ('customer','admin')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "admin all"   on profiles for all using (
  exists(select 1 from profiles where id=auth.uid() and role='admin')
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles(id,first_name,last_name)
  values(new.id, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name');
  return new;
end;$$;
create trigger on_signup after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── PRODUCTS ───────────────────────────────────────────
create table public.products (
  id            uuid primary key default uuid_generate_v4(),
  slug          text unique not null,
  name          text not null,
  category      text not null,
  short_desc    text,
  description   text,
  price         numeric(10,2) not null,
  compare_price numeric(10,2),
  badge         text,
  images        text[] default '{}',
  features      text[] default '{}',
  avg_rating    numeric(3,2) default 0,
  review_count  int default 0,
  stock         int default 50,
  is_active     boolean default true,
  stripe_price_id text,
  created_at    timestamptz default now()
);
alter table public.products enable row level security;
create policy "public read" on products for select using (is_active = true);
create policy "admin write" on products for all using (
  exists(select 1 from profiles where id=auth.uid() and role='admin')
);

-- ── CART (server-side for logged-in users) ─────────────
create table public.cart_items (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  qty        int not null default 1 check (qty > 0),
  created_at timestamptz default now(),
  unique(user_id, product_id)
);
alter table public.cart_items enable row level security;
create policy "own cart" on cart_items for all using (auth.uid() = user_id);

-- ── WISHLIST ───────────────────────────────────────────
create table public.wishlist (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, product_id)
);
alter table public.wishlist enable row level security;
create policy "own wishlist" on wishlist for all using (auth.uid() = user_id);

-- ── COUPONS ────────────────────────────────────────────
create table public.coupons (
  id             uuid primary key default uuid_generate_v4(),
  code           text unique not null,
  type           text not null check (type in ('percent','fixed')),
  value          numeric(10,2) not null,
  min_order      numeric(10,2) default 0,
  max_uses       int,
  uses           int default 0,
  expires_at     timestamptz,
  is_active      boolean default true
);
alter table public.coupons enable row level security;
create policy "public read" on coupons for select using (is_active = true);

insert into public.coupons (code,type,value,min_order) values
  ('LUXIVEN10','percent',10,0),
  ('WELCOME20','percent',20,0),
  ('VIP30','percent',30,500);

-- ── ORDERS ─────────────────────────────────────────────
create table public.orders (
  id                   uuid primary key default uuid_generate_v4(),
  order_number         text unique not null,
  user_id              uuid references profiles(id),
  guest_email          text,
  status               text default 'pending' check (status in ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  payment_status       text default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  stripe_session_id    text,
  stripe_payment_intent text,
  subtotal             numeric(10,2) not null,
  discount             numeric(10,2) default 0,
  shipping             numeric(10,2) default 0,
  tax                  numeric(10,2) default 0,
  total                numeric(10,2) not null,
  coupon_code          text,
  shipping_address     jsonb,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
alter table public.orders enable row level security;
create policy "own orders"  on orders for select using (auth.uid() = user_id);
create policy "insert order" on orders for insert with check (auth.uid() = user_id or user_id is null);
create policy "admin orders" on orders for all using (
  exists(select 1 from profiles where id=auth.uid() and role='admin')
);

-- ── ORDER ITEMS ────────────────────────────────────────
create table public.order_items (
  id         uuid primary key default uuid_generate_v4(),
  order_id   uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  name       text not null,
  image      text,
  price      numeric(10,2) not null,
  qty        int not null default 1
);
alter table public.order_items enable row level security;
create policy "order items" on order_items for select using (
  exists(select 1 from orders where id=order_items.order_id and
    (auth.uid()=user_id or exists(select 1 from profiles where id=auth.uid() and role='admin')))
);

-- ── NEWSLETTER ─────────────────────────────────────────
create table public.newsletter (
  id         uuid primary key default uuid_generate_v4(),
  email      text unique not null,
  is_active  boolean default true,
  created_at timestamptz default now()
);
alter table public.newsletter enable row level security;
create policy "subscribe" on newsletter for insert with check (true);

-- ── REVIEWS ────────────────────────────────────────────
create table public.reviews (
  id         uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  body       text,
  verified   boolean default false,
  created_at timestamptz default now(),
  unique(product_id, user_id)
);
alter table public.reviews enable row level security;
create policy "public reviews" on reviews for select using (true);
create policy "own review"     on reviews for insert with check (auth.uid() = user_id);

-- Auto-update product rating
create or replace function update_product_rating()
returns trigger language plpgsql as $$
begin
  update products set
    avg_rating   = (select coalesce(avg(rating),0) from reviews where product_id=coalesce(new.product_id,old.product_id)),
    review_count = (select count(*) from reviews where product_id=coalesce(new.product_id,old.product_id))
  where id = coalesce(new.product_id,old.product_id);
  return new;
end;$$;
create trigger trg_rating after insert or update or delete on reviews
  for each row execute procedure update_product_rating();

-- ── SEED PRODUCTS ──────────────────────────────────────
insert into public.products(slug,name,category,short_desc,description,price,compare_price,badge,images,features,avg_rating,review_count,stock) values
('velvet-meridian-sofa','Velvet Meridian Sofa','living-room','Hand-stitched Italian velvet on solid walnut legs.','Hand-stitched in Italian velvet with a solid walnut frame. Each cushion individually filled with premium goose down.',2490,3200,'Bestseller',ARRAY['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80'],ARRAY['Grade-A Italian velvet','Solid walnut frame','Removable cushion covers','10-year warranty'],4.9,48,12),
('aurel-marble-coffee-table','Aurel Marble Coffee Table','living-room','White Carrara marble top on brushed brass base.','White Carrara marble top on a hand-formed brushed brass base. Each marble slab is unique.',1890,2400,'New Arrival',ARRAY['https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=800&q=80'],ARRAY['Carrara marble surface','Brushed brass base','Waterproof sealant','Each piece unique'],4.8,31,8),
('nordic-arc-floor-lamp','Nordic Arc Floor Lamp','lighting','Sculptural arc in matte black with warm linen shade.','A sculptural arc lamp in matte black with a warm-toned linen shade.',680,890,'',ARRAY['https://images.unsplash.com/photo-1507652313519-d4e9174996dd?w=800&q=80'],ARRAY['Matte black steel','Handmade linen shade','Dimmable LED 8W 2700K','10-min assembly'],4.7,22,20),
('sable-platform-bed','Sable Platform Bed','bedroom','Ultra-low platform bed in hand-smoked solid oak.','Ultra-low profile platform bed in hand-smoked oak using Japanese Shou Sugi Ban technique.',3200,4100,'Signature',ARRAY['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80'],ARRAY['Hand-smoked solid oak','Shou Sugi Ban technique','Integrated slatted base','Custom dimensions'],5.0,19,6),
('arco-writing-desk','Arco Writing Desk','office','Slim solid ash desk with full-grain leather pull.','A slim purposeful desk in solid ash. Three-coat hand-wax finish.',1450,null,'',ARRAY['https://images.unsplash.com/photo-1593696140826-c58b021acf8b?w=800&q=80'],ARRAY['Solid ash 3-coat wax','Full-grain leather pull','Cable management slot','50+ year lifespan'],4.8,14,15),
('onyx-vessel-vase','Onyx Vessel Vase','decor','Hand-thrown ceramic in unique onyx reactive glaze.','Hand-thrown ceramic vessel in deep onyx reactive glaze. Each piece unique.',340,460,'Limited',ARRAY['https://images.unsplash.com/photo-1602928298849-e5d4b53f4c6c?w=800&q=80'],ARRAY['Hand-thrown stoneware','Unique reactive glaze','Artisan-signed base','Waterproof interior'],4.9,37,18),
('linen-cloud-bedding','Linen Cloud Bedding','bedroom','Pure French linen, stone-washed 12 times.','Pure French linen bedding stone-washed 12 times for unparalleled softness.',380,520,'New Arrival',ARRAY['https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=800&q=80'],ARRAY['100% French linen','Stone-washed 12×','OEKO-TEX certified','Machine washable'],4.9,61,30),
('meridian-accent-chair','Meridian Accent Chair','living-room','High-back boucle accent chair on solid brass legs.','High curved back accent chair in boucle fabric on solid brass legs.',1290,1680,'',ARRAY['https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=80'],ARRAY['Boucle upholstery','Solid brass legs','High curved back','Ivory & charcoal options'],4.7,25,10);
