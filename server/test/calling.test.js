import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { callingUpdateSchema, listSchema, queueQuery, updateCalling, callingPriority } from '../src/services/calling.service.js';
import { migrateCalling } from '../src/scripts/apply-calling-migration.js';

const input = (status = 'No Answer', version = 0) => ({ status, notes: 'Customer contacted', expected_version: version, request_id: randomUUID() });
function fakeDatabase() {
  const db = { order: { id: 1, production_status: 'Editing Send', is_deleted: 0, deleted_at: null, archived_from_active_list: 0 },
    state: null, requests: new Map(), history: [], failHistory: false, sql: [], tail: Promise.resolve() };
  db.connection = () => {
    let snapshot, unlock;
    return {
      async beginTransaction() {},
      async execute(sql, args = []) {
        db.sql.push(sql);
        if (sql.includes('FROM orders o') && sql.includes('FOR UPDATE')) {
          const previous = db.tail; db.tail = new Promise(resolve => { unlock = resolve; }); await previous;
          snapshot = { state: db.state && { ...db.state }, requests: new Map(db.requests), history: [...db.history] };
          return [db.order ? [{ ...db.order }] : []];
        }
        if (sql.startsWith('SELECT * FROM order_calling_requests')) return [db.requests.has(args[0]) ? [db.requests.get(args[0])] : []];
        if (sql.startsWith('SELECT calling_status')) return [db.state ? [{ ...db.state }] : []];
        if (sql.startsWith('INSERT INTO order_calling_requests')) {
          db.requests.set(args[0], { request_id: args[0], order_id: args[1], agent_id: args[2], payload_hash: args[3] }); return [{}];
        }
        if (sql.startsWith('INSERT INTO order_calling_state')) { db.state = { calling_status: args[1], version: args[2] }; return [{}]; }
        if (sql.startsWith('INSERT INTO order_calling_history')) {
          if (db.failHistory) throw new Error('History insert failed'); db.history.push(args); return [{}];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      async commit() { unlock?.(); unlock = null; snapshot = null; },
      async rollback() { if (snapshot) Object.assign(db, snapshot); unlock?.(); unlock = null; snapshot = null; }
    };
  };
  db.update = (body, agentId = 7) => updateCalling(db.connection(), { orderId: 1, agentId, body });
  return db;
}

test('queue uses exact eligible names, deletion guards, bounded pagination and separate status', () => {
  const spec = queueQuery({ page: '2', limit: '25', production_status: 'Correction Send', calling_status: 'Call Back' });
  assert.deepEqual(spec.params, ['Correction Send', 'Call Back']);
  assert.match(spec.sql, /BINARY s.name IN \('Editing Send','Correction Send'\)/);
  assert.match(spec.sql, /BINARY s.name = \?/); assert.match(spec.sql, /LIMIT 25 OFFSET 25/);
  assert.match(spec.sql, /o.deleted_at IS NULL/); assert.match(spec.sql, /archived_from_active_list/);
  assert.match(spec.sql, /MAX\(h.changed_at\)/); assert.match(spec.sql, /h.to_status_id=o.status_id/);
  assert.match(spec.sql, /eligible_since ASC, o.id ASC/);
  assert.match(spec.sql, /WHEN 'Not Called' THEN 0 WHEN 'Call Back' THEN 1 WHEN 'No Answer' THEN 2 ELSE 3/);
  for (const status of ['Editing', 'Correction', 'Editing Done', 'Correction Done', 'Editing Sent', 'editing send', "Editing Send' OR 1=1"]) assert.throws(() => queueQuery({ production_status: status }));
  for (const page of [0, -1, 'oops', '1 OR 1=1']) assert.throws(() => listSchema.parse({ page }));
  assert.throws(() => listSchema.parse({ limit: 101 }));
});
test('calling priority groups are correct', () => {
  assert.deepEqual(['Not Called', 'Call Back', 'No Answer', 'Confirmed', 'Completed', 'Wrong Number'].map(callingPriority), [0, 1, 2, 3, 3, 3]);
});

test('search trims input and parameterizes literal substrings in both count and page queries', () => {
  const search = "O'Brien_%";
  const spec = queueQuery({ search: `  ${search}  `, production_status: 'Editing Send', page: 2, limit: 2 });
  assert.deepEqual(spec.params, ['Editing Send', search, search, search]);
  for (const sql of [spec.sql, spec.countSql]) {
    assert.ok(!sql.includes(search));
    assert.match(sql, /LOWER\(o.order_number\)/);
    assert.match(sql, /CAST\(o.id AS CHAR\)/);
    assert.match(sql, /LOWER\(c.name\)/);
  }
  assert.match(spec.sql, /LIMIT 2 OFFSET 2/);
  assert.deepEqual(queueQuery({ search: '   ' }).params, []);
  assert.throws(() => queueQuery({ search: 'x'.repeat(121) }));
  assert.throws(() => queueQuery({ search: ['test'] }));
});
test('invalid calling input is rejected before a transaction', async () => {
  const db = fakeDatabase();
  for (const body of [{ ...input(), status: 'Editing Send' }, { ...input(), expected_version: -1 }, { ...input(), notes: 'x'.repeat(2001) }, { ...input(), request_id: 'bad' }, { ...input(), agent_id: 99 }]) {
    await assert.rejects(db.update(body));
  }
  assert.equal(db.sql.length, 0);
  assert.equal(callingUpdateSchema.parse({ ...input(), notes: undefined }).notes, '');
});
test('default Not Called changes transactionally and records exact history without production writes', async () => {
  const db = fakeDatabase(), body = input();
  const result = await db.update(body);
  assert.deepEqual(result, { calling_status: 'No Answer', calling_version: 1, changed: true });
  assert.deepEqual(db.history[0], [1, 'Not Called', 'No Answer', 7, body.request_id, 'Customer contacted']);
  assert.equal(db.order.production_status, 'Editing Send');
  assert.ok(db.sql.every(sql => !/UPDATE orders|INSERT INTO order_status_history|commissions|production_progress/.test(sql)));
});
test('all six statuses remain independent and historical rows are preserved', async () => {
  const db = fakeDatabase();
  for (const [i, status] of ['Call Back', 'No Answer', 'Confirmed', 'Wrong Number', 'Completed', 'Not Called'].entries()) await db.update(input(status, i));
  assert.equal(db.history.length, 6); assert.equal(db.history[0][2], 'Call Back'); assert.equal(db.state.version, 6);
});
test('an eligible order can advance through multiple calling steps with one history entry per save', async () => {
  const db = fakeDatabase();
  let version = 0;
  for (const status of ['No Answer', 'Call Back', 'Confirmed']) {
    const request = input(status, version);
    const result = await db.update(request);
    version += 1;
    assert.equal(result.calling_status, status);
    assert.equal(result.calling_version, version);
    assert.equal((await db.update(request)).replayed, true);
    assert.deepEqual(queueQuery({ calling_status: status }).params, [status]);
  }
  assert.deepEqual(db.history.map((entry) => entry.slice(1, 3)), [
    ['Not Called', 'No Answer'], ['No Answer', 'Call Back'], ['Call Back', 'Confirmed']
  ]);
  assert.equal(db.order.production_status, 'Editing Send');
});
test('lost-response retry, including after a later change, never duplicates or reverts', async () => {
  const db = fakeDatabase(), first = input();
  await db.update(first); assert.equal((await db.update(first)).replayed, true);
  await db.update(input('Confirmed', 1));
  const result = await db.update(first);
  assert.equal(result.calling_status, 'Confirmed'); assert.equal(db.history.length, 2);
});
test('same status is a no-op, and its request remains idempotent after subsequent updates', async () => {
  const db = fakeDatabase(), body = input('Not Called');
  assert.equal((await db.update(body)).changed, false); assert.equal(db.history.length, 0);
  await db.update(input()); await db.update(body);
  assert.equal(db.history.length, 1); assert.equal(db.state.calling_status, 'No Answer');
});
test('reused request ID with another actor or payload is rejected', async () => {
  const db = fakeDatabase(), body = input(); await db.update(body);
  await assert.rejects(db.update(body, 8), /different update/);
  await assert.rejects(db.update({ ...body, notes: 'Different' }), /different update/);
  assert.equal(db.history.length, 1);
});
test('concurrent duplicate request creates one history entry', async () => {
  const db = fakeDatabase(), body = input();
  const results = await Promise.all([db.update(body), db.update(body)]);
  assert.equal(db.history.length, 1); assert.equal(results[1].replayed, true);
});
test('two agents with stale versions cannot overwrite each other', async () => {
  const db = fakeDatabase();
  const results = await Promise.allSettled([db.update(input('Call Back'), 7), db.update(input('Confirmed'), 8)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409); assert.equal(db.history.length, 1);
});
test('history failure rolls back status, version and request, permitting a safe retry', async () => {
  const db = fakeDatabase(), body = input(); db.failHistory = true;
  await assert.rejects(db.update(body), /History insert failed/);
  assert.equal(db.state, null); assert.equal(db.requests.size, 0); assert.equal(db.history.length, 0);
  db.failHistory = false; await db.update(body); assert.equal(db.history.length, 1);
});
test('updates recheck eligibility and reject archived/deleted/noneligible orders', async () => {
  for (const patch of [{ production_status: 'Editing' }, { production_status: 'Correction' }, { production_status: 'Correction Done' },
    { production_status: 'Editing Done' }, { production_status: 'editing send' }, { is_deleted: 1 }, { deleted_at: '2026-01-01' }, { archived_from_active_list: 1 }]) {
    const db = fakeDatabase(); Object.assign(db.order, patch); await assert.rejects(db.update(input()), /no longer eligible/); assert.equal(db.history.length, 0);
  }
  const db = fakeDatabase(); db.order.production_status = 'Correction Send'; await db.update(input()); assert.equal(db.history.length, 1);
});
test('missing order returns 404', async () => {
  const db = fakeDatabase(); db.order = null; await assert.rejects(db.update(input()), error => error.status === 404);
});
test('migration reruns safely without backfilling or modifying existing order/status records', async () => {
  let indexed = false, indexCreates = 0; const statements = [];
  const connection = { execute: async sql => {
    statements.push(sql);
    if (sql.startsWith('SELECT INDEX_NAME')) return [indexed ? [{ INDEX_NAME: 'idx_calling_eligible_history' }] : []];
    if (sql.startsWith('CREATE INDEX')) { indexed = true; indexCreates++; }
    return [{}];
  } };
  await migrateCalling(connection); await migrateCalling(connection); assert.equal(indexCreates, 1);
  assert.ok(statements.every(sql => !/^\s*(UPDATE |DELETE |DROP |TRUNCATE |INSERT INTO orders|INSERT INTO order_statuses)/.test(sql)));
  assert.equal(statements.filter(sql => sql.startsWith('CREATE TABLE IF NOT EXISTS')).length, 6);
});

test('backend role gates and paginated read routes enforce agent-only queue/update and admin history', async () => {
  const { default: router } = await import('../src/routes/calling.routes.js');
  const { pool } = await import('../src/config/db.js');
  const original = pool.execute;
  try {
    const getRoute = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
    for (const [path, method, allowed] of [['/orders', 'get', ['CALLING_AGENT']], ['/orders/:id/status', 'patch', ['CALLING_AGENT']],
      ['/orders/:id/history', 'get', ['CALLING_AGENT', 'OWNER', 'CO_ADMIN']]]) {
      for (const role of ['CALLING_AGENT', 'OWNER', 'CO_ADMIN', 'DESIGN_TEAM', 'PRODUCTION_EMPLOYEE']) {
        let passed = false, code;
        getRoute(path, method).stack[0].handle({ user: { role } }, { status(value) { code = value; return this; }, json() {} }, () => { passed = true; });
        assert.equal(passed, allowed.includes(role)); if (!passed) assert.equal(code, 403);
      }
    }
    const queries = [];
    pool.execute = async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('COUNT(*)')) return [[{ total: 26 }]];
      if (sql.includes('SELECT o.id FROM')) return [[{ id: 1 }]];
      if (sql.includes('order_calling_history h')) return [[{ id: 1, previous_status: 'Not Called', new_status: 'Call Back' }]];
      return [[{ id: 1, calling_status: 'Not Called', calling_version: 0 }]];
    };
    let output;
    const res = { json(value) { output = value; }, status() { return this; } };
    await getRoute('/orders', 'get').stack.at(-1).handle({ query: { page: '2' }, user: { role: 'CALLING_AGENT' } }, res, error => { throw error; });
    assert.equal(output.pagination.totalPages, 2); assert.equal(output.pagination.page, 2); assert.equal(output.orders[0].calling_status, 'Not Called');
    await getRoute('/orders/:id/history', 'get').stack.at(-1).handle({ params: { id: '1' }, query: {}, user: { role: 'OWNER' } }, res, error => { throw error; });
    assert.equal(output.history.length, 1); assert.equal(output.pagination.total, 26);
    assert.ok(!queries.find(q => q.sql.includes('SELECT o.id FROM')).sql.includes('BINARY s.name IN'));
  } finally { pool.execute = original; }
});

test('existing employee endpoints let OWNER/CO_ADMIN manage calling accounts but deny workers', async () => {
  const { default: router } = await import('../src/routes/employees.routes.js');
  const { pool } = await import('../src/config/db.js');
  const original = pool.execute;
  let inserted, updated;
  try {
    pool.execute = async (sql, params) => {
      if (sql.includes('information_schema.COLUMNS')) return [[{ column_count: 1 }]];
      if (sql.includes('INSERT IGNORE INTO roles')) return [{}];
      if (sql.startsWith('SELECT id FROM roles')) { assert.equal(params.role, 'CALLING_AGENT'); return [[{ id: 5 }]]; }
      if (sql.startsWith('SELECT id, deleted_at')) return [[]];
      if (sql.includes('INSERT INTO employees')) { inserted = params; return [{ insertId: 20 }]; }
      if (sql.includes('UPDATE employees')) { updated = params; return [{}]; }
      if (sql.includes('FROM employees')) return [[{ id: 20, name: 'Test caller', role: 'CALLING_AGENT', deleted_at: null, is_active: 1 }]];
      throw new Error(`Unexpected employee SQL: ${sql}`);
    };
    for (const method of ['post', 'put']) {
      const route = router.stack.find(layer => layer.route?.path === (method === 'post' ? '/' : '/:id') && layer.route.methods[method]).route;
      for (const role of ['OWNER', 'CO_ADMIN', 'CALLING_AGENT', 'DESIGN_TEAM']) {
        let passed = false;
        route.stack[1].handle({ user: { role } }, { status() { return this; }, json() {} }, () => { passed = true; });
        assert.equal(passed, ['OWNER', 'CO_ADMIN'].includes(role));
      }
      let output;
      await route.stack.at(-1).handle({ params: { id: '20' }, user: { id: 1, role: 'CO_ADMIN' },
        body: method === 'post' ? { name: 'Test caller', email: 'caller@example.test', password: 'test-only-password', role: 'CALLING_AGENT' } : { role: 'CALLING_AGENT', name: 'Updated caller' } },
      { status() { return this; }, json(value) { output = value; } }, error => { throw error; });
      assert.equal(output.role, 'CALLING_AGENT');
    }
    assert.equal(inserted.role_id, 5); assert.equal(updated.role_id, 5);
    assert.notEqual(inserted.password_hash, 'test-only-password');
  } finally { pool.execute = original; }
});

test('frontend landing routes send calling agents only to their new dashboard', async () => {
  const { homePath } = await import('../../client/src/utils/roles.js');
  assert.equal(homePath('CALLING_AGENT'), '/calling');
  for (const role of ['OWNER', 'ADMIN', 'CO_ADMIN']) assert.equal(homePath(role), '/admin');
  for (const role of ['DESIGN_TEAM', 'PRODUCTION_EMPLOYEE']) assert.equal(homePath(role), '/production');
});

test('authenticated calling agent cannot use broad legacy APIs, but existing roles retain access', async () => {
  const { pool } = await import('../src/config/db.js');
  const { authenticate } = await import('../src/middleware/auth.js');
  const { default: jwt } = await import('jsonwebtoken');
  const original = pool.execute, secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'calling-test-only-secret';
  try {
    for (const role of ['CALLING_AGENT', 'OWNER', 'CO_ADMIN', 'DESIGN_TEAM']) {
      pool.execute = async () => [[{ id: 7, role, is_active: 1 }]];
      for (const baseUrl of ['/api/orders', '/api/production', '/api/employees', '/api/calling', '/api/auth']) {
        let passed = false, code;
        await authenticate({ baseUrl, headers: { authorization: `Bearer ${jwt.sign({ id: 7 }, process.env.JWT_SECRET)}` }, query: {} },
          { status(value) { code = value; return this; }, json() {} }, () => { passed = true; });
        assert.equal(passed, role !== 'CALLING_AGENT' || ['/api/calling', '/api/auth'].includes(baseUrl));
        if (!passed) assert.equal(code, 403);
      }
    }
    let code;
    await authenticate({ headers: {}, query: {} }, { status(value) { code = value; return this; }, json() {} }, () => assert.fail('unauthenticated'));
    assert.equal(code, 401);
  } finally { pool.execute = original; if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; await pool.end(); }
});
