-- 0001_init.sql
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- Tenants
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Memberships
create table if not exists public.memberships (
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid not null, -- auth.users.id
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz default now(),
  primary key (tenant_id, user_id)
);

-- Helper: current_tenant from JWT
create or replace function public.current_tenant()
returns uuid language sql stable as $$
  select nullif((auth.jwt() ->> 'tenant_id'), '')::uuid
$$;

-- Accounts (chart of accounts)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant(),
  code text not null,
  name text not null,
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  created_at timestamptz default now(),
  unique (tenant_id, code)
);

-- Journal entries (header)
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant(),
  occurred_at date not null default current_date,
  description text not null,
  external_id text,
  created_at timestamptz default now(),
  unique (tenant_id, external_id)
);

-- Ledger lines (details)
create table if not exists public.ledger_lines (
  id bigserial primary key,
  tenant_id uuid not null,
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  check (debit = 0 or credit = 0),
  check (debit >= 0 and credit >= 0)
);

-- Trigger to set tenant on ledger_lines
create or replace function public.set_line_tenant()
returns trigger language plpgsql as $$
begin
  new.tenant_id := (select tenant_id from public.journal_entries where id = new.journal_entry_id);
  return new;
end; $$;

drop trigger if exists trg_set_line_tenant on public.ledger_lines;
create trigger trg_set_line_tenant
before insert on public.ledger_lines
for each row execute procedure public.set_line_tenant();

-- RPC to post a journal entry atomically
create or replace function public.post_journal_entry(
  p_tenant uuid,
  p_description text,
  p_occurred_at date,
  p_external_id text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
as $$
declare
  v_entry_id uuid;
  v_sum numeric(18,2);
  v_line jsonb;
begin
  -- membership check
  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant and m.user_id = auth.uid()
  ) then
    raise exception 'not member of tenant';
  end if;

  -- insert header
  insert into public.journal_entries (tenant_id, description, occurred_at, external_id)
  values (p_tenant, p_description, coalesce(p_occurred_at, current_date), p_external_id)
  returning id into v_entry_id;

  -- insert lines
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.ledger_lines (journal_entry_id, account_id, debit, credit)
    values (
      v_entry_id,
      (v_line->>'account_id')::uuid,
      coalesce((v_line->>'debit')::numeric, 0),
      coalesce((v_line->>'credit')::numeric, 0)
    );
  end loop;

  -- check sum
  select coalesce(sum(debit - credit),0) into v_sum
  from public.ledger_lines where journal_entry_id = v_entry_id;

  if v_sum <> 0 then
    raise exception 'unbalanced entry (sum=%). Must equal zero', v_sum;
  end if;

  return v_entry_id;
end;
$$;

-- Make ledger immutable
create or replace function public.prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'immutable';
end; $$;

drop trigger if exists trg_immutable_lines on public.ledger_lines;
create trigger trg_immutable_lines
before update or delete on public.ledger_lines
for each row execute procedure public.prevent_mutation();

drop trigger if exists trg_immutable_entries on public.journal_entries;
create trigger trg_immutable_entries
before update or delete on public.journal_entries
for each row execute procedure public.prevent_mutation();

-- Billing tables
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant(),
  name text not null,
  email text,
  tax_id text,
  created_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant(),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant(),
  product_id uuid references public.products(id) on delete cascade,
  currency text not null default 'BRL',
  unit_amount numeric(18,2) not null,
  recurring_interval text check (recurring_interval in ('one_time','day','week','month','year')) not null default 'one_time',
  created_at timestamptz default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant(),
  customer_id uuid references public.customers(id),
  status text not null check (status in ('draft','open','paid','void')) default 'draft',
  due_date date,
  total numeric(18,2) not null default 0,
  external_id text,
  created_at timestamptz default now()
);

create table if not exists public.invoice_lines (
  id bigserial primary key,
  tenant_id uuid not null default public.current_tenant(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(18,4) not null default 1,
  unit_amount numeric(18,2) not null,
  amount numeric(18,2) generated always as (quantity * unit_amount) stored
);

create or replace function public.update_invoice_total()
returns trigger language plpgsql as $$
begin
  update public.invoices i
  set total = coalesce((select sum(amount) from public.invoice_lines where invoice_id = i.id), 0)
  where i.id = coalesce(new.invoice_id, old.invoice_id);
  return null;
end; $$;

drop trigger if exists trg_invoice_total_ins on public.invoice_lines;
create trigger trg_invoice_total_ins
after insert on public.invoice_lines
for each row execute procedure public.update_invoice_total();

drop trigger if exists trg_invoice_total_del on public.invoice_lines;
create trigger trg_invoice_total_del
after delete on public.invoice_lines
for each row execute procedure public.update_invoice_total();

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid references public.invoices(id),
  provider text not null,
  provider_payment_id text not null,
  amount numeric(18,2) not null,
  currency text not null default 'BRL',
  paid_at timestamptz not null default now(),
  created_at timestamptz default now(),
  unique (tenant_id, provider, provider_payment_id)
);

-- RLS
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.ledger_lines enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.prices enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;

