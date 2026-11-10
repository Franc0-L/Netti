import assert from "node:assert/strict";
import test from "node:test";
import { planOrphanCleanup } from "./cleanup-plan.js";

test("removes unreferenced objects and preserves objects still referenced by content", () => {
  const plan = planOrphanCleanup([
    { id: 1, storageKey: "orphan.webp", action: "put" },
    { id: 2, storageKey: "used.webp", action: "put" },
    { id: 3, storageKey: "pending-delete.webp", action: "delete" },
    { id: 4, storageKey: "still-in-use.webp", action: "delete" },
  ], new Set(["used.webp", "still-in-use.webp"]));

  assert.deepEqual(plan, {
    repairWithoutDeleteIds: [2],
    deleteIds: [1, 3],
    deleteKeys: ["orphan.webp", "pending-delete.webp"],
    blockedIds: [4],
  });
});

test("handles an empty pending queue", () => {
  assert.deepEqual(planOrphanCleanup([], new Set()), {
    repairWithoutDeleteIds: [], deleteIds: [], deleteKeys: [], blockedIds: [],
  });
});
