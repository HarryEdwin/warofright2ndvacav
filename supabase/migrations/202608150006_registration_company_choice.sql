-- Record the applicant's chosen company when the Auth user is created.
-- Run this file in Supabase SQL Editor before deploying the updated register-qq function.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_qq text := new.raw_user_meta_data ->> 'qq_number';
    new_nickname text := btrim(new.raw_user_meta_data ->> 'nickname');
    new_company text := btrim(new.raw_user_meta_data ->> 'company');
begin
    if new_qq is null or new_qq !~ '^[0-9]{5,12}$' then
        raise exception 'Invalid QQ number';
    end if;
    if new_nickname is null or char_length(new_nickname) not between 2 and 24 then
        raise exception 'Invalid nickname';
    end if;
    if new_company is null or new_company not in ('A 连', 'SC 连') then
        raise exception 'Invalid company';
    end if;

    insert into public.profiles (id, qq_number, nickname)
    values (new.id, new_qq, new_nickname);

    insert into public.member_records (profile_id, company)
    values (new.id, new_company)
    on conflict (profile_id) do update
        set company = excluded.company;

    return new;
end;
$$;
