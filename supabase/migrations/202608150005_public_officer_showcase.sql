-- Public company officer showcase with tightly scoped avatar access.

create or replace function public.get_public_company_officers(p_company text)
returns table (
    profile_id uuid,
    nickname text,
    company text,
    current_rank text,
    achievements text[],
    avatar_path text
)
language sql
stable
security definer
set search_path = public
as $$
    select p.id, p.nickname, m.company, m.current_rank, m.achievements, m.avatar_path
    from public.profiles p
    join public.member_records m on m.profile_id = p.id
    where p.account_status = 'approved'
      and m.company = p_company
      and m.company in ('A 连', 'SC 连')
      and m.current_rank in ('少尉', '中尉', '上尉')
    order by case m.current_rank
        when '上尉' then 3
        when '中尉' then 2
        when '少尉' then 1
        else 0
    end desc, p.nickname;
$$;

revoke all on function public.get_public_company_officers(text) from public;
grant execute on function public.get_public_company_officers(text) to anon, authenticated;

create or replace function public.is_public_officer_avatar(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles p
        join public.member_records m on m.profile_id = p.id
        where p.account_status = 'approved'
          and m.company in ('A 连', 'SC 连')
          and m.current_rank in ('少尉', '中尉', '上尉')
          and m.avatar_path = p_object_name
    );
$$;

revoke all on function public.is_public_officer_avatar(text) from public;
grant execute on function public.is_public_officer_avatar(text) to anon, authenticated;

drop policy if exists "public reads officer avatars" on storage.objects;
create policy "public reads officer avatars" on storage.objects
    for select to anon, authenticated
    using (
        bucket_id = 'member-avatars'
        and public.is_public_officer_avatar(storage.objects.name)
    );
