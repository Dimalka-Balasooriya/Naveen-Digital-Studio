import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileSpreadsheet, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { inputClass } from '../../components/FormFields';

export default function ReportsPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [employees, setEmployees] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [previewType, setPreviewType] = useState('commissions');
  const [loading, setLoading] = useState(false);

  const params = useMemo(() => ({
    month,
    ...(employeeId ? { employee_id: employeeId } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {})
  }), [month, employeeId, role, status]);

  async function load() {
    setLoading(true);
    try {
      const [commissionRes, performanceRes, employeesRes, statusesRes] = await Promise.all([
        api.get('/reports/commissions', { params }),
        api.get('/reports/performance', { params }),
        api.get('/employees'),
        api.get('/lookups/statuses')
      ]);
      setCommissions(commissionRes.data);
      setPerformance(performanceRes.data);
      setEmployees(employeesRes.data);
      setStatuses(statusesRes.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [params]);

  const baseUrl = api.defaults.baseURL;
  const token = localStorage.getItem('nds_token');

  function downloadUrl(type, format) {
    const search = new URLSearchParams({ ...params, token: token || '' });
    return `${baseUrl}/reports/${type}/${format}?${search.toString()}`;
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
          <select className={inputClass} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">All employees</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
          <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">All roles</option>
            <option value="OWNER">Owner</option>
            <option value="CO_ADMIN">Co-admin</option>
            <option value="PRODUCTION_EMPLOYEE">Production Employee</option>
          </select>
          <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {[
          { type: 'commissions', title: 'Monthly Commission Report', count: commissions.length, total: `Rs. ${commissionTotal.toLocaleString()}` },
          { type: 'performance', title: 'Employee Performance Report', count: performance.length, total: `${completedTotal} completed qty` }
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
              <button onClick={() => setPreviewType(report.type)} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Eye size={16} /> Preview Report</button>
              <a className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white" href={downloadUrl(report.type, 'pdf')} target="_blank" rel="noreferrer"><Download size={16} /> Download PDF</a>
              <a className="flex items-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white" href={downloadUrl(report.type, 'excel')} target="_blank" rel="noreferrer"><Download size={16} /> Download Excel</a>
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <h4 className="font-semibold text-slate-950">Preview: {previewType === 'commissions' ? 'Monthly Commission Report' : 'Employee Performance Report'}</h4>
        </div>
        <div className="overflow-x-auto">
          {previewType === 'commissions' ? (
            <table className="min-w-[1120px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Payable</th><th className="px-3 py-2">Assigned By</th><th className="px-3 py-2">Started</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {commissions.map((row) => <tr key={`${row.order_number}-${row.employee_name}-${row.assignment_started_at}`}><td className="px-3 py-2">{row.employee_name}</td><td className="px-3 py-2">{row.email}</td><td className="px-3 py-2">{row.order_number}</td><td className="px-3 py-2">{row.order_quantity || 1}</td><td className="px-3 py-2">Rs. {Number(row.commission_amount).toFixed(2)}</td><td className="px-3 py-2">{row.is_payable ? 'Yes' : 'Pending'}</td><td className="px-3 py-2">{row.assigned_by_name || '-'} ({row.assigned_by_role || '-'})</td><td className="px-3 py-2">{row.assignment_started_at ? new Date(row.assignment_started_at).toLocaleString() : '-'}</td></tr>)}
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
