-- Allow approved administrators to moderate member-uploaded avatars.
-- Run this file once after 202608150001_company_rosters.sql.

drop policy if exists "admins delete member avatars" on storage.objects;
create policy "admins delete member avatars" on storage.objects
    for delete to authenticated
    using (bucket_id = 'member-avatars' and public.is_admin());

create or replace function public.clear_member_avatar(p_target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null or not public.is_admin() then
        raise exception 'Only administrators can clear member avatars' using errcode = '42501';
    end if;
    if p_target_profile_id = auth.uid() then
        raise exception 'Use the account page to replace your own avatar' using errcode = '42501';
    end if;

    update public.member_records
    set avatar_path = null
    where profile_id = p_target_profile_id;

    if not found then
        raise exception 'Member record not found' using errcode = 'P0002';
    end if;
end;
$$;

revoke all on function public.clear_member_avatar(uuid) from public, anon;
grant execute on function public.clear_member_avatar(uuid) to authenticated;
