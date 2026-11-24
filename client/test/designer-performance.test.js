import test from 'node:test';
import assert from 'node:assert/strict';
import { colomboDate,presetDates,durationText,reportTime } from '../src/utils/designerPerformance.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculatePerformance, reportRange } from '../../server/src/services/designer-performance.js';
test('Today and Yesterday use Colombo dates at UTC day boundaries',()=>{
  const now=Date.parse('2026-07-01T18:30:00Z');assert.equal(colomboDate(now),'2026-07-02');
  assert.deepEqual(presetDates('today',now),{start:'2026-07-02',end:'2026-07-02'});assert.equal(presetDates('yesterday',now).start,'2026-07-01');
});
test('duration display distinguishes unavailable from valid zero',()=>{
  assert.equal(durationText(null),'N/A');assert.equal(durationText(0),'0.00 h');assert.equal(durationText(5400000),'1.50 h');assert.equal(reportTime(null),'N/A');
});
function renderReport(report=null,loading=false,error='') {
  const require=createRequire(import.meta.url);
  const compiled=transformSync(readFileSync(new URL('../src/pages/admin/DesignerPerformanceReport.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs',jsx:'automatic'}).code;
  const module={exports:{}};let index=0;
  const react={...React,useState(initial){index++;return React.useState(index===3?report:index===4?loading:index===5?error:initial);}};
  new Function('require','module','exports',compiled)(name=>{
    if(name==='react')return react;
    if(name==='../../services/api')return {api:{}};
    if(name==='../../components/FormFields')return {inputClass:'input'};
    if(name==='../../utils/designerPerformance')return {colomboDate,presetDates,durationText,reportTime};
    if(name==='recharts')return Object.fromEntries(['BarChart','Bar','XAxis','YAxis','Tooltip','ResponsiveContainer'].map(key=>[key,({children})=>React.createElement('div',null,children)]));
    return require(name);
  },module,module.exports);
  return renderToStaticMarkup(React.createElement(module.exports.default));
}
test('report renders loading, errors and empty states with accessible controls',()=>{
  assert.match(renderReport(null,true),/Loading designer performance/);
  assert.match(renderReport(null,false,'Unable to load'),/role="alert"/);
  const report=calculatePerformance({designers:[],orders:[],assignments:[],history:[]},reportRange({start:'2026-07-01'},Date.parse('2026-07-03T00:00:00Z')));
  const html=renderReport(report);assert.match(html,/No designers found/);assert.match(html,/No completed orders/);assert.match(html,/Excel export/);assert.match(html,/N\/A/);assert.match(html,/Asia\/Colombo/);
});
test('designer table and expandable event details preserve original and completing designer',()=>{
  const at=Date.parse('2026-07-01T00:00:00Z');
  const report=calculatePerformance({designers:[{id:3,name:'Original'},{id:4,name:'Completer'}],orders:[{id:1,order_number:'TEST-123',created:at,status:'Correction Done'}],assignments:[{id:1,order_id:1,designer_id:3,start:at,end:null}],history:[{id:1,order_id:1,from:'Correction',to:'Correction Done',time:at+3600000,actor_id:4}]},reportRange({start:'2026-07-01'},at+86400000));
  const html=renderReport(report);assert.match(html,/TEST-123/);assert.match(html,/Original/);assert.match(html,/Completer/);assert.match(html,/Assigned designer/);assert.match(html,/Daily pending snapshots/);
});
