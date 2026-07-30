-- Esquema del reclamo judicial conjunto de la Orquesta Sinfonica de Entre Rios.
--
-- Este archivo es la copia de lo que ya esta aplicado en el proyecto Supabase
-- "camerino-giustozzi" (ref grswqigekcopfrozcxqj). Se puede volver a correr
-- entero sin romper nada: todo es "if not exists" / "create or replace".
--
-- Todo lleva el prefijo oser_ y las policies de storage filtran por bucket_id,
-- asi que nada de esto toca las tablas ni los buckets del negocio.
--
-- IDEA GENERAL DE SEGURIDAD
--   * La pagina publica usa la clave anonima. Con esa clave NO se puede leer
--     ninguna tabla (le revocamos los privilegios) ni bajar archivos.
--   * Para cargar una adhesion, la pagina llama a dos funciones SECURITY DEFINER
--     que validan los datos del lado del servidor.
--   * Para LEER hay que estar logueado con un usuario cuyo email figure en
--     oser_admins. Los admins de las otras webs del proyecto no ven nada.

-- ---------------------------------------------------------------------------
-- 1) Quien puede ver los datos
-- ---------------------------------------------------------------------------
create table if not exists public.oser_admins (
  email text primary key,
  nota text,
  creado_en timestamptz not null default now()
);
alter table public.oser_admins enable row level security;
-- Sin policies y sin grants: solo se toca desde el editor SQL de Supabase.
revoke all on public.oser_admins from anon, authenticated;

create or replace function public.oser_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.oser_admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Para que el panel pueda avisar "no estas habilitado" en lugar de mostrar una
-- tabla vacia (RLS devuelve vacio, no un error, a quien no es admin).
create or replace function public.oser_soy_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.oser_es_admin();
$$;

grant execute on function public.oser_soy_admin() to authenticated;

-- Habilitar a alguien:
--   insert into public.oser_admins (email, nota) values ('mail@ejemplo.com', 'quien es');
-- Quitarle el acceso:
--   delete from public.oser_admins where email = 'mail@ejemplo.com';
insert into public.oser_admins (email, nota)
values ('jsgiusto@gmail.com', 'Titular del reclamo conjunto')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Las adhesiones y sus archivos
-- ---------------------------------------------------------------------------
create table if not exists public.oser_reclamos (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  nombre text not null,
  dni text not null,
  cuit text not null,
  domicilio text not null,
  telefono text not null,
  email text not null,
  firmo_ate boolean not null,
  firmo_upcn boolean not null
);

create table if not exists public.oser_reclamo_archivos (
  id uuid primary key default gen_random_uuid(),
  reclamo_id uuid not null references public.oser_reclamos(id) on delete cascade,
  tipo text not null check (tipo in ('recibo', 'antecedente')),
  path text not null unique,
  nombre_original text not null,
  tamano bigint,
  mime text,
  creado_en timestamptz not null default now()
);
create index if not exists oser_reclamo_archivos_reclamo_idx
  on public.oser_reclamo_archivos (reclamo_id);

-- ---------------------------------------------------------------------------
-- 3) RLS: leer/borrar solo si tu email esta en oser_admins
-- ---------------------------------------------------------------------------
alter table public.oser_reclamos enable row level security;
alter table public.oser_reclamo_archivos enable row level security;

revoke all on public.oser_reclamos from anon;
revoke all on public.oser_reclamo_archivos from anon;

drop policy if exists "oser admin lee reclamos" on public.oser_reclamos;
create policy "oser admin lee reclamos" on public.oser_reclamos
  for select to authenticated using (public.oser_es_admin());

drop policy if exists "oser admin borra reclamos" on public.oser_reclamos;
create policy "oser admin borra reclamos" on public.oser_reclamos
  for delete to authenticated using (public.oser_es_admin());

drop policy if exists "oser admin lee archivos" on public.oser_reclamo_archivos;
create policy "oser admin lee archivos" on public.oser_reclamo_archivos
  for select to authenticated using (public.oser_es_admin());

