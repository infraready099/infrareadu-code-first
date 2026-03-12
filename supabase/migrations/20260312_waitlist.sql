-- Waitlist signups from the landing page
create table if not exists waitlist (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null unique,
  source     text        not null default 'landing',
  created_at timestamptz not null default now()
);

-- Allow service role to insert (used by /api/waitlist)
alter table waitlist enable row level security;
create policy "service role full access" on waitlist using (true) with check (true);
