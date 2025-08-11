import { serve } from "https://deno.land/std@0.214.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // TODO: Verificar assinatura do provedor (Stripe/Mercado Pago)
  // Ex.: const sig = req.headers.get("stripe-signature");

  const payload = await req.json().catch(() => ({}));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Exemplo genérico esperado do PSP em payload.metadata
  const meta = payload?.data?.object?.metadata || {};
  const tenant_id = meta.tenant_id;
  const invoice_id = meta.invoice_id;
  const provider_payment_id = payload?.data?.object?.id || meta.provider_payment_id;
  const amount = Number(meta.amount || payload?.data?.object?.amount || 0) / (meta.amount > 1000 ? 100 : 1);
  const provider = meta.provider || "stripe";

  if (!tenant_id || !invoice_id || !provider_payment_id || !amount) {
    return new Response("missing metadata", { status: 400 });
  }

  // 1) idempotência
  const { error: dup } = await supabase
    .from("payments")
    .insert({
      tenant_id,
      invoice_id,
      provider,
      provider_payment_id,
      amount
    });

  if (dup && !String(dup.message).includes("duplicate key")) {
    return new Response(dup.message, { status: 400 });
  }

  // 2) marcar fatura como paga
  await supabase
    .from("invoices")
    .update({ status: "paid" })
    .eq("id", invoice_id)
    .eq("tenant_id", tenant_id);

  // 3) lançar no razão (ajuste os UUIDs das contas no seu tenant)
  // Sugestão: obtenha pela code, p.ex. 'Bancos' e 'Receita de Assinaturas'
  const { data: cash } = await supabase
    .from("accounts")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("code", "1.1.2")
    .single();

  const { data: revenue } = await supabase
    .from("accounts")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("code", "4.1.1")
    .single();

  const lines = [
    { account_id: cash?.id, debit: amount, credit: 0 },
    { account_id: revenue?.id, debit: 0, credit: amount }
  ];

  const { error: rpcErr } = await supabase.rpc("post_journal_entry", {
    p_tenant: tenant_id,
    p_description: `Pagamento ${provider_payment_id}`,
    p_occurred_at: new Date().toISOString().slice(0,10),
    p_external_id: provider_payment_id,
    p_lines: lines
  });

  if (rpcErr) {
    return new Response(rpcErr.message, { status: 400 });
  }

  return new Response("ok", { status: 200 });
});
