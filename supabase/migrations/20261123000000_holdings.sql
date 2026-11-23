-- Holdings and concentration v1.0: which stocks the user holds, and per-user concentration settings.

-- One row = the stock is held. No row = not held. Null amounts = held, amount unknown.
create table app.holdings (
  stock_id      uuid primary key,
  user_id       uuid not null,
  shares        numeric(18,4) check (shares > 0),
  average_cost  numeric(18,4) check (average_cost >= 0),
  cost_currency text not null check (cost_currency in ('USD','THB')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (stock_id, user_id) references app.stocks (id, user_id) on delete cascade
);
create index holdings_user on app.holdings (user_id);

-- One row per user, created on the first save; absent = defaults.
create table app.user_settings (
  user_id                 uuid primary key,
  concentration_threshold smallint not null default 40
                          check (concentration_threshold between 1 and 100),
  usd_thb_rate            numeric(18,6) check (usd_thb_rate > 0),
  usd_thb_rate_updated_at timestamptz,
  updated_at              timestamptz not null default now()
);

-- No policies: deny by default for anything but the owner role the API connects as.
alter table app.holdings      enable row level security;
alter table app.user_settings enable row level security;
