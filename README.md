# Wayne Ops Hub

Full-stack React + Supabase personal dashboard for Wayne Crowe's soccer tournament operations.

## Stack

- React 18 + Vite
- Tailwind CSS
- Supabase Auth + PostgreSQL
- react-router-dom v6
- lucide-react icons
- date-fns

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
4. Deploy.

## Database notes

All tables have RLS enabled with the policy `authenticated users have full access`. All child records reference `tournaments(id)` with `ON DELETE CASCADE`.

## Registration imports

Open a tournament, go to the `Registrations` tab, and upload a GotSport-style `.xlsx` registration export. The importer maps team, club, division, age, gender, payment, coach, manager, document, standings, and fee columns into `tournament_registrations`.

After import, use `Sync Ops Tabs` to generate operational records from the registration export:
- `Teams`: one team row per imported registration.
- `Contacts`: enroller, coach, and manager contacts.
- `Finances`: a registration import income summary.

Generated records are marked in `notes`, so re-syncing replaces generated records without deleting manually entered records.

Run the latest `schema.sql` in Supabase before using this tab.
