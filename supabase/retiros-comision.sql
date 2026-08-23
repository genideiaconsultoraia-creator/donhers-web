-- ============================================================
--  Historial de retiros de comisión GENIDEIA
--  Cada fila = un retiro real ("cobré $X el día Y"). El panel resta
--  la suma de esta tabla al total de comisión generada (15% de las
--  ventas confirmadas) para mostrar cuánto queda pendiente.
--  Correr una vez en el SQL Editor del proyecto real
--  (vbbxwgmpwmusekhnjlfb) — mismo que pedidos/productos.
-- ============================================================

create table if not exists retiros_comision (
  id          bigint generated always as identity primary key,
  monto       integer not null,
  fecha       date not null default current_date,
  nota        text,
  creado_en   timestamptz not null default now()
);

alter table retiros_comision enable row level security;

-- Mismo criterio que el resto del panel: solo admins (es_admin() ya
-- existe, viene de seguridad-admin.sql).
drop policy if exists retiros_admin_lectura on retiros_comision;
create policy retiros_admin_lectura on retiros_comision for select to authenticated using (es_admin());
drop policy if exists retiros_admin_insert on retiros_comision;
create policy retiros_admin_insert on retiros_comision for insert to authenticated with check (es_admin());
drop policy if exists retiros_admin_delete on retiros_comision;
create policy retiros_admin_delete on retiros_comision for delete to authenticated using (es_admin());
