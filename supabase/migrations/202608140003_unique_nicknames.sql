-- Run once after the account tables have been installed.
-- QQ numbers are already unique; this adds case-insensitive nickname uniqueness.

create unique index if not exists profiles_nickname_unique_ci
    on public.profiles (lower(btrim(nickname)));
