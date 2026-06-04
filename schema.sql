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

alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_contacts enable row level security;
alter table public.tournament_campaigns enable row level security;
alter table public.tournament_finances enable row level security;
alter table public.tournament_operations enable row level security;
alter table public.tournament_links enable row level security;

drop policy if exists "authenticated users have full access" on public.tournaments;
drop policy if exists "authenticated users have full access" on public.tournament_teams;
drop policy if exists "authenticated users have full access" on public.tournament_contacts;
drop policy if exists "authenticated users have full access" on public.tournament_campaigns;
drop policy if exists "authenticated users have full access" on public.tournament_finances;
drop policy if exists "authenticated users have full access" on public.tournament_operations;
drop policy if exists "authenticated users have full access" on public.tournament_links;

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
