import { useEffect, useMemo, useState } from 'react';
import { Edit3, History, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import { Field, inputClass } from '../../components/FormFields';

const emptyForm = {
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  customer_notes: '',
  product_id: '',
  facebook_page_id: '',
  status_id: '',
  assigned_employee_id: '',
  commission_amount: 0,
  needed_date: '',
  is_fast: false,
  order_quantity: 1,
  total_amount: 0,
  advance_amount: 0,
  design_notes: ''
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [lookups, setLookups] = useState({ products: [], pages: [], statuses: [], employees: [] });
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [form, setForm] = useState(emptyForm);

  const productionEmployees = useMemo(() => lookups.employees.filter((employee) => employee.role === 'production' && employee.is_active), [lookups.employees]);

  async function load() {
    const [ordersRes, productsRes, pagesRes, statusesRes, employeesRes] = await Promise.all([
      api.get('/orders', { params: { search } }),
      api.get('/lookups/products'),
      api.get('/lookups/pages'),
      api.get('/lookups/statuses'),
      api.get('/employees')
    ]);
    setOrders(ordersRes.data);
    setLookups({ products: productsRes.data, pages: pagesRes.data, statuses: statusesRes.data, employees: employeesRes.data });
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      product_id: Number(form.product_id),
      facebook_page_id: form.facebook_page_id ? Number(form.facebook_page_id) : null,
      status_id: Number(form.status_id),
      assigned_employee_id: form.assigned_employee_id ? Number(form.assigned_employee_id) : null,
      commission_amount: Number(form.commission_amount || 0),
      order_quantity: Number(form.order_quantity || 1),
      total_amount: Number(form.total_amount),
      advance_amount: Number(form.advance_amount)
    };

    if (editingOrder) {
      await api.put(`/orders/${editingOrder.id}`, payload);
    } else {
      await api.post('/orders', payload);
    }
    setModalOpen(false);
    setEditingOrder(null);
    setForm(emptyForm);
    await load();
  }

  function startEdit(order) {
    setEditingOrder(order);
    setForm({
      customer_name: order.customer_name || '',
      customer_phone: order.customer_phone || '',
      customer_address: order.customer_address || '',
      customer_notes: '',
      product_id: order.product_id || '',
      facebook_page_id: order.facebook_page_id || '',
      status_id: order.status_id || '',
      assigned_employee_id: order.assigned_employee_id || '',
      commission_amount: 0,
      needed_date: order.needed_date?.slice(0, 10) || '',
      is_fast: Boolean(order.is_fast),
      order_quantity: order.order_quantity || order.quantity || 1,
      total_amount: order.total_amount || 0,
      advance_amount: order.advance_amount || 0,
      design_notes: order.design_notes || ''
    });
    setModalOpen(true);
  }

  async function removeOrder(id) {
    if (!confirm('Delete this order?')) return;
    await api.delete(`/orders/${id}`);
    await load();
  }

  async function showDetails(order) {
    const { data } = await api.get(`/orders/${order.id}`);
    setDetailOrder(data);
  }

  async function runSearch(event) {
    event.preventDefault();
    const [ordersRes, customersRes] = await Promise.all([
      api.get('/orders', { params: { search } }),
      search ? api.get('/customers/search', { params: { q: search } }) : Promise.resolve({ data: [] })
    ]);
    setOrders(ordersRes.data);
    setCustomerHistory(customersRes.data);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={runSearch} className="flex max-w-xl flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={17} />
            <input className={`${inputClass} pl-9`} placeholder="Search by order, customer, or phone" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Search</button>
        </form>
        <button onClick={() => { setEditingOrder(null); setForm(emptyForm); setModalOpen(true); }} className="flex items-center justify-center gap-2 rounded-md bg-studio-mint px-4 py-2 text-sm font-semibold text-white">
          <Plus size={17} />
          New Order
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
        {customerHistory.length ? (
          <div className="border-b border-slate-200 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-950">Customer Search Result</h3>
            <div className="mt-3 grid gap-3">
              {customerHistory.map((customer) => (
                <div key={customer.id} className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-950">Customer: {customer.name}</p>
                  <p className="text-sm text-slate-600">Phone: {customer.phone}</p>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-semibold text-slate-700">Order History</p>
                    {customer.orders.map((order, index) => (
                      <div key={order.id} className="rounded border border-slate-100 px-3 py-2 text-sm text-slate-700">
                        {index + 1}. {order.product_name} | Qty: {order.order_quantity || 1} | FB Page: {order.facebook_page_name || 'None'} | Status: {order.status_name}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Needed</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id} className={order.is_fast ? 'bg-orange-50/70' : 'bg-white'}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {order.order_number}
                    {order.is_fast ? <span className="ml-2 rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">Fast</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{order.customer_name}</p>
                    <p className="text-xs text-slate-500">{order.customer_phone}</p>
                  </td>
                  <td className="px-4 py-3">{order.product_name}</td>
                  <td className="px-4 py-3 font-semibold">{order.order_quantity || 1}</td>
                  <td className="px-4 py-3"><StatusBadge color={order.status_color}>{order.status_name}</StatusBadge></td>
                  <td className="px-4 py-3">{order.assigned_employee_name || 'Unassigned'}</td>
                  <td className="px-4 py-3">{order.needed_date?.slice(0, 10)}</td>
                  <td className="px-4 py-3">Rs. {Number(order.total_amount).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(order)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" title="Edit order"><Edit3 size={17} /></button>
                      <button onClick={() => showDetails(order)} className="rounded-md p-2 text-teal-700 hover:bg-teal-50" title="Status history"><History size={17} /></button>
                      <button onClick={() => removeOrder(order.id)} className="rounded-md p-2 text-rose-600 hover:bg-rose-50" title="Delete order"><Trash2 size={17} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={editingOrder ? 'Edit Order' : 'Create Order'} open={modalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name"><input className={inputClass} value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} required /></Field>
          <Field label="Phone number"><input className={inputClass} value={form.customer_phone} onChange={(event) => setForm({ ...form, customer_phone: event.target.value })} required /></Field>
          <Field label="Address"><input className={inputClass} value={form.customer_address} onChange={(event) => setForm({ ...form, customer_address: event.target.value })} /></Field>
          <Field label="Needed date"><input type="date" className={inputClass} value={form.needed_date} onChange={(event) => setForm({ ...form, needed_date: event.target.value })} required /></Field>
          <Field label="Product"><select className={inputClass} value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })} required><option value="">Select</option>{lookups.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Facebook page"><select className={inputClass} value={form.facebook_page_id} onChange={(event) => setForm({ ...form, facebook_page_id: event.target.value })}><option value="">None</option>{lookups.pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Status"><select className={inputClass} value={form.status_id} onChange={(event) => setForm({ ...form, status_id: event.target.value })} required><option value="">Select</option>{lookups.statuses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Assigned employee"><select className={inputClass} value={form.assigned_employee_id} onChange={(event) => setForm({ ...form, assigned_employee_id: event.target.value })}><option value="">Unassigned</option>{productionEmployees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Commission amount"><input type="number" min="0" className={inputClass} value={form.commission_amount} onChange={(event) => setForm({ ...form, commission_amount: event.target.value })} /></Field>
          <Field label="Order Quantity"><input type="number" min="1" required className={inputClass} value={form.order_quantity} onChange={(event) => setForm({ ...form, order_quantity: event.target.value })} /></Field>
          <Field label="Total amount"><input type="number" min="0" className={inputClass} value={form.total_amount} onChange={(event) => setForm({ ...form, total_amount: event.target.value })} /></Field>
          <Field label="Advance amount"><input type="number" min="0" className={inputClass} value={form.advance_amount} onChange={(event) => setForm({ ...form, advance_amount: event.target.value })} /></Field>
          <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.is_fast} onChange={(event) => setForm({ ...form, is_fast: event.target.checked })} /> Fast order</label>
          <div className="sm:col-span-2"><Field label="Design notes"><textarea className={inputClass} rows="3" value={form.design_notes} onChange={(event) => setForm({ ...form, design_notes: event.target.value })} /></Field></div>
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save order</button>
          </div>
        </form>
      </Modal>

      <Modal title={`Status History ${detailOrder?.order_number || ''}`} open={Boolean(detailOrder)} onClose={() => setDetailOrder(null)}>
        <div className="grid gap-5 lg:grid-cols-3">
          <section>
            <h4 className="font-semibold text-slate-950">Status Updates</h4>
            <div className="mt-3 space-y-3">
              {(detailOrder?.history || []).map((item) => (
                <div key={item.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-950">{item.from_status_name || 'New'} → {item.to_status_name}</p>
                  <p className="mt-1 text-xs text-slate-500">By {item.changed_by_name} · {new Date(item.changed_at).toLocaleString()}</p>
                  {item.note ? <p className="mt-2 text-sm text-slate-600">{item.note}</p> : null}
                </div>
              ))}
            </div>
          </section>
          <section>
            <h4 className="font-semibold text-slate-950">Commission Records</h4>
            <div className="mt-3 space-y-3">
              {(detailOrder?.commissions || []).map((item) => (
                <div key={item.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-950">{item.employee_name}</p>
                  <p className="mt-1 text-sm text-slate-600">Rs. {Number(item.commission_amount).toLocaleString()} · {item.is_active ? 'Current' : 'Previous'} · {item.is_payable ? 'Payable' : 'Pending delivery'}</p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h4 className="font-semibold text-slate-950">Assignment History</h4>
            <div className="mt-3 space-y-3">
              {(detailOrder?.assignmentHistory || []).map((item) => (
                <div key={item.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-950">
                    {item.old_employee_name || 'Unassigned'} → {item.new_employee_name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Assigned by {item.changed_by_name} ({item.changed_by_role}) · {new Date(item.changed_at).toLocaleString()}
                  </p>
                  {item.reason ? <p className="mt-2 text-sm text-slate-600">{item.reason}</p> : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      </Modal>
    </div>
  );
}
