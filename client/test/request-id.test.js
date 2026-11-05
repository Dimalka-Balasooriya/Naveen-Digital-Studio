import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createRequestId } from '../src/utils/requestId.js';

test('formats a UUID v4 using only getRandomValues, as on HTTP', () => {
  const httpCrypto = { getRandomValues: (bytes) => bytes.fill(0xff) };
  assert.equal(createRequestId(httpCrypto), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('generates distinct UUID v4 request IDs with HTTP and HTTPS crypto capabilities', () => {
  const httpCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const ids = [httpCrypto, webcrypto].flatMap((provider) =>
    Array.from({ length: 500 }, () => createRequestId(provider))
  );
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test('fails explicitly when secure randomness is unavailable', () => {
  assert.throws(() => createRequestId({}), /Secure random generation is unavailable/);
});
