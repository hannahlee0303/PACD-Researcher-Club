# PACD Research Club

International-facing PACD Research Club website.

## Architecture

- Static HTML, CSS and JavaScript hosted by GitHub Pages.
- Supabase Postgres for public content and collaboration applications.
- Supabase Auth magic links for applicants and administrators.
- Supabase Storage for public media and private PDF CV files.
- Supabase Edge Function for transactional application emails.

The browser uses only the Supabase publishable key. Never add a secret key,
`service_role` key, database password or email-provider API key to this
repository.

## Local preview

```bash
node scripts/serve-static.mjs
```

Open <http://localhost:3000>.

## Validation

```bash
node scripts/check-static.mjs
```

## Supabase deployment

The initial schema and RLS policies are in
`supabase/migrations/202607260001_initial.sql`.

```bash
supabase link --project-ref uxzxtbrflusqwvvxgzan
supabase db push
supabase functions deploy application-email
```

Transactional status emails additionally require these project secrets:

- `RESEND_API_KEY`
- `EMAIL_FROM`, recommended:
  `PACD Research Club <apply@pacdresearchclub.com>`
- `ADMIN_EMAIL=hannahlee03@163.com`

Magic-link emails use Supabase Auth and work independently from the optional
transactional email function.

## GitHub Pages

`.github/workflows/pages.yml` publishes the `public` directory. The `CNAME`
file configures `pacdresearchclub.com`.

