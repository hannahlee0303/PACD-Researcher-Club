alter table public.research_items
  add column if not exists pdf_url text;

update storage.buckets
set
  file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'public-media';
