import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Eye, FileSpreadsheet, Loader2, Printer, Trophy, XCircle } from 'lucide-react';
import { api } from '../../services/api';
import { inputClass } from '../../components/FormFields';
import { useAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../utils/roles';

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`;
}

function dateText(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function ReportsPage() {
  const { user } = useAuth();
  const canManageCommission = ['OWNER', 'CO_ADMIN'].includes(normalizeRole(user?.role));
  const [activeTab, setActiveTab] = useState('commission');
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
  const [commissionOverview, setCommissionOverview] = useState({ summary: [], records: [], top_earner: null });
  const [performance, setPerformance] = useState([]);
  const [advancedRows, setAdvancedRows] = useState([]);
  const [previewType, setPreviewType] = useState('commissions');
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

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
    setError('');
    try {
      const [commissionOverviewRes, commissionRes, performanceRes, advancedRes, employeesRes, statusesRes] = await Promise.all([
        api.get('/commissions/overview', { params }),
        api.get('/reports/commissions', { params }),
        api.get('/reports/performance', { params }),
        api.get(`/reports/advanced/${advancedType}`, { params }),
        api.get('/employees'),
        api.get('/lookups/statuses')
      ]);
      setCommissionOverview(commissionOverviewRes.data);
      setCommissions(commissionRes.data);
      setPerformance(performanceRes.data);
      setAdvancedRows(advancedRes.data);
      setEmployees(employeesRes.data);
      setStatuses(statusesRes.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Reports could not be loaded.');
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
    return `${baseUrl}/reports/${type}/${format}?${search.toString()}`;
  }

  async function markPaid(record) {
    if (!confirm(`Pay commission for ${record.employee_name}? Current commission balance will become Rs. 0.`)) return;
    setActionId(record.id);
    setNotice('');
    setError('');
    try {
      const { data } = await api.patch(`/commissions/${record.id}/paid`, { is_paid: true });
      setNotice(data.message || 'Commission marked as paid.');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Commission could not be paid.');
    } finally {
      setActionId(null);
    }
  }

  async function cancelCommission(record) {
    if (!confirm(`Cancel commission for ${record.employee_name}?`)) return;
    setActionId(record.id);
    setNotice('');
    setError('');
    try {
      const { data } = await api.patch(`/commissions/${record.id}/cancel`, { reason: 'Cancelled from commission tab' });
      setNotice(data.message || 'Commission cancelled.');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Commission could not be cancelled.');
    } finally {
      setActionId(null);
    }
  }

  const commissionTotal = commissions.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
  const completedTotal = performance.reduce((sum, row) => sum + Number(row.completed_orders || 0), 0);
  const topEarner = commissionOverview.top_earner;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-950">Reports</h3>
          <p className="text-sm text-slate-500">Simple commission view plus printable business reports.</p>
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

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveTab('commission')} className={`rounded-md px-4 py-2 text-sm font-semibold ${activeTab === 'commission' ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>Commission</button>
        <button onClick={() => setActiveTab('reports')} className={`rounded-md px-4 py-2 text-sm font-semibold ${activeTab === 'reports' ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>Reports</button>
      </div>

      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div> : null}
      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      {activeTab === 'commission' ? (
        <div className="space-y-5">
          {topEarner ? (
            <section className="rounded-md border border-teal-200 bg-teal-50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-600 text-white"><Trophy size={22} /></div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">Congratulations</p>
                  <h4 className="text-xl font-semibold text-slate-950">{topEarner.employee_name}</h4>
                  <p className="text-sm text-slate-600">Highest monthly commission: {money(topEarner.monthly_commission)}</p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <h4 className="font-semibold text-slate-950">Commission Summary</h4>
              <p className="text-sm text-slate-500">Sorted from highest commission to lowest. Everyone can view this summary.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Orders</th>
                    <th className="px-4 py-3">Today</th>
                    <th className="px-4 py-3">Weekly</th>
                    <th className="px-4 py-3">Monthly</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(commissionOverview.summary || []).map((row) => (
                    <tr key={row.employee_id} className={row.employee_id === topEarner?.employee_id ? 'bg-teal-50/70' : 'bg-white'}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{row.employee_name}</td>
                      <td className="px-4 py-3">{row.employee_role}</td>
                      <td className="px-4 py-3">{row.orders_count || 0}</td>
                      <td className="px-4 py-3">{money(row.daily_commission)}</td>
                      <td className="px-4 py-3">{money(row.weekly_commission)}</td>
                      <td className="px-4 py-3 font-semibold">{money(row.monthly_commission)}</td>
                      <td className="px-4 py-3">{money(row.total_commission)}</td>
                      <td className="px-4 py-3">{money(row.paid_commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-5">
              <h4 className="font-semibold text-slate-950">Commission Records</h4>
              <p className="text-sm text-slate-500">Admin can pay or cancel individual commission records.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1160px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(commissionOverview.records || []).map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{record.employee_name}<span className="block text-xs font-normal text-slate-500">{record.employee_role}</span></td>
                      <td className="px-4 py-3">{record.order_number}</td>
                      <td className="px-4 py-3">{record.status_name}</td>
                      <td className="px-4 py-3">{record.commission_type || 'PRODUCTION'}</td>
                      <td className="px-4 py-3 font-semibold">{money(record.commission_amount)}</td>
                      <td className="px-4 py-3">{money(record.paid_amount)}</td>
                      <td className="px-4 py-3">{record.paid_at ? 'Paid' : record.cancelled_at ? `Cancelled (${record.cancelled_reason || '-'})` : record.is_payable ? 'Payable' : 'Pending'}</td>
                      <td className="px-4 py-3">{dateText(record.assignment_started_at)}</td>
                      <td className="px-4 py-3">
                        {canManageCommission && !record.paid_at && !record.cancelled_at ? (
                          <div className="flex flex-wrap gap-2">
                            <button disabled={actionId === record.id} onClick={() => markPaid(record)} className="flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60"><CheckCircle2 size={14} /> Pay</button>
                            <button disabled={actionId === record.id} onClick={() => cancelCommission(record)} className="flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60"><XCircle size={14} /> Cancel</button>
                          </div>
                        ) : <span className="text-xs text-slate-400">No action</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <>
          <div className="no-print grid gap-4 xl:grid-cols-3">
            {[
              { type: 'commissions', title: 'Monthly Commission Report', count: commissions.length, total: money(commissionTotal) },
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
                    <p className="mt-1 text-sm text-slate-500">{report.count} rows - {report.total}</p>
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
                    {commissions.map((row) => <tr key={`${row.order_number}-${row.employee_name}-${row.assignment_started_at}`}><td className="px-3 py-2">{row.employee_name}</td><td className="px-3 py-2">{row.employee_role}</td><td className="px-3 py-2">{row.order_number}</td><td className="px-3 py-2">{money(row.commission_amount)}</td><td className="px-3 py-2">{money(row.total_monthly_commission)}</td><td className="px-3 py-2">{row.orders_count || 0}</td><td className="px-3 py-2">{row.latest_order_status || '-'}</td><td className="px-3 py-2">{dateText(row.assignment_started_at)}</td></tr>)}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Rank</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Completed</th><th className="px-3 py-2">Fast</th><th className="px-3 py-2">Avg Hours</th><th className="px-3 py-2">Commission</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {performance.map((row) => <tr key={row.email}><td className="px-3 py-2">{row.performance_rank}</td><td className="px-3 py-2">{row.employee_name}</td><td className="px-3 py-2">{row.email}</td><td className="px-3 py-2">{row.employee_role}</td><td className="px-3 py-2">{row.completed_orders || 0}</td><td className="px-3 py-2">{row.fast_orders_completed || 0}</td><td className="px-3 py-2">{row.average_completion_hours || 0}</td><td className="px-3 py-2">{money(row.commission_total)}</td></tr>)}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
