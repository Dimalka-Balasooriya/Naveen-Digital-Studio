import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Clock, Search, Trophy, Zap } from 'lucide-react';
import { api } from '../../services/api';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

export default function ProductionDashboard() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [reminders, setReminders] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [allCommissions, setAllCommissions] = useState([]);
  const [commissionSearch, setCommissionSearch] = useState('');
  const [commissionMonth, setCommissionMonth] = useState(new Date().toISOString().slice(0, 7));
  const [notice, setNotice] = useState('');

  async function load() {
    const [ordersRes, statsRes, remindersRes, statusesRes, commissionsRes, allCommissionsRes] = await Promise.all([
      api.get('/production/orders'),
      api.get('/production/profile/stats'),
      api.get('/reminders'),
      api.get('/lookups/statuses'),
      api.get('/production/commissions'),
      api.get('/commissions/all', { params: { month: commissionMonth } })
    ]);
    setOrders(ordersRes.data);
    setStats(statsRes.data);
    setReminders(remindersRes.data);
    setStatuses(statusesRes.data);
    setCommissions(commissionsRes.data);
    setAllCommissions(allCommissionsRes.data);
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      api.get('/reminders').then((response) => setReminders(response.data));
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [commissionMonth]);

  const filteredCommissions = allCommissions.filter((item) =>
    item.employee_name.toLowerCase().includes(commissionSearch.toLowerCase())
  );
  const topCommission = filteredCommissions[0]?.employee_id;

  async function updateProgress(order, progress) {
    await api.patch(`/production/orders/${order.id}/progress`, { production_progress: progress });
    await load();
  }

  async function updateStatus(order, statusId) {
    const { data } = await api.patch(`/orders/${order.id}/status`, { status_id: Number(statusId), note: 'Updated by production employee' });
    setNotice(data.message || 'Status updated.');
    await load();
  }

  async function markReminder(id) {
    await api.patch(`/reminders/${id}/read`);
    await load();
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assigned Orders" value={stats.assigned_orders} />
        <StatCard label="Completed Orders" value={stats.completed_orders} tone="green" />
        <StatCard label="Fast Orders" value={stats.fast_orders} tone="orange" />
        <StatCard label="Average Progress" value={`${stats.average_progress || 0}%`} tone="teal" />
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-950">My Commissions</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {commissions.map((commission) => (
            <div key={commission.id} className="rounded-md border border-slate-200 p-3">
              <p className="font-semibold text-slate-950">{commission.order_number}</p>
              {commission.paid_at ? <p className="mt-1 text-xs font-semibold text-emerald-700">Paid amount: Rs. {Number(commission.paid_amount || 0).toLocaleString()}</p> : null}
              {commission.cancelled_reason ? <p className="mt-1 text-xs font-semibold text-rose-600">{commission.cancelled_reason}</p> : null}
              <p className="mt-1 text-sm text-slate-600">Rs. {Number(commission.commission_amount).toLocaleString()} · {commission.is_payable ? 'Payable' : 'Pending delivery'}</p>
            </div>
          ))}
          {!commissions.length ? <p className="text-sm text-slate-500">No commission records yet.</p> : null}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-950">All Employee Commissions</h3>
            <p className="text-sm text-slate-500">Read-only commission summary for the team.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 pl-9 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 sm:w-64"
                placeholder="Search employee"
                value={commissionSearch}
                onChange={(event) => setCommissionSearch(event.target.value)}
              />
            </label>
            <input
              type="month"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              value={commissionMonth}
              onChange={(event) => setCommissionMonth(event.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Assigned Orders</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Pending</th>
                <th className="px-4 py-3">Monthly</th>
                <th className="px-4 py-3">Weekly</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCommissions.map((item) => (
                <tr key={item.employee_id} className={item.employee_id === topCommission ? 'bg-teal-50/80' : 'bg-white'}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    <span className="inline-flex items-center gap-2">
                      {item.employee_id === topCommission ? <Trophy size={16} className="text-teal-700" /> : null}
                      {item.employee_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{item.employee_role}</td>
                  <td className="px-4 py-3 font-semibold">Assigned Orders: {item.total_orders_assigned || 0}</td>
                  <td className="px-4 py-3">{item.completed_orders || 0}</td>
                  <td className="px-4 py-3">{item.pending_orders || 0}</td>
                  <td className="px-4 py-3 font-semibold">Rs. {Number(item.monthly_commission_total || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">Rs. {Number(item.weekly_commission_total || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">Rs. {Number(item.assigned_commission_rate || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">{item.last_commission_updated_at ? new Date(item.last_commission_updated_at).toLocaleString() : 'No updates'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredCommissions.length ? <p className="p-5 text-sm text-slate-500">No employees found.</p> : null}
        </div>
      </section>

      {reminders.length ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-900">
            <BellRing size={18} />
            <h3 className="font-semibold">Reminders</h3>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {reminders.map((reminder) => (
              <div key={reminder.id} className="rounded-md border border-amber-200 bg-white p-3">
                <p className="font-semibold text-slate-950">{reminder.title}</p>
                <p className="mt-1 text-sm text-slate-600">{reminder.message}</p>
                <button onClick={() => markReminder(reminder.id)} className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">Mark read</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-base font-semibold text-slate-950">Assigned Orders</h3>
        </div>
        <div className="grid divide-y divide-slate-100">
          {orders.map((order) => (
            <article key={order.id} className={`p-5 ${order.is_fast ? 'bg-orange-50/60' : 'bg-white'}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-slate-950">{order.order_number}</h4>
                    <StatusBadge color={order.status_color}>{order.status_name}</StatusBadge>
                    {order.is_fast ? <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700"><Zap size={13} />Fast</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{order.customer_name} · {order.customer_phone} · {order.product_name} · Qty {order.order_quantity || 1}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock size={14} /> Needed {order.needed_date?.slice(0, 10)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Assigned by {order.assigned_by_admin_name || 'Not recorded'} {order.assigned_by_role ? `(${order.assigned_by_role})` : ''} · {order.assigned_at ? new Date(order.assigned_at).toLocaleString() : 'No date'} · Commission Rs. {Number(order.assigned_commission || 0).toLocaleString()}
                  </p>
                  {order.design_notes ? <p className="mt-2 text-sm text-slate-700">{order.design_notes}</p> : null}
                </div>
                <div className="w-full lg:w-72">
                  <select className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={order.status_id} onChange={(event) => updateStatus(order, event.target.value)}>
                    {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                  </select>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">Progress</span>
                    <span className="font-semibold text-slate-950">{order.production_progress}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={order.production_progress}
                    onChange={(event) => updateProgress(order, Number(event.target.value))}
                    className="mt-3 w-full accent-teal-600"
                  />
                </div>
              </div>
            </article>
          ))}
          {!orders.length ? (
            <div className="flex items-center gap-2 p-6 text-slate-500">
              <CheckCircle2 size={18} />
              No assigned production orders.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
