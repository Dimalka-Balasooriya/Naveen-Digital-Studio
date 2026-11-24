import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import StatusBadge from '../../components/StatusBadge';

export default function CorrectionPanel() {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState({ orders: [], pagination: { total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const saving = useRef(false);

  useEffect(() => {
    const refresh = () => { if (!saving.current && document.visibilityState === 'visible') setRevision(value => value + 1); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.get('/corrections', { params: { page, limit: 25 }, signal: controller.signal })
      .then(({ data: result }) => {
        if (controller.signal.aborted) return;
        if (page > result.pagination.totalPages) { setPage(result.pagination.totalPages); return; }
        setData(result); setError('');
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.message || 'Corrections could not be loaded. Please refresh.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision]);

  async function complete(order) {
    if (saving.current) return;
    saving.current = true; setBusy(order.id); setNotice(''); setError('');
    try {
      const { data: result } = await api.post(`/corrections/${order.id}/complete`, { expected_history_id: Number(order.correction_history_id) });
      setData(previous => ({ ...previous, orders: previous.orders.filter(item => item.id !== order.id),
        pagination: { ...previous.pagination, total: Math.max(0, previous.pagination.total - 1) } }));
      setNotice(`${order.order_number}: ${result.message}`);
    } catch (err) {
      setNotice(err.response?.data?.message || 'Could not confirm completion. Refresh to check the current status before retrying.');
    } finally {
      saving.current = false; setBusy(null); setRevision(value => value + 1);
      window.dispatchEvent(new Event('nds-corrections-updated'));
    }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold text-slate-950">Correction</h1>
        <p className="text-sm text-slate-500">{data.pagination.total} pending corrections · Shared with all designers</p></div>
      <button type="button" disabled={loading || busy !== null} onClick={() => setRevision(value => value + 1)}
        className="flex min-h-11 items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm disabled:opacity-50"><RefreshCw size={16} />Refresh</button>
    </div>
    {notice ? <p role="status" className="rounded-md bg-teal-50 p-3 text-sm text-teal-900">{notice}</p> : null}
    {error ? <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    {loading ? <p role="status" className="text-sm text-slate-500">Refreshing corrections...</p> : null}
    <div aria-busy={loading} className="grid gap-4 xl:grid-cols-2">
      {data.orders.map(order => <article key={order.id} className="min-w-0 space-y-3 rounded-md border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="font-semibold text-slate-950">{order.order_number}</h2><p className="text-xs text-slate-500">Order ID: {order.id}</p></div>
          <div className="flex flex-wrap gap-2"><StatusBadge color={order.status_color}>{order.status_name}</StatusBadge>
            <StatusBadge color={order.is_fast ? 'orange' : 'slate'}>{order.is_fast ? 'High priority' : 'Normal priority'}</StatusBadge></div>
        </div>
        <div className="space-y-1 text-sm [overflow-wrap:anywhere]">
          <p className="font-medium">{order.customer_name}</p><p>Phone: {order.customer_phone || 'Not available'}</p>
          <p>Product: {order.product_name} × {order.order_quantity || 1}</p>
          {order.product_description ? <p className="whitespace-pre-wrap text-slate-600">{order.product_description}</p> : null}
          <p>Originally assigned designer: <strong>{order.original_designer_name}</strong></p>
          {order.needed_date ? <p>Needed: {new Date(order.needed_date).toLocaleDateString()}</p> : null}
        </div>
        <div className="space-y-2 rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
          <p><strong>Design notes:</strong> {order.design_notes || 'No design notes.'}</p>
          {order.correction_note ? <p><strong>Correction notes:</strong> {order.correction_note}</p> : null}
          {order.calling_correction_note ? <p><strong>Calling Agent correction notes:</strong> {order.calling_correction_note}</p> : null}
        </div>
        <button type="button" onClick={() => complete(order)} disabled={loading || busy !== null || Boolean(error)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50 sm:w-auto">
          <CheckCircle2 size={16} />{busy === order.id ? 'Completing...' : 'Correction Done'}
        </button>
      </article>)}
    </div>
    {!loading && !error && !data.orders.length ? <p className="rounded-md border bg-white p-5 text-slate-500">No pending corrections.</p> : null}
    <div className="flex items-center justify-between gap-2 text-sm">
      <button disabled={loading || busy !== null || page <= 1} onClick={() => setPage(value => value - 1)} className="min-h-11 rounded border bg-white px-4 py-2 disabled:opacity-50">Previous</button>
      <span>Page {page} of {data.pagination.totalPages}</span>
      <button disabled={loading || busy !== null || page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)} className="min-h-11 rounded border bg-white px-4 py-2 disabled:opacity-50">Next</button>
    </div>
  </div>;
}
