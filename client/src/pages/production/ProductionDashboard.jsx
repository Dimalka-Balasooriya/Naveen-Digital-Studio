import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Clock, Download, ReceiptText, Search, Trophy, Zap } from 'lucide-react';
import { api } from '../../services/api';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { titleCase } from '../../utils/statusDisplay';
import { useAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../utils/roles';

export default function ProductionDashboard() {
  const { user } = useAuth();
  const isDesignTeam = normalizeRole(user?.role) === 'DESIGN_TEAM';
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [reminders, setReminders] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [allCommissions, setAllCommissions] = useState([]);
  const [commissionSearch, setCommissionSearch] = useState('');
  const [commissionMonth, setCommissionMonth] = useState(new Date().toISOString().slice(0, 7));
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [wholesaleBillPreview, setWholesaleBillPreview] = useState(null);

  async function load(overrides = {}) {
    setError('');
    const nextOrderStatusFilter = overrides.orderStatusFilter ?? orderStatusFilter;
    const correctionOnly = isDesignTeam && nextOrderStatusFilter === 'correction';
    const [
      ordersRes,
      statsRes,
      remindersRes,
      statusesRes,
      commissionsRes,
      allCommissionsRes
    ] = await Promise.allSettled([
      api.get('/production/orders', { params: {
        status_id: correctionOnly ? undefined : nextOrderStatusFilter || undefined,
        status: correctionOnly ? 'Correction' : undefined,
        _: Date.now()
      } }),
      api.get('/production/profile/stats'),
      api.get('/reminders'),
      api.get('/production/statuses'),
      api.get('/production/commissions'),
      api.get('/commissions/all', { params: { month: commissionMonth } })
    ]);

    if (ordersRes.status === 'fulfilled') setOrders(correctionOnly
      ? ordersRes.value.data.filter((order) => order.status_name === 'Correction'
        && (Number(order.assigned_employee_id) === Number(user.id)
          || Number(order.current_assignment_employee_id) === Number(user.id)))
      : ordersRes.value.data);
    else {
      setOrders([]);
      setError(ordersRes.reason?.response?.data?.message || 'Assigned orders could not be loaded.');
    }
    if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
    if (remindersRes.status === 'fulfilled') setReminders(remindersRes.value.data);
    if (statusesRes.status === 'fulfilled') setStatuses(statusesRes.value.data);
    else {
      const fallback = await api.get('/lookups/statuses').catch(() => ({ data: [] }));
      const allowedNames = new Set(['new', 'editing', 'editing done', 'correction send', 'correction done', 'save', 'message send']);
      setStatuses(fallback.data.filter((status) => allowedNames.has(String(status.name || '').trim().toLowerCase())));
    }
    if (commissionsRes.status === 'fulfilled') setCommissions(commissionsRes.value.data);
    if (allCommissionsRes.status === 'fulfilled') setAllCommissions(allCommissionsRes.value.data);
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

  async function applyOrderStatusFilter(value) {
    setOrderStatusFilter(value);
    await load({ orderStatusFilter: value });
  }

  async function updateStatus(order, statusId) {
    if (!statusId) return;
    const { data } = await api.patch(`/orders/${order.id}/status`, { status_id: Number(statusId), note: 'Updated by production employee' });
    setNotice(data.message || 'Status updated.');
    await load();
  }

  async function markReminder(id) {
    await api.patch(`/reminders/${id}/read`);
    await load();
  }

  async function downloadWholesaleBill(billId) {
    if (!billId) return;
    setError('');
    try {
      const { data } = await api.get(`/stock/wholesale-bills/${billId}/pdf`, { responseType: 'blob' });
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wholesale-bill-${billId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Wholesale bill could not be downloaded.');
    }
  }

  async function viewWholesaleBill(billId) {
    if (!billId) return;
    setError('');
    try {
      const { data } = await api.get(`/stock/wholesale-bills/${billId}`);
      setWholesaleBillPreview(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Wholesale bill could not be opened.');
    }
  }

  function isWholesaleOrder(order) {
    return Boolean(
      order?.is_wholesale
      || order?.linked_wholesale_bill
      || (order?.wholesale_items || []).length
    );
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assigned Orders" value={isDesignTeam && orderStatusFilter === 'correction' ? orders.length : stats.assigned_orders} />
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
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Assigned Orders</h3>
            <p className="text-sm text-slate-500">
              {orderStatusFilter ? `${orders.length} order(s) in selected status` : `${orders.length} assigned order(s) visible`}
            </p>
          </div>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 sm:w-64"
            value={orderStatusFilter}
            onChange={(event) => applyOrderStatusFilter(event.target.value)}
          >
            <option value="">All Statuses</option>
            {isDesignTeam ? <option value="correction">Correction</option> : null}
            {statuses.map((status) => <option key={status.id} value={status.id}>{titleCase(status.name)}</option>)}
          </select>
        </div>
        <div className="grid divide-y divide-slate-100">
          {orders.map((order) => (
            <article key={order.id} className={`p-5 ${order.is_fast ? 'bg-orange-50/60' : order.is_future_order ? 'bg-sky-50/60' : 'bg-white'}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-slate-950">{order.order_number}</h4>
                    <StatusBadge color={order.status_color}>{order.status_name}</StatusBadge>
                    {order.is_fast ? <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700"><Zap size={13} />Fast</span> : null}
                    {order.is_future_order ? <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700"><Clock size={13} />Future</span> : null}
                    {isWholesaleOrder(order) ? <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700"><ReceiptText size={13} />Wholesale</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{order.customer_name} · {order.customer_phone} · {order.product_name} · Qty {order.order_quantity || 1}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock size={14} /> Needed {order.needed_date?.slice(0, 10)}</p>
                  {order.is_future_order ? <p className="mt-1 text-xs font-semibold text-sky-700">Future needed {(order.future_needed_date || order.needed_date)?.slice(0, 10)}</p> : null}
                  <p className="mt-1 text-xs text-slate-500">
                    Assigned by {order.assigned_by_admin_name || 'Not recorded'} {order.assigned_by_role ? `(${order.assigned_by_role})` : ''} · {order.assigned_at ? new Date(order.assigned_at).toLocaleString() : 'No date'} · Commission Rs. {Number(order.assigned_commission || 0).toLocaleString()}
                  </p>
                  {order.is_future_order && order.future_note ? <p className="mt-2 text-sm text-sky-800">{order.future_note}</p> : null}
                  {order.design_notes ? <p className="mt-2 text-sm text-slate-700">{order.design_notes}</p> : null}
                  {isWholesaleOrder(order) ? (
                    <div className="mt-3 rounded-md border border-purple-100 bg-purple-50/70 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Wholesale Items</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {(order.wholesale_items || []).map((item) => (
                          <div key={item.id} className="rounded border border-purple-100 bg-white px-3 py-2 text-sm">
                            <p className="font-semibold text-slate-950">{item.item_name}</p>
                            <p className="text-xs text-slate-500">{item.item_code || '-'} - {item.branch_name || 'No branch'} - Qty {item.quantity}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 rounded-md border border-purple-100 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Wholesale Bill</p>
                        {order.linked_wholesale_bill ? (
                          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm text-slate-600">
                              <p className="font-semibold text-slate-950">{order.linked_wholesale_bill.bill_number}</p>
                              <p>Rs. {Number(order.linked_wholesale_bill.total_amount || 0).toLocaleString()} · {order.linked_wholesale_bill.generated_at ? new Date(order.linked_wholesale_bill.generated_at).toLocaleString() : 'Generated'}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => viewWholesaleBill(order.linked_wholesale_bill.id)}
                                className="inline-flex items-center gap-2 rounded-md border border-purple-200 px-3 py-2 text-xs font-semibold text-purple-700"
                              >
                                <ReceiptText size={14} /> View Bill
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadWholesaleBill(order.linked_wholesale_bill.id)}
                                className="inline-flex items-center gap-2 rounded-md bg-purple-700 px-3 py-2 text-xs font-semibold text-white"
                              >
                                <Download size={14} /> Download PDF
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">Wholesale bill has not been generated yet.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="w-full lg:w-72">
                  <select
                    className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={statuses.some((status) => Number(status.id) === Number(order.status_id)) ? order.status_id : ''}
                    onChange={(event) => updateStatus(order, event.target.value)}
                  >
                    <option value="" disabled>Select production status</option>
                    {statuses.map((status) => <option key={status.id} value={status.id}>{titleCase(status.name)}</option>)}
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
      {wholesaleBillPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Wholesale Bill</p>
                <h3 className="text-lg font-semibold text-slate-950">{wholesaleBillPreview.bill_number}</h3>
              </div>
              <button
                type="button"
                onClick={() => setWholesaleBillPreview(null)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-slate-500">Order</p>
                  <p className="font-semibold text-slate-950">{wholesaleBillPreview.order_number || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Customer</p>
                  <p className="font-semibold text-slate-950">{wholesaleBillPreview.customer_name || '-'}</p>
                  {wholesaleBillPreview.customer_phone ? <p className="text-slate-500">{wholesaleBillPreview.customer_phone}</p> : null}
                </div>
                <div>
                  <p className="text-slate-500">Generated</p>
                  <p className="font-semibold text-slate-950">{wholesaleBillPreview.generated_at ? new Date(wholesaleBillPreview.generated_at).toLocaleString() : '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Total</p>
                  <p className="font-semibold text-slate-950">Rs. {Number(wholesaleBillPreview.total_amount || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Branch</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(wholesaleBillPreview.items || []).map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 font-semibold text-slate-950">{item.item_name}</td>
                        <td className="px-3 py-2 text-slate-600">{item.item_code || '-'}</td>
                        <td className="px-3 py-2 text-slate-600">{item.branch_name || '-'}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{item.quantity}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-950">Rs. {Number(item.line_total || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => downloadWholesaleBill(wholesaleBillPreview.id)}
                className="inline-flex items-center gap-2 rounded-md bg-purple-700 px-4 py-2 text-sm font-semibold text-white"
              >
                <Download size={16} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
