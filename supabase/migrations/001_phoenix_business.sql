-- Phoenix Hibachi commercial booking hardening
-- Run in Supabase SQL editor after backing up existing data.

alter table public.bookings
  add column if not exists pdf_url text,
  add column if not exists pdf_path text,
  add column if not exists assigned_chef_id uuid,
  add column if not exists updated_at timestamptz default now();

create index if not exists bookings_booking_number_idx on public.bookings (booking_number);
create index if not exists bookings_event_date_idx on public.bookings (event_date);
create index if not exists bookings_customer_email_idx on public.bookings (customer_email);
create index if not exists bookings_assigned_chef_id_idx on public.bookings (assigned_chef_id);

-- Optional profile helper: adjust role values to your existing profiles table.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anonymous')
$$;

alter table public.bookings enable row level security;

-- Clean old broad policies manually if they exist before applying these.
-- drop policy if exists "..." on public.bookings;

create policy if not exists "public can create bookings"
on public.bookings
for insert
to anon, authenticated
with check (true);

create policy if not exists "admin manager can read all bookings"
on public.bookings
for select
to authenticated
using (public.current_user_role() in ('Admin','Manager','admin','manager'));

create policy if not exists "admin manager can update all bookings"
on public.bookings
for update
to authenticated
using (public.current_user_role() in ('Admin','Manager','admin','manager'))
with check (public.current_user_role() in ('Admin','Manager','admin','manager'));

create policy if not exists "chef can read assigned bookings"
on public.bookings
for select
to authenticated
using (assigned_chef_id = auth.uid() or public.current_user_role() in ('Admin','Manager','admin','manager'));

create policy if not exists "member can read own bookings"
on public.bookings
for select
to authenticated
using (lower(customer_email) = lower((auth.jwt() ->> 'email')) or public.current_user_role() in ('Admin','Manager','admin','manager'));

-- Storage bucket for generated order PDFs.
insert into storage.buckets (id, name, public)
values ('order-pdfs', 'order-pdfs', false)
on conflict (id) do nothing;

-- Private bucket policy: service role can always write. Authenticated admins can read/list.
create policy if not exists "admins can read order pdfs"
on storage.objects
for select
to authenticated
using (bucket_id = 'order-pdfs' and public.current_user_role() in ('Admin','Manager','admin','manager'));

create policy if not exists "admins can upload order pdfs"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'order-pdfs' and public.current_user_role() in ('Admin','Manager','admin','manager'));
