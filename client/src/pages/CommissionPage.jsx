import { useEffect, useState } from 'react';
import { CheckCircle2, Trophy, WalletCards, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { inputClass } from '../components/FormFields';
import { useAuth } from '../context/AuthContext';
import { normalizeRole } from '../utils/roles';

function money(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`;
}

function dateText(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function CommissionPage() {
  const { user } = useAuth();
  const canManageCommission = ['OWNER', 'CO_ADMIN'].includes(normalizeRole(user?.role));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [overview, setOverview] = useState({ summary: [], records: [], top_earner: null });
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/commissions/overview', { params: { month } });
      setOverview(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Commission data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [month]);

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
      const { data } = await api.patch(`/commissions/${record.id}/cancel`, { reason: 'Cancelled from commission page' });
      setNotice(data.message || 'Commission cancelled.');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Commission could not be cancelled.');
    } finally {
      setActionId(null);
    }
  }

  const topEarner = overview.top_earner;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Commission</p>
          <h1 className="text-2xl font-semibold text-slate-950">Commission Dashboard</h1>
          <p className="text-sm text-slate-500">Daily, weekly, monthly, and total commission for every employee and co-admin.</p>
        </div>
        <input type="month" className={`${inputClass} max-w-xs`} value={month} onChange={(event) => setMonth(event.target.value)} />
      </div>

      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div> : null}
      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

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
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <h4 className="font-semibold text-slate-950">Commission Summary</h4>
            <p className="text-sm text-slate-500">Highest commission to lowest.</p>
          </div>
          {loading ? <span className="text-sm text-slate-500">Loading...</span> : null}
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
              {(overview.summary || []).map((row) => (
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
          {!overview.summary?.length ? <p className="p-5 text-sm text-slate-500">No commission summary yet.</p> : null}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <h4 className="font-semibold text-slate-950">Commission Records</h4>
          <p className="text-sm text-slate-500">Pay or cancel options are visible only for admin users.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1160px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(overview.records || []).map((record) => (
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
          {!overview.records?.length ? <p className="p-5 text-sm text-slate-500">No commission records yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
