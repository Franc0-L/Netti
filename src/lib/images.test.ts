import assert from "node:assert/strict";
import test from "node:test";
import { detectImageType, IMAGE_VARIANT_WIDTHS, MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS, UPLOAD_MAX_BYTES } from "./images.js";
test("defines the agreed upload and image derivative limits", () => { assert.equal(UPLOAD_MAX_BYTES, 2 * 1024 * 1024); assert.equal(MAX_IMAGE_PIXELS, 20_000_000); assert.equal(MAX_IMAGE_EDGE, 2560); assert.deepEqual(IMAGE_VARIANT_WIDTHS, [480, 960, 1600]); });
test("detects formats using magic bytes", () => { assert.equal(detectImageType(Uint8Array.from([255,216,255,0])), "image/jpeg"); assert.equal(detectImageType(Uint8Array.from([137,80,78,71,13,10,26,10])), "image/png"); assert.equal(detectImageType(new TextEncoder().encode("RIFF0000WEBP")), "image/webp"); assert.equal(detectImageType(new TextEncoder().encode("0000ftypavif")), "image/avif"); });
test("rejects unknown and truncated signatures", () => { assert.equal(detectImageType(new TextEncoder().encode("not an image")), null); assert.equal(detectImageType(Uint8Array.from([255,216])), null); });
