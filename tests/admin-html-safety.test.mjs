import assert from "node:assert/strict";
import test from "node:test";
import { escapeAttribute, escapeHtml, safeMediaUrl } from "../public/admin/js/html-safety.js";

test("escapes untrusted text before inserting it into HTML", () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert("x")&lt;/script&gt;');
});

test("escapes quotes and markup in attribute values", () => {
  assert.equal(escapeAttribute('"><img src=x onerror=alert(1)>'), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeAttribute("it's & fine"), "it&#39;s &amp; fine");
});

test("only accepts local media paths from supported collections and formats", () => {
  assert.equal(safeMediaUrl("/media/games/zelda/cover.webp"), "/media/games/zelda/cover.webp");
  assert.equal(safeMediaUrl("https://evil.example/track.png"), "");
  assert.equal(safeMediaUrl("//evil.example/track.png"), "");
  assert.equal(safeMediaUrl("/media/games/zelda/../../admin.js"), "");
  assert.equal(safeMediaUrl("/images/logo.svg"), "");
});
