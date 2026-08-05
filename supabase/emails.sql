-- Emails de confirmacion de la adhesion al reclamo de la Orquesta.
--
-- El problema que resuelve: la persona completa el formulario, ve la pantalla
-- de "listo" y despues no le queda ningun rastro de que se haya guardado. Con
-- esto le llega un mail que le repite lo que cargo y que archivos entraron, asi
-- puede revisar si esta todo bien.
--
-- Como esta armado (misma idea que los avisos push de la escuela):
--
--   1) Cada adhesion deja una fila "pendiente" en oser_emails. Un disparador la
--      encola sola cuando entra una adhesion nueva.
--   2) Ese mismo disparador le pega a la funcion oser-enviar-emails, que saca
--      los pendientes, los manda por SMTP y marca el resultado.
--   3) Un cron cada 10 minutos vuelve a llamar a la funcion. Es la red de
--      seguridad: si el disparador no pudo salir (se cayo la funcion, no habia
--      red), el mail igual sale un rato despues en vez de perderse.
--
-- La cola es lo que hace que nadie reciba dos veces el mismo mail: hay un unico
-- registro por (adhesion, tipo) y solo se manda si esta pendiente.
--
-- Este archivo se puede correr entero de nuevo sin romper nada.

-- ---------------------------------------------------------------------------
-- 1) La cola
-- ---------------------------------------------------------------------------
create table if not exists public.oser_emails (
  id uuid primary key default gen_random_uuid(),
  reclamo_id uuid not null references public.oser_reclamos(id) on delete cascade,
  -- Por ahora hay un solo tipo, 'confirmacion'. Queda abierto por si alguna vez
  -- hay que mandar otra cosa (un recordatorio, un aviso de novedades).
  tipo text not null default 'confirmacion',
  destinatario text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviando', 'enviado', 'error')),
  intentos int not null default 0,
  ultimo_error text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  -- Una sola fila por persona y tipo: el seguro contra mandar dos veces.
  unique (reclamo_id, tipo)
);

create index if not exists oser_emails_pendientes_idx
  on public.oser_emails (estado, creado_en);

alter table public.oser_emails enable row level security;
revoke all on public.oser_emails from anon, authenticated;

-- El panel puede mirar como viene la cola (mismo criterio que el resto: solo
-- admins). Escribir, solo las funciones de mas abajo.
drop policy if exists "oser admin lee emails" on public.oser_emails;
create policy "oser admin lee emails" on public.oser_emails
  for select to authenticated using (public.oser_es_admin());
grant select on public.oser_emails to authenticated;

-- ---------------------------------------------------------------------------
-- 2) El secreto con el que se identifica la funcion
-- ---------------------------------------------------------------------------
-- Igual que push_aviso_secreto: la funcion oser-enviar-emails no pide JWT, se
-- identifica con esto. Quien no lo sabe no consigue ni un dato ni manda nada.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'oser_email_secreto') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'oser_email_secreto',
      'Lo que la base le muestra a la funcion oser-enviar-emails para identificarse.'
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Sacar los pendientes (lo que llama la funcion)
-- ---------------------------------------------------------------------------
-- Devuelve los mails a mandar y, en el mismo movimiento, los deja en 'enviando'
-- con un intento mas. El "for update skip locked" es para que dos corridas a la
-- vez (el disparador y el cron) no se lleven la misma fila.
--
-- Cinco intentos y listo: si a la quinta no salio, es un mail que no existe o
-- algo mal configurado, y seguir reintentando solo ensucia la casilla.
create or replace function public.oser_emails_pendientes(
  p_secreto text,
  p_limite int default 20
) returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_esperado text;
  v_datos jsonb;
