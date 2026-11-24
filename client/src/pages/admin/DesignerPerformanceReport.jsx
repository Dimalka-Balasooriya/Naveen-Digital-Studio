import { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { inputClass } from '../../components/FormFields';
import { colomboDate, presetDates, durationText, reportTime } from '../../utils/designerPerformance';

const columns = [['assigned_orders','Assigned'],['completed_orders','Distinct Editing Done'],['completion_events','Editing Done events'],
  ['pending_new','Pending New'],['pending_editing','Pending Editing'],['pending_correction','Pending Correction'],
  ['correction_orders','Distinct corrections'],['correction_events','Correction events']];
function Measures({row}) {
  return <>{columns.map(([key])=><td key={key} className="p-3">{row[key]}</td>)}
    {[['total_duration','average'],['total_duration','minimum'],['total_duration','maximum'],['waiting_duration','average'],['editing_duration','average']].map(([key,stat])=><td className="p-3 whitespace-nowrap" key={key+stat}>{durationText(row[key][stat])}<small className="block text-slate-500">{row[key].samples} samples</small></td>)}</>;
}
export default function DesignerPerformanceReport() {
  const reportElement=useRef(null);
  const [filters,setFilters]=useState(()=>({...presetDates('today'),designer_id:''}));
  const [preset,setPreset]=useState('today');
  const [report,setReport]=useState(null), [loading,setLoading]=useState(true), [error,setError]=useState('');
  const [exporting,setExporting]=useState(false), [revision,setRevision]=useState(0), [detailPage,setDetailPage]=useState(1);
  useEffect(()=>{
    let previous=[];
    const before=()=>{previous=Array.from(reportElement.current?.querySelectorAll('details')||[]).map(element=>[element,element.open]);previous.forEach(([element])=>{element.open=true;});};
    const after=()=>{previous.forEach(([element,open])=>{element.open=open;});previous=[];};
    window.addEventListener('beforeprint',before);window.addEventListener('afterprint',after);
    return ()=>{window.removeEventListener('beforeprint',before);window.removeEventListener('afterprint',after);after();};
  },[]);
  useEffect(()=>{
    const controller=new AbortController(); setLoading(true); setError(''); setDetailPage(1);
    api.get('/designer-performance',{params:filters,signal:controller.signal}).then(({data})=>{if(!controller.signal.aborted)setReport(data);})
      .catch(err=>{if(!controller.signal.aborted){setReport(null);setError(err.response?.data?.message || 'Could not load the report. Please retry.');}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[filters,revision]);
  function changePreset(value) { setPreset(value); if(['today','yesterday'].includes(value))setFilters(f=>({...f,...presetDates(value)})); else if(value==='date')setFilters(f=>({...f,end:f.start})); }
  async function download() {
    setExporting(true);setError('');
    try {
      const {data}=await api.get('/designer-performance/export',{params:filters,responseType:'blob'});
      const url=URL.createObjectURL(data), link=document.createElement('a');link.href=url;link.download=`designer-performance-${filters.start}-${filters.end}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch {setError('Excel export failed. Please retry.');} finally {setExporting(false);}
  }
  const details=report?.details.slice((detailPage-1)*25,detailPage*25) || [];
  return <section ref={reportElement} className="designer-performance space-y-5">
    <style>{`@media print { body * { visibility:hidden; } .designer-performance,.designer-performance * { visibility:visible; } .designer-performance { position:absolute;left:0;top:0;width:100%;font-size:9px; } .designer-performance .no-print { display:none!important; } .designer-performance .overflow-x-auto { overflow:visible; } .designer-performance table { font-size:8px; } .designer-performance td,.designer-performance th { padding:3px!important; } .designer-performance details>* { display:block!important; } .designer-performance tr { break-inside:avoid; } @page { size:landscape; margin:10mm; } }`}</style>
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-xl font-semibold">Designer Performance Report</h1><p className="text-sm text-slate-500">Asia/Colombo · Recorded production activity</p></div>
      <div className="no-print flex flex-wrap gap-2"><button disabled={loading} className="rounded border bg-white p-2 disabled:opacity-50" onClick={()=>{if(['today','yesterday'].includes(preset))setFilters(f=>({...f,...presetDates(preset)}));else setRevision(n=>n+1);}}><RefreshCw size={16} className="inline"/> Refresh</button><button disabled={loading||!report||exporting} onClick={download} className="rounded bg-teal-700 p-2 text-white disabled:opacity-50"><Download size={16} className="inline"/> {exporting?'Exporting…':'Excel export'}</button><button disabled={loading||!report} onClick={()=>window.print()} className="rounded border bg-white p-2 disabled:opacity-50"><Printer size={16} className="inline"/> Print</button></div>
    </div>
    <div className="no-print grid gap-3 rounded border bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm">Period<select value={preset} onChange={e=>changePreset(e.target.value)} className={inputClass}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="date">Custom date</option><option value="range">Date range</option></select></label>
      <label className="text-sm">{preset==='range'?'From':'Date'}<input type="date" max={colomboDate()} value={filters.start} className={inputClass} onChange={e=>{setPreset(preset==='range'?'range':'date');setFilters(f=>({...f,start:e.target.value,...(preset!=='range'?{end:e.target.value}:{})}));}}/></label>
      {preset==='range'?<label className="text-sm">To<input type="date" max={colomboDate()} min={filters.start} value={filters.end} onChange={e=>setFilters(f=>({...f,end:e.target.value}))} className={inputClass}/></label>:null}
      <label className="text-sm">Designer<select value={filters.designer_id} onChange={e=>setFilters(f=>({...f,designer_id:e.target.value}))} className={inputClass}><option value="">All Designers</option>{report?.designers.map(d=><option key={d.id} value={d.id}>{d.name}{d.is_active?'':' (inactive)'}</option>)}</select></label>
    </div>
    {error?<p role="alert" className="rounded bg-rose-50 p-3 text-rose-800">{error}</p>:null}
    {loading?<p role="status">Loading designer performance…</p>:report?<>
      <p className="text-sm">{report.range.start} – {report.range.end} · Pending snapshot: {reportTime(Date.parse(report.daily.at(-1)?.as_of))}. Range pending counts are not the sum of daily counts.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{columns.map(([key,label])=><div key={key} className="rounded border bg-white p-4"><p className="text-sm text-slate-500">{label}</p><strong className="text-2xl">{report.summary[key]}</strong></div>)}</div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[['total_duration','average','Average completion'],['total_duration','minimum','Minimum completion'],['total_duration','maximum','Maximum completion'],['waiting_duration','average','Average waiting'],['editing_duration','average','Average editing']].map(([key,stat,label])=><div key={label} className="rounded border bg-white p-3"><p className="text-sm">{label}</p><strong>{durationText(report.summary[key][stat])}</strong><p className="text-xs text-slate-500">{report.summary[key].samples} valid events</p></div>)}</div>
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm"><strong>{report.gaps.length?`${report.gaps.length} historical reconstruction gaps. Counts may be incomplete.`:'Historical coverage notes'}</strong>{report.limitations.map(text=><p className="mt-1" key={text}>{text}</p>)}</div>
      {!report.rows.length?<p>No designers found.</p>:<>
        <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm"><caption className="p-3 text-left font-semibold">Individual designer performance · durations in hours</caption><thead className="bg-slate-50"><tr><th className="p-3">Designer</th>{columns.map(([,label])=><th key={label} className="p-3">{label}</th>)}{['Average total','Min total','Max total','Average waiting','Average editing'].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{report.rows.map(row=><tr key={row.id} className="border-t"><th className="p-3">{row.name}</th><Measures row={row}/></tr>)}<tr className="border-t font-semibold"><th className="p-3">Team totals*</th><Measures row={report.summary}/></tr></tbody></table></div>
        <p className="text-xs text-slate-500">*Team distinct orders are deduplicated across designers; individual distinct counts may not sum to the team count.</p>
        <div className="no-print rounded border bg-white p-4"><h2 className="font-semibold">Completed orders by designer</h2><div style={{height:Math.max(240,report.rows.length*40)}} role="img" aria-label="Comparison of distinct Editing Done orders per designer; exact values are in the table above"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.rows} layout="vertical" margin={{left:15,right:20}}><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={100}/><Tooltip/><Bar dataKey="completed_orders" name="Distinct Editing Done orders" fill="#0f766e"/></BarChart></ResponsiveContainer></div></div>
      </>}
      <details className="rounded border bg-white p-4"><summary className="cursor-pointer font-semibold">Daily pending snapshots</summary><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Date','New','Editing','Correction','Unknown orders (team-wide)'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{report.daily.map(day=><tr key={day.date}>{[day.date,day.pending_new,day.pending_editing,day.pending_correction,day.unknown_orders].map((value,i)=><td key={i} className="p-2">{value}</td>)}</tr>)}</tbody></table></div></details>
      <details className="rounded border bg-white p-4"><summary className="cursor-pointer font-semibold">Order-level completion details ({report.details.length} events)</summary><p className="text-xs text-slate-500">Assignment and completion actors are separate. Print includes this page of details; Excel includes every event.</p>{!report.details.length?<p className="py-4">No completed orders in this period.</p>:details.map(row=><details key={row.event_id} className="my-2 rounded border p-3"><summary className="cursor-pointer">{row.order_number} · {row.designer} · {row.kind} · {reportTime(row.completed_at)}</summary><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{[['Order ID',row.order_id],['Credited designer',row.designer],['Assigned designer',row.assigned_designer],['Actual actor ID',row.actor_id],['Assignment timestamp',reportTime(row.assignment_at)],['Cycle start',reportTime(row.cycle_start)],['Editing start',reportTime(row.editing_start)],['Completion',reportTime(row.completed_at)],['Total',durationText(row.total_duration)],['Waiting',durationText(row.waiting_duration)],['Editing',durationText(row.editing_duration)]].map(([label,value])=><div key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>)}</dl>{row.limitation?<p className="mt-2 text-sm text-amber-800">{row.limitation}</p>:null}</details>)}<div className="no-print mt-3 flex justify-between"><button disabled={detailPage===1} onClick={()=>setDetailPage(n=>n-1)} className="rounded border p-2 disabled:opacity-40">Previous</button><span>Page {detailPage} of {Math.max(1,Math.ceil(report.details.length/25))}</span><button disabled={detailPage*25>=report.details.length} onClick={()=>setDetailPage(n=>n+1)} className="rounded border p-2 disabled:opacity-40">Next</button></div></details>
      {report.gaps.length?<details className="rounded border bg-white p-4"><summary className="cursor-pointer">Unavailable historical information</summary>{report.gaps.slice(0,100).map((gap,i)=><p className="py-1 text-sm" key={i}>{gap.order_number} · {gap.date||'Selected period'}: {gap.reason}</p>)}{report.gaps.length>100?<p>First 100 shown. Excel includes all gaps.</p>:null}</details>:null}
    </>:null}
  </section>;
}
