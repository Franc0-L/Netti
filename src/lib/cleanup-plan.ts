export type PendingStorageOrphan = { id: number; storageKey: string; action: 'put' | 'delete' };

export function planOrphanCleanup(
  rows: PendingStorageOrphan[],
  referencedKeys: ReadonlySet<string>
) {
  const repairWithoutDeleteIds: number[] = [];
  const deleteIds: number[] = [];
  const deleteKeys: string[] = [];
  const blockedIds: number[] = [];

  for (const row of rows) {
    if (referencedKeys.has(row.storageKey)) {
      if (row.action === 'put') repairWithoutDeleteIds.push(row.id);
      else blockedIds.push(row.id);
      continue;
    }
    deleteIds.push(row.id);
    deleteKeys.push(row.storageKey);
  }

  return { repairWithoutDeleteIds, deleteIds, deleteKeys, blockedIds };
}
