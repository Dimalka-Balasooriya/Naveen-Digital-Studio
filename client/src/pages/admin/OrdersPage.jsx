import { useEffect, useMemo, useState } from 'react';
import { Download, Edit3, History, Plus, Printer, ReceiptText, Search, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import { Field, inputClass } from '../../components/FormFields';
import { useAuth } from '../../context/AuthContext';
import { normalizeRole } from '../../utils/roles';
import { titleCase } from '../../utils/statusDisplay';

const emptyForm = {
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  customer_notes: '',
  product_id: '',
  product_name: '',
  facebook_page_id: '',
  courier_service_id: '',
  tracking_number: '',
  status_id: '',
  assigned_employee_id: '',
  commission_amount: 0,
  production_commission_amount: 0,
  co_admin_id: '',
  co_admin_commission_amount: 0,
  needed_date: '',
  is_fast: false,
  order_quantity: 1,
  total_amount: 0,
  advance_amount: 0,
  design_notes: ''
};

function isCancelledStatus(statusName) {
  return ['cancel', 'cancelled', 'canceled'].includes(String(statusName || '').trim().toLowerCase());
}

function isCompleteStatus(statusName) {
  return ['complete', 'completed'].includes(String(statusName || '').trim().toLowerCase());
}

export default function OrdersPage() {
  const { user } = useAuth();
  const isCoAdmin = normalizeRole(user?.role) === 'CO_ADMIN';
  const [orders, setOrders] = useState([]);
  const [lookups, setLookups] = useState({ products: [], pages: [], couriers: [], statuses: [], filterStatuses: [], employees: [] });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [assignedOrdersCount, setAssignedOrdersCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [billOrder, setBillOrder] = useState(null);
  const [billPreview, setBillPreview] = useState(null);
  const [manualPrice, setManualPrice] = useState('');
  const [customerHistory, setCustomerHistory] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [completionOrder, setCompletionOrder] = useState(null);
  const [completionStatusId, setCompletionStatusId] = useState('');
  const [completionCandidates, setCompletionCandidates] = useState([]);
  const [completionAmounts, setCompletionAmounts] = useState({});
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [payingCommissionId, setPayingCommissionId] = useState(null);

  const productionEmployees = useMemo(() => lookups.employees.filter((employee) => employee.role === 'PRODUCTION_EMPLOYEE' && employee.is_active), [lookups.employees]);
  const coAdmins = useMemo(() => lookups.employees.filter((employee) => employee.role === 'CO_ADMIN' && employee.is_active), [lookups.employees]);

  async function loadLookups() {
    const cacheBust = Date.now();
    const [productsRes, pagesRes, couriersRes, statusesRes, filterStatusesRes, employeesRes] = await Promise.all([
      api.get('/lookups/products', { params: { _: cacheBust } }),
      api.get('/lookups/pages', { params: { _: cacheBust } }),
      api.get('/lookups/couriers', { params: { _: cacheBust } }),
      api.get('/lookups/statuses', { params: { _: cacheBust } }),
      api.get('/lookups/statuses', { params: { include_inactive: true, _: cacheBust } }),
      api.get('/employees', { params: { _: cacheBust } })
    ]);
    setLookups({ products: productsRes.data, pages: pagesRes.data, couriers: couriersRes.data, statuses: statusesRes.data, filterStatuses: filterStatusesRes.data, employees: employeesRes.data });
  }

  async function load() {
    setError('');
    try {
      const [ordersRes, assignedCountRes] = await Promise.all([
        api.get('/orders', { params: { search, status: statusFilter || undefined, assigned_only: assignedOnly ? 'true' : undefined, _: Date.now() } }),
        isCoAdmin ? api.get('/orders', { params: { assigned_only: 'true', _: Date.now() } }) : Promise.resolve({ data: [] }),
        loadLookups()
      ]);
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setAssignedOrdersCount(Array.isArray(assignedCountRes.data) ? assignedCountRes.data.length : 0);
    } catch (requestError) {
      setOrders([]);
      setError(requestError.response?.data?.message || requestError.message || 'Orders could not be loaded.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (savingOrder) return;
    setSavingOrder(true);
    setError('');
    setNotice('');
    const payload = {
      ...form,
      product_id: form.product_id ? Number(form.product_id) : null,
      product_name: form.product_name?.trim() || null,
      facebook_page_id: form.facebook_page_id ? Number(form.facebook_page_id) : null,
      courier_service_id: form.courier_service_id ? Number(form.courier_service_id) : null,
      tracking_number: form.tracking_number?.trim() || null,
      status_id: Number(form.status_id),
      assigned_employee_id: form.assigned_employee_id ? Number(form.assigned_employee_id) : null,
      commission_amount: Number(form.commission_amount || 0),
      production_commission_amount: Number(form.production_commission_amount || form.commission_amount || 0),
      co_admin_id: form.co_admin_id ? Number(form.co_admin_id) : null,
      co_admin_commission_amount: Number(form.co_admin_commission_amount || 0),
      order_quantity: Number(form.order_quantity || 1),
      total_amount: Number(form.total_amount),
      advance_amount: Number(form.advance_amount)
    };
    const selectedStatus = lookups.statuses.find((status) => Number(status.id) === Number(payload.status_id));
    const shouldOpenCompletionPopup = editingOrder
      && Number(payload.status_id) !== Number(editingOrder.status_id)
      && isCompleteStatus(selectedStatus?.name);

    try {
      if (editingOrder) {
        const savePayload = shouldOpenCompletionPopup ? { ...payload, status_id: Number(editingOrder.status_id) } : payload;
        const { data } = await api.put(`/orders/${editingOrder.id}`, savePayload);
        setNotice(data.message || 'Order updated.');
        if (shouldOpenCompletionPopup) {
          const candidatesRes = await api.get(`/orders/${editingOrder.id}/completion-commissions`);
          const candidates = candidatesRes.data.candidates || [];
          setCompletionOrder(candidatesRes.data.order);
          setCompletionStatusId(payload.status_id);
          setCompletionCandidates(candidates);
          setCompletionAmounts(Object.fromEntries(candidates.map((candidate) => [
            `${candidate.employee_id}-${candidate.commission_type}`,
            candidate.existing_commission_amount ?? 0
          ])));
          setModalOpen(false);
          setEditingOrder(null);
          setForm(emptyForm);
          await load();
          return;
        }
      } else {
        if (isCompleteStatus(selectedStatus?.name)) {
          setError('Create the order first, then change status to complete to add commissions.');
          return;
        }
        const { data } = await api.post('/orders', payload);
        setNotice(data.message || 'Order created.');
      }
      setModalOpen(false);
      setEditingOrder(null);
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Order could not be saved.');
    } finally {
      setSavingOrder(false);
    }
  }

  async function startEdit(order) {
    await loadLookups();
    setEditingOrder(order);
    setForm({
      customer_name: order.customer_name || '',
      customer_phone: order.customer_phone || '',
      customer_address: order.customer_address || '',
      customer_notes: '',
      product_id: order.product_id || '',
      product_name: '',
      facebook_page_id: order.facebook_page_id || '',
      courier_service_id: order.courier_service_id || '',
      tracking_number: order.tracking_number || '',
      status_id: order.status_id || '',
      assigned_employee_id: order.assigned_employee_id || '',
      commission_amount: order.current_commission_amount || 0,
      production_commission_amount: order.current_commission_amount || 0,
      co_admin_id: order.assigned_co_admin_id || order.current_co_admin_id || '',
      co_admin_commission_amount: order.current_co_admin_commission_amount || 0,
      needed_date: order.needed_date?.slice(0, 10) || '',
      is_fast: Boolean(order.is_fast),
      order_quantity: order.order_quantity || order.quantity || 1,
      total_amount: order.total_amount || 0,
      advance_amount: order.advance_amount || 0,
      design_notes: order.design_notes || ''
    });
    setModalOpen(true);
  }

  async function openCreateOrder() {
    await loadLookups();
    setEditingOrder(null);
    setForm(emptyForm);
    setError('');
    setModalOpen(true);
  }

  async function completeOrder({ withCommissions }) {
    if (!completionOrder || savingCompletion) return;
    setSavingCompletion(true);
    setError('');
    setNotice('');
    try {
      const commissions = withCommissions
        ? completionCandidates.map((candidate) => ({
          employee_id: Number(candidate.employee_id),
          user_role: candidate.user_role,
          commission_type: candidate.commission_type,
          commission_amount: Number(completionAmounts[`${candidate.employee_id}-${candidate.commission_type}`] || 0)
        }))
        : [];

      const { data } = await api.post(`/orders/${completionOrder.id}/complete`, {
        status_id: Number(completionStatusId),
        commissions,
        note: withCommissions ? 'Completed with manual commissions' : 'Completed without commission'
      });
      setNotice(data.message || 'Order completed.');
      setCompletionOrder(null);
      setCompletionStatusId('');
      setCompletionCandidates([]);
      setCompletionAmounts({});
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Order could not be completed.');
    } finally {
      setSavingCompletion(false);
    }
  }

  async function removeOrder(id) {
    if (!confirm('Remove this order from active list? It will remain in customer history and reports.')) return;
    try {
      const { data } = await api.delete(`/orders/${id}`);
      setNotice(data.message || 'Order removed from active list.');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Order could not be removed.');
    }
  }

  async function showDetails(order) {
    const { data } = await api.get(`/orders/${order.id}`);
    setDetailOrder(data);
  }

  async function markCommissionPaid(commission) {
    if (!confirm(`Mark ${commission.employee_name}'s commission as paid? The current commission balance will show Rs. 0.`)) return;
    setPayingCommissionId(commission.id);
    setError('');
    try {
      const { data } = await api.patch(`/commissions/${commission.id}/paid`, { is_paid: true });
      setNotice(data.message || 'Commission marked as paid.');
      if (detailOrder) {
        const refreshed = await api.get(`/orders/${detailOrder.id}`);
        setDetailOrder(refreshed.data);
      }
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Commission could not be marked as paid.');
    } finally {
      setPayingCommissionId(null);
    }
  }

  async function showCustomerProfile(order) {
    setError('');
    try {
      const { data } = await api.get(`/customers/by-whatsapp/${encodeURIComponent(order.customer_phone)}`);
      setCustomerProfile(data);
      setDetailOrder(null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Customer profile could not be opened.');
    }
  }

  function openBillModal(order) {
    setBillOrder(order);
    setBillPreview(null);
    setManualPrice(order.total_amount && Number(order.total_amount) > 0 ? String(order.total_amount) : '');
  }

  async function generateBill(event) {
    event.preventDefault();
    if (savingBill) return;
    setSavingBill(true);
    setError('');
    try {
      const { data } = await api.post(`/orders/${billOrder.id}/generate-bill`, {
        manual_price: Number(manualPrice)
      });
      setNotice(data.message || 'Bill generated successfully.');
      setBillPreview(data.preview);
      setManualPrice('');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Bill could not be generated.');
    } finally {
      setSavingBill(false);
    }
  }

  function billHtml() {
    if (!billPreview) return '';
    const assignmentRows = (billPreview.assignmentHistory || []).map((item) => `
      <tr>
        <td>${item.assigned_employee_name || '-'}</td>
        <td>${item.assigned_employee_role || '-'}</td>
        <td>${item.assigned_by_name || '-'} (${item.assigned_by_role || '-'})</td>
        <td>${item.changed_at ? new Date(item.changed_at).toLocaleString() : '-'}</td>
      </tr>
    `).join('');
    const statusRows = (billPreview.statusHistory || []).map((item) => `
      <tr>
        <td>${item.old_status_name || 'New'}</td>
        <td>${item.new_status_name || '-'}</td>
        <td>${item.changed_by_name || '-'} (${item.changed_by_role || '-'})</td>
        <td>${item.changed_at ? new Date(item.changed_at).toLocaleString() : '-'}</td>
      </tr>
    `).join('');

    return `<!doctype html>
      <html>
        <head>
          <title>Invoice ${billPreview.order.order_number}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
            .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 16px; }
            .logo { width: 180px; height: auto; }
            h1 { margin: 8px 0 0; font-size: 28px; }
            h2 { margin-top: 28px; font-size: 18px; }
            .muted { color: #64748b; font-size: 13px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
            .box { border: 1px solid #e5e7eb; padding: 14px; border-radius: 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; }
            .total { font-size: 22px; font-weight: 700; margin-top: 8px; }
            .footer { border-top: 1px solid #e5e7eb; margin-top: 28px; padding-top: 12px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <img class="logo" src="/naveen-digital-studio-logo.jpeg" />
              <h1>Invoice</h1>
              <p class="muted">${billPreview.order.order_number}</p>
            </div>
            <div>
              <p><strong>Generated:</strong> ${new Date(billPreview.bill.generated_at).toLocaleString()}</p>
              <p><strong>Generated by:</strong> ${billPreview.bill.generated_by_name} (${billPreview.bill.generated_by_role})</p>
              <p class="total">Rs. ${Number(billPreview.bill.manual_price).toLocaleString()}</p>
            </div>
          </div>
          <div class="grid">
            <div class="box">
              <h2>Customer</h2>
              <p><strong>${billPreview.order.customer_name}</strong></p>
              <p>${billPreview.order.customer_phone}</p>
              <p>${billPreview.order.customer_address || 'No address'}</p>
            </div>
            <div class="box">
              <h2>Order</h2>
              <p><strong>${billPreview.order.product_name}</strong></p>
              <p>Qty: ${billPreview.order.order_quantity || 1}</p>
              <p>Facebook Page: ${billPreview.order.facebook_page_name || 'None'}</p>
              <p>Courier: ${billPreview.order.courier_service_name || 'Not selected'}</p>
              <p>Tracking: ${billPreview.order.tracking_number || 'Not added'}</p>
              <p>Status: ${billPreview.order.status_name}</p>
            </div>
          </div>
          <h2>Assignment History</h2>
          <table><thead><tr><th>Employee</th><th>Role</th><th>Assigned By</th><th>Assigned At</th></tr></thead><tbody>${assignmentRows || '<tr><td colspan="4">No assignment history.</td></tr>'}</tbody></table>
          <h2>Status History</h2>
          <table><thead><tr><th>From</th><th>To</th><th>Changed By</th><th>Changed At</th></tr></thead><tbody>${statusRows || '<tr><td colspan="4">No status history.</td></tr>'}</tbody></table>
          <div class="footer">Copyright ${new Date().getFullYear()} Naveen Digital Studio. All rights reserved.</div>
        </body>
      </html>`;
  }

  function printBill() {
    const popup = window.open('', '_blank');
    if (!popup) return;
    popup.document.write(billHtml());
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function downloadBill() {
    const blob = new Blob([billHtml()], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${billPreview?.order?.order_number || 'invoice'}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runSearch(event) {
    event.preventDefault();
    setError('');
    try {
      const [ordersRes, customersRes] = await Promise.all([
        api.get('/orders', { params: { search, status: statusFilter || undefined, assigned_only: assignedOnly ? 'true' : undefined } }),
        search ? api.get('/customers/search', { params: { q: search } }) : Promise.resolve({ data: [] })
      ]);
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setCustomerHistory(Array.isArray(customersRes.data) ? customersRes.data : []);
    } catch (requestError) {
      setOrders([]);
      setCustomerHistory([]);
      setError(requestError.response?.data?.message || requestError.message || 'Search could not be completed.');
    }
  }

  async function applyStatusFilter(value) {
    setStatusFilter(value);
    setError('');
    try {
      const { data } = await api.get('/orders', {
        params: { search, status: value || undefined, assigned_only: assignedOnly ? 'true' : undefined, _: Date.now() }
      });
      setOrders(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setOrders([]);
      setError(requestError.response?.data?.message || requestError.message || 'Orders could not be filtered.');
    }
  }

  async function applyAssignmentFilter(value) {
    const onlyMine = value === 'assigned';
    setAssignedOnly(onlyMine);
    setError('');
    try {
      const { data } = await api.get('/orders', {
        params: { search, status: statusFilter || undefined, assigned_only: onlyMine ? 'true' : undefined, _: Date.now() }
      });
      setOrders(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setOrders([]);
      setError(requestError.response?.data?.message || requestError.message || 'Orders could not be filtered.');
    }
  }

  return (
    <div className="space-y-5">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={runSearch} className="flex max-w-xl flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={17} />
            <input className={`${inputClass} pl-9`} placeholder="Search by order, customer, or phone" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Search</button>
        </form>
        {isCoAdmin ? (
          <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">
            Assigned Orders: {assignedOrdersCount}
          </div>
        ) : null}
        {isCoAdmin ? (
          <select
            className={`${inputClass} sm:w-52`}
            value={assignedOnly ? 'assigned' : 'all'}
            onChange={(event) => applyAssignmentFilter(event.target.value)}
          >
            <option value="all">All Orders</option>
            <option value="assigned">My Assigned Orders</option>
          </select>
        ) : null}
        <select
          className={`${inputClass} sm:w-56`}
          value={statusFilter}
          onChange={(event) => applyStatusFilter(event.target.value)}
        >
          <option value="">All Orders</option>
          {lookups.filterStatuses.map((status) => (
            <option key={status.id} value={status.name}>{titleCase(status.name)}</option>
          ))}
        </select>
        <button onClick={openCreateOrder} className="flex items-center justify-center gap-2 rounded-md bg-studio-mint px-4 py-2 text-sm font-semibold text-white">
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
                        {index + 1}. {order.product_name} | Qty: {order.order_quantity || 1} | FB Page: {order.facebook_page_name || 'None'} | Courier: {order.courier_service_name || 'Not selected'} | Tracking: {order.tracking_number || 'Not added'} | Status: {titleCase(order.status_name)}
                        {order.archived_from_active_list ? <span className="ml-2 rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">Removed from active list</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto scrollbar-thin">
          <table className="min-w-[1280px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Courier / Tracking</th>
                <th className="px-4 py-3">Needed</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id} onClick={() => showDetails(order)} className={`${order.is_fast ? 'bg-orange-50/70' : 'bg-white'} cursor-pointer hover:bg-slate-50`}>
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
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{order.courier_service_name || 'Not selected'}</p>
                    <p className="text-xs text-slate-500">{order.tracking_number || 'No tracking number'}</p>
                  </td>
                  <td className="px-4 py-3">{order.needed_date?.slice(0, 10)}</td>
                  <td className="px-4 py-3">Rs. {Number(order.total_amount).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={(event) => { event.stopPropagation(); startEdit(order); }} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" title="Edit order"><Edit3 size={17} /></button>
                      <button onClick={(event) => { event.stopPropagation(); showDetails(order); }} className="rounded-md p-2 text-teal-700 hover:bg-teal-50" title="Status history"><History size={17} /></button>
                      <button onClick={(event) => { event.stopPropagation(); openBillModal(order); }} className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50" title="Generate bill"><ReceiptText size={17} /></button>
                      <button onClick={(event) => { event.stopPropagation(); removeOrder(order.id); }} className="rounded-md p-2 text-rose-600 hover:bg-rose-50" title="Remove order from active list"><Trash2 size={17} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!orders.length ? (
                <tr>
                  <td colSpan="10" className="px-4 py-8 text-center text-sm text-slate-500">
                    No orders found for this account and filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={editingOrder ? 'Edit Order' : 'Create Order'} open={modalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error ? <div className="sm:col-span-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          <Field label="Customer name"><input className={inputClass} value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} required /></Field>
          <Field label="Phone number"><input className={inputClass} value={form.customer_phone} onChange={(event) => setForm({ ...form, customer_phone: event.target.value })} required /></Field>
          <Field label="Address"><input className={inputClass} value={form.customer_address} onChange={(event) => setForm({ ...form, customer_address: event.target.value })} /></Field>
          <Field label="Needed date"><input type="date" className={inputClass} value={form.needed_date} onChange={(event) => setForm({ ...form, needed_date: event.target.value })} required /></Field>
          <Field label="Product"><select className={inputClass} value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value, product_name: event.target.value ? '' : form.product_name })}><option value="">Select or type custom</option>{lookups.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Or type custom product"><input className={inputClass} value={form.product_name} onChange={(event) => setForm({ ...form, product_name: event.target.value, product_id: event.target.value ? '' : form.product_id })} placeholder="Type product name" /></Field>
          <Field label="Facebook page"><select className={inputClass} value={form.facebook_page_id} onChange={(event) => setForm({ ...form, facebook_page_id: event.target.value })}><option value="">None</option>{lookups.pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Courier service"><select className={inputClass} value={form.courier_service_id} onChange={(event) => setForm({ ...form, courier_service_id: event.target.value })}><option value="">Not selected</option>{lookups.couriers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Tracking number"><input className={inputClass} value={form.tracking_number} onChange={(event) => setForm({ ...form, tracking_number: event.target.value })} placeholder="Add anytime" /></Field>
          <Field label="Status"><select className={inputClass} value={form.status_id} onChange={(event) => setForm({ ...form, status_id: event.target.value })} required><option value="">Select</option>{lookups.statuses.map((item) => <option key={item.id} value={item.id}>{titleCase(item.name)}</option>)}</select></Field>
          <Field label="Assigned employee"><select className={inputClass} value={form.assigned_employee_id} onChange={(event) => setForm({ ...form, assigned_employee_id: event.target.value })}><option value="">Unassigned</option>{productionEmployees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="CO_ADMIN for completion commission"><select className={inputClass} value={form.co_admin_id} onChange={(event) => setForm({ ...form, co_admin_id: event.target.value })}><option value="">Order creator / logged-in CO_ADMIN</option>{coAdmins.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Order Quantity"><input type="number" min="1" required className={inputClass} value={form.order_quantity} onChange={(event) => setForm({ ...form, order_quantity: event.target.value })} /></Field>
          <Field label="Total amount"><input type="number" min="0" className={inputClass} value={form.total_amount} onChange={(event) => setForm({ ...form, total_amount: event.target.value })} /></Field>
          <Field label="Advance amount"><input type="number" min="0" className={inputClass} value={form.advance_amount} onChange={(event) => setForm({ ...form, advance_amount: event.target.value })} /></Field>
          <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.is_fast} onChange={(event) => setForm({ ...form, is_fast: event.target.checked })} /> Fast order</label>
          <div className="sm:col-span-2"><Field label="Design notes"><textarea className={inputClass} rows="3" value={form.design_notes} onChange={(event) => setForm({ ...form, design_notes: event.target.value })} /></Field></div>
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button>
            <button disabled={savingOrder} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{savingOrder ? 'Saving...' : 'Save order'}</button>
          </div>
        </form>
      </Modal>

      <Modal
        title="Add Commission Before Completing Order"
        open={Boolean(completionOrder)}
        onClose={() => {
          if (savingCompletion) return;
          setCompletionOrder(null);
          setCompletionStatusId('');
          setCompletionCandidates([]);
          setCompletionAmounts({});
        }}
      >
        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Order number</p>
            <p className="font-semibold text-slate-950">{completionOrder?.order_number}</p>
            <p className="mt-2 text-sm text-slate-500">Customer</p>
            <p className="font-medium text-slate-800">{completionOrder?.customer_name}</p>
          </div>

          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Commission amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {completionCandidates.map((candidate) => {
                  const key = `${candidate.employee_id}-${candidate.commission_type}`;
                  return (
                    <tr key={key}>
                      <td className="px-3 py-2 font-medium text-slate-900">{candidate.employee_name}</td>
                      <td className="px-3 py-2 text-slate-600">{candidate.user_role}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          className={inputClass}
                          value={completionAmounts[key] ?? 0}
                          onChange={(event) => setCompletionAmounts({ ...completionAmounts, [key]: event.target.value })}
                        />
                        {candidate.existing_commission_id ? (
                          <p className="mt-1 text-xs text-amber-700">Existing amount will be updated, not duplicated.</p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {!completionCandidates.length ? (
                  <tr>
                    <td colSpan="3" className="px-3 py-5 text-center text-slate-500">No assigned users found for this order.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={savingCompletion}
              onClick={() => {
                setCompletionOrder(null);
                setCompletionStatusId('');
                setCompletionCandidates([]);
                setCompletionAmounts({});
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingCompletion}
              onClick={() => completeOrder({ withCommissions: false })}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {savingCompletion ? 'Saving...' : 'Complete Without Commission'}
            </button>
            <button
              type="button"
              disabled={savingCompletion}
              onClick={() => completeOrder({ withCommissions: true })}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingCompletion ? 'Saving...' : 'Save Commission and Complete'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal title={`Generate Bill ${billOrder?.order_number || ''}`} open={Boolean(billOrder)} onClose={() => { setBillOrder(null); setBillPreview(null); }}>
        <form onSubmit={generateBill} className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">{billOrder?.customer_name}</p>
            <p className="mt-1 text-sm text-slate-600">{billOrder?.product_name} · Status: {billOrder?.status_name}</p>
          </div>
          <Field label="Manual price">
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              className={inputClass}
              value={manualPrice}
              onChange={(event) => setManualPrice(event.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button type="button" onClick={() => { setBillOrder(null); setBillPreview(null); }} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">Close</button>
            <button disabled={savingBill} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{savingBill ? 'Generating...' : 'Generate Bill'}</button>
          </div>
        </form>

        {billPreview ? (
          <div className="mt-6 rounded-md border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-600">Naveen Digital Studio</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">Invoice</h3>
                <p className="mt-1 text-sm text-slate-600">{billPreview.order.order_number}</p>
              </div>
              <div className="text-sm text-slate-600 sm:text-right">
                <p>Generated: {new Date(billPreview.bill.generated_at).toLocaleString()}</p>
                <p>Generated by: {billPreview.bill.generated_by_name} ({billPreview.bill.generated_by_role})</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">Rs. {Number(billPreview.bill.manual_price).toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={printBill} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Printer size={16} />
                Print Bill
              </button>
              <button type="button" onClick={downloadBill} className="flex items-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                <Download size={16} />
                Download Bill
              </button>
            </div>

            <div className="grid gap-4 border-b border-slate-200 py-4 sm:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-950">Customer</h4>
                <p className="mt-1 text-sm text-slate-700">{billPreview.order.customer_name}</p>
                <p className="text-sm text-slate-600">{billPreview.order.customer_phone}</p>
                <p className="text-sm text-slate-600">{billPreview.order.customer_address || 'No address'}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-950">Order</h4>
                <p className="mt-1 text-sm text-slate-700">{billPreview.order.product_name} · Qty {billPreview.order.order_quantity || 1}</p>
                <p className="text-sm text-slate-600">Facebook Page: {billPreview.order.facebook_page_name || 'None'}</p>
                <p className="text-sm text-slate-600">Current Status: {billPreview.order.status_name}</p>
              </div>
            </div>

            <section className="pt-4">
              <h4 className="text-base font-semibold text-slate-950">Order History</h4>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-xs">
                  <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Assigned Employee</th>
                      <th className="px-3 py-2">Employee Role</th>
                      <th className="px-3 py-2">Assigned By</th>
                      <th className="px-3 py-2">Assigned At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {billPreview.assignmentHistory.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">{item.assigned_employee_name}</td>
                        <td className="px-3 py-2">{item.assigned_employee_role}</td>
                        <td className="px-3 py-2">{item.assigned_by_name} ({item.assigned_by_role})</td>
                        <td className="px-3 py-2">{new Date(item.changed_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!billPreview.assignmentHistory.length ? <p className="mt-2 text-sm text-slate-500">No assignment history.</p> : null}
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-xs">
                  <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Status From</th>
                      <th className="px-3 py-2">Status To</th>
                      <th className="px-3 py-2">Changed By</th>
                      <th className="px-3 py-2">Changed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {billPreview.statusHistory.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">{item.old_status_name || 'New'}</td>
                        <td className="px-3 py-2">{item.new_status_name}</td>
                        <td className="px-3 py-2">{item.changed_by_name} ({item.changed_by_role})</td>
                        <td className="px-3 py-2">{new Date(item.changed_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!billPreview.statusHistory.length ? <p className="mt-2 text-sm text-slate-500">No status history.</p> : null}
              </div>
            </section>
          </div>
        ) : null}
      </Modal>

      <Modal title={`Order Details ${detailOrder?.order_number || ''}`} open={Boolean(detailOrder)} onClose={() => setDetailOrder(null)}>
        {detailOrder ? (
          <div className="mb-5 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-slate-500">Customer</p><p className="font-semibold">{detailOrder.customer_name}</p><p>{detailOrder.customer_phone}</p></div>
            <div><p className="text-slate-500">Address</p><p className="font-semibold">{detailOrder.customer_address || 'No address'}</p></div>
            <div>
              <p className="text-slate-500">Order</p>
              <p className="font-semibold">{detailOrder.product_name}</p>
              <p>FB: {detailOrder.facebook_page_name || 'No Facebook page'}</p>
              <p>FB WhatsApp: {detailOrder.facebook_page_whatsapp_number || 'Not added'}</p>
              <p>Courier: {detailOrder.courier_service_name || 'Not selected'}</p>
              <p>Tracking: {detailOrder.tracking_number || 'Not added'}</p>
            </div>
            <div><p className="text-slate-500">Amounts</p><p className="font-semibold">Total Rs. {Number(detailOrder.total_amount || 0).toLocaleString()}</p><p>Advance Rs. {Number(detailOrder.advance_amount || 0).toLocaleString()}</p></div>
            <div><p className="text-slate-500">Status</p><p className="font-semibold">{detailOrder.status_name}</p></div>
            <div><p className="text-slate-500">Assigned employee</p><p className="font-semibold">{detailOrder.assigned_employee_name || 'Unassigned'}</p></div>
            <div><p className="text-slate-500">Created</p><p className="font-semibold">{detailOrder.created_at ? new Date(detailOrder.created_at).toLocaleString() : '-'}</p></div>
            <div><p className="text-slate-500">Updated</p><p className="font-semibold">{detailOrder.updated_at ? new Date(detailOrder.updated_at).toLocaleString() : '-'}</p></div>
            <button onClick={() => showCustomerProfile(detailOrder)} className="rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white sm:col-span-2 lg:col-span-4">Open Customer Profile</button>
          </div>
        ) : null}
        <div className="grid gap-5 lg:grid-cols-4">
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
          {isCompleteStatus(detailOrder?.status_name) ? (
            <section>
              <h4 className="font-semibold text-slate-950">Commission Records</h4>
              <div className="mt-3 space-y-3">
                {(detailOrder?.commissions || []).map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <p className="text-sm font-semibold text-slate-950">{item.employee_name}</p>
                      {!item.paid_at && Number(item.commission_amount || 0) > 0 ? (
                        <button
                          type="button"
                          disabled={payingCommissionId === item.id}
                          onClick={() => markCommissionPaid(item)}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {payingCommissionId === item.id ? 'Saving...' : 'Mark paid'}
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Rs. {Number(item.commission_amount).toLocaleString()} - {item.commission_type || 'PRODUCTION'} - {item.paid_at ? 'Paid' : item.cancelled_reason?.includes('deducted') ? 'Return deduction applied' : item.cancelled_at ? 'Not Payable' : item.is_payable ? 'Payable' : 'Pending'}
                    </p>
                    {item.paid_at ? <p className="mt-1 text-xs text-emerald-700">Paid amount: Rs. {Number(item.paid_amount || 0).toLocaleString()} on {new Date(item.paid_at).toLocaleString()}</p> : null}
                    {item.cancelled_reason ? <p className="mt-1 text-xs text-rose-600">Reason: {item.cancelled_reason}</p> : null}
                  </div>
                ))}
                {!detailOrder?.commissions?.length ? <p className="text-sm text-slate-500">No commissions saved for this completed order.</p> : null}
              </div>
            </section>
          ) : null}
          <section>
            <h4 className="font-semibold text-slate-950">Bills</h4>
            <div className="mt-3 space-y-3">
              {(detailOrder?.bills || []).map((item) => (
                <div key={item.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-950">Rs. {Number(item.manual_price).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">By {item.generated_by_name} · {new Date(item.generated_at).toLocaleString()}</p>
                </div>
              ))}
              {detailOrder && !detailOrder.bills?.length ? <p className="text-sm text-slate-500">No bills generated yet.</p> : null}
            </div>
          </section>
        </div>
      </Modal>

      <Modal title={`Customer Profile ${customerProfile?.name || ''}`} open={Boolean(customerProfile)} onClose={() => setCustomerProfile(null)} zIndex="z-50">
        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold text-slate-950">{customerProfile?.name}</p>
            <p className="text-sm text-slate-600">WhatsApp: {customerProfile?.whatsapp_number || customerProfile?.phone}</p>
            <p className="text-sm text-slate-600">{customerProfile?.address || 'No address'}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1160px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Current Status</th><th className="px-3 py-2">Status History</th><th className="px-3 py-2">Courier / Tracking</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Assigned By</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(customerProfile?.orders || []).map((order) => (
                  <tr key={order.id}>
                    <td className="px-3 py-2 font-semibold">
                      {order.order_number}
                      {order.archived_from_active_list ? <span className="ml-2 rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">Removed from active list</span> : null}
                    </td>
                    <td className="px-3 py-2">{order.product_name}</td>
                    <td className="px-3 py-2">{order.created_at ? new Date(order.created_at).toLocaleDateString() : '-'}</td>
                    <td className="px-3 py-2">
                      {order.status_name}
                      {order.archived_from_active_list ? <span className="ml-1 text-xs text-rose-600">(Cancelled/Deleted)</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex max-w-xs flex-wrap items-center gap-1 text-xs text-slate-600">
                        {(order.status_history || []).map((historyItem, index) => (
                          <span key={historyItem.id} className="inline-flex items-center gap-1">
                            {index === 0 ? (historyItem.from_status_name ? <span>{historyItem.from_status_name}</span> : null) : null}
                            {index > 0 || historyItem.from_status_name ? <span className="text-slate-400">↓</span> : null}
                            <span className="rounded bg-slate-100 px-2 py-1">{historyItem.to_status_name}</span>
                          </span>
                        ))}
                        {!order.status_history?.length ? <span>-</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{order.courier_service_name || 'Not selected'}</p>
                      <p className="text-xs text-slate-500">{order.tracking_number || 'No tracking number'}</p>
                    </td>
                    <td className="px-3 py-2">Rs. {Number(order.total_amount || 0).toLocaleString()}</td>
                    <td className="px-3 py-2">{order.assigned_employee_name || '-'}</td>
                    <td className="px-3 py-2">{order.assigned_by_admin_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
