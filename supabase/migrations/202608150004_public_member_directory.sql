-- Make the approved-member directory fields uniformly visible.
-- Run this file after 202608150003_roster_privacy.sql.

drop function if exists public.get_company_roster();
drop function if exists public.set_own_roster_visibility(jsonb);

alter table public.member_records
    drop column if exists roster_visibility;

create function public.get_company_roster()
returns table (
    profile_id uuid,
    nickname text,
    member_role text,
    company text,
    current_rank text,
    member_status text,
    avatar_path text,
    qq_number text,
    promotion_path text,
    joined_on date,
    activity_total integer,
    experience_points integer,
    training_points integer,
    command_points integer,
    service_points integer,
    achievements text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if auth.uid() is null or not public.is_approved_member() then
        raise exception 'Only approved members can view the member directory' using errcode = '42501';
    end if;

    return query
    select
        p.id,
        p.nickname,
        p.role,
        m.company,
        m.current_rank,
        m.member_status,
        m.avatar_path,
        p.qq_number,
        m.promotion_path,
        m.joined_on,
        m.activity_total,
        m.experience_points,
        m.training_points,
        m.command_points,
        m.service_points,
        m.achievements
    from public.profiles p
    join public.member_records m on m.profile_id = p.id
    where p.account_status = 'approved';
end;
$$;

revoke all on function public.get_company_roster() from public, anon;
grant execute on function public.get_company_roster() to authenticated;
