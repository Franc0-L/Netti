import assert from 'node:assert/strict';
import test from 'node:test';
import { isAuthorizedCron } from './cron-auth';

const SECRET = 'test-secret-with-at-least-32-characters';

function requestWith(authorization?: string): Request {
  return new Request('http://localhost/api/revalidate', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

test('rejects a missing authorization header', () => {
  process.env.CRON_SECRET = SECRET;
  assert.equal(isAuthorizedCron(requestWith()), false);
});

test('rejects a secret shorter than the minimum length', () => {
  process.env.CRON_SECRET = 'too-short';
  assert.equal(isAuthorizedCron(requestWith(`Bearer ${SECRET}`)), false);
});

test('rejects a different token', () => {
  process.env.CRON_SECRET = SECRET;
  assert.equal(
    isAuthorizedCron(requestWith('Bearer wrong-secret-with-at-least-32-characters')),
    false
  );
});

test('accepts the exact bearer token', () => {
  process.env.CRON_SECRET = SECRET;
  assert.equal(isAuthorizedCron(requestWith(`Bearer ${SECRET}`)), true);
});
