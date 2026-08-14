-- ============================================================================
-- SAFAR — Postgres schema for Supabase
-- ============================================================================
-- Run this in the Supabase SQL editor on a fresh project.
--
-- Two ideas run through the whole thing:
--
--   1. This database is a scratchpad, not a record. Almost every row belongs to
--      one train on one date and deletes itself shortly after that train arrives.
--      Only profiles, blocks and reports survive.
--
--   2. Locked fields are never SENT, not hidden after sending. Anything the phone
--      receives can be read off the phone, so coach, seat, college and contact live
--      in tables the client cannot select from. They come back only through a
--      function that checks both people unlocked each other.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. PEOPLE
-- ============================================================================

-- Public half. This is everything a stranger on your train can see.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  first_name   text not null check (char_length(first_name) between 1 and 24),
  photo_url    text,
  bio          text check (char_length(bio) <= 140),
  tags         text[] not null default '{}' check (array_length(tags,1) is null or array_length(tags,1) <= 5),
  status       text not null default 'active' check (status in ('active','suspended')),
  journeys_count int not null default 0,          -- drives new-account rate limits
  created_at   timestamptz not null default now()
);

-- Private half. Never exposed by a policy — only ever returned by unlocked_profile().
create table public.profile_private (
  id         uuid primary key references public.profiles(id) on delete cascade,
  dob        date not null,                        -- 18+ gate; never shown to anyone
  college    text,
  study_year text,
  hometown   text,
  instagram  text,
  phone      text
);

alter table public.profiles        enable row level security;
alter table public.profile_private enable row level security;

-- ============================================================================
-- 2. JOURNEYS
-- ============================================================================

create table public.journeys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  mode          text not null check (mode in ('train','bus')),
  service_code  text not null,                     -- '12229', or operator+route for a bus
  travel_date   date not null,
  coach         text,                              -- PRIVATE. matching key, never public.
  seat          text,                              -- PRIVATE.
  from_station  text,
  to_station    text,                              -- PRIVATE until unlocked
  visibility    text not null default 'everyone' check (visibility in ('everyone','nobody')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,              -- scheduled arrival + 24h
  unique (user_id, service_code, travel_date)
);

create index journeys_lookup_idx on public.journeys (service_code, travel_date)
  where visibility = 'everyone';
create index journeys_expiry_idx on public.journeys (expires_at);

alter table public.journeys enable row level security;

-- ============================================================================
-- 3. BLOCKS AND REPORTS  — the only things that outlive the journey
-- ============================================================================

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles(id) on delete set null,
  reported_id  uuid not null references public.profiles(id) on delete cascade,
  service_code text,
  travel_date  date,
  reason       text not null,
  detail       text,
  chat_copy    jsonb,                              -- attached only if the reporter agreed
  created_at   timestamptz not null default now(),
  reviewed     boolean not null default false
);

create index reports_reported_idx on public.reports (reported_id);

alter table public.blocks  enable row level security;
alter table public.reports enable row level security;

-- ============================================================================
-- 4. UNLOCKS — always mutual, never announced
-- ============================================================================

create table public.unlocks (
  id           uuid primary key default gen_random_uuid(),
  service_code text not null,
  travel_date  date not null,
  a_id         uuid not null references public.profiles(id) on delete cascade,
  b_id         uuid not null references public.profiles(id) on delete cascade,
  a_asked      boolean not null default false,
  b_asked      boolean not null default false,
  expires_at   timestamptz not null,
  check (a_id < b_id),                             -- one row per pair, order-independent
  unique (a_id, b_id, service_code, travel_date)
);

create index unlocks_expiry_idx on public.unlocks (expires_at);
alter table public.unlocks enable row level security;

-- ============================================================================
-- 5. THREADS AND MESSAGES
-- ============================================================================

