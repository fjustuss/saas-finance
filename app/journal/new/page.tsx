"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

export default function NewJournalEntry() {
  const supabase = supabaseBrowser();
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([{ account_id: "", debit: 0, credit: 0 }]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    const tenantId = (user?.app_metadata as any)?.tenant_id;
    if (!tenantId) { setErr("Defina tenant_id no JWT."); return; }

    const { data, error } = await supabase.rpc("post_journal_entry", {
      p_tenant: tenantId,
      p_description: description,
      p_occurred_at: new Date().toISOString().slice(0,10),
      p_external_id: null,
      p_lines: lines
    });
    if (error) { setErr(error.message); return; }
    setMsg(`Lançamento criado: ${data}`);
  }

  function updateLine(idx: number, field: string, value: any) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [field]: field === "debit" || field === "credit" ? Number(value) : value } : l));
  }

  return (
    <div className="card p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Novo Lançamento</h1>
      <form onSubmit={submit} className="grid gap-4">
        <input className="input" placeholder="Descrição" value={description} onChange={e => setDescription(e.target.value)} required />
        <div className="grid gap-2">
          <div className="text-sm text-slate-400">Linhas</div>
          {lines.map((ln, idx) => (
            <div className="grid grid-cols-12 gap-2" key={idx}>
              <input className="input col-span-6" placeholder="UUID da conta" value={ln.account_id} onChange={e => updateLine(idx, "account_id", e.target.value)} required />
              <input className="input col-span-3" type="number" step="0.01" placeholder="Débito" value={ln.debit} onChange={e => updateLine(idx, "debit", e.target.value)} />
              <input className="input col-span-3" type="number" step="0.01" placeholder="Crédito" value={ln.credit} onChange={e => updateLine(idx, "credit", e.target.value)} />
            </div>
          ))}
          <button type="button" className="btn w-max" onClick={() => setLines([...lines, { account_id: "", debit: 0, credit: 0 }])}>Adicionar Linha</button>
        </div>
        <button className="btn w-max" type="submit">Lançar</button>
      </form>
      {msg && <p className="text-emerald-400 mt-4 text-sm">{msg}</p>}
      {err && <p className="text-red-400 mt-4 text-sm">{err}</p>}
    </div>
  );
}
