# Deploy com EasyPanel (via GitHub)

## Pré-requisitos
- Repositório no GitHub com este projeto (Dockerfile incluso).
- Projeto Supabase criado (com migrações aplicadas).
- Dominío apontado para o seu servidor (opcional, mas recomendado).

## Passo a passo
1) **Conecte o GitHub no EasyPanel:**
   - Crie um novo app -> Tipo: **Docker** (a partir de repositório Git).
   - Selecione o repositório e a branch (ex.: `main`).

2) **Build:**
   - Dockerfile path: `Dockerfile`
   - Build Args:
     - `NEXT_PUBLIC_SUPABASE_URL` = sua URL do Supabase
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = sua Anon Key
   - (Opcional) Habilite auto deploy on push.

3) **Run:**
   - Porta interna: **3000** (o container expõe 3000).
   - Variáveis de ambiente (Runtime):
     - `PORT=3000` (o Next usa esse valor)
     - `NEXT_PUBLIC_SUPABASE_URL` (mesmo do build)
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (mesmo do build)

4) **Domínio e SSL:**
   - Aponte o domínio no EasyPanel para este app e habilite HTTPS/SSL.

5) **Banco e Webhook:**
   - As **migrações** do Supabase devem ser aplicadas (via CLI local ou GitHub Actions).
   - A **Edge Function** `payments-webhook` roda no Supabase; faça deploy via CLI ou CI.
   - Configure o PSP para enviar webhooks para a URL da função no Supabase.

## Observações
- As variáveis `NEXT_PUBLIC_*` são públicas por design (não incluir outras chaves sensíveis no front).
- Se quiser buildar sem passar build args, crie `.env.production` com as chaves públicas.