create table public.threads (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('dm','coach','service')),
  service_code    text not null,
  travel_date     date not null,
  coach           text,                            -- set for kind='coach'
  last_message_at timestamptz not null default now(),
  expires_at      timestamptz not null,            -- last_message_at + 9h, pushed on every message
  created_at      timestamptz not null default now()
);

create table public.thread_members (
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  primary key (thread_id, user_id)
);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  client_id  uuid not null,                        -- generated on the phone before sending
  created_at timestamptz not null default now(),
  unique (thread_id, client_id)                    -- retry after a tunnel can never double-post
);

create index messages_thread_idx on public.messages (thread_id, created_at desc);
create index threads_expiry_idx  on public.threads (expires_at);

alter table public.threads        enable row level security;
alter table public.thread_members enable row level security;
alter table public.messages       enable row level security;

-- ============================================================================
-- 6. ADDA
-- ============================================================================

create table public.plans (
  id           uuid primary key default gen_random_uuid(),
  service_code text not null,
  travel_date  date not null,
  host_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null check (char_length(title) <= 60),
  place        text,
  at_time      timestamptz not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create table public.plan_members (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (plan_id, user_id)
);

create index plans_lookup_idx on public.plans (service_code, travel_date);
create index plans_expiry_idx on public.plans (expires_at);

alter table public.plans        enable row level security;
alter table public.plan_members enable row level security;

-- ============================================================================
-- 7. HELPERS
-- ============================================================================

-- Either direction counts. A block is permanent and mutual in effect.
create or replace function public.is_blocked_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other       and blocked_id = auth.uid())
  );
$$;

-- Are we on the same service on the same day, both switched on?
create or replace function public.shares_journey(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from journeys me
    join journeys them
      on me.service_code = them.service_code
     and me.travel_date  = them.travel_date
    where me.user_id   = auth.uid()
      and them.user_id = other
      and me.visibility   = 'everyone'
      and them.visibility = 'everyone'
      and me.expires_at   > now()
      and them.expires_at > now()
  );
$$;

create or replace function public.is_unlocked_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from unlocks
    where a_id = least(auth.uid(), other)
      and b_id = greatest(auth.uid(), other)
      and a_asked and b_asked
      and expires_at > now()
  );
$$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

-- Profiles: yourself, or someone active on your train who hasn't blocked you.
create policy profiles_self on public.profiles
  for select using (id = auth.uid());

create policy profiles_onboard on public.profiles
  for select using (
    status = 'active'
    and shares_journey(id)
    and not is_blocked_with(id)
  );

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Private half: owner only. No policy grants anyone else read access, ever.
create policy profile_private_self on public.profile_private
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Journeys: your own rows only. Other people's journeys are reached through
-- onboard_list(), never selected directly — that is what keeps coach and seat private.
create policy journeys_own on public.journeys
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy blocks_own on public.blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy reports_insert on public.reports
  for insert with check (reporter_id = auth.uid());

create policy unlocks_mine on public.unlocks
  for select using (a_id = auth.uid() or b_id = auth.uid());

create policy threads_member on public.threads
  for select using (exists (
    select 1 from thread_members m where m.thread_id = id and m.user_id = auth.uid()
  ));

create policy thread_members_self on public.thread_members
  for select using (exists (
    select 1 from thread_members m where m.thread_id = thread_id and m.user_id = auth.uid()
  ));

create policy messages_read on public.messages
  for select using (exists (
    select 1 from thread_members m where m.thread_id = thread_id and m.user_id = auth.uid()
  ));

create policy messages_send on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from thread_members m where m.thread_id = thread_id and m.user_id = auth.uid())
  );

create policy plans_read on public.plans
  for select using (exists (
    select 1 from journeys j
    where j.user_id = auth.uid()
      and j.service_code = plans.service_code
      and j.travel_date  = plans.travel_date
  ));

create policy plans_host on public.plans
  for insert with check (host_id = auth.uid());

create policy plan_members_self on public.plan_members
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- 9. THE ONE QUERY THE APP ACTUALLY RUNS
-- ============================================================================
-- Public fields only. No coach, no seat, no destination, no age.