begin
  select decrypted_secret into v_esperado
  from vault.decrypted_secrets where name = 'oser_email_secreto';

  if v_esperado is null or p_secreto is null or p_secreto <> v_esperado then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  with tomados as (
    select id from public.oser_emails
    where estado in ('pendiente', 'error')
      and intentos < 5
    order by creado_en
    limit greatest(coalesce(p_limite, 20), 1)
    for update skip locked
  ), marcados as (
    update public.oser_emails e
    set estado = 'enviando',
        intentos = e.intentos + 1
    where e.id in (select id from tomados)
    returning e.id, e.reclamo_id, e.destinatario, e.tipo
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'tipo', m.tipo,
    'para', m.destinatario,
    'nombre', r.nombre,
    'dni', r.dni,
    'cuit', r.cuit,
    'firmo_ate', r.firmo_ate,
    'firmo_upcn', r.firmo_upcn,
    'creado_en', r.creado_en,
    'archivos', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', a.tipo, 'nombre', a.nombre_original)
                        order by a.creado_en)
      from public.oser_reclamo_archivos a
      where a.reclamo_id = r.id
    ), '[]'::jsonb)
  )), '[]'::jsonb)
  into v_datos
  from marcados m
  join public.oser_reclamos r on r.id = m.reclamo_id;

  return jsonb_build_object('ok', true, 'emails', v_datos);
end;
$$;

-- Como le fue a cada envio.
create or replace function public.oser_email_resultado(
  p_secreto text,
  p_id uuid,
  p_ok boolean,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_esperado text;
begin
  select decrypted_secret into v_esperado
  from vault.decrypted_secrets where name = 'oser_email_secreto';

  if v_esperado is null or p_secreto is null or p_secreto <> v_esperado then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  update public.oser_emails
  set estado = case when p_ok then 'enviado' else 'error' end,
      enviado_en = case when p_ok then now() else enviado_en end,
      ultimo_error = case when p_ok then null else left(coalesce(p_error, 'error desconocido'), 500) end
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.oser_emails_pendientes(text, int) from anon, authenticated;
revoke all on function public.oser_email_resultado(text, uuid, boolean, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Encolar y despertar a la funcion
-- ---------------------------------------------------------------------------
-- Le avisa a oser-enviar-emails que hay trabajo. Si algo falla (no esta el
-- secreto, no responde la funcion) no se levanta ninguna excepcion: encolar el
-- mail nunca puede hacer que se pierda la adhesion.
create or replace function public.oser_disparar_emails()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_secreto text;
begin
  select decrypted_secret into v_secreto
  from vault.decrypted_secrets where name = 'oser_email_secreto';
  if v_secreto is null then return; end if;

  perform net.http_post(
    url := 'https://grswqigekcopfrozcxqj.supabase.co/functions/v1/oser-enviar-emails',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-oser-secreto', v_secreto
    ),
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'oser_disparar_emails: %', sqlerrm;
end;
$$;

revoke all on function public.oser_disparar_emails() from anon, authenticated;

create or replace function public.oser_encolar_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.oser_emails (reclamo_id, tipo, destinatario)
  values (new.id, 'confirmacion', new.email)
  on conflict (reclamo_id, tipo) do nothing;

  perform public.oser_disparar_emails();
  return new;
exception when others then
  -- Si el mail no se puede encolar, la adhesion tiene que quedar guardada igual.
  raise warning 'oser_encolar_email: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists oser_reclamos_email on public.oser_reclamos;
create trigger oser_reclamos_email
  after insert on public.oser_reclamos
  for each row execute function public.oser_encolar_email();

-- ---------------------------------------------------------------------------
-- 5) La red de seguridad
-- ---------------------------------------------------------------------------
-- Cada 10 minutos vuelve a despertar a la funcion. Si no hay nada pendiente no
-- hace nada; si quedo algo colgado, sale sin que nadie tenga que mirar.
select cron.unschedule('oser-emails')
where exists (select 1 from cron.job where jobname = 'oser-emails');

select cron.schedule('oser-emails', '*/10 * * * *', $$select public.oser_disparar_emails();$$);

-- ---------------------------------------------------------------------------
-- 6) Los que ya se habian inscripto
-- ---------------------------------------------------------------------------
-- El disparador solo agarra las adhesiones nuevas. Para las que ya estaban hay
-- que encolarlas a mano, y esto no se corre solo: se ejecuta cuando se decide
-- mandarles el mail (ver el README).
--
--   insert into public.oser_emails (reclamo_id, tipo, destinatario)
--   select id, 'confirmacion', email from public.oser_reclamos
--   on conflict (reclamo_id, tipo) do nothing;
--   select public.oser_disparar_emails();
