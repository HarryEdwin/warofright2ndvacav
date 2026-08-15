-- Member-controlled roster detail visibility.
-- Run this file once in Supabase SQL Editor after the earlier roster migrations.

alter table public.member_records
    add column if not exists roster_visibility jsonb not null default jsonb_build_object(
        'qq_number', false,
        'promotion_path', false,
        'joined_on', false,
        'activity_total', false,
        'experience_points', false,
        'training_points', false,
        'command_points', false,
        'service_points', false,
        'achievements', false
    );

create or replace function public.set_own_roster_visibility(p_visibility jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null or not public.is_approved_member() then
        raise exception 'Only approved members can set roster visibility' using errcode = '42501';
    end if;
    if p_visibility is null or jsonb_typeof(p_visibility) <> 'object' then
        raise exception 'Roster visibility must be an object' using errcode = '22023';
    end if;

    update public.member_records
    set roster_visibility = jsonb_build_object(
        'qq_number', (p_visibility -> 'qq_number') = 'true'::jsonb,
        'promotion_path', (p_visibility -> 'promotion_path') = 'true'::jsonb,
        'joined_on', (p_visibility -> 'joined_on') = 'true'::jsonb,
        'activity_total', (p_visibility -> 'activity_total') = 'true'::jsonb,
        'experience_points', (p_visibility -> 'experience_points') = 'true'::jsonb,
        'training_points', (p_visibility -> 'training_points') = 'true'::jsonb,
        'command_points', (p_visibility -> 'command_points') = 'true'::jsonb,
        'service_points', (p_visibility -> 'service_points') = 'true'::jsonb,
        'achievements', (p_visibility -> 'achievements') = 'true'::jsonb
    ),
    updated_at = now()
    where profile_id = auth.uid();
end;
$$;

revoke all on function public.set_own_roster_visibility(jsonb) from public, anon;
grant execute on function public.set_own_roster_visibility(jsonb) to authenticated;

drop function if exists public.get_company_roster();

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
        raise exception 'Only approved members can view the roster' using errcode = '42501';
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
        case when p.id = auth.uid() or (m.roster_visibility -> 'qq_number') = 'true'::jsonb then p.qq_number end,
        case when p.id = auth.uid() or (m.roster_visibility -> 'promotion_path') = 'true'::jsonb then m.promotion_path end,
        case when p.id = auth.uid() or (m.roster_visibility -> 'joined_on') = 'true'::jsonb then m.joined_on end,
        case when p.id = auth.uid() or (m.roster_visibility -> 'activity_total') = 'true'::jsonb then m.activity_total end,
        case when p.id = auth.uid() or (m.roster_visibility -> 'experience_points') = 'true'::jsonb then m.experience_points end,
        case when p.id = auth.uid() or (m.roster_visibility -> 'training_points') = 'true'::jsonb then m.training_points end,
        case when p.id = auth.uid() or (m.roster_visibility -> 'command_points') = 'true'::jsonb then m.command_points end,
        case when p.id = auth.uid() or (m.roster_visibility -> 'service_points') = 'true'::jsonb then m.service_points end,
        case when p.id = auth.uid() or (m.roster_visibility -> 'achievements') = 'true'::jsonb then m.achievements end
    from public.profiles p
    join public.member_records m on m.profile_id = p.id
    where p.account_status = 'approved';
end;
$$;

revoke all on function public.get_company_roster() from public, anon;
grant execute on function public.get_company_roster() to authenticated;
