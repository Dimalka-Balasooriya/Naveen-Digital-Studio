import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { inputClass } from '../../components/FormFields';

const sections = [
  { key: 'pages', title: 'Facebook Pages', fields: ['name', 'url'] },
  { key: 'products', title: 'Products', fields: ['name', 'description', 'base_price'] },
  { key: 'statuses', title: 'Order Statuses', fields: ['name', 'color', 'sort_order'] },
  { key: 'tasks', title: 'Production Tasks', fields: ['name', 'description', 'sort_order'] }
];

export default function SettingsPage() {
  const [data, setData] = useState({});
  const [forms, setForms] = useState({});

  async function load() {
    const results = await Promise.all(sections.map((section) => api.get(`/lookups/${section.key}`)));
    setData(Object.fromEntries(sections.map((section, index) => [section.key, results[index].data])));
  }

  useEffect(() => {
    load();
  }, []);

  async function addItem(section) {
    const raw = forms[section.key] || {};
    const payload = { ...raw };
    if ('base_price' in payload) payload.base_price = Number(payload.base_price || 0);
    if ('sort_order' in payload) payload.sort_order = Number(payload.sort_order || 0);
    await api.post(`/lookups/${section.key}`, payload);
    setForms({ ...forms, [section.key]: {} });
    await load();
  }

  async function removeItem(section, id) {
    await api.delete(`/lookups/${section.key}/${id}`);
    await load();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {sections.map((section) => (
        <section key={section.key} className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-950">{section.title}</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {section.fields.map((field) => (
              <input
                key={field}
                className={inputClass}
                placeholder={field.replace('_', ' ')}
                value={forms[section.key]?.[field] || ''}
                onChange={(event) => setForms({ ...forms, [section.key]: { ...(forms[section.key] || {}), [field]: event.target.value } })}
              />
            ))}
            <button onClick={() => addItem(section)} className="flex items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              <Plus size={16} />
              Add
            </button>
          </div>

          <div className="mt-5 divide-y divide-slate-100">
            {(data[section.key] || []).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.description || item.url || item.color || `Sort ${item.sort_order ?? 0}`}</p>
                </div>
                <button onClick={() => removeItem(section, item.id)} className="rounded-md p-2 text-rose-600 hover:bg-rose-50" title="Remove">
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
