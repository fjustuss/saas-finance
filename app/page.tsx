"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

export default function HomePage() {
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + "/dashboard" } });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="grid gap-8">
      <div className="card p-8">
        <h1 className="text-2xl font-semibold mb-2">Entre com Magic Link</h1>
        <p className="text-slate-400 mb-6">Enviaremos um link para seu e-mail.</p>

        {sent ? (
          <p className="text-emerald-400">Verifique seu e-mail. ✉️</p>
        ) : (
          <form className="flex gap-3" onSubmit={signIn}>
            <input className="input flex-1" placeholder="seu@email.com" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <button className="btn" type="submit">Entrar</button>
          </form>
        )}

        {error && <p className="text-red-400 mt-3 text-sm">{error}</p>}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-6"><h3 className="font-semibold mb-2">Multi-tenant</h3><p className="text-slate-400 text-sm">RLS por organização, políticas e memberships.</p></div>
        <div className="card p-6"><h3 className="font-semibold mb-2">Dupla Entrada</h3><p className="text-slate-400 text-sm">Lançamentos imutáveis e soma zero.</p></div>
        <div className="card p-6"><h3 className="font-semibold mb-2">Webhooks</h3><p className="text-slate-400 text-sm">Integração com PSP (Stripe/Mercado Pago).</p></div>
      </div>
    </div>
  );
}
