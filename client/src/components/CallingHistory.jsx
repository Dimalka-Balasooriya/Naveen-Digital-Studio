import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function CallingHistory({ orderId, revision = 0 }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ history: [], pagination: { totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setPage(1); }, [orderId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get(`/calling/orders/${orderId}/history`, { params: { page, limit: 20 }, signal: controller.signal })
      .then(({ data: result }) => { if (!controller.signal.aborted) setData(result); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.response?.data?.message || 'Call history could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [orderId, page, revision]);
  return <div className="mt-3 space-y-3">
    <h4 className="text-sm font-semibold text-slate-900">Call History</h4>
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : loading ? <p className="text-sm text-slate-500">Loading history...</p> : <>
      {data.history.map((item) => <div key={item.id} className="rounded-md border border-slate-200 p-3 text-sm">
        <p className="font-semibold">{item.previous_status} → {item.new_status}</p>
        <p className="text-xs text-slate-500">{item.agent_name || `Agent ${item.agent_id}`} · {new Date(item.changed_at).toLocaleString()}</p>
        {item.notes ? <p className="mt-1 whitespace-pre-wrap text-slate-700">{item.notes}</p> : null}
      </div>)}
      {!data.history.length ? <p className="text-sm text-slate-500">No calling status changes yet.</p> : null}
    </>}
    <div className="flex items-center gap-3 text-sm">
      <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} of {data.pagination.totalPages}</span>
      <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={loading || page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</button>
    </div>
  </div>;
}
