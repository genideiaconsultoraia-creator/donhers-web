-- ============================================================
--  Liquidaciones de comisión GENIDEIA
--  Cada fila = "el día X se pagó la comisión acumulada hasta ese
--  momento". A partir de esa fecha, el panel vuelve a contar desde
--  cero. Guarda snapshot de ventas/comisión + comprobante adjunto.
--  Correr una vez en el SQL Editor (después de seguridad-admin.sql).
-- ============================================================

create table if not exists liquidaciones_comision (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  ventas_total numeric not null default 0,
  comision_total numeric not null default 0,
  comprobante_path text,      -- ruta dentro del bucket "comprobantes" (privado)
  nota text,
  creado_en timestamptz not null default now()
);

alter table liquidaciones_comision enable row level security;

drop policy if exists liquidaciones_admin_total on liquidaciones_comision;
create policy liquidaciones_admin_total on liquidaciones_comision for all to authenticated
  using (es_admin()) with check (es_admin());

-- ---------- Storage: bucket privado para comprobantes ----------
-- Privado (a diferencia de "productos"): son comprobantes de pago,
-- solo el admin debe poder verlos, vía signed URL.
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

drop policy if exists comprobantes_admin_select on storage.objects;
create policy comprobantes_admin_select on storage.objects
  for select to authenticated using (bucket_id = 'comprobantes' and es_admin());

drop policy if exists comprobantes_admin_insert on storage.objects;
create policy comprobantes_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'comprobantes' and es_admin());

drop policy if exists comprobantes_admin_delete on storage.objects;
create policy comprobantes_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'comprobantes' and es_admin());
