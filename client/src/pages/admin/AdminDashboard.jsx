import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../services/api';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';

export default function AdminDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/analytics').then((response) => setData(response.data));
  }, []);

  const summary = data?.summary || {};
  const commissionTotal = (data?.commissionTotals || []).reduce((sum, item) => sum + Number(item.total || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Daily Qty" value={summary.daily_order_quantity} tone="teal" />
        <StatCard label="Weekly Qty" value={summary.weekly_order_quantity} />
        <StatCard label="Monthly Qty" value={summary.monthly_order_quantity} />
        <StatCard label="Fast Orders" value={summary.fast_orders_count} tone="orange" />
        <StatCard label="Completed Qty" value={summary.completed_quantity} tone="green" />
        <StatCard label="Pending Qty" value={summary.pending_quantity} />
        <StatCard label="Returned Qty" value={summary.returned_quantity} tone="rose" />
        <StatCard label="Commission Total" value={`Rs. ${commissionTotal.toLocaleString()}`} tone="teal" />
      </div>

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
      </div>
    </div>
  );
}
