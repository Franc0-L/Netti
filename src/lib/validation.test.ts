import assert from "node:assert/strict";
import test from "node:test";
import { makeArticleSchema } from "./validation.js";

const schema = makeArticleSchema();

test("accepts a minimally valid published guide", () => {
  const result = schema.safeParse({
    kind: "guide",
    status: "published",
    slug: "guia-inicial",
    title: "Guía inicial",
    body: "Contenido suficientemente largo para publicar.",
    publishedAt: "2026-11-09T12:00:00.000Z",
  });

  assert.equal(result.success, true);
});

test("rejects repeated tags regardless of case", () => {
  const result = schema.safeParse({
    kind: "guide",
    status: "draft",
    slug: "",
    tags: ["Nintendo", "nintendo"],
  });

  assert.equal(result.success, false);
});

test("rejects non-HTTP source URLs", () => {
  const result = schema.safeParse({
    kind: "news",
    status: "draft",
    slug: "",
    sourceUrl: "ftp://example.com/source",
  });

  assert.equal(result.success, false);
});

test("requires review-specific fields before publication", () => {
  const result = schema.safeParse({
    kind: "review",
    status: "published",
    slug: "analisis",
    title: "Análisis",
    body: "Texto de reseña suficientemente largo.",
    publishedAt: "2026-11-09T12:00:00.000Z",
  });

  assert.equal(result.success, false);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path[0]);
    assert.ok(fields.includes("gameId"));
    assert.ok(fields.includes("score"));
    assert.ok(fields.includes("scoreReason"));
    assert.ok(fields.includes("verdict"));
  }
});
