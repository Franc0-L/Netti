import { isIPv4, isIPv6 } from 'node:net';

/**
 * Client address normalization for the login rate limit.
 *
 * IPv4 addresses are used as they arrive. IPv6 addresses are reduced to their
 * /64 prefix: a single subscriber usually receives a whole /64 and can rotate
 * the interface identifier at will, so counting each address separately would
 * let a single source get a fresh budget on every attempt.
 */

/** Expands an IPv6 address into its eight groups, or null when it is invalid. */
function expandIpv6(ip: string): string[] | null {
  const withoutZone = ip.split('%')[0] ?? '';
  const halves = withoutZone.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];

  // An embedded IPv4 address counts as two groups.
  const last = tail.length > 0 ? tail[tail.length - 1] : head[head.length - 1];
  let embeddedIpv4: string | null = null;
  if (last && last.includes('.')) {
    if (!isIPv4(last)) return null;
    embeddedIpv4 = last;
    const octets = last.split('.').map(Number);
    const high = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0);
    const low = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
    const groups = [high.toString(16), low.toString(16)];
    if (tail.length > 0) tail.splice(tail.length - 1, 1, ...groups);
    else if (head.length > 0) head.splice(head.length - 1, 1, ...groups);
    else return null;
  }

  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail];

  // An IPv4 mapped address is the same host: keep it grouped with the IPv4.
  if (embeddedIpv4 && groups.slice(0, 5).every((group) => group === '0') && groups[5] === 'ffff') {
    return null;
  }
  return groups;
}

/**
 * Returns the key used to group login attempts by origin.
 *
 * IPv4 keeps its exact value; IPv6 collapses to its /64 prefix, written in
 * canonical form.
 */
export function normalizeIp(ip: string | undefined | null): string {
  const value = (ip ?? '').trim();
  if (!value) return 'unknown';
  if (isIPv4(value)) return value;
  if (!isIPv6(value)) return value.slice(0, 64);
  const groups = expandIpv6(value);
  if (!groups) {
    // IPv4 mapped addresses come back as null: fall back to the embedded IPv4.
    const embedded = value.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (embedded && isIPv4(embedded[1] ?? '')) return embedded[1] ?? 'unknown';
    return value.slice(0, 64);
  }
  return groups.slice(0, 4).join(':') + '::/64';
}
