import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { Field, inputClass } from '../../components/FormFields';
import CallingHistory from '../../components/CallingHistory';
import CallNowButton from '../../components/CallNowButton';
import { createRequestId } from '../../utils/requestId';

const statuses = ['Not Called', 'No Answer', 'Call Back', 'Confirmed', 'Wrong Number', 'Completed', 'Correction (Call Agent)'];

function CallingOrder({ order, callingFilter, onSaved, onBusy, disabled }) {
  const [status, setStatus] = useState(order.calling_status);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef(null);
  const submitting = useRef(false);
  useEffect(() => { setStatus(order.calling_status); }, [order.calling_version, order.calling_status]);

  async function save(event) {
    event.preventDefault();
    if (submitting.current || disabled) return;
    const payload = { status, notes: notes.trim(), expected_version: Number(order.calling_version) };
    const signature = JSON.stringify(payload);
    submitting.current = true; setSaving(true); onBusy(1); setError(''); setNotice('');
    try {
      if (request.current?.signature !== signature) {
        request.current = { signature, body: { ...payload, request_id: createRequestId() } };
      }
      const { data } = await api.patch(`/calling/orders/${order.id}/status`, request.current.body);
      request.current = null; setNotes(''); setNotice(data.message);
      onSaved(order.id, data);
    } catch (error) {
      // Keep both the draft and request ID: retrying a lost response is idempotent.
      setError(error.response?.data?.message || 'Could not confirm the save. Retry with the same details to safely confirm it.');
    } finally { submitting.current = false; setSaving(false); onBusy(-1); }
  }
  return <article className="rounded-md border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap justify-between gap-3">
      <div><h3 className="font-semibold text-slate-950">{order.order_number}</h3>
        <p className="text-sm text-slate-500">Order ID: {order.id}</p>
        <p className="mt-1 font-medium">{order.customer_name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="break-all text-sm">Customer contact: {order.customer_phone || 'Not available'}</p>
          <CallNowButton phone={order.customer_phone} />
        </div>
        {order.recipient_contact_number ? <p className="text-sm">Recipient contact: {order.recipient_contact_number}</p> : null}
      </div>
      <div className="text-sm"><p>Production: <strong>{order.production_status}</strong></p>
        <p>Calling: <strong>{order.calling_status}</strong></p>
        <p className="text-xs text-slate-500">Eligible since {new Date(order.eligible_since).toLocaleString()}</p>
      </div>
    </div>
    <form onSubmit={save} className="mt-4">
      <fieldset disabled={saving || disabled} className="grid gap-3 sm:grid-cols-2">
        <Field label="Calling status"><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Notes (optional)"><textarea className={inputClass} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        <div className="sm:col-span-2 flex flex-wrap gap-3">
          <button disabled={saving || status === order.calling_status} className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save calling status'}</button>
          <button type="button" onClick={() => setHistoryOpen(!historyOpen)} className="rounded-md border px-4 py-2 text-sm">{historyOpen ? 'Hide history' : 'View call history'}</button>
        </div>
      </fieldset>
    </form>
    {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm text-teal-700">{notice}</p> : null}
    {callingFilter && order.calling_status !== callingFilter ? (
      <p className="mt-2 text-sm text-slate-600">Saved outside the current calling status filter.</p>
    ) : null}
    {historyOpen ? <CallingHistory orderId={order.id} revision={order.calling_version} /> : null}
  </article>;
}

export default function CallingDashboard() {
  const [filter, setFilter] = useState('');
  const [callingFilter, setCallingFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ orders: [], pagination: { total: 0, totalPages: 1 } });
  const pendingSearch = searchInput.trim() !== search;
  const refreshing = loading || pendingSearch;
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    if (pendingSearch) return undefined;
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get('/calling/orders', { params: { page, limit: 25, production_status: filter || undefined, calling_status: callingFilter || undefined, search: search || undefined }, signal: controller.signal })
      .then(({ data: result }) => {
        if (controller.signal.aborted) return;
        if (page > result.pagination.totalPages) { setPage(result.pagination.totalPages); return; }
        setData(result);
      })
      .catch((error) => { if (!controller.signal.aborted) setError(error.response?.data?.message || 'Calling orders could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, callingFilter, page, revision, search, pendingSearch]);

  function applySavedStatus(orderId, result) {
    // Keep the current page stable while the agent is working through an order.
    setData((current) => ({
      ...current,
      orders: current.orders.map((order) => order.id === orderId ? {
        ...order, calling_status: result.calling_status, calling_version: result.calling_version
      } : order)
    }));
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold text-slate-950">Calling Agent Dashboard</h1>
        <p className="text-sm text-slate-500">{data.pagination.total} eligible orders · Not Called, Call Back, then No Answer first.</p></div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Production status filter" className={inputClass} disabled={busy > 0} value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>
          <option value="">All</option><option>Editing Send</option><option>Correction Send</option>
        </select>
        <select aria-label="Calling status filter" className={inputClass} disabled={busy > 0} value={callingFilter} onChange={(event) => { setCallingFilter(event.target.value); setPage(1); }}>
          <option value="">All Calling Statuses</option>
          {statuses.map((value) => <option key={value}>{value}</option>)}
        </select>
        <button disabled={refreshing || busy > 0} onClick={() => setRevision((value) => value + 1)} className="rounded-md border bg-white px-4 py-2 text-sm disabled:opacity-50">Refresh</button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <input type="search" aria-label="Search orders" placeholder="Search by Order ID or Customer Name..."
        maxLength={120} disabled={busy > 0} value={searchInput}
        onChange={(event) => { setSearchInput(event.target.value); setPage(1); }}
        className={`${inputClass} min-w-0 flex-1 basis-64`} />
      <button type="button" disabled={busy > 0 || !searchInput}
        onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
        className="min-h-11 rounded-md border bg-white px-4 py-2 text-sm disabled:opacity-50">Clear search</button>
    </div>
    {error ? <p role="alert" className="rounded bg-rose-50 p-3 text-rose-700">{error}</p> : null}
    {refreshing ? <p role="status" className="text-sm text-slate-500">Refreshing orders...</p> : null}
    <div aria-busy={refreshing} className={refreshing ? 'pointer-events-none opacity-60' : ''}>
      <div className="space-y-4">{data.orders.map((order) => <CallingOrder key={order.id} order={order} callingFilter={callingFilter} disabled={refreshing || Boolean(error)} onSaved={applySavedStatus} onBusy={(delta) => setBusy((value) => value + delta)} />)}</div>
    </div>
    {!refreshing && !error && !data.orders.length ? <p role="status" className="rounded-md border bg-white p-5 text-slate-500">No matching orders found</p> : null}
    <div className="flex items-center justify-between text-sm">
      <button disabled={refreshing || busy > 0 || page <= 1} onClick={() => setPage(page - 1)} className="rounded border bg-white px-4 py-2 disabled:opacity-50">Previous</button>
      <span>Page {page} of {data.pagination.totalPages}</span>
      <button disabled={refreshing || busy > 0 || page >= data.pagination.totalPages} onClick={() => setPage(page + 1)} className="rounded border bg-white px-4 py-2 disabled:opacity-50">Next</button>
    </div>
  </div>;
}
