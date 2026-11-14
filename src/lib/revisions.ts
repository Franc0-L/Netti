/**
 * Revision retention.
 *
 * Every save of an article creates a snapshot through the database trigger, so
 * the table needs a hard bound. Keeping the newest snapshots is enough to
 * review or undo a recent change, and it keeps the database small.
 *
 * The constant lives outside the server actions on purpose: a `'use server'`
 * file may only export async functions, and the panel also needs the number to
 * tell the editor how many versions are kept.
 */
export const REVISION_RETENTION = 20;
