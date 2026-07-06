import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../services/api';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { isCoAdmin } from '../../utils/roles';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [myCommission, setMyCommission] = useState(null);

  useEffect(() => {
    api.get('/analytics').then((response) => setData(response.data));
    if (isCoAdmin(user?.role)) {
      api.get('/commissions/summary/me').then((response) => setMyCommission(response.data));
    }
  }, [user?.role]);

  const summary = data?.summary || {};
  const commissionTotal = (data?.commissionTotals || []).reduce((sum, item) => sum + Number(item.total || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Daily Orders" value={summary.daily_order_quantity} tone="teal" />
        <StatCard label="Weekly Orders" value={summary.weekly_order_quantity} />
        <StatCard label="Monthly Orders" value={summary.monthly_order_quantity} />
        <StatCard label="Fast Orders" value={summary.fast_orders_count} tone="orange" />
        <StatCard label="Future Orders" value={summary.future_orders_count} tone="teal" />
        <StatCard label="Completed Orders" value={summary.completed_quantity} tone="green" />
        <StatCard label="Pending Orders" value={summary.pending_quantity} />
        <StatCard label="Returned Orders" value={summary.returned_quantity} tone="rose" />
        <StatCard label="Commission Total" value={`Rs. ${commissionTotal.toLocaleString()}`} tone="teal" />
      </div>

      {isCoAdmin(user?.role) ? (
        <section className="rounded-md border border-teal-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">My CO_ADMIN Commission</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">Personal Commission Summary</h3>
            </div>
            <p className="text-sm text-slate-500">{user?.name}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Today Commission" value={`Rs. ${Number(myCommission?.today_commission || 0).toLocaleString()}`} tone="teal" />
            <StatCard label="Weekly Commission" value={`Rs. ${Number(myCommission?.weekly_commission || 0).toLocaleString()}`} />
            <StatCard label="Monthly Commission" value={`Rs. ${Number(myCommission?.monthly_commission || 0).toLocaleString()}`} />
            <StatCard label="Total Commission" value={`Rs. ${Number(myCommission?.total_commission || 0).toLocaleString()}`} tone="green" />
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {[
          ['Most Completed', data?.highlights?.mostCompleted, 'completed_orders'],
          ['Least Completed', data?.highlights?.leastCompleted, 'completed_orders'],
          ['Fastest Employee', data?.highlights?.fastest, 'avg_completion_hours']
        ].map(([label, employee, metric]) => (
          <section key={label} className="rounded-md border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">{employee?.name || 'No data'}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {metric === 'avg_completion_hours' ? `${employee?.avg_completion_hours || 0} avg hours` : `${employee?.completed_orders || 0} completed orders`}
            </p>
            <p className="mt-3 text-sm font-semibold text-teal-700">Rs. {Number(employee?.commission_total || 0).toLocaleString()} commission</p>
          </section>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-950">Weekly Order Trend</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.weeklyTrend || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-950">Employee Leaderboard</h3>
          <div className="mt-4 space-y-3">
            {(data?.leaderboard || []).map((employee, index) => (
              <div key={employee.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">#{index + 1} {employee.name}</p>
                  <span className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">{employee.completed_orders || 0} completed</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">Assigned Orders: {employee.assigned_orders || 0} · Pending {employee.pending_orders || 0}</p>
                <p className="mt-1 text-sm text-slate-600">Avg {employee.avg_completion_hours || 0} hours · Rs. {Number(employee.commission_total || 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-950">Completion Trend</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.completionTrend || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#f97316" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-md border border-orange-200 bg-orange-50 p-5">
          <h3 className="text-base font-semibold text-orange-950">Fast Order Reminders</h3>
          <div className="mt-4 space-y-3">
            {(data?.fastReminders || []).map((order) => (
              <div key={order.id} className="rounded-md border border-orange-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{order.order_number}</p>
                  <StatusBadge color="orange">Fast</StatusBadge>
                </div>
                <p className="text-sm text-slate-600">{order.customer_name} · Qty {order.order_quantity || 1} · {order.employee_name || 'Unassigned'} · Needed {order.needed_date?.slice(0, 10)}</p>
              </div>
            ))}
            {!data?.fastReminders?.length ? <p className="text-sm text-orange-800">No pending fast orders.</p> : null}
          </div>
        </section>

        <section className="rounded-md border border-sky-200 bg-sky-50 p-5">
          <h3 className="text-base font-semibold text-sky-950">Future Order Reminders</h3>
          <div className="mt-4 space-y-3">
            {(data?.futureReminders || []).map((order) => (
              <div key={order.id} className="rounded-md border border-sky-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-950">{order.order_number}</p>
                  <StatusBadge color="sky">Future</StatusBadge>
                </div>
                <p className="text-sm text-slate-600">
                  {order.customer_name} · Qty {order.order_quantity || 1} · {order.employee_name || 'Unassigned'} · Future {(order.future_needed_date || order.needed_date)?.slice(0, 10)}
                </p>
                {order.future_note ? <p className="mt-1 text-sm text-sky-800">{order.future_note}</p> : null}
              </div>
            ))}
            {!data?.futureReminders?.length ? <p className="text-sm text-sky-800">No pending future orders.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
