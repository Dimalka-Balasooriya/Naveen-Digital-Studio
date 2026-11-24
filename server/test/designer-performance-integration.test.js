import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';

test('designer report: disposable MySQL and HTTP', {skip:process.env.PERFORMANCE_TEST_MYSQL !== '1'}, async t=>{
  const port=Number(process.env.PERFORMANCE_TEST_PORT);
  assert.ok(Number.isInteger(port)&&port>1024&&port!==3306);
  const database=`performance_test_${Date.now()}`;
  const db=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:'',multipleStatements:true});
  let server,pool;
  try {
    await db.query(`CREATE DATABASE ${database}`);await db.query(`USE ${database}`);await db.query("SET time_zone='+00:00'");
    await db.query(await readFile(new URL('../../database/schema.sql',import.meta.url),'utf8'));
    for(const name of ['OWNER','CO_ADMIN','DESIGN_TEAM','PRODUCTION_EMPLOYEE','CALLING_AGENT','ADMIN']) await db.execute('INSERT INTO roles(name) VALUES(?)',[name]);
    for(const [id,role] of [[1,'OWNER'],[2,'CO_ADMIN'],[3,'DESIGN_TEAM'],[4,'DESIGN_TEAM'],[5,'PRODUCTION_EMPLOYEE'],[6,'CALLING_AGENT'],[7,'ADMIN']]) {
      await db.execute('INSERT INTO employees(id,role_id,name,email,password_hash) SELECT ?,id,?,?,? FROM roles WHERE name=?',[id,`Synthetic ${id}`,`report${id}@test.invalid`,'unused',role]);
    }
    await db.query("INSERT INTO customers(name,phone) VALUES('Synthetic report customer','0000000000'); INSERT INTO products(name) VALUES('Test print'); INSERT INTO order_statuses(id,name) VALUES(1,'New'),(2,'Editing'),(3,'Editing Done'),(4,'Correction'),(5,'Correction Done')");
    await db.query("INSERT INTO orders(id,order_number,customer_id,product_id,status_id,assigned_employee_id,needed_date,created_at,production_progress) VALUES(1,'PERF-1',1,1,5,3,'2026-07-01','2026-07-01 02:30:00',45)");
    await db.query("INSERT INTO order_assignments(order_id,assigned_to_employee_id,assigned_by_admin_id,assigned_by_role,assignment_started_at) VALUES(1,3,1,'OWNER','2026-07-01 02:30:00')");
    await db.query("INSERT INTO order_status_history(order_id,from_status_id,to_status_id,changed_by,changed_at) VALUES(1,NULL,1,1,'2026-07-01 02:30:00'),(1,1,2,3,'2026-07-01 03:30:00'),(1,2,3,3,'2026-07-02 05:30:00'),(1,3,4,1,'2026-07-02 06:30:00'),(1,4,5,4,'2026-07-02 07:30:00')");
    Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:'root',DB_PASSWORD:'',DB_NAME:database,DB_SSL:'false',JWT_SECRET:'performance-local-test-only'});
    const {default:app}=await import('../src/app.js');({pool}=await import('../src/config/db.js'));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const get=(id,path='?start=2026-07-01&end=2026-07-02')=>fetch(`http://127.0.0.1:${server.address().port}/api/designer-performance${path}`,{headers:id?{Authorization:`Bearer ${jwt.sign({id},process.env.JWT_SECRET)}`}:{}});
    const snapshot=async()=>{const output={};for(const table of ['orders','order_assignments','assignment_history','order_status_history','order_activity','commissions','order_statuses'])output[table]=(await db.query(`SELECT * FROM ${table}`))[0];return output;};
    const before=await snapshot();
    await t.test('only main admin (OWNER/ADMIN) and CO_ADMIN can view or export',async()=>{
      for(const id of [1,2,7])assert.equal((await get(id)).status,200);
      for(const id of [3,4,5,6])for(const suffix of ['', '/export'])assert.equal((await get(id,`${suffix}?start=2026-07-01`)).status,403);
      assert.equal((await get(null)).status,401);
    });
    await t.test('real TIMESTAMP data yields Colombo durations and past pending snapshots',async()=>{
      const result=await(await get(1)).json();
      assert.equal(result.summary.assigned_orders,1);assert.equal(result.summary.completed_orders,1);
      assert.equal(result.summary.total_duration.average,27*3600000);assert.equal(result.summary.waiting_duration.average,3600000);
      assert.equal(result.daily[0].pending_editing,1);assert.equal(result.daily[1].pending_editing,0);
      assert.equal(result.rows.find(r=>r.id===4).correction_events,1);assert.equal(result.rows.find(r=>r.id===3).correction_events,0);
      assert.equal(result.details[0].assigned_designer,'Synthetic 3');assert.equal(result.details[0].designer,'Synthetic 4');
    });
    await t.test('date and designer inputs are validated and parameterized',async()=>{
      assert.equal((await get(1,'?start=2026-02-30')).status,400);assert.equal((await get(1,'?designer_id=1%20OR%201=1')).status,400);
      const result=await(await get(2,'?start=2026-07-01&end=2026-07-02&designer_id=4')).json();assert.equal(result.rows.length,1);assert.equal(result.summary.completed_orders,0);assert.equal(result.summary.correction_events,1);
    });
    await t.test('Excel includes summary, details, daily counts and limitations',async()=>{
      const response=await get(1,'/export?start=2026-07-01&end=2026-07-02');assert.equal(response.status,200);
      const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()));
      assert.deepEqual(book.worksheets.map(w=>w.name),['Designers','Completion events','Daily pending','Historical limitations']);
      assert.ok(book.getWorksheet('Completion events').rowCount>=3);
    });
    await t.test('all requests are read-only; order workflows and audit records unchanged',async()=>assert.deepEqual(await snapshot(),before));
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();
    await db.query(`DROP DATABASE IF EXISTS ${database}`);await db.end();
  }
});
