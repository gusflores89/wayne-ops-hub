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

drop trigger if exists set_ai_intake_reviews_updated_at on public.ai_intake_reviews;
create trigger set_ai_intake_reviews_updated_at
before update on public.ai_intake_reviews
for each row execute function public.set_updated_at();

alter table public.ai_intake_reviews enable row level security;

drop policy if exists "users manage their own intake reviews" on public.ai_intake_reviews;
create policy "users manage their own intake reviews" on public.ai_intake_reviews
for all using (user_id = auth.uid()) with check (user_id = auth.uid());
