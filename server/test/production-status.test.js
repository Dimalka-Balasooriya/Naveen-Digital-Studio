import test from 'node:test';
import assert from 'node:assert/strict';
import { designAllowedStatuses, ensureProductionAllowedStatuses, isProductionAllowedStatus } from '../src/utils/tracking.js';

test('validates an active Editing Done ID without provisioning other statuses', async () => {
  const connection = {
    async execute(sql, params) {
      assert.equal(sql, 'SELECT name FROM order_statuses WHERE id = ? AND is_active = TRUE');
      return [params[0] === 9001 ? [{ name: 'Editing Done' }] : []];
    }
  };
  assert.equal(await isProductionAllowedStatus({ statusId: 9001, connection }), true);
  assert.equal(await isProductionAllowedStatus({ statusId: 9002, connection }), false);
  assert.equal(await isProductionAllowedStatus({ statusId: 9001, connection, role: 'PRODUCTION_EMPLOYEE' }), false);
});

test('status lookup preserves inactive names without inserting duplicates or offering them', async () => {
  const rows = designAllowedStatuses.map(({ name }, index) => ({ id: index + 1, name, sort_order: index }));
  const connection = {
    async execute(sql) {
      assert.match(sql, /^SELECT /);
      return [sql.includes('WHERE is_active = TRUE') ? rows.filter(({ name }) => name !== 'Editing Send') : rows];
    }
  };
  const statuses = await ensureProductionAllowedStatuses({ connection });
  assert.ok(statuses.some(({ name }) => name === 'Editing Done'));
  assert.ok(!statuses.some(({ name }) => name === 'Editing Send'));
});
