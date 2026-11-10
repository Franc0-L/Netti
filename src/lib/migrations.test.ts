import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = join(process.cwd(), "src/db/migrations");
const journal = JSON.parse(readFileSync(join(root, "meta/_journal.json"), "utf8")) as {
 version: string; dialect: string; entries: Array<{ idx: number; version: string; tag: string; breakpoints: boolean }>;
};
test("Drizzle journal is valid and references existing migrations", () => {
 assert.equal(journal.version, "7"); assert.equal(journal.dialect, "postgresql");
 assert.deepEqual(journal.entries.map((item) => item.idx), journal.entries.map((_, i) => i));
 assert.equal(new Set(journal.entries.map((item) => item.tag)).size, journal.entries.length);
 for (const item of journal.entries) { assert.equal(item.version, "7"); assert.equal(item.breakpoints, true); assert.ok(existsSync(join(root, item.tag + ".sql"))); }
});
test("baseline defines runtime tables, constraints, indexes and triggers", () => {
 const sql = readFileSync(join(root, "0000_initial_schema.sql"), "utf8");
 for (const table of ["media","games","articles","media_variants","article_revisions","sessions","login_attempts","redirects","storage_orphans","cron_runs"]) assert.ok(sql.includes('CREATE TABLE "' + table + '"'), table + " table missing");
 for (const item of ["articles_kind_slug_active","articles_visible_idx","games_external_idx","articles_review_complete","games_set_updated_at","articles_validate_tags","articles_set_updated_at","redirects_validate"]) assert.ok(sql.includes(item), item + " missing");
 assert.ok(sql.includes("--> statement-breakpoint"));
});
test("baseline does not drop existing data", () => {
 const sql = readFileSync(join(root, "0000_initial_schema.sql"), "utf8");
 assert.doesNotMatch(sql, /\bDROP\s+(TABLE|SCHEMA|TYPE|INDEX)\b/i);
});
