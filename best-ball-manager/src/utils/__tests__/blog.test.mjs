// Unit tests for the pure blog scheduling + author-preview helpers (TASK-263).
// Run with: node --test src/utils/__tests__/blog.test.mjs
//
// These modules are intentionally import.meta-free so they run under plain Node.
// blog.js itself can't be imported here (its top-level import.meta.glob requires
// Vite) — the date/author logic it relies on lives in these pure modules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, isAuthorEmail } from '../authorPreview.js';
import { isLive } from '../blogSchedule.js';

test('normalizeEmail lowercases and strips +tag', () => {
  assert.equal(normalizeEmail('Heithoff.Patrick+beta@gmail.com'), 'heithoff.patrick@gmail.com');
  assert.equal(normalizeEmail('heithoff.patrick@gmail.com'), 'heithoff.patrick@gmail.com');
  assert.equal(normalizeEmail('  HEITHOFF.PATRICK+anything@GMAIL.com '), 'heithoff.patrick@gmail.com');
});

test('normalizeEmail returns empty for falsy/malformed input', () => {
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(undefined), '');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail('not-an-email'), '');
  assert.equal(normalizeEmail('@nodomain.com'), '');
  assert.equal(normalizeEmail(123), '');
});

test('isAuthorEmail matches the author across +tag variants, rejects others', () => {
  assert.equal(isAuthorEmail('heithoff.patrick@gmail.com'), true);
  assert.equal(isAuthorEmail('heithoff.patrick+beta@gmail.com'), true);
  assert.equal(isAuthorEmail('Heithoff.Patrick+anything@Gmail.com'), true);
  assert.equal(isAuthorEmail('someone.else@gmail.com'), false);
  assert.equal(isAuthorEmail('heithoff.patrick@otherdomain.com'), false);
  assert.equal(isAuthorEmail(null), false);
  assert.equal(isAuthorEmail(''), false);
});

test('isLive: published + past/today date is live', () => {
  assert.equal(isLive({ status: 'published', date: '2026-06-10' }, '2026-06-15'), true);
  assert.equal(isLive({ status: 'published', date: '2026-06-15' }, '2026-06-15'), true); // on the day
});

test('isLive: published + future date is NOT live (scheduled)', () => {
  assert.equal(isLive({ status: 'published', date: '2026-06-20' }, '2026-06-15'), false);
});

test('isLive: drafts are never live regardless of date', () => {
  assert.equal(isLive({ status: 'draft', date: '2026-06-10' }, '2026-06-15'), false);
  assert.equal(isLive({ status: 'draft', date: '2026-06-20' }, '2026-06-15'), false);
});
