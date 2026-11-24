import { Router } from 'express';
import ExcelJS from 'exceljs';
import { authenticate, requireAdminOrCoAdmin } from '../middleware/auth.js';
import { loadDesignerPerformance } from '../services/designer-performance-data.js';

const router = Router();
router.use(authenticate, requireAdminOrCoAdmin);
router.get('/', async (req,res,next) => {
  try { res.json(await loadDesignerPerformance(req.query)); } catch(error) { next(error); }
});
const hours = value => value == null ? 'N/A' : value/3600000;
const timestamp = value => value == null ? 'N/A' : new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Colombo',hour12:false});
export function performanceWorkbook(report) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Designers');
  sheet.addRow(['Designer Performance Report', report.range.start, report.range.end, 'Asia/Colombo']);
  sheet.addRow(['Designer','Assigned orders','Distinct Editing Done orders','Editing Done events','Pending New','Pending Editing','Pending Correction','Distinct corrections','Correction events','Average total hours','Minimum total hours','Maximum total hours','Average waiting hours','Average editing hours','Total samples','Waiting samples','Editing samples']);
  for (const row of [{name:'Team total',...report.summary},...report.rows]) sheet.addRow([row.name,row.assigned_orders,row.completed_orders,row.completion_events,row.pending_new,row.pending_editing,row.pending_correction,row.correction_orders,row.correction_events,hours(row.total_duration.average),hours(row.total_duration.minimum),hours(row.total_duration.maximum),hours(row.waiting_duration.average),hours(row.editing_duration.average),row.total_duration.samples,row.waiting_duration.samples,row.editing_duration.samples]);
  const details = book.addWorksheet('Completion events');
  details.addRow(['Order ID','Order number','Credited designer','Assigned designer','Status','Actor ID','Assigned at (Colombo)','Cycle start','Editing start','Completed at','Total hours','Waiting hours','Editing hours','Limitation']);
  for (const row of report.details) details.addRow([row.order_id,row.order_number,row.designer,row.assigned_designer,row.kind,row.actor_id,timestamp(row.assignment_at),timestamp(row.cycle_start),timestamp(row.editing_start),timestamp(row.completed_at),hours(row.total_duration),hours(row.waiting_duration),hours(row.editing_duration),row.limitation]);
  const daily = book.addWorksheet('Daily pending');
  daily.addRow(['Date','Designer','Pending New','Pending Editing','Pending Correction','Unknown orders (team-wide)']);
  for (const day of report.daily) {
    daily.addRow([day.date,'Selected team',day.pending_new,day.pending_editing,day.pending_correction,day.unknown_orders]);
    for (const row of report.rows) { const counts=day.designers[row.id]; daily.addRow([day.date,row.name,counts.pending_new,counts.pending_editing,counts.pending_correction,'See team total']); }
  }
  const gaps = book.addWorksheet('Historical limitations');
  for (const text of report.limitations) gaps.addRow([text]);
  gaps.addRow(['Order','Date','Reason']);
  for (const row of report.gaps) gaps.addRow([row.order_number,row.date || 'Selected range',row.reason]);
  for (const page of book.worksheets) { page.getRow(1).font={bold:true}; page.columns.forEach(column=>{column.width=24;}); }
  return book;
}
router.get('/export', async(req,res,next) => {
  try {
    const report = await loadDesignerPerformance(req.query);
    const buffer = await performanceWorkbook(report).xlsx.writeBuffer();
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="designer-performance-${report.range.start}-${report.range.end}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch(error) { next(error); }
});
export default router;