drop policy if exists "oser admin borra archivos" on public.oser_reclamo_archivos;
create policy "oser admin borra archivos" on public.oser_reclamo_archivos
  for delete to authenticated using (public.oser_es_admin());

-- Ojo: no hay ninguna policy de INSERT. El formulario publico no escribe
-- directo en las tablas, entra por las funciones de abajo.

-- ---------------------------------------------------------------------------
-- 4) Alta de una adhesion (lo unico que puede hacer la clave anonima)
-- ---------------------------------------------------------------------------
create or replace function public.oser_crear_reclamo(
  p_nombre text,
  p_dni text,
  p_cuit text,
  p_domicilio text,
  p_telefono text,
  p_email text,
  p_firmo_ate boolean,
  p_firmo_upcn boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'Falta el nombre y apellido.';
  end if;
  if coalesce(btrim(p_dni), '') = '' then
    raise exception 'Falta el DNI.';
  end if;
  if coalesce(btrim(p_cuit), '') = '' then
    raise exception 'Falta el CUIT/CUIL.';
  end if;
  if coalesce(btrim(p_domicilio), '') = '' then
    raise exception 'Falta el domicilio real.';
  end if;
  if coalesce(btrim(p_telefono), '') = '' then
    raise exception 'Falta el telefono.';
  end if;
  if coalesce(btrim(p_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'El email no parece valido.';
  end if;
  if p_firmo_ate is null or p_firmo_upcn is null then
    raise exception 'Falta indicar si firmaste los reclamos de ATE y UPCN.';
  end if;

  insert into public.oser_reclamos
    (nombre, dni, cuit, domicilio, telefono, email, firmo_ate, firmo_upcn)
  values (
    left(btrim(p_nombre), 200),
    left(btrim(p_dni), 30),
    left(btrim(p_cuit), 30),
    left(btrim(p_domicilio), 300),
    left(btrim(p_telefono), 50),
    left(lower(btrim(p_email)), 200),
    p_firmo_ate,
    p_firmo_upcn
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Deja registrado un archivo ya subido al bucket. La ruta tiene que estar
-- dentro de la carpeta del reclamo, asi nadie cuelga archivos en otra carpeta.
create or replace function public.oser_registrar_archivo(
  p_reclamo_id uuid,
  p_tipo text,
  p_path text,
  p_nombre_original text,
  p_tamano bigint,
  p_mime text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo not in ('recibo', 'antecedente') then
    raise exception 'Tipo de archivo invalido.';
  end if;
  if not exists (select 1 from public.oser_reclamos where id = p_reclamo_id) then
    raise exception 'El reclamo no existe.';
  end if;
  if position(p_reclamo_id::text || '/' in coalesce(p_path, '')) <> 1 then
    raise exception 'Ruta de archivo invalida.';
  end if;

  insert into public.oser_reclamo_archivos
    (reclamo_id, tipo, path, nombre_original, tamano, mime)
  values (
    p_reclamo_id,
    p_tipo,
    p_path,
    left(coalesce(btrim(p_nombre_original), 'archivo'), 300),
    p_tamano,
    left(coalesce(p_mime, ''), 150)
  )
  on conflict (path) do nothing;
end;
$$;

grant execute on function public.oser_crear_reclamo(text, text, text, text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.oser_registrar_archivo(uuid, text, text, text, bigint, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Bucket privado de los archivos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('oser-reclamos', 'oser-reclamos', false, 15728640)  -- 15 MB por archivo
on conflict (id) do update
  set public = false,
      file_size_limit = 15728640;

-- Subir si, listar y leer no: es un formulario publico.
drop policy if exists "oser subir al bucket del reclamo" on storage.objects;
create policy "oser subir al bucket del reclamo" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'oser-reclamos');

drop policy if exists "oser admin lee el bucket del reclamo" on storage.objects;
create policy "oser admin lee el bucket del reclamo" on storage.objects
  for select to authenticated
  using (bucket_id = 'oser-reclamos' and public.oser_es_admin());

drop policy if exists "oser admin borra del bucket del reclamo" on storage.objects;
create policy "oser admin borra del bucket del reclamo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'oser-reclamos' and public.oser_es_admin());
