create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.admin_users (
  email text primary key check (email = lower(email)),
  display_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and enabled = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.site_intro (
  id boolean primary key default true check (id = true),
  title text not null,
  background text not null,
  statement jsonb not null default '[]'::jsonb,
  action_plan jsonb not null default '[]'::jsonb,
  group_image text,
  logo_image text,
  source text,
  published boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.founders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution text not null,
  role text not null default 'Co-Founder',
  bio text,
  image_url text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.research_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('frontier', 'results')),
  title text not null,
  journal text,
  impact_factor numeric(6, 2),
  quartile text check (quartile is null or quartile in ('Q1', 'Q2', 'Q3', 'Q4')),
  authors_team text,
  image_url text,
  doi_url text,
  summary text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  research_name text,
  audience text,
  intro_text text,
  intro_image_url text,
  is_paid boolean not null default false,
  estimated_time text,
  qr_url text,
  link_url text,
  contact_info text,
  image_url text,
  highlight_url text,
  help_us boolean not null default false,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  professional_role text not null check (char_length(professional_role) between 2 and 160),
  institution text not null check (char_length(institution) between 2 and 240),
  country_region text not null check (char_length(country_region) between 2 and 120),
  email text not null check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  interests text[] not null default '{}',
  proposal text not null check (char_length(proposal) between 20 and 5000),
  cv_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'more_information')),
  reviewer_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists applications_email_idx
  on public.applications (lower(email));
create index if not exists applications_status_idx
  on public.applications (status, created_at desc);
create index if not exists research_items_section_idx
  on public.research_items (section, published, published_at desc);

drop trigger if exists site_intro_set_updated_at on public.site_intro;
create trigger site_intro_set_updated_at
before update on public.site_intro
for each row execute function public.set_updated_at();

drop trigger if exists founders_set_updated_at on public.founders;
create trigger founders_set_updated_at
before update on public.founders
for each row execute function public.set_updated_at();

drop trigger if exists research_items_set_updated_at on public.research_items;
create trigger research_items_set_updated_at
before update on public.research_items
for each row execute function public.set_updated_at();

drop trigger if exists questionnaires_set_updated_at on public.questionnaires;
create trigger questionnaires_set_updated_at
before update on public.questionnaires
for each row execute function public.set_updated_at();

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.site_intro enable row level security;
alter table public.founders enable row level security;
alter table public.research_items enable row level security;
alter table public.questionnaires enable row level security;
alter table public.applications enable row level security;

create policy "Admins can view their access"
on public.admin_users for select
to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_admin());

create policy "Published intro is public"
on public.site_intro for select
to anon, authenticated
using (published = true or public.is_admin());

create policy "Admins manage intro"
on public.site_intro for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Published founders are public"
on public.founders for select
to anon, authenticated
using (published = true or public.is_admin());

create policy "Admins manage founders"
on public.founders for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Published research is public"
on public.research_items for select
to anon, authenticated
using (published = true or public.is_admin());

create policy "Admins manage research"
on public.research_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Published questionnaires are public"
on public.questionnaires for select
to anon, authenticated
using (published = true or public.is_admin());

create policy "Admins manage questionnaires"
on public.questionnaires for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Visitors can submit applications"
on public.applications for insert
to anon, authenticated
with check (
  user_id is null
  or user_id = auth.uid()
);

create policy "Applicants can view their applications"
on public.applications for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "Admins update applications"
on public.applications for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins delete applications"
on public.applications for delete
to authenticated
using (public.is_admin());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'public-media',
    'public-media',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'application-files',
    'application-files',
    false,
    10485760,
    array['application/pdf']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins upload public media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'public-media' and public.is_admin());

create policy "Admins update public media"
on storage.objects for update
to authenticated
using (bucket_id = 'public-media' and public.is_admin())
with check (bucket_id = 'public-media' and public.is_admin());

create policy "Admins delete public media"
on storage.objects for delete
to authenticated
using (bucket_id = 'public-media' and public.is_admin());

create policy "Applicants upload their CV"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'application-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = 'pdf'
);

create policy "Applicants and admins read CV files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'application-files'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
  )
);