-- Policies: a) read/write allowed se membro do tenant; b) writes restritas por role
-- Tenants: select apenas se membro
drop policy if exists p_tenants_select on public.tenants;
create policy p_tenants_select on public.tenants
for select using (
  exists (select 1 from public.memberships m where m.tenant_id = tenants.id and m.user_id = auth.uid())
);

-- Memberships: select/insert/update pelo próprio tenant (owner/admin)
drop policy if exists p_memberships_select on public.memberships;
create policy p_memberships_select on public.memberships
for select using (
  exists (select 1 from public.memberships m where m.tenant_id = memberships.tenant_id and m.user_id = auth.uid())
);

drop policy if exists p_memberships_insert on public.memberships;
create policy p_memberships_insert on public.memberships
for insert with check (
  exists (select 1 from public.memberships m where m.tenant_id = memberships.tenant_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
);

drop policy if exists p_memberships_update on public.memberships;
create policy p_memberships_update on public.memberships
for update using (
  exists (select 1 from public.memberships m where m.tenant_id = memberships.tenant_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
) with check (
  exists (select 1 from public.memberships m where m.tenant_id = memberships.tenant_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
);

-- Generic helper for per-tenant tables
create or replace function public.is_member(p_tenant uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.memberships m where m.tenant_id = p_tenant and m.user_id = auth.uid())
$$;

-- Accounts
drop policy if exists p_accounts_select on public.accounts;
create policy p_accounts_select on public.accounts for select using (public.is_member(accounts.tenant_id));

drop policy if exists p_accounts_insert on public.accounts;
create policy p_accounts_insert on public.accounts for insert with check (public.is_member(accounts.tenant_id));

-- Journal entries
drop policy if exists p_je_select on public.journal_entries;
create policy p_je_select on public.journal_entries for select using (public.is_member(journal_entries.tenant_id));

drop policy if exists p_je_insert on public.journal_entries;
create policy p_je_insert on public.journal_entries for insert with check (public.is_member(journal_entries.tenant_id));

-- Ledger lines
drop policy if exists p_ll_select on public.ledger_lines;
create policy p_ll_select on public.ledger_lines for select using (public.is_member(ledger_lines.tenant_id));

drop policy if exists p_ll_insert on public.ledger_lines;
create policy p_ll_insert on public.ledger_lines for insert with check (public.is_member(ledger_lines.tenant_id));

-- Customers
drop policy if exists p_cust_select on public.customers;
create policy p_cust_select on public.customers for select using (public.is_member(customers.tenant_id));

drop policy if exists p_cust_insert on public.customers;
create policy p_cust_insert on public.customers for insert with check (public.is_member(customers.tenant_id));

drop policy if exists p_cust_update on public.customers;
create policy p_cust_update on public.customers for update using (public.is_member(customers.tenant_id)) with check (public.is_member(customers.tenant_id));

-- Products
drop policy if exists p_prod_select on public.products;
create policy p_prod_select on public.products for select using (public.is_member(products.tenant_id));
drop policy if exists p_prod_write on public.products;
create policy p_prod_write on public.products for all using (public.is_member(products.tenant_id)) with check (public.is_member(products.tenant_id));

-- Prices
drop policy if exists p_prices_select on public.prices;
create policy p_prices_select on public.prices for select using (public.is_member(prices.tenant_id));
drop policy if exists p_prices_write on public.prices;
create policy p_prices_write on public.prices for all using (public.is_member(prices.tenant_id)) with check (public.is_member(prices.tenant_id));

-- Invoices
drop policy if exists p_inv_select on public.invoices;
create policy p_inv_select on public.invoices for select using (public.is_member(invoices.tenant_id));
drop policy if exists p_inv_write on public.invoices;
create policy p_inv_write on public.invoices for all using (public.is_member(invoices.tenant_id)) with check (public.is_member(invoices.tenant_id));

-- Invoice lines
drop policy if exists p_il_select on public.invoice_lines;
create policy p_il_select on public.invoice_lines for select using (public.is_member(invoice_lines.tenant_id));
drop policy if exists p_il_write on public.invoice_lines;
create policy p_il_write on public.invoice_lines for all using (public.is_member(invoice_lines.tenant_id)) with check (public.is_member(invoice_lines.tenant_id));

-- Payments
drop policy if exists p_pay_select on public.payments;
create policy p_pay_select on public.payments for select using (public.is_member(payments.tenant_id));
drop policy if exists p_pay_insert on public.payments;
create policy p_pay_insert on public.payments for insert with check (public.is_member(payments.tenant_id));

-- Seed function: default chart of accounts for a tenant
create or replace function public.seed_default_chart(p_tenant uuid)
returns void language plpgsql as $$
begin
  insert into public.accounts (tenant_id, code, name, type) values
    (p_tenant, '1.1.1', 'Caixa', 'asset'),
    (p_tenant, '1.1.2', 'Bancos', 'asset'),
    (p_tenant, '1.1.3', 'Clientes', 'asset'),
    (p_tenant, '2.1.1', 'Fornecedores', 'liability'),
    (p_tenant, '3.1.1', 'Capital Social', 'equity'),
    (p_tenant, '4.1.1', 'Receita de Assinaturas', 'revenue'),
    (p_tenant, '5.1.1', 'Despesas Operacionais', 'expense')
  on conflict do nothing;
end;
$$;
