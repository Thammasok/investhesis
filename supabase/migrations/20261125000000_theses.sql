-- Thesis log v1.0: dated thesis entries (buy, sell, update, review) per stock.
create table app.theses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  stock_id      uuid not null,
  type          text not null check (type in ('buy','sell','update','review')),
  entry_date    date not null,
  note          text not null check (char_length(note) between 1 and 10000),
  target_price  numeric(18,4) check (target_price > 0),
  invalidation  text check (char_length(invalidation) between 1 and 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (stock_id, user_id) references app.stocks (id, user_id) on delete cascade
);
create index theses_user_stock_order
  on app.theses (user_id, stock_id, entry_date desc, created_at desc);

-- No policies: deny by default for anything but the owner role the API connects as.
alter table app.theses enable row level security;
