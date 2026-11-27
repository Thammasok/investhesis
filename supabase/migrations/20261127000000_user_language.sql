-- i18n v1.0: the language the user chose for the interface. null = never chosen.
alter table app.user_settings
  add column language text check (language in ('en', 'th'));