insert into public.admin_users (email, display_name)
values ('hannahlee03@163.com', 'Hannah Lee')
on conflict (email) do update set enabled = true;

insert into public.site_intro (
  id,
  title,
  background,
  statement,
  action_plan,
  group_image,
  logo_image,
  source,
  published
)
values (
  true,
  'PACD Research Club',
  'Glaucoma is a major cause of irreversible vision loss. Primary angle-closure disease is an important research priority, particularly across Asian populations. PACD Research Club is a non-profit collaboration network connecting clinical, imaging, data-science and public-health expertise.',
  '[
    "Build a high-trust international research and exchange platform for PACD.",
    "Develop reproducible diagnostic, imaging and treatment research methods.",
    "Advance earlier risk detection and personalized intervention strategies.",
    "Translate multicentre evidence into practical blindness-prevention pathways."
  ]'::jsonb,
  '[
    "Multicentre clinical data platform for PACD.",
    "Shallow anterior chamber longitudinal cohort.",
    "Imaging and AI-driven risk prediction.",
    "Community screening and implementation research."
  ]'::jsonb,
  'assets/home-1-logo.jpg',
  'assets/clublogo.png',
  'Programme information supplied by PACD Research Club.',
  true
)
on conflict (id) do update set
  title = excluded.title,
  background = excluded.background,
  statement = excluded.statement,
  action_plan = excluded.action_plan,
  group_image = excluded.group_image,
  logo_image = excluded.logo_image,
  source = excluded.source,
  published = excluded.published;

insert into public.founders (
  id,
  name,
  institution,
  role,
  bio,
  image_url,
  sort_order,
  published
)
values
  (
    'a64de76c-379d-4e04-b049-7137762e3179',
    'Academician Wang Ningli',
    'Chinese Academy of Engineering',
    'Co-Founder',
    'Ophthalmology leader and strategic initiator of the PACD collaboration network.',
    'assets/wangningli.jpg',
    1,
    true
  ),
  (
    '6e71c5dd-4769-45ca-94dc-fffd466beca5',
    'Professor Li Shuning',
    'Beijing Tongren Hospital, Capital Medical University',
    'Co-Founder',
    'Clinical investigator focused on glaucoma diagnosis, care pathways and translational collaboration.',
    'assets/lishuning.jpg',
    2,
    true
  ),
  (
    '96a93d98-3b5f-46c6-8d22-e8f00c44476f',
    'Professor Ying Han',
    'University of California, San Francisco',
    'Co-Founder',
    'International collaborator advancing cross-border PACD research and innovation.',
    'assets/yinghan.jpg',
    3,
    true
  )
on conflict (id) do update set
  name = excluded.name,
  institution = excluded.institution,
  role = excluded.role,
  bio = excluded.bio,
  image_url = excluded.image_url,
  sort_order = excluded.sort_order,
  published = excluded.published;

insert into public.questionnaires (
  id,
  title,
  research_name,
  audience,
  intro_text,
  intro_image_url,
  is_paid,
  estimated_time,
  qr_url,
  contact_info,
  image_url,
  highlight_url,
  help_us,
  published,
  published_at
)
values (
  'ac039f48-c3da-4045-9472-8dfdbe46e5cb',
  'Real-world APAC Management Survey (Acute Primary Angle-Closure)',
  'Real-world APAC Management Survey',
  'Clinicians and researchers working on acute primary angle-closure management.',
  'A short survey collecting real-world practice patterns and management preferences.',
  'assets/survey-cover.png',
  false,
  '5 min',
  'assets/scan.png',
  'PACD Research Club | angleclosureclub@163.com',
  'assets/survey-cover.png',
  'assets/survey-cover.png',
  true,
  true,
  timezone('utc', now())
)
on conflict (id) do update set
  title = excluded.title,
  research_name = excluded.research_name,
  audience = excluded.audience,
  intro_text = excluded.intro_text,
  intro_image_url = excluded.intro_image_url,
  is_paid = excluded.is_paid,
  estimated_time = excluded.estimated_time,
  qr_url = excluded.qr_url,
  contact_info = excluded.contact_info,
  image_url = excluded.image_url,
  highlight_url = excluded.highlight_url,
  help_us = excluded.help_us,
  published = excluded.published;
