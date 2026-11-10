import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin-nav";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminPanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();
  try { await requireSession(); } catch { redirect("/admin/login"); }
  return <div className="admin-shell"><AdminNav /><main className="admin-main">{children}</main></div>;
}
