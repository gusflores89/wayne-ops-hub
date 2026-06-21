create extension if not exists "pgcrypto";

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'closed')),
  start_date date,
  end_date date,
  city text,
  country text,
  venue text,
  total_slots integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournaments add column if not exists series_name text;
alter table public.tournaments add column if not exists host_state text;
alter table public.tournaments add column if not exists revenue_target numeric not null default 0;
alter table public.tournaments add column if not exists expense_budget numeric not null default 0;
alter table public.tournaments add column if not exists profit_target numeric not null default 0;
alter table public.tournaments add column if not exists margin_target numeric not null default 0;

create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_name text not null,
  contact_name text,
  contact_email text,
  age_group text,
  status text not null default 'pending' check (status in ('confirmed', 'pending', 'waitlist')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_contacts (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  role text not null default 'other' check (role in ('referee', 'vendor', 'investor', 'field_manager', 'logistics', 'staff', 'sponsor', 'other')),
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_campaigns (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  type text not null default 'email' check (type in ('email', 'sms', 'both')),
  sent_date date,
  recipients_count integer not null default 0,
  open_rate numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_finances (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  description text not null,
  category text not null check (category in ('income', 'expense')),
  amount numeric not null default 0,
  date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_operations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  title text not null,
  category text not null default 'other' check (category in ('logistics', 'field', 'referee', 'vendor', 'sponsor', 'media', 'security', 'other')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  description text,
  assigned_to text,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_links (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  label text not null,
  url text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  external_id text,
  current_team_name text,
  club_name text,
  event_team_name text,
  short_name text,
  created_at_source text,
  complete boolean not null default false,
  submitted boolean not null default false,
  submitted_at text,
  enrolled_by_name text,
  enrolled_by_email text,
  enrolled_by_phone text,
  event_age text,
  team_id text,
  club_id text,
  team_age text,
  gender text,
  state text,
  division text,
  bracket text,
  flags text,
  billing_name text,
  fee_group text,
  invoiced_reg_fee numeric not null default 0,
  account_payment_method text,
  payment_status text,
  last_payment_check_id text,
  last_payment_method text,
  last_payment_date_received text,
  features_invoiced_total numeric not null default 0,
  invoiced_total numeric not null default 0,
  transaction_ids text,
  accounting_codes text,
  preferred_division text,
  optional_notes text,
  coach_name_1 text,
  coach_email_1 text,
  coach_phone_1 text,
  coach_name_2 text,
  coach_email_2 text,
  coach_phone_2 text,
  manager_name_1 text,
  manager_email_1 text,
  manager_phone_1 text,
  manager_name_2 text,
  manager_email_2 text,
  manager_phone_2 text,
  arrival_date text,
  departure_date text,
  current_league_platform text,
  standings_link text,
  preferred_level text,
  birth_year text,
  payment_acknowledged boolean not null default false,
  schedule_acknowledged boolean not null default false,
  finals_acknowledged boolean not null default false,
  guest_player_documents text,
  player_passes text,
  official_roster text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, external_id)
);

create table if not exists public.ai_intake_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  source_text text,
  attachment_names text[] not null default '{}'::text[],
  summary text not null,
  confidence integer not null default 0 check (confidence between 0 and 100),
  clarification_needed boolean not null default false,
  clarification_question text,
  actions jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  result_log jsonb not null default '[]'::jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_tournaments_updated_at on public.tournaments;
create trigger set_tournaments_updated_at
before update on public.tournaments
for each row execute function public.set_updated_at();

drop trigger if exists set_tournament_registrations_updated_at on public.tournament_registrations;
create trigger set_tournament_registrations_updated_at
before update on public.tournament_registrations
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_intake_reviews_updated_at on public.ai_intake_reviews;
create trigger set_ai_intake_reviews_updated_at
before update on public.ai_intake_reviews
for each row execute function public.set_updated_at();

alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_contacts enable row level security;
alter table public.tournament_campaigns enable row level security;
alter table public.tournament_finances enable row level security;
alter table public.tournament_operations enable row level security;
alter table public.tournament_links enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.ai_intake_reviews enable row level security;

drop policy if exists "authenticated users have full access" on public.tournaments;
drop policy if exists "authenticated users have full access" on public.tournament_teams;
drop policy if exists "authenticated users have full access" on public.tournament_contacts;
drop policy if exists "authenticated users have full access" on public.tournament_campaigns;
drop policy if exists "authenticated users have full access" on public.tournament_finances;
drop policy if exists "authenticated users have full access" on public.tournament_operations;
drop policy if exists "authenticated users have full access" on public.tournament_links;
drop policy if exists "authenticated users have full access" on public.tournament_registrations;
drop policy if exists "users manage their own intake reviews" on public.ai_intake_reviews;

create policy "authenticated users have full access" on public.tournaments
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated users have full access" on public.tournament_teams
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated users have full access" on public.tournament_contacts
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated users have full access" on public.tournament_campaigns
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated users have full access" on public.tournament_finances
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated users have full access" on public.tournament_operations
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated users have full access" on public.tournament_links
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated users have full access" on public.tournament_registrations
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "users manage their own intake reviews" on public.ai_intake_reviews
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
