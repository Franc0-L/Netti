"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout, logoutAll } from "@/app/actions/auth";

export function AdminNav() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signOut(all: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const result = all ? await logoutAll() : await logout();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setMessage("No se pudo cerrar la sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="admin-header">
      <a className="admin-brand" href="/admin">NETTI <span>/ STUDIO</span></a>
      <nav className="admin-nav" aria-label="Administración">
        <a href="/admin">Artículos</a>
        <a href="/admin/articles/new">Nuevo artículo</a>
      </nav>
      <div className="admin-session">
        {message ? <span className="admin-error" role="alert">{message}</span> : null}
        <button type="button" className="admin-button admin-button-quiet" disabled={busy} onClick={() => void signOut(false)}>Salir</button>
        <button type="button" className="admin-button admin-button-quiet" disabled={busy} onClick={() => void signOut(true)}>Cerrar todas</button>
      </div>
    </header>
  );
}
