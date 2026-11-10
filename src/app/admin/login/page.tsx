import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Ingresar al panel", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  await connection();
  let authenticated = false;
  try { await requireSession(); authenticated = true; } catch { /* No hay una sesión activa. */ }
  if (authenticated) redirect("/admin");
  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <p className="admin-eyebrow">NETTI / STUDIO</p>
        <h1>Ingresar</h1>
        <p>Acceso privado al espacio editorial de Netti.</p>
        <AdminLoginForm />
      </section>
    </main>
  );
}
