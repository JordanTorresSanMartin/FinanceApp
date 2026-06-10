-- Crear la tabla para almacenar los links de Fintoc
create table public.user_bank_links (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  fintoc_link_token text not null, -- Este es el token permanente
  fintoc_link_id text not null unique, -- ID del link para identificarlo en webhooks
  institution_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar Row Level Security (RLS)
alter table public.user_bank_links enable row level security;

-- Política: El usuario solo puede ver sus propios links
create policy "Usuarios pueden ver sus propios links" 
  on public.user_bank_links for select 
  using (auth.uid() = user_id);

-- Nota: No creamos política de 'insert' o 'update' para el usuario, 
-- ya que esto lo hará la Edge Function usando el service_role (bypass RLS).
