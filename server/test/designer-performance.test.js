import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePerformance, reportRange, colomboDay } from '../src/services/designer-performance.js';
const time = value => Date.parse(`2026-07-${value}+05:30`);
const designers=[{id:3,name:'Designer A'},{id:4,name:'Designer B'}];
const order={id:1,order_number:'TEST-1',created:time('01T08:00:00'),status:'Editing Done',assigned_employee_id:3,is_deleted:0,archived:0};
const assignment={id:1,order_id:1,task_id:null,designer_id:3,start:time('01T08:00:00'),end:null};
const event=(id,from,to,at,actor_id=3)=>({id,order_id:1,from,to,time:time(at),actor_id});
const history=[event(1,null,'New','01T08:00:00',1),event(2,'New','Editing','01T09:00:00'),event(3,'Editing','Editing Done','01T11:00:00')];
const run=(changes={},query={start:'2026-07-01'})=>calculatePerformance({designers,orders:[order],assignments:[assignment],history,...changes},reportRange(query,time('03T12:00:00')));
test('Colombo midnight and exclusive range endpoints, dates validated',()=>{
  assert.equal(colomboDay(Date.parse('2026-07-01T18:30:00Z')),'2026-07-02');
  const r=reportRange({start:'2026-07-01'},time('03T12:00:00'));
  assert.equal(r.from,Date.parse('2026-06-30T18:30:00Z'));assert.equal(r.until,Date.parse('2026-07-01T18:30:00Z'));
  for(const query of [{start:'2026-02-30'},{start:'2027-01-01'},{start:'2025-01-01',end:'2026-01-01'},{start:'2026-07-02',end:'2026-07-01'},{designer_id:'1 OR 1=1'}])assert.throws(()=>reportRange(query,time('03T12:00:00')));
});
test('exact completion, waiting and editing durations and samples',()=>{
  const r=run();assert.equal(r.summary.assigned_orders,1);assert.equal(r.summary.completed_orders,1);
  assert.deepEqual(r.summary.total_duration,{average:10800000,minimum:10800000,maximum:10800000,samples:1});
  assert.equal(r.summary.waiting_duration.average,3600000);assert.equal(r.summary.editing_duration.average,7200000);
});
test('duplicate completion entries ignored, reopened cycles counted as events not distinct orders',()=>{
  const r=run({history:[...history,event(4,'Editing','Editing Done','01T11:01:00'),event(5,'Editing Done','New','01T12:00:00'),event(6,'New','Editing','01T13:00:00'),event(7,'Editing','Editing Done','01T14:00:00')]});
  assert.equal(r.summary.completed_orders,1);assert.equal(r.summary.completion_events,2);assert.equal(r.summary.total_duration.minimum,7200000);assert.equal(r.summary.total_duration.maximum,10800000);
});
test('reopen without New does not reuse an old cycle start',()=>{
  const r=run({history:[...history,event(4,'Editing Done','Editing','01T12:00:00'),event(5,'Editing','Editing Done','01T13:00:00')]});
  assert.equal(r.summary.completion_events,2);assert.equal(r.summary.total_duration.samples,1);assert.equal(r.details[0].total_duration,null);assert.equal(r.details[0].editing_duration,3600000);
});
test('skipped Editing and missing assignment produce N/A, never fabricated times',()=>{
  const skipped=run({history:[history[0],event(2,'New','Editing Done','01T11:00:00')]});
  assert.equal(skipped.summary.total_duration.average,10800000);assert.equal(skipped.summary.editing_duration.average,null);assert.equal(skipped.summary.waiting_duration.average,null);
  const missing=run({assignments:[]});assert.equal(missing.summary.completed_orders,1);assert.equal(missing.summary.total_duration.samples,0);
});
test('reassignment resets cycle and does not credit prior designer editing time',()=>{
  const r=run({orders:[{...order,assigned_employee_id:4}],assignments:[{...assignment,end:time('01T10:00:00')},{...assignment,id:2,designer_id:4,start:time('01T10:00:00')}],history:[history[0],history[1],event(3,'Editing','Editing Done','01T11:00:00',4)]});
  assert.equal(r.rows[0].completed_orders,0);assert.equal(r.rows[1].completed_orders,1);assert.equal(r.details[0].total_duration,3600000);assert.equal(r.details[0].editing_duration,null);assert.equal(r.summary.assigned_orders,1);
});
test('shared correction credits actor, preserves separate original assignment attribution',()=>{
  const r=run({history:[...history,event(4,'Editing Done','Correction','01T12:00:00',1),event(5,'Correction','Correction Done','01T13:00:00',4)],orders:[{...order,status:'Correction Done'}]});
  assert.equal(r.rows[0].correction_events,0);assert.equal(r.rows[1].correction_events,1);assert.equal(r.details[0].assigned_designer,'Designer A');assert.equal(r.details[0].designer,'Designer B');
});
test('past-day pending uses recorded end-of-day state, not current Editing Done',()=>{
  const r=run({history:[history[0],history[1],event(3,'Editing','Editing Done','02T11:00:00')]},{start:'2026-07-01',end:'2026-07-02'});
  assert.equal(r.daily[0].pending_editing,1);assert.equal(r.daily[1].pending_editing,0);assert.equal(r.summary.pending_editing,0);assert.equal(r.summary.completed_orders,1);
});
test('today reads current snapshot; past gaps and archive uncertainty flagged',()=>{
  const r=run({orders:[{...order,status:'Correction'}],history:[]},{start:'2026-07-03'});assert.equal(r.summary.pending_correction,1);
  const old=run({history:[]});assert.equal(old.daily[0].unknown_orders,1);assert.ok(old.gaps.length);
  const archived=run({orders:[{...order,archived:1}]});assert.equal(archived.daily[0].unknown_orders,1);
});
test('end boundary excluded, start boundary included and designer filter respected',()=>{
  const r=run({history:[event(1,null,'New','01T00:00:00'),event(2,'New','Editing Done','02T00:00:00')]});assert.equal(r.summary.completed_orders,0);
  assert.equal(run({}, {start:'2026-07-01',designer_id:'4'}).summary.completed_orders,0);
  assert.throws(()=>run({}, {start:'2026-07-01',designer_id:'999'}));
});
test('conflicting history and overlapping main assignments exclude durations',()=>{
  const r=run({history:[history[0],event(2,'Correction','Editing Done','01T11:00:00')]});assert.equal(r.summary.total_duration.samples,0);
  const overlap=run({assignments:[assignment,{...assignment,id:2,designer_id:4}]});assert.equal(overlap.summary.total_duration.samples,0);
});
test('correction status names are exact and admin actors never receive designer correction credit',()=>{
  const r=run({history:[event(1,null,'Correction','01T08:00:00'),event(2,'Correction','Correction Done','01T09:00:00',1)]});assert.equal(r.summary.correction_events,0);assert.ok(r.gaps.length);
});
test('same-second reassignment cannot invent cross-table ordering',()=>{
  const r=run({assignments:[{...assignment,end:time('01T11:00:00')},{...assignment,id:2,designer_id:4,start:time('01T11:00:00')}],history:[history[0],history[1],event(3,'Editing','Editing Done','01T11:00:00',4)]});
  assert.equal(r.details[0].assignment_at,null);assert.equal(r.details[0].total_duration,null);
});
test('Editing Done exactly at Colombo midnight belongs only to the new day',()=>{
  const data={history:[history[0],history[1],event(3,'Editing','Editing Done','02T00:00:00')]};
  assert.equal(run(data,{start:'2026-07-01'}).summary.completed_orders,0);
  assert.equal(run(data,{start:'2026-07-02'}).summary.completed_orders,1);
});
test('deletion timestamp does not retroactively erase earlier pending state',()=>{
  const r=run({orders:[{...order,status:'Editing',is_deleted:1,deleted:time('02T10:00:00')}],history:history.slice(0,2)},{start:'2026-07-01',end:'2026-07-02'});
  assert.equal(r.daily[0].pending_editing,1);assert.equal(r.daily[1].pending_editing,0);
});
test('waiting uses first Editing, editing duration uses last uninterrupted segment',()=>{
  const r=run({history:[history[0],history[1],event(3,'Editing','Correction','01T10:00:00'),event(4,'Correction','Editing','01T12:00:00'),event(5,'Editing','Editing Done','01T13:00:00')]});
  assert.equal(r.summary.total_duration.average,5*3600000);assert.equal(r.summary.waiting_duration.average,3600000);assert.equal(r.summary.editing_duration.average,3600000);
});
