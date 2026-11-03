import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import { migrateCalling } from '../src/scripts/apply-calling-migration.js';
import { queueQuery, updateCalling } from '../src/services/calling.service.js';

// Opt in only for an empty, disposable local MySQL instance. Never reads app DB settings.
test('Calling release: real MySQL migration, transactions, permissions and order regressions', { skip: process.env.CALLING_TEST_MYSQL !== '1' }, async t => {
  const port = Number(process.env.CALLING_TEST_PORT);
  assert.ok(Number.isInteger(port) && port > 1024 && port !== 3306, 'Specify a dedicated local test port');
  const database = `calling_release_test_${Date.now()}`;
  const options = { host: '127.0.0.1', port, user: 'root', password: '', multipleStatements: true };
  const db = await mysql.createConnection(options);
  let pool, server;
  try {
    await db.query(`CREATE DATABASE ${database}`);
    await db.query(`USE ${database}`);
    await db.query(await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
    await db.query(await readFile(new URL('../../database/order-print-contact-fields-migration.sql', import.meta.url), 'utf8'));
    await db.query("INSERT INTO roles (name) VALUES ('OWNER'),('CO_ADMIN'),('DESIGN_TEAM'),('PRODUCTION_EMPLOYEE')");
    await db.query("INSERT INTO employees (role_id,name,email,password_hash) VALUES (1,'Owner','owner@test.invalid','unused'),(2,'Co Admin','co@test.invalid','unused'),(3,'Designer','design@test.invalid','unused')");
    await db.query("INSERT INTO customers (name,phone) VALUES ('Test Customer','0000000000')");
    await db.query("INSERT INTO products (name) VALUES ('Test Product')");
    await db.query("INSERT INTO order_statuses (name) VALUES ('Editing Done'),('Correction Done'),('Correction'),('Correction Send'),('Editing'),('Billing Done')");
    for (let id = 1; id <= 10; id++) {
      const status = id <= 6 ? (id % 2 ? 1 : 2) : id - 4;
      await db.execute(`INSERT INTO orders (id,order_number,customer_id,product_id,status_id,needed_date,created_by,assigned_employee_id,assigned_co_admin_id,created_at) VALUES (?, ?,1,1,?,'2026-01-01',1,3,2,?)`, [id, `TEST-${id}`, status, `2026-01-${String(id).padStart(2,'0')} 00:00:00`]);
    }
    const beforeOrders = (await db.query('SELECT * FROM orders ORDER BY id'))[0];
    const beforeStatuses = (await db.query('SELECT * FROM order_statuses ORDER BY id'))[0];
    await t.test('migration runs twice on baseline schema and preserves existing orders/statuses', async () => {
      await migrateCalling(db); await migrateCalling(db);
      assert.deepEqual((await db.query('SELECT * FROM orders ORDER BY id'))[0], beforeOrders);
      assert.deepEqual((await db.query('SELECT * FROM order_statuses ORDER BY id'))[0], beforeStatuses);
      assert.equal((await db.query("SELECT COUNT(*) n FROM roles WHERE name='CALLING_AGENT'"))[0][0].n, 1);
      const tables = (await db.query('SHOW TABLES'))[0].map(row => Object.values(row)[0]);
      assert.equal(tables.filter(name => name.startsWith('order_calling_')).length, 3);
      assert.ok(!tables.some(name => /fardar/i.test(name)));
      const columns = (await db.query('SHOW COLUMNS FROM orders'))[0].map(row => row.Field);
      assert.ok(!columns.includes('recipient_city')); assert.ok(!columns.includes('is_exchange'));
    });
    await db.query("INSERT INTO employees (role_id,name,email,password_hash) SELECT id,'Caller','caller@test.invalid','unused' FROM roles WHERE name='CALLING_AGENT'");
    const caller = (await db.query("SELECT id FROM employees WHERE email='caller@test.invalid'"))[0][0].id;
    const body = (status, version=0) => ({status, notes:'Test note', expected_version:version, request_id:randomUUID()});
    const update = async (id, input, connection=db) => updateCalling(connection, {orderId:id, agentId:caller, body:input});
    const queue = async filters => {const q=queueQuery(filters);return (await db.execute(q.sql,q.params))[0];};
    await t.test('exact eligibility, default status and pagination execute against MySQL', async () => {
      assert.deepEqual((await queue({})).map(o=>o.id), [1,2,3,4,5,6]);
      assert.ok((await queue({})).every(o=>o.calling_status==='Not Called' && o.calling_version===0));
      assert.deepEqual((await queue({production_status:'Correction Done'})).map(o=>o.id),[2,4,6]);
      assert.deepEqual((await queue({page:2,limit:2})).map(o=>o.id),[3,4]);
      for (const id of [7,8,9,10]) await assert.rejects(update(id,body('Confirmed')), e=>e.status===409);
    });
    await t.test('persistent state, history, idempotency and priority sorting', async () => {
      const request=body('No Answer'); await update(1,request); await update(1,request);
      await update(2,body('Call Back')); await update(3,body('Confirmed')); await update(4,body('Completed')); await update(5,body('Wrong Number'));
      assert.deepEqual((await queue({})).map(o=>o.id),[6,2,1,3,4,5]);
      const history=(await db.query('SELECT * FROM order_calling_history WHERE order_id=1'))[0];
      assert.equal(history.length,1); assert.equal(history[0].previous_status,'Not Called'); assert.equal(history[0].new_status,'No Answer'); assert.equal(history[0].agent_id,caller); assert.equal(history[0].notes,'Test note');
      assert.deepEqual((await db.query('SELECT * FROM orders ORDER BY id'))[0],beforeOrders);
      assert.equal((await db.query('SELECT COUNT(*) n FROM order_status_history'))[0][0].n,0);
    });
    await t.test('failed history write rolls back request and state in MySQL', async () => {
      const request=body('Confirmed');
      const failing={beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),execute:(sql,args)=>{if(sql.startsWith('INSERT INTO order_calling_history'))throw Error('Injected history failure');return db.execute(sql,args);}};
      await assert.rejects(update(6,request,failing),/Injected history failure/);
      assert.equal((await db.query('SELECT COUNT(*) n FROM order_calling_state WHERE order_id=6'))[0][0].n,0);
      assert.equal((await db.execute('SELECT COUNT(*) n FROM order_calling_requests WHERE request_id=?',[request.request_id]))[0][0].n,0);
    });
    await t.test('concurrent agents serialize and reject stale version', async () => {
      const a=await mysql.createConnection({...options,database}),b=await mysql.createConnection({...options,database});
      try {
        const outcomes=await Promise.allSettled([update(6,body('Call Back'),a),update(6,body('No Answer'),b)]);
        assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
        assert.equal(outcomes.find(r=>r.status==='rejected').reason.status,409);
        assert.equal((await db.query('SELECT COUNT(*) n FROM order_calling_history WHERE order_id=6'))[0][0].n,1);
      } finally {await a.end();await b.end();}
    });
    Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:'root',DB_PASSWORD:'',DB_NAME:database,DB_SSL:'false',JWT_SECRET:'local-test-only-calling-release',DB_CONNECTION_LIMIT:'5'});
    const {default:app}=await import('../src/app.js');
    ({pool}=await import('../src/config/db.js'));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const api=async(path,id,method='GET',data)=>{
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{...(id?{Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`} : {}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
      return {status:response.status,body:await response.json()};
    };
    await t.test('real HTTP authentication and existing role boundaries',async()=>{
      assert.equal((await api('/calling/orders')).status,401);
      assert.equal((await api('/calling/orders',caller)).status,200);
      for(const id of [1,2,3]) assert.equal((await api('/calling/orders',id)).status,403);
      for(const route of ['/orders','/employees','/production/orders']) assert.equal((await api(route,caller)).status,403);
      for(const id of [1,2,caller]) assert.equal((await api('/calling/orders/1/history',id)).status,200);
      assert.equal((await api('/calling/orders/1/history',3)).status,403);
      assert.equal((await api('/calling/orders/1/status',1,'PATCH',body('Confirmed',1))).status,403);
    });
    await t.test('existing admin list/detail return calling state and normal edit remains available',async()=>{
      const listing=await api('/orders',1);assert.equal(listing.status,200,JSON.stringify(listing.body));
      const detail=await api('/orders/1',1);assert.equal(detail.status,200,JSON.stringify(detail.body));
      assert.equal(detail.body.calling_status,'No Answer');
      const edited=await api('/orders/1',1,'PUT',{design_notes:'Independent release regression'});
      assert.equal(edited.status,200,JSON.stringify(edited.body));assert.equal(edited.body.calling_status,'No Answer');
      assert.equal((await db.query('SELECT status_id FROM orders WHERE id=1'))[0][0].status_id,1);
      const co=await api('/orders',2);assert.equal(co.status,200,JSON.stringify(co.body));
    });
    await t.test('Correction filter still returns only assigned Correction orders',async()=>{
      const result=await api('/production/orders?status=Correction',3);
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.deepEqual(result.body.map(order=>order.id),[7]);
      assert.ok(result.body.every(order=>order.status_name==='Correction' && order.assigned_employee_id===3));
    });
    await t.test('production status change remains independent and history persists after eligibility ends',async()=>{
      const result=await api('/orders/1/status',1,'PATCH',{status_id:3,note:'Baseline status regression'});
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal((await db.query('SELECT calling_status FROM order_calling_state WHERE order_id=1'))[0][0].calling_status,'No Answer');
      assert.equal((await api('/calling/orders/1/history',caller)).status,404);
      assert.equal((await api('/calling/orders/1/history',1)).status,200);
    });
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    if(pool) await pool.end();
    await db.query(`DROP DATABASE IF EXISTS ${database}`);
    await db.end();
  }
});
