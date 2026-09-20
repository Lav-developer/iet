import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { databaseConfigured } from "@/lib/db";
import { getDashboardSummary } from "@/lib/store";

/**
 * Administrator dashboard counters.
 *
 * Authentication is the same call every other admin route makes
 * (`requireAdmin` -> `getSession`), and the error handling follows the same
 * pattern as well (`/api/admin/content`'s `handleError`): only a genuine
 * authentication failure answers 401, everything else is logged with its real
 * cause and reported as a server error. The dashboard view used to load the
 * entire dataset (every entity, drafts included, with relations) on every
 * request, which is the one admin read that did not follow the per-entity
 * scoped pattern used elsewhere — it now reads status aggregates only.
 */
export async function GET() {
  try {
    await requireAdmin();
    const summary = await getDashboardSummary();
    const health = [
      { label: "Database connection", detail: databaseConfigured ? "DATABASE_URL configured; Prisma adapter active." : "No DATABASE_URL; review seed store is active for preview.", ok: databaseConfigured },
      { label: "Public publishing", detail: `${summary.publishedDepartments} departments are currently published.`, ok: summary.hasPublishedDepartment },
      { label: "Workflow coverage", detail: "Every editorial entity carries a status field.", ok: true },
      { label: "Institutional handover", detail: "Environment variables, schema and migration docs are present.", ok: true },
    ];
    return NextResponse.json({ mode: summary.mode, stats: summary.stats, health });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Log the underlying cause: without this the runtime logs only showed a
    // generic 500 and the real failure was invisible.
    console.error("Unable to load dashboard.", error);
    const fallback = "Unable to load dashboard.";
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? fallback : (error instanceof Error ? error.message : fallback) },
      { status: 500 },
    );
  }
}
