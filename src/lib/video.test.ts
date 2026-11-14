import assert from 'node:assert/strict';
import test from 'node:test';
import { videoEmbedUrl } from './video.js';

test('builds a privacy-friendly YouTube embed', () => {
  assert.equal(
    videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
  );
  assert.equal(
    videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
  );
  assert.equal(
    videoEmbedUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
  );
});

test('builds a Vimeo embed', () => {
  assert.equal(
    videoEmbedUrl('https://vimeo.com/123456789'),
    'https://player.vimeo.com/video/123456789'
  );
  assert.equal(
    videoEmbedUrl('https://player.vimeo.com/video/123456789'),
    'https://player.vimeo.com/video/123456789'
  );
});

test('refuses unknown providers and malformed values', () => {
  assert.equal(videoEmbedUrl('https://example.com/video'), null);
  assert.equal(videoEmbedUrl('https://www.youtube.com/watch?v=short'), null);
  assert.equal(videoEmbedUrl('ftp://youtu.be/dQw4w9WgXcQ'), null);
  assert.equal(videoEmbedUrl('no es una url'), null);
  assert.equal(videoEmbedUrl(null), null);
});
