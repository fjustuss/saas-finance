# SaaS Financeiro + Supabase (Boilerplate)

Stack:
- Next.js (App Router, TS, Tailwind)
- Supabase (Auth, Postgres, Storage opcional)
- Multi-tenant com RLS (memberships)
- Contabilidade de dupla entrada (razão imutável)
- Faturas/linhas + pagamentos via webhook (ex.: Stripe/Mercado Pago)

## 1) Setup
```bash
cp .env.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
npm i
npm run dev
```

## 2) Supabase (CLI)
```bash
supabase init
# copie os arquivos de /supabase para a pasta do projeto Supabase
supabase start         # ambiente local
supabase db reset      # aplica migrações locais
# ou conecte no projeto remoto:
# supabase link --project-ref <ref>
# supabase db push
```

## 3) Fluxo
1. Abra `/onboarding` e crie um tenant (gera `tenants` e `memberships`).  
2. No painel do Supabase, adicione `tenant_id` no `app_metadata` do usuário autenticado.  
3. (Opcional) Rode `select public.seed_default_chart('<TENANT_UUID>');` para criar um plano de contas padrão.  
4. Crie faturas em `/invoices/new` ou lançamentos manuais em `/journal/new`.  
5. Configure PSP, envie `tenant_id` e `invoice_id` no metadata e aponte o webhook para a Edge Function.

> **Importante:** As tabelas `journal_entries` e `ledger_lines` são imutáveis (apenas INSERT). Para correções, lance estornos.

## 4) Edge Function
Veja `supabase/functions/payments-webhook/index.ts` e configure a verificação de assinatura do PSP. Use a `SUPABASE_SERVICE_ROLE_KEY` somente no backend.

## 5) Segurança
- RLS aplicado em todas as tabelas com base em `memberships`.
- Idempotência no registro de pagamentos.
- RPC `post_journal_entry` garante soma zero.

Bom estudo e bons deploys! 🚀
