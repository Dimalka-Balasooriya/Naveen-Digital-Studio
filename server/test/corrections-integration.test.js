import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import { migrateCalling } from '../src/scripts/apply-calling-migration.js';

// Only an explicitly selected disposable local instance, never application .env settings.
test('shared corrections on disposable MySQL', { skip: process.env.CORRECTION_TEST_MYSQL !== '1' }, async t => {
  const port = Number(process.env.CORRECTION_TEST_PORT);
  assert.ok(Number.isInteger(port) && port > 1024 && port !== 3306);
  const database = `correction_test_${Date.now()}`;
  const db = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', multipleStatements: true });
  let pool, server;
  try {
    await db.query(`CREATE DATABASE ${database}`); await db.query(`USE ${database}`);
    await db.query(await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
    await db.query(await readFile(new URL('../../database/order-print-contact-fields-migration.sql', import.meta.url), 'utf8'));
    await migrateCalling(db);
    await db.query(await readFile(new URL('../../database/calling-agent-correction-status-migration.sql', import.meta.url), 'utf8'));
    for (const name of ['OWNER','CO_ADMIN','DESIGN_TEAM','PRODUCTION_EMPLOYEE']) await db.execute('INSERT IGNORE INTO roles(name) VALUES(?)',[name]);
    for (const [id,role] of [[1,'OWNER'],[2,'CO_ADMIN'],[3,'DESIGN_TEAM'],[4,'DESIGN_TEAM'],[5,'PRODUCTION_EMPLOYEE'],[6,'CALLING_AGENT'],[7,'DESIGN_TEAM']]) {
      await db.execute('INSERT INTO employees(id,role_id,name,email,password_hash,is_active) SELECT ?,id,?,?,?,? FROM roles WHERE name=?',
        [id,`Test employee ${id}`,`correction${id}@test.invalid`,'unused',id===7?0:1,role]);
    }
    await db.query("INSERT INTO customers(name,phone) VALUES('Synthetic customer','0000000000')");
    await db.query("INSERT INTO products(name,description) VALUES('Test print','Product description')");
    await db.query("INSERT INTO order_statuses(id,name) VALUES(1,'Correction'),(2,'Correction Done'),(3,'Correction Send'),(4,'Editing'),(5,'Editing Done')");
    for (let id=1;id<=8;id++) await db.execute(`INSERT INTO orders(id,order_number,customer_id,product_id,status_id,assigned_employee_id,needed_date,is_fast,is_deleted,archived_from_active_list,production_progress,design_notes)
      VALUES(?,?,1,1,?,?,CURDATE(),?,?,?,?,?)`,[id,`CORR-${id}`,id===3?2:id===4?3:1,id===5?null:id===8?5:3,id===2,id===6,id===7,45,'Keep existing design']);
    for(const id of [1,8]) await db.execute("INSERT INTO order_assignments(order_id,assigned_to_employee_id,assigned_by_admin_id,assigned_by_role,commission_amount) VALUES(?,3,1,'OWNER',100)",[id]);
    await db.query("INSERT INTO commissions(order_id,employee_id,assigned_by,commission_amount) VALUES(1,3,1,100)");
    await db.query("INSERT INTO order_status_history(order_id,from_status_id,to_status_id,changed_by,note) VALUES(1,4,1,1,'Change the background')");
    await db.query("INSERT INTO order_calling_state(order_id,calling_status,version) VALUES(1,'Correction (Call Agent)',1)");
    await db.query("INSERT INTO order_calling_requests(request_id,order_id,agent_id,payload_hash) VALUES('00000000-0000-4000-8000-000000000001',1,6,REPEAT('a',64))");
    await db.query("INSERT INTO order_calling_history(order_id,previous_status,new_status,agent_id,request_id,notes) VALUES(1,'Not Called','Correction (Call Agent)',6,'00000000-0000-4000-8000-000000000001','Customer requested blue background')");
    Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:'root',DB_PASSWORD:'',DB_NAME:database,DB_SSL:'false',DB_CONNECTION_LIMIT:'5',JWT_SECRET:'correction-local-test-only'});
    const {default:app}=await import('../src/app.js');
    ({pool}=await import('../src/config/db.js'));
    const {completeCorrection}=await import('../src/services/correction.service.js');
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const api=async(path,id,method='GET',body)=>{
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(id?{Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
      return {status:response.status,data:await response.json()};
    };
    const complete=(id,actor,version=0,extra={})=>api(`/corrections/${id}/complete`,actor,'POST',{expected_history_id:version,...extra});
    const version=async id=>Number((await db.execute('SELECT COALESCE(MAX(id),0) version FROM order_status_history WHERE order_id=?',[id]))[0][0].version);
    const reopen=async id=>{
      await db.execute('UPDATE orders SET status_id=1 WHERE id=?',[id]);
      await db.execute("INSERT INTO order_status_history(order_id,from_status_id,to_status_id,changed_by,note) VALUES(?,2,1,1,'Another correction round')",[id]);
    };
    await t.test('only authenticated active DESIGN_TEAM users can list, count or complete',async()=>{
      for(const actor of [null,1,2,5,6,7]) {
        const expected=actor===null||actor===7?401:403;
        for(const path of ['/corrections','/corrections/count']) assert.equal((await api(path,actor)).status,expected);
        assert.equal((await complete(1,actor,1)).status,expected);
      }
      assert.equal((await complete(1,4,1,{status_id:4})).status,400);
    });
    await t.test('shared queue includes exact pending designer assignments with notes and priority',async()=>{
      for(const actor of [3,4]) {
        const result=await api('/corrections',actor);assert.equal(result.status,200,JSON.stringify(result.data));
        assert.deepEqual(result.data.orders.map(o=>o.id),[2,1,8]);
        assert.equal(result.data.pagination.total,3);
        const order=result.data.orders.find(o=>o.id===1);
        assert.equal(order.original_designer_id,3);assert.equal(order.original_designer_name,'Test employee 3');
        assert.equal(order.correction_note,'Change the background');
        assert.equal(order.calling_correction_note,'Customer requested blue background');
        assert.equal(order.design_notes,'Keep existing design');
        assert.equal(order.product_description,'Product description');
        assert.equal((await api('/corrections/count',actor)).data.pending_count,3);
        assert.deepEqual((await api('/corrections?page=2&limit=1',actor)).data.orders.map(o=>o.id),[1]);
      }
    });
    await t.test('another designer completes with original assignment, commissions and calling state preserved',async()=>{
      const assignments=(await db.query('SELECT * FROM order_assignments'))[0];
      const commissions=(await db.query('SELECT * FROM commissions'))[0];
      const calling=(await db.query('SELECT * FROM order_calling_state'))[0];
      const statuses=(await db.query('SELECT * FROM order_statuses'))[0];
      const originalVersion=await version(1);
      assert.equal((await complete(1,4,originalVersion)).status,200);
      assert.equal((await complete(1,3,originalVersion)).status,409);
      const order=(await db.query('SELECT * FROM orders WHERE id=1'))[0][0];
      assert.equal(order.status_id,2);assert.equal(order.assigned_employee_id,3);assert.equal(order.production_progress,45);
      for(const [table,snapshot] of [['order_assignments',assignments],['commissions',commissions],['order_calling_state',calling],['order_statuses',statuses]])assert.deepEqual((await db.query(`SELECT * FROM ${table}`))[0],snapshot);
      const history=(await db.query('SELECT * FROM order_status_history WHERE order_id=1 ORDER BY id'))[0];
      assert.equal(history.length,2);assert.equal(history[1].changed_by,4);assert.equal(history[1].from_status_id,1);assert.equal(history[1].to_status_id,2);assert.ok(history[1].changed_at);
      assert.equal((await api('/corrections/count',3)).data.pending_count,2);
      const dashboard=await api('/production/orders',3);assert.equal(dashboard.status,200,JSON.stringify(dashboard.data));
      assert.equal(dashboard.data.find(o=>o.id===1).status_name,'Correction Done');
      assert.ok(!(await api('/production/orders',4)).data.some(o=>o.id===1));
      assert.equal((await api('/orders/1/status',4,'PATCH',{status_id:4})).status,403);
      assert.equal((await api('/production/orders/1/progress',4,'PATCH',{production_progress:100})).status,403);
    });
    await t.test('reopened corrections reappear and an old request cannot complete the new round',async()=>{
      await reopen(1);
      const queue=(await api('/corrections',4)).data.orders;
      assert.ok(queue.some(o=>o.id===1));
      assert.equal((await complete(1,4,1)).status,409);
      assert.equal((await complete(1,3,await version(1))).status,200);
      assert.equal((await db.query('SELECT COUNT(*) n FROM order_status_history WHERE order_id=1 AND to_status_id=2'))[0][0].n,2);
    });
    await t.test('concurrent designers produce one completion and one audit entry',async()=>{
      const results=await Promise.all([complete(2,3),complete(2,4)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal((await db.query('SELECT COUNT(*) n FROM order_status_history WHERE order_id=2'))[0][0].n,1);
      assert.equal((await db.query('SELECT COUNT(*) n FROM order_activity WHERE order_id=2'))[0][0].n,1);
    });
    await t.test('rejects unassigned, archived, deleted, nonpending and missing orders',async()=>{
      for(const id of [3,4,5,6,7])assert.equal((await complete(id,4)).status,409);
      assert.equal((await complete(999,4)).status,404);
      await db.query('UPDATE orders SET status_id=3 WHERE id=8');
      assert.equal((await complete(8,4)).status,409);
      await reopen(8);
    });
    await t.test('history failure rolls back status and activity',async()=>{
      const connection=await pool.getConnection();
      const wrapped={beginTransaction:()=>connection.beginTransaction(),commit:()=>connection.commit(),rollback:()=>connection.rollback(),
        execute:(sql,args)=>{if(sql.includes('INSERT INTO order_status_history'))throw Error('Injected history failure');return connection.execute(sql,args);}};
      const before=await version(8);
      try{await assert.rejects(completeCorrection(wrapped,{orderId:8,user:{id:4,role:'DESIGN_TEAM'},body:{expected_history_id:before}}),/Injected history failure/);}
      finally{connection.release();}
      assert.equal((await db.query('SELECT status_id FROM orders WHERE id=8'))[0][0].status_id,1);
      assert.equal(await version(8),before);
      assert.equal((await db.query('SELECT COUNT(*) n FROM order_activity WHERE order_id=8'))[0][0].n,0);
    });
    await t.test('missing existing destination status is rejected without creating duplicates',async()=>{
      await db.query("UPDATE order_statuses SET name='Temporarily unavailable' WHERE id=2");
      try{assert.equal((await complete(8,4,await version(8))).status,409);}
      finally{await db.query("UPDATE order_statuses SET name='Correction Done' WHERE id=2");}
      assert.equal((await complete(8,4,await version(8))).status,200);
      assert.equal((await api('/corrections/count',3)).data.pending_count,0);
    });
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    if(pool)await pool.end();
    await db.query(`DROP DATABASE IF EXISTS ${database}`);await db.end();
  }
});
