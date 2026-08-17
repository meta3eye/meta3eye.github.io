-- SPIRIT SYSTEM FINAL INITIAL SETUP
-- This version is designed to be safe to run on the NEW project already created.
-- It does not drop tables, policies, or triggers.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null default 'PLAYER',
  level integer not null default 1 check (level between 1 and 100),
  exp integer not null default 0 check (exp >= 0),
  perception integer not null default 1 check (perception between 1 and 100),
  intuition integer not null default 1 check (intuition between 1 and 100),
  focus integer not null default 1 check (focus between 1 and 100),
  interpretation integer not null default 1 check (interpretation between 1 and 100),
  control integer not null default 1 check (control between 1 and 100),
  highest_level integer not null default 1 check (highest_level between 1 and 100),
  streak_days integer not null default 0 check (streak_days >= 0),
  last_training_at timestamptz,
  last_login_at timestamptz,
  status text not null default 'AWAKENED'
    check (status in ('AWAKENED','DORMANT_WARNING','DORMANT','DEPLETED','DELETED')),
  assessment_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quest_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_code text not null,
  grade text not null check (grade in ('D','C','B','A','S')),
  exp_gained integer not null default 0 check (exp_gained >= 0),
  score numeric(5,2),
  result jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

create table if not exists public.assessment_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric(5,2) not null check (score between 0 and 100),
  assigned_level integer not null check (assigned_level between 1 and 30),
  stats jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

create table if not exists public.quest_defs (
  code text primary key,
  title text not null,
  grade text not null check (grade in ('D','C','B','A','S')),
  min_level integer not null default 1 check (min_level between 1 and 100),
  base_exp integer not null default 10 check (base_exp >= 0),
  active boolean not null default true
);

insert into public.quest_defs(code,title,grade,min_level,base_exp) values
('focus_5','5분 집중 훈련','D',1,10),
('sense_observation','감각 관찰','D',1,10),
('intuition_choice','직관 선택','C',10,20),
('emotion_guess','감정 추측','B',20,30),
('life_death','생사 판별','A',30,50)
on conflict (code) do nothing;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'profiles_touch_updated_at'
      and tgrelid = 'public.profiles'::regclass
  ) then
    create trigger profiles_touch_updated_at
    before update on public.profiles
    for each row execute function public.touch_updated_at();
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.quest_logs enable row level security;
alter table public.assessment_logs enable row level security;
alter table public.quest_defs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
    create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quest_logs' and policyname='quest_logs_select_own') then
    create policy quest_logs_select_own on public.quest_logs for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quest_logs' and policyname='quest_logs_insert_own') then
    create policy quest_logs_insert_own on public.quest_logs for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='assessment_logs' and policyname='assessment_logs_select_own') then
    create policy assessment_logs_select_own on public.assessment_logs for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='assessment_logs' and policyname='assessment_logs_insert_own') then
    create policy assessment_logs_insert_own on public.assessment_logs for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quest_defs' and policyname='quest_defs_public_read') then
    create policy quest_defs_public_read on public.quest_defs for select using (active = true);
  end if;
end $$;

-- Secure player creation: the browser cannot choose another user's id.
create or replace function public.create_player(
  p_player_name text default 'PLAYER',
  p_level integer default 1,
  p_perception integer default 1,
  p_intuition integer default 1,
  p_focus integer default 1,
  p_interpretation integer default 1,
  p_control integer default 1
)
returns public.profiles
language plpgsql
security invoker
as $$
declare
  v_user uuid := auth.uid();
  v_row public.profiles;
begin
  if v_user is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_level < 1 or p_level > 30 then raise exception 'INVALID_START_LEVEL'; end if;

  insert into public.profiles(
    id, player_name, level, highest_level, perception, intuition,
    focus, interpretation, control, last_login_at
  )
  values(
    v_user, coalesce(nullif(trim(p_player_name),''),'PLAYER'), p_level, p_level,
    greatest(1,least(100,p_perception)), greatest(1,least(100,p_intuition)),
    greatest(1,least(100,p_focus)), greatest(1,least(100,p_interpretation)),
    greatest(1,least(100,p_control)), now()
  )
  on conflict (id) do update set last_login_at=now()
  returning * into v_row;

  return v_row;
end $$;

grant execute on function public.create_player(text,integer,integer,integer,integer,integer,integer) to authenticated;

-- Server-side quest completion for the simple MVP quests.
-- A future production version should replace this with per-quest validation.
create or replace function public.complete_simple_quest(
  p_quest_code text,
  p_exp integer
)
returns public.profiles
language plpgsql
security invoker
as $$
declare
  v_user uuid := auth.uid();
  v_p public.profiles;
  v_q public.quest_defs;
  v_exp integer;
  v_level integer;
begin
  if v_user is null then raise exception 'LOGIN_REQUIRED'; end if;

  select * into v_p from public.profiles where id=v_user for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  select * into v_q from public.quest_defs
  where code=p_quest_code and active=true and min_level <= v_p.level;

  if not found then raise exception 'QUEST_NOT_AVAILABLE'; end if;

  v_exp := least(100000, greatest(0, v_q.base_exp));
  v_level := v_p.level;

  -- Simple XP curve: 100 + 40*(level-1)
  while v_level < 100 and v_p.exp + v_exp >= (100 + (v_level-1)*40) loop
    v_p.exp := v_p.exp - (100 + (v_level-1)*40) + v_exp;
    v_level := v_level + 1;
    v_exp := 0;
  end loop;

  if v_level = v_p.level then
    v_p.exp := v_p.exp + greatest(0,v_exp);
  end if;

  update public.profiles
  set level=v_level,
      highest_level=greatest(highest_level,v_level),
      last_training_at=now(),
      last_login_at=now(),
      status='AWAKENED',
      streak_days=case
        when last_training_at is null then 1
        when last_training_at::date = current_date then streak_days
        when last_training_at::date = current_date-1 then streak_days+1
        else 1
      end
  where id=v_user
  returning * into v_p;

  insert into public.quest_logs(user_id,quest_code,grade,exp_gained,result)
  values(v_user,p_quest_code,v_q.grade,v_q.base_exp,'{"source":"simple_mvp"}'::jsonb);

  return v_p;
end $$;

grant execute on function public.complete_simple_quest(text,integer) to authenticated;

create or replace function public.save_assessment(
  p_score numeric,
  p_level integer,
  p_stats jsonb
)
returns void
language plpgsql
security invoker
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'LOGIN_REQUIRED'; end if;
  if p_score < 0 or p_score > 100 or p_level < 1 or p_level > 30 then raise exception 'INVALID_ASSESSMENT'; end if;

  insert into public.assessment_logs(user_id,score,assigned_level,stats)
  values(v_user,p_score,p_level,coalesce(p_stats,'{}'::jsonb));
end $$;

grant execute on function public.save_assessment(numeric,integer,jsonb) to authenticated;
