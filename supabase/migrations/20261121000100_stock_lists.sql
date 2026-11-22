-- Stock lists v1.0 (docs/features/stock-lists/v1.0/design.md, Data Model).
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;   -- not reachable through the Data API

create table app.stocks (
  id                   uuid primary key,
  user_id              uuid not null,
  market               text not null check (market in ('US','TH')),
  ticker               text not null check (ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,11}$'),
  exchange             text not null,
  currency             text not null,
  name                 text not null check (char_length(name) between 1 and 200),
  index_membership     text[] not null default '{}',
  gics_sector          text,
  set_industry_group   text,
  value_chain          text,
  value_chain_position text,
  size                 text,
  style                text,
  economic_cycle       text,
  lynch_type           text,
  life_cycle           text,
  customers            text[] not null default '{}',
  revenue_types        text[] not null default '{}',
  moat                 text,
  themes               text[] not null default '{}',
  volatility           text,
  lens_sources         jsonb not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint stocks_exchange_market check (
    (market = 'US' and exchange in ('NYSE','NASDAQ') and currency = 'USD') or
    (market = 'TH' and exchange in ('SET','mai')     and currency = 'THB')),
  constraint stocks_user_market_ticker unique (user_id, market, ticker),
  constraint stocks_id_user unique (id, user_id)
);

create table app.lists (
  id         uuid primary key,
  user_id    uuid not null,
  name       text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lists_id_user unique (id, user_id)
);
create unique index lists_user_name_ci on app.lists (user_id, lower(name));

create table app.list_stocks (
  list_id  uuid not null,
  stock_id uuid not null,
  user_id  uuid not null,
  added_at timestamptz not null default now(),
  primary key (list_id, stock_id),
  foreign key (list_id,  user_id) references app.lists  (id, user_id) on delete cascade,
  foreign key (stock_id, user_id) references app.stocks (id, user_id) on delete cascade
);
create index list_stocks_stock on app.list_stocks (stock_id);

-- No policies: deny by default for anything but the owner role the API connects as.
alter table app.stocks      enable row level security;
alter table app.lists       enable row level security;
alter table app.list_stocks enable row level security;
