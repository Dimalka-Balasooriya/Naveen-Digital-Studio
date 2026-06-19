import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileSpreadsheet, Loader2, Printer } from 'lucide-react';
import { api } from '../../services/api';
import { inputClass } from '../../components/FormFields';

export default function ReportsPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState('day');
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [advancedType, setAdvancedType] = useState('complete_monthly_orders');
  const [employees, setEmployees] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [advancedRows, setAdvancedRows] = useState([]);
  const [previewType, setPreviewType] = useState('commissions');
  const [loading, setLoading] = useState(false);

  const advancedReports = [
    { type: 'complete_monthly_orders', title: 'Complete Monthly Order Report' },
    { type: 'return_monthly_orders', title: 'Return Monthly Order Report' },
    { type: 'cancel_monthly_orders', title: 'Cancel Monthly Order Report' },
    { type: 'closed_orders_report', title: 'Completed / Cancelled / Removed Orders Report' },
    { type: 'co_admin_performance', title: 'CO_ADMIN Performance Report' },
    { type: 'production_performance', title: 'Production Employee Performance Report' },
    { type: 'co_admin_commissions', title: 'CO_ADMIN Commission Report' },
    { type: 'production_commissions', title: 'Production Employee Commission Report' },
    { type: 'daily_attendance', title: 'Daily/Weekly/Monthly Attendance Report' }
  ];

  const params = useMemo(() => ({
    month,
    date,
    period,
    ...(employeeId ? { employee_id: employeeId } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {})
  }), [month, date, period, employeeId, role, status]);

  async function load() {
    setLoading(true);
    try {
      const [commissionRes, performanceRes, advancedRes, employeesRes, statusesRes] = await Promise.all([
        api.get('/reports/commissions', { params }),
        api.get('/reports/performance', { params }),
        api.get(`/reports/advanced/${advancedType}`, { params }),
        api.get('/employees'),
        api.get('/lookups/statuses')
      ]);
      setCommissions(commissionRes.data);
      setPerformance(performanceRes.data);
      setAdvancedRows(advancedRes.data);
      setEmployees(employeesRes.data);
      setStatuses(statusesRes.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [params, advancedType]);

  const baseUrl = api.defaults.baseURL;
  const token = localStorage.getItem('nds_token');

  function downloadUrl(type, format) {
    const search = new URLSearchParams({ ...params, token: token || '' });
    const path = type.startsWith('advanced/')
      ? `/reports/${type}/${format}`
      : `/reports/${type}/${format}`;
    return `${baseUrl}${path}?${search.toString()}`;
  }

  const commissionTotal = commissions.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
  const completedTotal = performance.reduce((sum, row) => sum + Number(row.completed_orders || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-950">Report Dashboard</h3>
          <p className="text-sm text-slate-500">Preview, filter, and download printable reports.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <input type="month" className={inputClass} value={month} onChange={(event) => setMonth(event.target.value)} />
          <input type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} />
          <select className={inputClass} value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          <select className={inputClass} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">All employees</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
          <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">All roles</option>
            <option value="CO_ADMIN">Co-admin</option>
            <option value="PRODUCTION_EMPLOYEE">Production Employee</option>
          </select>
          <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
          <select className={inputClass} value={advancedType} onChange={(event) => { setAdvancedType(event.target.value); setPreviewType('advanced'); }}>
            {advancedReports.map((report) => <option key={report.type} value={report.type}>{report.title}</option>)}
          </select>
        </div>
      </div>

      <div className="no-print grid gap-4 xl:grid-cols-3">
        {[
          { type: 'commissions', title: 'Monthly Commission Report', count: commissions.length, total: `Rs. ${commissionTotal.toLocaleString()}` },
          { type: 'performance', title: 'Employee Performance Report', count: performance.length, total: `${completedTotal} completed orders` },
          { type: `advanced/${advancedType}`, title: advancedReports.find((report) => report.type === advancedType)?.title || 'Advanced Report', count: advancedRows.length, total: 'Server-filtered' }
        ].map((report) => (
          <section key={report.type} className="rounded-md border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                  <FileSpreadsheet size={20} />
                </div>
                <h4 className="mt-3 font-semibold text-slate-950">{report.title}</h4>
                <p className="mt-1 text-sm text-slate-500">{report.count} rows · {report.total}</p>
              </div>
              {loading ? <Loader2 className="animate-spin text-slate-400" size={20} /> : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => setPreviewType(report.type.startsWith('advanced/') ? 'advanced' : report.type)} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Eye size={16} /> Preview Report</button>
              <a className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white" href={downloadUrl(report.type, 'pdf')} target="_blank" rel="noreferrer"><Download size={16} /> Download PDF</a>
              <a className="flex items-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white" href={downloadUrl(report.type, 'excel')} target="_blank" rel="noreferrer"><Download size={16} /> Download Excel</a>
              <button onClick={() => window.print()} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Printer size={16} /> Print</button>
            </div>
          </section>
        ))}
      </div>

      <section className="print-report rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <h4 className="font-semibold text-slate-950">Preview: {previewType === 'commissions' ? 'Monthly Commission Report' : previewType === 'performance' ? 'Employee Performance Report' : advancedReports.find((report) => report.type === advancedType)?.title}</h4>
        </div>
        <div className="overflow-x-auto">
          {previewType === 'advanced' ? (
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>{Object.keys(advancedRows[0] || { message: 'No data' }).map((key) => <th key={key} className="px-3 py-2">{key.replaceAll('_', ' ')}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {advancedRows.map((row, index) => (
                  <tr key={index}>{Object.entries(row).map(([key, value]) => <td key={key} className="px-3 py-2">{key.includes('time') || key.includes('_at') || key.includes('date') ? (value ? new Date(value).toLocaleString() : '-') : String(value ?? '-')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          ) : previewType === 'commissions' ? (
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Monthly Total</th><th className="px-3 py-2">Orders Count</th><th className="px-3 py-2">Latest Status</th><th className="px-3 py-2">Started</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {commissions.map((row) => <tr key={`${row.order_number}-${row.employee_name}-${row.assignment_started_at}`}><td className="px-3 py-2">{row.employee_name}</td><td className="px-3 py-2">{row.employee_role}</td><td className="px-3 py-2">{row.order_number}</td><td className="px-3 py-2">Rs. {Number(row.commission_amount).toFixed(2)}</td><td className="px-3 py-2">Rs. {Number(row.total_monthly_commission || 0).toFixed(2)}</td><td className="px-3 py-2">{row.orders_count || 0}</td><td className="px-3 py-2">{row.latest_order_status || '-'}</td><td className="px-3 py-2">{row.assignment_started_at ? new Date(row.assignment_started_at).toLocaleString() : '-'}</td></tr>)}
              </tbody>
            </table>
          ) : (
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Rank</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Completed</th><th className="px-3 py-2">Fast</th><th className="px-3 py-2">Avg Hours</th><th className="px-3 py-2">Commission</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {performance.map((row) => <tr key={row.email}><td className="px-3 py-2">{row.performance_rank}</td><td className="px-3 py-2">{row.employee_name}</td><td className="px-3 py-2">{row.email}</td><td className="px-3 py-2">{row.employee_role}</td><td className="px-3 py-2">{row.completed_orders || 0}</td><td className="px-3 py-2">{row.fast_orders_completed || 0}</td><td className="px-3 py-2">{row.average_completion_hours || 0}</td><td className="px-3 py-2">Rs. {Number(row.commission_total || 0).toFixed(2)}</td></tr>)}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
