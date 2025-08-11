"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

export default function NewInvoicePage() {
  const supabase = supabaseBrowser();
  const [customerName, setCustomerName] = useState("");
  const [items, setItems] = useState([{ description: "", quantity: 1, unit_amount: 0 }]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    const tenantId = (user?.app_metadata as any)?.tenant_id;
    if (!tenantId) { setErr("Defina tenant_id no JWT do usuário."); return; }

    // cria/acha cliente
    const { data: cust, error: e1 } = await supabase
      .from("customers")
      .insert({ tenant_id: tenantId, name: customerName })
      .select("id").single();
    if (e1) { setErr(e1.message); return; }

    // cria invoice
    const { data: inv, error: e2 } = await supabase
      .from("invoices")
      .insert({ tenant_id: tenantId, customer_id: cust.id, status: "open" })
      .select("id")
      .single();
    if (e2) { setErr(e2.message); return; }

    // linhas
    const lines = items.map(i => ({ tenant_id: tenantId, invoice_id: inv.id, description: i.description, quantity: i.quantity, unit_amount: i.unit_amount }));
    const { error: e3 } = await supabase.from("invoice_lines").insert(lines);
    if (e3) { setErr(e3.message); return; }

    setMsg(`Fatura criada: ${inv.id}`);
  }

  function updateItem(idx: number, field: string, value: any) {
    setItems(items => items.map((it, i) => i === idx ? { ...it, [field]: field === "quantity" || field === "unit_amount" ? Number(value) : value } : it));
  }

  return (
    <div className="card p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Nova Fatura</h1>
      <form onSubmit={submit} className="grid gap-4">
        <div>
          <label className="text-sm text-slate-400">Cliente</label>
          <input className="input w-full" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nome do cliente" required />
        </div>
        <div className="grid gap-2">
          <div className="text-sm text-slate-400">Itens</div>
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <input className="input col-span-6" placeholder="Descrição" value={it.description} onChange={e => updateItem(idx, "description", e.target.value)} required />
              <input className="input col-span-3" type="number" min={1} value={it.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} />
              <input className="input col-span-3" type="number" min={0} step="0.01" value={it.unit_amount} onChange={e => updateItem(idx, "unit_amount", e.target.value)} />
            </div>
          ))}
          <button type="button" className="btn w-max" onClick={() => setItems([...items, { description: "", quantity: 1, unit_amount: 0 }])}>Adicionar Item</button>
        </div>
        <button className="btn w-max" type="submit">Salvar Fatura</button>
      </form>
      {msg && <p className="text-emerald-400 mt-4 text-sm">{msg}</p>}
      {err && <p className="text-red-400 mt-4 text-sm">{err}</p>}
    </div>
  );
}
