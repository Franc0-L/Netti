import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db/index";
import { articles } from "@/db/schema";

const statusLabel: Record<string, string> = { draft: "Borrador", published: "Publicado", trashed: "Papelera" };
const kindLabel: Record<string, string> = { review: "Reseña", news: "Noticia", guide: "Guía" };

export default async function AdminDashboardPage() {
  const rows = await db.select({
    id: articles.id, kind: articles.kind, slug: articles.slug, title: articles.title,
    status: articles.status, updatedAt: articles.updatedAt,
  }).from(articles).orderBy(desc(articles.updatedAt)).limit(100);

  return (
    <>
      <div className="admin-toolbar">
        <div><p className="admin-eyebrow">ESCRITORIO EDITORIAL</p><h1>Artículos</h1><p className="admin-muted">{rows.length} registros recientes</p></div>
        <Link className="admin-button admin-button-primary" href="/admin/articles/new">Crear artículo</Link>
      </div>
      {rows.length === 0 ? <div className="admin-empty">Todavía no hay artículos. Creá el primero para empezar.</div> : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Título</th><th>Tipo</th><th>Estado</th><th>Última edición</th><th></th></tr></thead>
            <tbody>
              {rows.map((row) => <tr key={row.id}>
                <td><strong>{row.title || "Sin título"}</strong><br /><span className="admin-muted">/{row.slug || "sin-slug"}</span></td>
                <td>{kindLabel[row.kind] ?? row.kind}</td>
                <td><span className={"admin-status admin-status-" + row.status}>{statusLabel[row.status] ?? row.status}</span></td>
                <td>{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(row.updatedAt)}</td>
                <td>{row.status !== "trashed" ? <Link href={"/admin/articles/" + row.id}>Editar</Link> : <span className="admin-muted">—</span>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
