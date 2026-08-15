-- Run this once if 202608140001_member_accounts.sql was already installed.
-- It makes administrator approval confirm the member's synthetic QQ login.

create or replace function public.confirm_approved_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
    if new.account_status = 'approved' and old.account_status <> 'approved' then
        update auth.users
        set email_confirmed_at = coalesce(email_confirmed_at, now()),
            updated_at = now()
        where id = new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists confirm_approved_user on public.profiles;
create trigger confirm_approved_user
    after update of account_status on public.profiles
    for each row execute function public.confirm_approved_user();
