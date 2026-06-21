# Wayne Ops Hub

Full-stack React + Supabase personal dashboard for Wayne Crowe's soccer tournament operations.

## Stack

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + PostgreSQL
- react-router-dom v6
- lucide-react icons
- date-fns
- OpenAI Responses API with Structured Outputs

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run the full contents of `schema.sql`.
4. Go to Authentication > Users.
5. Create Wayne's email/password user.
6. Copy the project URL and anon public key from Project Settings > API.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

3. Start the app:

```bash
npm run dev
```

4. Sign in at `/login` with the user created in Supabase Auth.

## Deploy to Vercel

1. Push this project to GitHub.
2. Import the repository in Vercel.
3. Add the same environment variables in Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional, defaults to `gpt-5.5`)
4. Deploy.

## Database notes

All tables have RLS enabled with the policy `authenticated users have full access`. All child records reference `tournaments(id)` with `ON DELETE CASCADE`.

## Registration imports

Open a tournament, go to the `Registrations` tab, and upload a GotSport-style `.xlsx` registration export. The importer maps team, club, division, age, gender, payment, coach, manager, document, standings, and fee columns into `tournament_registrations`.

Registrations can also be added manually with `Add Team`. Manual entries use the same analytics and automatically sync into Teams, Contacts, and Finances.

After import, use `Sync Ops Tabs` to generate operational records from the registration export:
- `Teams`: one team row per imported registration.
- `Contacts`: enroller, coach, and manager contacts.
- `Finances`: a registration import income summary.

Generated records are marked in `notes`, so re-syncing replaces generated records without deleting manually entered records.

The registration dashboard also shows represented states, recorded expenses, projected net, and returning coaches. Returning coaches are matched across later tournaments using normalized coach email addresses.

## Executive dashboard and reports

The home page is an executive operating view with collected registration revenue, recorded expenses, operating profit, margin, targets, event status, and team count versus target.

The `Reports` page groups tournament editions by `series_name` and compares registration pace, teams, gender, age groups, and in-state versus out-of-state participation. Configure each tournament's series name, host state, event date, team target, revenue target, expense budget, profit target, and margin target from the tournament Overview tab.

Run the latest `schema.sql` to add these tournament planning fields to an existing Supabase project.

Run the latest `schema.sql` in Supabase before using this tab.

## AI Intake

`AI Intake` accepts a short message and up to two receipt or document images. The Vercel Function at `api/intake.js` sends them to OpenAI and returns structured proposed actions. The OpenAI API key is server-side and is never exposed through a `VITE_` variable.

Every proposal is saved to `ai_intake_reviews`. A user must review and confirm it before the app writes to registrations, teams, contacts, finances, operations, or links. Run the latest `schema.sql`, or only `supabase/migrations/202606210001_ai_intake_reviews.sql`, before opening the feature.
