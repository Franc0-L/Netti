export function loginBackoff(failures: number): number {
  if (failures < 5) return 0;
  return Math.min(900, 30 * 2 ** Math.min(failures - 5, 5));
}

export function remainingLoginDelay(failures: number, lastFailureAt: number, now = Date.now()): number {
  const delay = loginBackoff(failures);
  return Math.max(0, Math.ceil(delay - (now - lastFailureAt) / 1000));
}
