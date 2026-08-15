-- Enforce the member/admin/super-admin hierarchy in the database.
-- Run this file once in the Supabase SQL Editor after the earlier migrations.

create or replace function public.can_manage_member(p_target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.is_super_admin()
        or (
            public.is_admin()
            and exists (
                select 1
                from public.profiles
                where id = p_target_profile_id
                  and role = 'member'
            )
        );
$$;

revoke all on function public.can_manage_member(uuid) from public, anon;
grant execute on function public.can_manage_member(uuid) to authenticated;

-- Role changes require a super administrator. Even a super administrator may
-- not change their own role, which prevents accidental loss of the last
-- management account through the website.
create or replace function public.protect_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.id <> old.id or new.qq_number <> old.qq_number or new.created_at <> old.created_at then
        raise exception 'Identity fields cannot be changed';
    end if;

    if new.role <> old.role then
        if auth.uid() is null or not public.is_super_admin() then
            raise exception 'Only a super administrator can change roles';
        end if;
        if auth.uid() = old.id then
            raise exception 'A super administrator cannot change their own role';
        end if;
    end if;

    if old.role in ('admin', 'super_admin')
       and auth.uid() is not null
       and auth.uid() <> old.id
       and not public.is_super_admin() then
        raise exception 'Only a super administrator can modify another administrator';
    end if;

    if new.account_status <> old.account_status then
        if auth.uid() is not null and not public.is_admin() then
            raise exception 'Only an administrator can change account status';
        end if;
        if new.account_status = 'approved' then
            new.approved_at := now();
            new.approved_by := auth.uid();
        else
            new.approved_at := null;
            new.approved_by := null;
        end if;
    end if;

    new.updated_at := now();
    return new;
end;
$$;

-- A normal administrator may edit ordinary-member profiles only. A super
-- administrator may edit every profile. The existing protect_profile_update
-- trigger remains a second layer that permits role changes only to super admins.
drop policy if exists "admins update profiles" on public.profiles;
create policy "role hierarchy updates profiles" on public.profiles
    for update to authenticated
    using (
        public.is_super_admin()
        or (public.is_admin() and role = 'member')
    )
    with check (
        public.is_super_admin()
        or (public.is_admin() and role = 'member')
    );

drop policy if exists "admins insert member records" on public.member_records;
create policy "role hierarchy inserts member records" on public.member_records
    for insert to authenticated
    with check (public.can_manage_member(profile_id));

drop policy if exists "admins update member records" on public.member_records;
create policy "role hierarchy updates member records" on public.member_records
    for update to authenticated
    using (public.can_manage_member(profile_id))
    with check (public.can_manage_member(profile_id));

drop policy if exists "admins delete member records" on public.member_records;
create policy "super admins delete member records" on public.member_records
    for delete to authenticated
    using (public.is_super_admin());

-- Deleting the auth user also removes the linked profile and member data via
-- ON DELETE CASCADE. The caller must be an approved super administrator.
create or replace function public.delete_member_account(p_target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    target_profile public.profiles%rowtype;
begin
    if auth.uid() is null or not public.is_super_admin() then
        raise exception 'Only a super administrator can delete accounts'
            using errcode = '42501';
    end if;

    if p_target_profile_id = auth.uid() then
        raise exception 'A super administrator cannot delete their own account'
            using errcode = '42501';
    end if;

    select * into target_profile
    from public.profiles
    where id = p_target_profile_id;

    if not found then
        raise exception 'Account not found'
            using errcode = 'P0002';
    end if;

    insert into public.audit_logs (actor_id, target_id, action, before_data)
    values (
        auth.uid(),
        null,
        'account.deleted',
        jsonb_build_object(
            'id', target_profile.id,
            'qq_number', target_profile.qq_number,
            'nickname', target_profile.nickname,
            'role', target_profile.role,
            'account_status', target_profile.account_status
        )
    );

    delete from auth.users where id = p_target_profile_id;
end;
$$;

revoke all on function public.delete_member_account(uuid) from public, anon;
grant execute on function public.delete_member_account(uuid) to authenticated;
