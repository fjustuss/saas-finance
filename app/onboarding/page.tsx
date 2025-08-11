"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

export default function OnboardingPage() {
  const supabase = supabaseBrowser();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMessage(null); setError(null);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) { setError("Faça login primeiro."); setLoading(false); return; }

    // 1) cria tenant
    const { data: tenant, error: e1 } = await supabase
      .from("tenants")
      .insert({ name })
      .select("id")
      .single();
    if (e1) { setError(e1.message); setLoading(false); return; }

    // 2) membership owner
    const { error: e2 } = await supabase
      .from("memberships")
      .insert({ tenant_id: tenant.id, user_id: user.id, role: "owner" });
    if (e2) { setError(e2.message); setLoading(false); return; }

    setMessage(`Tenant criado: ${tenant.id}. Agora atualize o app_metadata do usuário com esse tenant_id no painel do Supabase ou via admin flow.`);
    setLoading(false);
  }

  return (
    <div className="card p-6 max-w-xl">
      <h1 className="text-xl font-semibold mb-2">Onboarding</h1>
      <p className="text-slate-400 mb-6 text-sm">Crie sua organização (tenant) e torne-se owner.</p>
      <form onSubmit={createTenant} className="flex gap-3">
        <input className="input flex-1" placeholder="Nome da empresa" value={name} onChange={e => setName(e.target.value)} required />
        <button className="btn" disabled={loading} type="submit">{loading ? "Criando..." : "Criar"}</button>
      </form>
      {message && <p className="text-emerald-400 mt-4 text-sm">{message}</p>}
      {error && <p className="text-red-400 mt-4 text-sm">{error}</p>}
    </div>
  );
}
