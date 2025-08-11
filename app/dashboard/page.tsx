import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = supabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card p-6">
        <p>Você não está autenticado.</p>
        <Link href="/" className="btn mt-4">Ir para login</Link>
      </div>
    );
  }

  // Exemplo: buscar invoices e contas (se existir tenant_id no JWT)
  const tenantId = (user.app_metadata as any)?.tenant_id || null;

  let invoices: any[] = [];
  if (tenantId) {
    const { data } = await supabase
      .from("invoices")
      .select("id,status,total,created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    invoices = data || [];
  }

  return (
    <div className="grid gap-6">
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Olá, {user.email}</h1>
        <p className="text-slate-400 text-sm mt-1">Tenant atual (JWT): <span className="badge">{tenantId || "não definido"}</span></p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-6">
          <h3 className="font-semibold mb-2">Ações rápidas</h3>
          <div className="flex flex-wrap gap-2">
            <Link href="/onboarding" className="btn">Criar Tenant</Link>
            <Link href="/invoices/new" className="btn">Nova Fatura</Link>
            <Link href="/journal/new" className="btn">Novo Lançamento</Link>
          </div>
        </div>

        <div className="card p-6 md:col-span-2">
          <h3 className="font-semibold mb-4">Últimas faturas</h3>
          {invoices.length === 0 ? (
            <p className="text-slate-400 text-sm">Sem faturas ainda.</p>
          ) : (
            <table className="table text-sm">
              <thead>
                <tr><th>ID</th><th>Status</th><th>Total</th><th>Criada em</th></tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="font-mono">{i.id.slice(0,8)}…</td>
                    <td><span className="badge">{i.status}</span></td>
                    <td>R$ {Number(i.total).toFixed(2)}</td>
                    <td>{new Date(i.created_at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
