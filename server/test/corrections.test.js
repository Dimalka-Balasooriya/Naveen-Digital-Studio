import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionPageSchema, correctionCompletionSchema, correctionQueueQuery } from '../src/services/correction.service.js';

test('correction queue uses exact status and bounded pagination', () => {
  const spec = correctionQueueQuery({ page: 2, limit: 10 });
  assert.match(spec.sql, /BINARY s.name='Correction'/);
  assert.match(spec.sql, /LIMIT 10 OFFSET 10/);
  assert.match(spec.sql, /o.is_fast DESC, o.needed_date ASC/);
  for (const input of [{ page: 0 }, { limit: 101 }, { page: '1 OR 1=1' }]) assert.throws(() => correctionPageSchema.parse(input));
});

test('completion accepts only a history version, never arbitrary status, assignee or progress', () => {
  assert.deepEqual(correctionCompletionSchema.parse({ expected_history_id: 0 }), { expected_history_id: 0 });
  for (const body of [{}, { expected_history_id: -1 }, { expected_history_id: 0, status_id: 99 },
    { expected_history_id: 0, assigned_employee_id: 9 }, { expected_history_id: 0, production_progress: 100 }]) {
    assert.throws(() => correctionCompletionSchema.parse(body));
  }
});