create or replace function public.onboard_list(p_service text, p_date date)
returns table (
  id uuid, first_name text, photo_url text, bio text, tags text[], unlocked boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.photo_url, p.bio, p.tags, is_unlocked_with(p.id)
  from journeys j
  join profiles p on p.id = j.user_id
  where j.service_code = p_service
    and j.travel_date  = p_date
    and j.visibility   = 'everyone'
    and j.expires_at   > now()
    and p.status       = 'active'
    and p.id          <> auth.uid()
    and not is_blocked_with(p.id)
    -- you must be on this service yourself to see anyone on it
    and exists (
      select 1 from journeys me
      where me.user_id = auth.uid()
        and me.service_code = p_service
        and me.travel_date  = p_date
    );
$$;

-- The private fields, released only when both people asked.
create or replace function public.unlocked_profile(other uuid)
returns table (
  college text, study_year text, hometown text, instagram text, phone text,
  coach text, seat text, to_station text
)
language sql stable security definer set search_path = public as $$
  select pp.college, pp.study_year, pp.hometown, pp.instagram, pp.phone,
         j.coach, j.seat, j.to_station
  from profile_private pp
  join journeys j on j.user_id = pp.id and j.expires_at > now()
  where pp.id = other
    and is_unlocked_with(other)
    and not is_blocked_with(other);
$$;

-- Asking is silent. The other person is never told, and learns nothing until
-- they independently ask too.
create or replace function public.ask_unlock(other uuid, p_service text, p_date date)
returns boolean language plpgsql security definer set search_path = public as $$
declare lo uuid; hi uuid; mutual boolean;
begin
  if not shares_journey(other) or is_blocked_with(other) then
    raise exception 'not on the same journey';
  end if;

  lo := least(auth.uid(), other);
  hi := greatest(auth.uid(), other);

  insert into unlocks (service_code, travel_date, a_id, b_id, a_asked, b_asked, expires_at)
  values (p_service, p_date, lo, hi, lo = auth.uid(), hi = auth.uid(), now() + interval '48 hours')
  on conflict (a_id, b_id, service_code, travel_date) do update
    set a_asked = unlocks.a_asked or (lo = auth.uid()),
        b_asked = unlocks.b_asked or (hi = auth.uid());

  select u.a_asked and u.b_asked into mutual
  from unlocks u where u.a_id = lo and u.b_id = hi
    and u.service_code = p_service and u.travel_date = p_date;

  return mutual;
end; $$;

-- ============================================================================
-- 10. MODERATION — automatic, because there is nobody on duty at 3am
-- ============================================================================

create or replace function public.enforce_reports()
returns trigger language plpgsql security definer set search_path = public as $$
declare distinct_reporters int; account_age int;
begin
  -- the reporter never sees this person again, in either direction, permanently
  insert into blocks (blocker_id, blocked_id)
  values (new.reporter_id, new.reported_id)
  on conflict do nothing;

  select count(distinct reporter_id) into distinct_reporters
  from reports where reported_id = new.reported_id;

  select journeys_count into account_age from profiles where id = new.reported_id;

  -- three distinct reporters, or one against a brand-new account
  if distinct_reporters >= 3 or (account_age < 3 and distinct_reporters >= 1) then
    update profiles set status = 'suspended' where id = new.reported_id;
  end if;

  return new;
end; $$;

create trigger reports_enforce after insert on public.reports
  for each row execute function public.enforce_reports();

-- Every message pushes the thread's death forward. A live conversation stays
-- alive; a dead one starts counting down. Nothing is tied to the timetable,
-- which is exactly why a four-hour delay breaks nothing.
create or replace function public.touch_thread()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update threads
     set last_message_at = new.created_at,
         expires_at      = new.created_at + interval '9 hours'
   where id = new.thread_id;
  return new;
end; $$;

create trigger messages_touch after insert on public.messages
  for each row execute function public.touch_thread();

-- ============================================================================
-- 11. THE CLEANUP THAT KEEPS STORAGE FLAT
-- ============================================================================

create or replace function public.sweep_expired()
returns void language sql security definer set search_path = public as $$
  delete from messages where thread_id in (select id from threads where expires_at < now());
  delete from threads  where expires_at < now();
  delete from unlocks  where expires_at < now();
  delete from plans    where expires_at < now();
  delete from journeys where expires_at < now();
$$;

-- Hourly, on Supabase's free tier:
--   select cron.schedule('safar-sweep', '0 * * * *', $$ select public.sweep_expired(); $$);

-- ============================================================================
-- 12. NEW USER HOOK
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, photo_url)
  values (
    new.id,
    coalesce(split_part(new.raw_user_meta_data->>'full_name', ' ', 1), 'Traveller'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 13. RATE LIMITS  — additive; safe to run on its own if section 1-12 already ran
-- ============================================================================
-- Version one does not verify tickets. There is no free PNR API, the official one
-- is expensive and restricted, and the scrapers around it are unreliable. So anyone
-- can claim any train, and these two limits carry the weight verification would have.
-- Both live here rather than in the app, because a limit the client enforces is a
-- limit that a modified client ignores.

-- Count journeys so "new account" means something.
create or replace function public.bump_journeys_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update profiles set journeys_count = journeys_count + 1 where id = new.user_id;
  return new;
end; $$;

drop trigger if exists journeys_bump on public.journeys;
create trigger journeys_bump after insert on public.journeys
  for each row execute function public.bump_journeys_count();

-- Limit 1: a new account may open at most three one-to-one threads per journey.
-- Stops one person spraying an entire coach.
create or replace function public.start_dm(other uuid, p_service text, p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare t_id uuid; mine int; opened int;
begin
  if not shares_journey(other) or is_blocked_with(other) then
    raise exception 'not on the same journey';
  end if;

  -- already talking? hand back the existing thread
  select t.id into t_id
  from threads t
  join thread_members m1 on m1.thread_id = t.id and m1.user_id = auth.uid()
  join thread_members m2 on m2.thread_id = t.id and m2.user_id = other
  where t.kind = 'dm' and t.service_code = p_service and t.travel_date = p_date;
  if t_id is not null then return t_id; end if;

  select journeys_count into mine from profiles where id = auth.uid();

  select count(*) into opened
  from threads t
  join thread_members m on m.thread_id = t.id and m.user_id = auth.uid()
  where t.kind = 'dm' and t.service_code = p_service and t.travel_date = p_date;

  if mine < 3 and opened >= 3 then
    raise exception 'new accounts can start three conversations per journey';
  end if;

  insert into threads (kind, service_code, travel_date, expires_at)
  values ('dm', p_service, p_date, now() + interval '9 hours')
  returning id into t_id;

  insert into thread_members (thread_id, user_id) values (t_id, auth.uid()), (t_id, other);
  return t_id;
end; $$;

-- Limit 2: no links until an account has a few journeys behind it. Kills scams
-- and referral spam, which is what a brand-new account is usually here for.
create or replace function public.block_links_from_new_accounts()
returns trigger language plpgsql security definer set search_path = public as $$
declare mine int;
begin
  select journeys_count into mine from profiles where id = new.sender_id;
  if mine < 3 and new.body ~* '(https?://|www\.|\m\S+\.(com|in|net|org|co|me|ly|io|xyz|link)\M)' then
    raise exception 'links are not allowed until you have travelled a few times';
  end if;
  return new;
end; $$;

drop trigger if exists messages_no_links on public.messages;
create trigger messages_no_links before insert on public.messages
  for each row execute function public.block_links_from_new_accounts();

-- ============================================================================
-- 14. API GRANTS  — run this with "Automatically expose new tables" turned OFF
-- ============================================================================
-- With auto-expose off, nothing reaches the Data API until it is granted here.
-- Two layers now stand between a stranger and your data: a table must be granted
-- to a role at all, and then RLS decides which rows that role may touch.
--
-- Nothing is granted to `anon`. Every screen in Safar requires a signed-in user,
-- so an unauthenticated client should be able to read precisely nothing.

grant usage on schema public to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- Your own profile: read and edit. Other people's come back via onboard_list().
grant select, update            on public.profiles        to authenticated;

-- Your own private half. No policy grants anyone else a row here, ever.
grant select, insert, update    on public.profile_private to authenticated;

-- Your own journeys. Other people's coach and seat are never selectable —
-- they exist only inside unlocked_profile(), after both of you asked.
grant select, insert, update, delete on public.journeys   to authenticated;

grant select, insert, delete    on public.blocks          to authenticated;
grant insert                    on public.reports         to authenticated;  -- write-only by design
grant select                    on public.unlocks         to authenticated;
grant select                    on public.threads         to authenticated;
grant select                    on public.thread_members  to authenticated;
grant select, insert            on public.messages        to authenticated;
grant select, insert            on public.plans           to authenticated;
grant select, insert, delete    on public.plan_members    to authenticated;

-- Functions: PostgREST exposes these as RPC, and Postgres grants EXECUTE to
-- PUBLIC by default. Close that, then hand back only what the client calls.
revoke execute on function public.onboard_list(text, date)          from public;
revoke execute on function public.unlocked_profile(uuid)            from public;
revoke execute on function public.ask_unlock(uuid, text, date)      from public;
revoke execute on function public.start_dm(uuid, text, date)        from public;
revoke execute on function public.is_blocked_with(uuid)             from public;
revoke execute on function public.shares_journey(uuid)              from public;
revoke execute on function public.is_unlocked_with(uuid)            from public;
revoke execute on function public.sweep_expired()                   from public;

grant execute on function public.onboard_list(text, date)     to authenticated;
grant execute on function public.unlocked_profile(uuid)       to authenticated;
grant execute on function public.ask_unlock(uuid, text, date) to authenticated;
grant execute on function public.start_dm(uuid, text, date)   to authenticated;

-- sweep_expired() stays ungranted on purpose. pg_cron runs it as postgres;
-- no client should be able to trigger a mass delete.

-- The helper predicates are called from inside RLS policies and security-definer
-- functions, so they need no client grant. Leaving them ungranted also stops
-- anyone probing "is this person on my train" outside of onboard_list().

-- ============================================================================
-- 15. EXPIRY AT THE POLICY LEVEL  — additive, safe to run on an applied schema
-- ============================================================================
-- sweep_expired() reclaims space, but "chats die when the journey ends" is a
-- promise to users, not a storage optimisation. It must not depend on a cron job
-- being healthy. These policies make expired rows invisible the moment they lapse,
-- whether or not the sweep has run — cron then just clears the corpses.

drop policy if exists threads_member on public.threads;
create policy threads_member on public.threads
  for select using (
    expires_at > now()
    and exists (
      select 1 from thread_members m where m.thread_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select using (
    exists (
      select 1
      from thread_members m
      join threads t on t.id = m.thread_id
      where m.thread_id = messages.thread_id
        and m.user_id   = auth.uid()
        and t.expires_at > now()
    )
  );

-- You cannot post into a conversation that has already ended.
drop policy if exists messages_send on public.messages;
create policy messages_send on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from thread_members m
      join threads t on t.id = m.thread_id
      where m.thread_id = messages.thread_id
        and m.user_id   = auth.uid()
        and t.expires_at > now()
    )
  );

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans
  for select using (
    expires_at > now()
    and exists (
      select 1 from journeys j
      where j.user_id      = auth.uid()
        and j.service_code = plans.service_code
        and j.travel_date  = plans.travel_date
        and j.expires_at   > now()
    )
  );
