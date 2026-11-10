-- Afkrydsning af påkrævede tilskud/medicin pr. medicindøgn (06:00–05:59, Europe/Copenhagen).
-- Ligger i sin egen tabel og ikke i dagbog_indstillinger.data, fordi både
-- medicin-paamindelse og andre enheder skriver hele data-objektet tilbage og
-- ellers kan overskrive en afkrydsning, der lige er sket.
create table if not exists public.medicin_taget (
  bruger_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dag date not null,          -- medicindøgnets dato (døgnet starter kl. 06)
  punkt text not null,        -- id på punktet i data.medicin.punkter
  taget_kl timestamptz not null default now(),
  primary key (bruger_id, dag, punkt)
);

alter table public.medicin_taget enable row level security;

create policy medicin_taget_egne on public.medicin_taget
  for all to authenticated
  using (bruger_id = (select auth.uid()))
  with check (bruger_id = (select auth.uid()));

revoke all on public.medicin_taget from anon;
grant select, insert, update, delete on public.medicin_taget to authenticated;
