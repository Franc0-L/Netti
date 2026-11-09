import assert from "node:assert/strict";
import test from "node:test";
import { loginBackoff, remainingLoginDelay } from "./rate-limit.js";
test("backoff starts at the fifth failed login", () => { assert.equal(loginBackoff(4), 0); assert.equal(loginBackoff(5), 30); assert.equal(loginBackoff(6), 60); });
test("backoff is capped and counts down from the latest failed attempt", () => { assert.equal(loginBackoff(30), 900); assert.equal(remainingLoginDelay(5, 10_000, 25_000), 15); assert.equal(remainingLoginDelay(5, 10_000, 50_000), 0); });
