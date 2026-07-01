import { useEffect, useState } from 'react';
import { Check, Edit3, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import { inputClass } from '../../components/FormFields';
import { getStatusStyle, getStatusTone, isHexColor, statusColorMap, statusHexPalette, titleCase } from '../../utils/statusDisplay';

const statusColorOptions = [...statusHexPalette, ...Object.keys(statusColorMap)];

const sections = [
  {
    key: 'pages',
    title: 'Facebook Pages',
    columns: 'sm:grid-cols-3',
    fields: [
      { name: 'name', label: 'Page name', required: true },
      { name: 'whatsapp_number', label: 'WhatsApp number' }
    ]
  },
  {
    key: 'products',
    title: 'Products',
    columns: 'sm:grid-cols-2',
    fields: [{ name: 'name', label: 'Product name', required: true }]
  },
  {
    key: 'couriers',
    title: 'Courier Services',
    columns: 'sm:grid-cols-3',
    fields: [
      { name: 'name', label: 'Courier service name', required: true },
      { name: 'phone', label: 'Contact number' }
    ]
  },
  {
    key: 'statuses',
    title: 'Order Statuses',
    columns: 'sm:grid-cols-4',
    fields: [
      { name: 'name', label: 'Status name', required: true },
      { name: 'color', label: 'Color' },
      { name: 'sort_order', label: 'Sort order', type: 'number' }
    ]
  }
];

function cleanPayload(raw = {}) {
  const payload = Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => value !== '')
  );
  if ('sort_order' in payload) payload.sort_order = Number(payload.sort_order || 0);
  return payload;
}

function StatusColorMeta({ color, sortOrder }) {
  const tone = getStatusTone(color);
  const style = getStatusStyle(color);
  const isHex = isHexColor(color);
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span className={`h-3 w-3 rounded-full ${isHex ? '' : tone.dot}`} style={isHex ? { backgroundColor: color } : undefined} />
      <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${tone.chip}`} style={style}>
        {isHex ? String(color).toUpperCase() : titleCase(color || 'slate')}
      </span>
      <span>Sort {sortOrder ?? 0}</span>
    </span>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState({});
  const [forms, setForms] = useState({});
  const [editing, setEditing] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState('');

  async function load() {
    try {
      setError('');
      const results = await Promise.all(sections.map((section) => api.get(`/lookups/${section.key}`)));
      setData(Object.fromEntries(sections.map((section, index) => [section.key, results[index].data])));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Settings could not load. Check the API and database connection.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addItem(section) {
    if (submitting) return;
    try {
      setSubmitting(`add-${section.key}`);
      setError('');
      setNotice('');
      await api.post(`/lookups/${section.key}`, cleanPayload(forms[section.key]));
      setForms({ ...forms, [section.key]: {} });
      setNotice(`${section.title} saved.`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Item could not be saved.');
    } finally {
      setSubmitting('');
    }
  }

  async function saveEdit(section, item) {
    if (submitting) return;
    try {
      setSubmitting(`edit-${section.key}-${item.id}`);
      setError('');
      setNotice('');
      await api.put(`/lookups/${section.key}/${item.id}`, cleanPayload(editing[`${section.key}-${item.id}`]));
      setEditing(Object.fromEntries(Object.entries(editing).filter(([key]) => key !== `${section.key}-${item.id}`)));
      setNotice(`${section.title} updated.`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Item could not be updated.');
    } finally {
      setSubmitting('');
    }
  }

  async function removeItem(section, id) {
    if (submitting) return;
    try {
      setSubmitting(`delete-${section.key}-${id}`);
      setError('');
      setNotice('');
      await api.delete(`/lookups/${section.key}/${id}`);
      setNotice(`${section.title} removed.`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Item could not be removed.');
    } finally {
      setSubmitting('');
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 xl:col-span-2">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 xl:col-span-2">{notice}</div> : null}

      {sections.map((section) => (
        <section key={section.key} className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-950">{section.title}</h3>
          <div className={`mt-4 grid gap-2 ${section.columns}`}>
            {section.fields.map((field) => (
              <input
                key={field.name}
                type={field.type || 'text'}
                list={section.key === 'statuses' && field.name === 'color' ? 'status-color-options' : undefined}
                className={inputClass}
                placeholder={field.label}
                required={field.required}
                min={field.type === 'number' ? 0 : undefined}
                value={forms[section.key]?.[field.name] || ''}
                onChange={(event) => setForms({ ...forms, [section.key]: { ...(forms[section.key] || {}), [field.name]: event.target.value } })}
              />
            ))}
            {section.key === 'statuses' ? (
              <datalist id="status-color-options">
                {statusColorOptions.map((color) => <option key={color} value={color} />)}
              </datalist>
            ) : null}
            <button disabled={Boolean(submitting)} onClick={() => addItem(section)} className="flex items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              <Plus size={16} />
              {submitting === `add-${section.key}` ? 'Saving...' : 'Add'}
            </button>
          </div>

          <div className="mt-5 divide-y divide-slate-100">
            {(data[section.key] || []).map((item) => {
              const editKey = `${section.key}-${item.id}`;
              const editForm = editing[editKey];
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                  {editForm ? (
                    <div className={`grid flex-1 gap-2 ${section.columns}`}>
                      {section.fields.map((field) => (
                        <input
                          key={field.name}
                          type={field.type || 'text'}
                          list={section.key === 'statuses' && field.name === 'color' ? 'status-color-options' : undefined}
                          className={inputClass}
                          value={editForm[field.name] ?? ''}
                          onChange={(event) => setEditing({ ...editing, [editKey]: { ...editForm, [field.name]: event.target.value } })}
                        />
                      ))}
                      <div className="flex gap-2">
                        <button disabled={Boolean(submitting)} onClick={() => saveEdit(section, item)} className="rounded-md p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60" title="Save"><Check size={17} /></button>
                        <button onClick={() => setEditing(Object.fromEntries(Object.entries(editing).filter(([key]) => key !== editKey)))} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" title="Cancel"><X size={17} /></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="font-medium text-slate-900">{section.key === 'statuses' ? titleCase(item.name) : item.name}</p>
                        <p className="text-xs text-slate-500">
                          {section.key === 'pages' && (item.whatsapp_number || 'No WhatsApp number')}
                          {section.key === 'products' && 'Available for orders'}
                          {section.key === 'couriers' && (item.phone || 'Available for tracking')}
                          {section.key === 'statuses' && <StatusColorMeta color={item.color} sortOrder={item.sort_order} />}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditing({ ...editing, [editKey]: item })} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" title="Edit"><Edit3 size={17} /></button>
                        <button disabled={Boolean(submitting)} onClick={() => removeItem(section, item.id)} className="rounded-md p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-60" title="Remove"><Trash2 size={17} /></button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
