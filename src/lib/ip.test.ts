import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeIp } from './ip.js';

test('keeps IPv4 addresses as they arrive', () => {
  assert.equal(normalizeIp('203.0.113.7'), '203.0.113.7');
});

test('collapses IPv6 addresses to their /64 prefix', () => {
  assert.equal(normalizeIp('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64');
  assert.equal(normalizeIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
});

test('rotating the interface identifier does not create a new bucket', () => {
  const first = normalizeIp('2001:db8:abcd:1234::1');
  const second = normalizeIp('2001:db8:abcd:1234::2');
  assert.equal(first, second);
  assert.equal(first, '2001:db8:abcd:1234::/64');
});

test('a different /64 is a different bucket', () => {
  assert.notEqual(normalizeIp('2001:db8:abcd:1234::1'), normalizeIp('2001:db8:abcd:9999::1'));
});

test('handles compressed and zone scoped addresses', () => {
  assert.equal(normalizeIp('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(normalizeIp('fe80::1%eth0'), 'fe80:0:0:0::/64');
});

test('maps IPv4 mapped IPv6 addresses to their IPv4 form', () => {
  assert.equal(normalizeIp('::ffff:203.0.113.7'), '203.0.113.7');
});

test('falls back to a bounded key for unknown values', () => {
  assert.equal(normalizeIp(''), 'unknown');
  assert.equal(normalizeIp(undefined), 'unknown');
  assert.equal(normalizeIp('not-an-ip'), 'not-an-ip');
  assert.equal(normalizeIp('x'.repeat(200)).length, 64);
});
