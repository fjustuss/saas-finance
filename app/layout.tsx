import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "SaaS Financeiro",
  description: "Boilerplate Next.js + Supabase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="border-b border-slate-800">
          <div className="container py-4 flex items-center justify-between">
            <Link href="/" className="font-semibold">💸 SaaS Financeiro</Link>
            <nav className="flex gap-4 text-sm text-slate-300">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/onboarding">Onboarding</Link>
            </nav>
          </div>
        </header>
        <main className="container py-8">{children}</main>
        <footer className="container py-12 text-center text-slate-400 text-sm">
          Feito com Next.js + Supabase
        </footer>
      </body>
    </html>
  );
}
