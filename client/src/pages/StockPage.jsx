import { useEffect, useMemo, useState } from 'react';
import { Download, Edit3, Eye, History, Minus, Package, Plus, Printer, ReceiptText, Trash2, Warehouse } from 'lucide-react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import { Field, inputClass } from '../components/FormFields';
import { useAuth } from '../context/AuthContext';
import { normalizeRole } from '../utils/roles';

const emptyBranch = { branch_name: '', short_code: '' };
const emptyItem = { item_name: '', item_code: '', quantity: 0, unit_price: 0 };
const emptyCatalogItem = { item_name: '', item_code: '', unit_price: 0 };
const emptyAdjust = { type: 'ADD', quantity: 1, note: '' };
const emptyBillHeader = { customer_name: '', note: '' };
const emptyBillLine = { stock_item_id: '', item_name: '', item_code: '', branch_name: '', branch_code: '', quantity: 1, unit_price: 0, selected: false };

export default function StockPage() {
  const { user } = useAuth();
  const role = normalizeRole(user?.role);
  const isOwner = role === 'OWNER';
  const canAdjust = role === 'OWNER' || role === 'CO_ADMIN';
  const canAddBranchItems = role === 'OWNER' || role === 'CO_ADMIN';
  const canGenerateStockBill = role === 'OWNER' || role === 'CO_ADMIN';

  const [branches, setBranches] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogItem);
  const [editingCatalogItem, setEditingCatalogItem] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [items, setItems] = useState([]);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchForm, setBranchForm] = useState(emptyBranch);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustForm, setAdjustForm] = useState(emptyAdjust);
  const [historyItem, setHistoryItem] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [billSearch, setBillSearch] = useState('');
  const [billItems, setBillItems] = useState([]);
  const [billHeader, setBillHeader] = useState(emptyBillHeader);
  const [billLine, setBillLine] = useState(emptyBillLine);
  const [billLines, setBillLines] = useState([]);
  const [billHistory, setBillHistory] = useState([]);
  const [generatedBill, setGeneratedBill] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const totalQuantity = useMemo(() => branches.reduce((sum, branch) => sum + Number(branch.quantity || 0), 0), [branches]);
  const selectedQuantity = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), [items]);
  const billTotal = useMemo(
    () => billLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0),
    [billLines]
  );
  const itemFormTotal = useMemo(
    () => Number(itemForm.quantity || 0) * Number(itemForm.unit_price || 0),
    [itemForm.quantity, itemForm.unit_price]
  );
  const filteredCatalogItems = useMemo(() => {
    const term = String(catalogSearch || itemForm.item_name || itemForm.item_code || '').trim().toLowerCase();
    if (!term) return catalogItems.slice(0, 8);
    return catalogItems
      .filter((item) => item.item_name.toLowerCase().includes(term) || item.item_code.toLowerCase().includes(term))
      .slice(0, 8);
  }, [catalogItems, catalogSearch, itemForm.item_code, itemForm.item_name]);

  async function loadBranches() {
    const { data } = await api.get('/stock/branches', { params: { _: Date.now() } });
    setBranches(data);
    if (selectedBranch) {
      const fresh = data.find((branch) => branch.id === selectedBranch.id);
      if (fresh) setSelectedBranch(fresh);
    }
  }

  async function loadCatalogItems(search = '') {
    const { data } = await api.get('/stock/catalog/items', { params: { search, _: Date.now() } });
    setCatalogItems(data);
  }

  async function loadItems(branchId = selectedBranch?.id) {
    if (!branchId) return;
    const { data } = await api.get(`/stock/branches/${branchId}/items`, { params: { _: Date.now() } });
    setItems(data);
  }

  async function loadBillHistory() {
    if (!canGenerateStockBill) return;
    const { data } = await api.get('/stock/wholesale-bills', { params: { _: Date.now() } });
    setBillHistory(data);
  }

  useEffect(() => {
    loadBranches().catch((requestError) => setError(requestError.response?.data?.message || 'Stock details could not load.'));
    loadCatalogItems().catch(() => {});
    loadBillHistory().catch(() => {});
  }, []);

  useEffect(() => {
    if (!canGenerateStockBill) return undefined;
    const term = billSearch.trim();
    if (!term) {
      setBillItems([]);
      return undefined;
    }
    const timeoutId = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/stock/bill-items', { params: { search: term, _: Date.now() } });
        setBillItems(data);
        const exactMatch = data.length === 1 && (
          String(data[0].item_name || '').toLowerCase() === term.toLowerCase()
          || String(data[0].item_code || '').toLowerCase() === term.toLowerCase()
        );
        if (exactMatch) {
          setBillLine((current) => ({
            stock_item_id: data[0].id,
            item_name: data[0].item_name || '',
            item_code: data[0].item_code || '',
            branch_name: data[0].branch_name || '',
            branch_code: data[0].branch_code || '',
            quantity: Number(current.quantity || 1),
            unit_price: Number(data[0].unit_price || 0),
            selected: true
          }));
        }
      } catch (requestError) {
        try {
          const { data } = await api.get('/stock/catalog/items', { params: { search: term, _: Date.now() } });
          setBillItems(data.map((item) => ({
            ...item,
            id: `catalog-${item.id}`,
            stock_item_id: '',
            branch_name: '',
            branch_code: '',
            quantity: 0
          })));
        } catch {
          setError(requestError.response?.data?.message || 'Bill item search failed.');
        }
      }
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [billSearch, canGenerateStockBill]);

  async function saveCatalogItem(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = editingCatalogItem
        ? await api.put(`/stock/catalog/items/${editingCatalogItem.id}`, catalogForm)
        : await api.post('/stock/catalog/items', catalogForm);
      setNotice(data.message || (editingCatalogItem ? 'Item updated.' : 'Item added.'));
      setCatalogForm(emptyCatalogItem);
      setEditingCatalogItem(null);
      await loadCatalogItems();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Item could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function startEditCatalogItem(item) {
    setEditingCatalogItem(item);
    setCatalogForm({ item_name: item.item_name || '', item_code: item.item_code || '', unit_price: item.unit_price || 0 });
  }

  async function removeCatalogItem(item) {
    if (!window.confirm(`Delete ${item.item_name}?`)) return;
    setError('');
    try {
      await api.delete(`/stock/catalog/items/${item.id}`);
      setNotice('Item removed.');
      await loadCatalogItems();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Item could not be removed.');
    }
  }

  async function openBranch(branch) {
    setSelectedBranch(branch);
    setItems([]);
    setError('');
    try {
      await loadItems(branch.id);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Branch items could not load.');
    }
  }

  function openCreateBranch() {
    setEditingBranch(null);
    setBranchForm(emptyBranch);
    setError('');
    setBranchModalOpen(true);
  }

  function openEditBranch(branch) {
    setEditingBranch(branch);
    setBranchForm({
      branch_name: branch.branch_name || '',
      short_code: branch.short_code || ''
    });
    setError('');
    setBranchModalOpen(true);
  }

  async function saveBranch(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = editingBranch
        ? await api.put(`/stock/branches/${editingBranch.id}`, branchForm)
        : await api.post('/stock/branches', branchForm);
      setNotice(data.message || (editingBranch ? 'Branch updated.' : 'Branch added.'));
      setBranchModalOpen(false);
      setBranchForm(emptyBranch);
      setEditingBranch(null);
      await loadBranches();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Branch could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function removeBranch(branch) {
    if (!window.confirm(`Delete ${branch.branch_name}?`)) return;
    setError('');
    try {
      await api.delete(`/stock/branches/${branch.id}`);
      setNotice('Branch removed.');
      if (selectedBranch?.id === branch.id) {
        setSelectedBranch(null);
        setItems([]);
      }
      await loadBranches();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Branch could not be removed.');
    }
  }

  function openCreateItem() {
    setEditingItem(null);
    setItemForm(emptyItem);
    setCatalogSearch('');
    setError('');
    setItemModalOpen(true);
  }

  function openEditItem(item) {
    setEditingItem(item);
    setItemForm({
      item_name: item.item_name || '',
      item_code: item.item_code || '',
      quantity: item.quantity || 0,
      unit_price: item.unit_price || 0
    });
    setError('');
    setItemModalOpen(true);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (saving || !selectedBranch) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { ...itemForm, quantity: Number(itemForm.quantity || 0), unit_price: Number(itemForm.unit_price || 0) };
      const { data } = editingItem
        ? await api.put(`/stock/items/${editingItem.id}`, payload)
        : await api.post(`/stock/branches/${selectedBranch.id}/items`, payload);
      setNotice(data.message || (editingItem ? 'Item updated.' : 'Item added.'));
      setItemModalOpen(false);
      setItemForm(emptyItem);
      setEditingItem(null);
      await loadItems();
      await loadBranches();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Item could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function openAdjustItem(item, type = 'ADD') {
    setAdjustItem(item);
    setAdjustForm({ ...emptyAdjust, type });
    setError('');
  }

  async function saveItemAdjustment(event) {
    event.preventDefault();
    if (saving || !adjustItem) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.patch(`/stock/items/${adjustItem.id}/quantity`, {
        ...adjustForm,
        quantity: Number(adjustForm.quantity || 0)
      });
      setNotice(data.message || 'Item stock updated.');
      setAdjustItem(null);
      await loadItems();
      await loadBranches();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Item quantity could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(item) {
    if (!window.confirm(`Delete ${item.item_name}?`)) return;
    setError('');
    try {
      await api.delete(`/stock/items/${item.id}`);
      setNotice('Item removed.');
      await loadItems();
      await loadBranches();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Item could not be removed.');
    }
  }

  async function openItemHistory(item) {
    setHistoryItem(item);
    const { data } = await api.get(`/stock/items/${item.id}/movements`);
    setHistoryRows(data);
  }

  async function downloadStockReport(scope, format) {
    setError('');
    try {
      const endpoint = scope === 'full'
        ? `/stock/reports/full/${format}`
        : `/stock/reports/branches/${selectedBranch.id}/${format}`;
      const response = await api.get(endpoint, { responseType: 'blob' });
      const extension = format === 'excel' ? 'xlsx' : 'pdf';
      const filename = scope === 'full'
        ? `full-stock-report.${extension}`
        : `${selectedBranch.short_code}-stock-report.${extension}`;
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Stock report could not be downloaded.');
    }
  }

  function formatBillItemLabel(item) {
    const code = item.item_code ? ` (${item.item_code})` : '';
    const branch = item.branch_name ? ` - ${item.branch_name}` : ' - Item Master';
    return `${item.item_name}${code}${branch}`;
  }

  function selectBillItem(item) {
    setBillLine({
      stock_item_id: String(item.id).startsWith('catalog-') ? '' : item.id,
      item_name: item.item_name || '',
      item_code: item.item_code || '',
      branch_name: item.branch_name || '',
      branch_code: item.branch_code || '',
      quantity: 1,
      unit_price: Number(item.unit_price || 0),
      selected: true
    });
    setBillSearch(formatBillItemLabel(item));
    setBillItems([]);
    setGeneratedBill(null);
  }

  function lineFromBillItem(item) {
    return {
      stock_item_id: String(item.id).startsWith('catalog-') ? '' : item.id,
      item_name: item.item_name || '',
      item_code: item.item_code || '',
      branch_name: item.branch_name || '',
      branch_code: item.branch_code || '',
      quantity: Number(billLine.quantity || 1),
      unit_price: Number(item.unit_price || 0),
      selected: true
    };
  }

  function useCustomBillItem() {
    const term = billSearch.trim();
    if (!term) return;
    setBillLine({
      ...emptyBillLine,
      item_name: term,
      quantity: 1,
      selected: true
    });
    setBillItems([]);
  }

  async function addBillLine() {
    setError('');
    let nextLine = { ...billLine };
    const term = billSearch.trim().toLowerCase();
    if (!nextLine.stock_item_id && term) {
      let matches = billItems;
      if (!matches.length) {
        try {
          const { data } = await api.get('/stock/bill-items', { params: { search: billSearch.trim(), _: Date.now() } });
          matches = data;
          setBillItems(data);
        } catch (requestError) {
          const { data } = await api.get('/stock/catalog/items', { params: { search: billSearch.trim(), _: Date.now() } });
          matches = data.map((item) => ({
            ...item,
            id: `catalog-${item.id}`,
            stock_item_id: '',
            branch_name: '',
            branch_code: '',
            quantity: 0
          }));
          setBillItems(matches);
        }
      }
      const exactMatch = matches.find((item) => (
        String(item.item_name || '').toLowerCase() === term
        || String(item.item_code || '').toLowerCase() === term
        || formatBillItemLabel(item).toLowerCase() === term
      ));
      if (exactMatch) {
        nextLine = lineFromBillItem(exactMatch);
      } else if (matches.length) {
        setError('Please select one of the matching items before adding it to the bill.');
        return;
      } else if (billSearch.trim()) {
        nextLine = { ...emptyBillLine, item_name: billSearch.trim(), quantity: Number(billLine.quantity || 1), unit_price: Number(billLine.unit_price || 0), selected: true };
      }
    }
    const quantity = Number(nextLine.quantity || 0);
    const unitPrice = Number(nextLine.unit_price || 0);
    if (!nextLine.item_name.trim()) {
      setError('Please select or type an item before adding it to the bill.');
      return;
    }
    if (quantity <= 0) {
      setError('Bill item quantity must be greater than 0.');
      return;
    }
    if (unitPrice < 0) {
      setError('Bill item price must be zero or more.');
      return;
    }
    setBillLines((current) => [
      ...current,
      {
        ...nextLine,
        item_name: nextLine.item_name.trim(),
        item_code: String(nextLine.item_code || '').trim(),
        quantity,
        unit_price: unitPrice
      }
    ]);
    setBillLine(emptyBillLine);
    setBillSearch('');
    setGeneratedBill(null);
  }

  function removeBillLine(indexToRemove) {
    setBillLines((current) => current.filter((_, index) => index !== indexToRemove));
  }

  async function generateStockBill(event) {
    event.preventDefault();
    if (saving || !canGenerateStockBill) return;
    setSaving(true);
    setError('');
    setNotice('');
    setGeneratedBill(null);
    try {
      const { data } = await api.post('/stock/wholesale-bills', {
        ...billHeader,
        items: billLines.map((line) => ({
          ...line,
          stock_item_id: line.stock_item_id ? Number(line.stock_item_id) : null,
          quantity: Number(line.quantity || 0),
          unit_price: Number(line.unit_price || 0)
        }))
      });
      setGeneratedBill(data);
      setNotice(data.message || 'Wholesale stock bill generated successfully.');
      setBillHeader(emptyBillHeader);
      setBillLines([]);
      setBillLine(emptyBillLine);
      setBillSearch('');
      await loadBillHistory();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Stock bill could not be generated.');
    } finally {
      setSaving(false);
    }
  }

  async function downloadStockBill(bill = generatedBill) {
    if (!bill?.id) return;
    setError('');
    try {
      const response = await api.get(`/stock/wholesale-bills/${bill.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${bill.bill_number || 'stock-bill'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Stock bill could not be downloaded.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Stock Management</p>
          <h3 className="text-xl font-semibold text-slate-950">Branch Items</h3>
          <p className="mt-1 text-sm text-slate-500">Owner manages branches and items. Co-admins add or reduce item quantity. Production employees can view only.</p>
        </div>
        {isOwner ? (
          <button onClick={openCreateBranch} className="flex items-center justify-center gap-2 rounded-md bg-studio-mint px-4 py-2 text-sm font-semibold text-white">
            <Plus size={17} />
            Add Branch
          </button>
        ) : null}
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h4 className="font-semibold text-slate-950">Stock Reports</h4>
            <p className="mt-1 text-sm text-slate-500">Download the full stock report or open a branch and download that branch report.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadStockReport('full', 'pdf')} className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><Download size={16} /> Full PDF</button>
            <button onClick={() => downloadStockReport('full', 'excel')} className="flex items-center gap-2 rounded-md bg-teal-600 px-3 py-2 text-sm font-semibold text-white"><Download size={16} /> Full Excel</button>
            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Printer size={16} /> Print</button>
          </div>
        </div>
      </section>

      {canGenerateStockBill ? (
        <section className="rounded-md border border-teal-200 bg-white p-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <ReceiptText size={20} />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-950">Generate Wholesale Stock Bill</h4>
                  <p className="text-sm text-slate-500">Create a wholesale bill with multiple items. Stock will not reduce automatically.</p>
                </div>
              </div>
            </div>
            {generatedBill ? (
              <button type="button" onClick={() => downloadStockBill()} className="flex items-center justify-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
                <Download size={16} />
                Download {generatedBill.bill_number}
              </button>
            ) : null}
          </div>

          <form onSubmit={generateStockBill} className="mt-5 space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.55fr_0.65fr_auto]">
              <div className="relative">
                <Field label="Item name or item code">
                  <input
                    className={inputClass}
                    value={billSearch}
                    onChange={(event) => {
                      setBillSearch(event.target.value);
                      setBillLine((current) => ({ ...emptyBillLine, quantity: current.quantity || 1 }));
                    }}
                    placeholder="Type item name or code"
                  />
                </Field>
                {billItems.length ? (
                  <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {billItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectBillItem(item)}
                        className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-teal-50"
                      >
                        <span>
                          <span className="block font-semibold text-slate-950">{item.item_name}</span>
                          <span className="block text-xs text-slate-500">{item.branch_name || 'Item Master'} - {item.item_code}</span>
                        </span>
                        <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">Rs. {Number(item.unit_price || 0).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                ) : billSearch.trim() && !billLine.selected ? (
                  <button
                    type="button"
                    onClick={useCustomBillItem}
                    className="mt-2 flex w-full items-center justify-between rounded-md border border-dashed border-teal-300 bg-teal-50 px-3 py-2 text-left text-sm font-semibold text-teal-800"
                  >
                    <span>Add custom item to bill</span>
                    <span className="font-normal">{billSearch.trim()}</span>
                  </button>
                ) : null}
              </div>
              <Field label="Quantity">
                <input type="number" min="1" className={inputClass} value={billLine.quantity} onChange={(event) => setBillLine({ ...billLine, quantity: event.target.value })} />
              </Field>
              <Field label="Unit price">
                <input type="number" min="0" step="0.01" className={inputClass} value={billLine.unit_price} onChange={(event) => setBillLine({ ...billLine, unit_price: event.target.value })} placeholder="Price" />
              </Field>
              <div className="flex items-end">
                <button type="button" onClick={addBillLine} className="flex w-full items-center justify-center gap-2 rounded-md border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800">
                  <Plus size={17} />
                  Add to Bill
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {billLines.map((line, index) => (
                    <tr key={line.item_name + '-' + line.item_code + '-' + index}>
                      <td className="px-4 py-3 font-semibold text-slate-950">{line.item_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{line.item_code || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{line.branch_name || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{line.quantity}</td>
                      <td className="px-4 py-3 text-right">Rs. {Number(line.unit_price || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold">Rs. {(Number(line.quantity || 0) * Number(line.unit_price || 0)).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => removeBillLine(index)} className="rounded-md p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!billLines.length ? <p className="p-4 text-sm text-slate-500">No bill items added yet.</p> : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.8fr]">
              <Field label="Customer name (optional)">
                <input className={inputClass} value={billHeader.customer_name} onChange={(event) => setBillHeader({ ...billHeader, customer_name: event.target.value })} placeholder="Customer name" />
              </Field>
              <Field label="Note (optional)">
                <input className={inputClass} value={billHeader.note} onChange={(event) => setBillHeader({ ...billHeader, note: event.target.value })} placeholder="Bill note" />
              </Field>
              <div className="flex items-end">
                <button disabled={saving || !billLines.length} className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  <ReceiptText size={17} />
                  {saving ? 'Generating...' : `Generate Bill - Rs. ${billTotal.toLocaleString()}`}
                </button>
              </div>
            </div>
          </form>
          {billLine.item_name ? (
            <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-teal-900">
              Selected: <strong>{billLine.item_name}</strong>{billLine.branch_name ? <> from <strong>{billLine.branch_name}</strong></> : null}. Unit price: <strong>Rs. {Number(billLine.unit_price || 0).toLocaleString()}</strong>.
            </div>
          ) : null}
        </section>
      ) : null}

      {canGenerateStockBill ? (
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-semibold text-slate-950">Wholesale Bill History</h4>
              <p className="mt-1 text-sm text-slate-500">View previous wholesale stock bills and download them again.</p>
            </div>
            <button
              type="button"
              onClick={() => loadBillHistory().catch((requestError) => setError(requestError.response?.data?.message || 'Bill history could not load.'))}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-[820px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Bill No</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Generated By</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {billHistory.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-950">{bill.bill_number}</td>
                    <td className="px-4 py-3 text-slate-700">{bill.customer_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{bill.item_count || 0}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="block font-medium">{bill.generated_by_name || '-'}</span>
                      <span className="text-xs text-slate-500">{bill.generated_by_role || ''}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{bill.generated_at ? new Date(bill.generated_at).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-950">Rs. {Number(bill.total_amount || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => downloadStockBill(bill)}
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                      >
                        <Download size={14} />
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!billHistory.length ? <p className="p-4 text-sm text-slate-500">No wholesale bills generated yet.</p> : null}
          </div>
        </section>
      ) : null}

      {isOwner ? (
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h4 className="font-semibold text-slate-950">Item Master</h4>
              <p className="mt-1 text-sm text-slate-500">Add item name and item code once, then reuse it inside every branch.</p>
            </div>
            <form onSubmit={saveCatalogItem} className="grid w-full flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_160px_150px_auto]">
              <input
                className={inputClass}
                placeholder="Item name"
                value={catalogForm.item_name}
                onChange={(event) => setCatalogForm({ ...catalogForm, item_name: event.target.value })}
                required
              />
              <input
                className={inputClass}
                placeholder="Item code"
                value={catalogForm.item_code}
                onChange={(event) => setCatalogForm({ ...catalogForm, item_code: event.target.value })}
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                placeholder="Unit price"
                value={catalogForm.unit_price}
                onChange={(event) => setCatalogForm({ ...catalogForm, unit_price: event.target.value })}
              />
              <button disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? 'Saving...' : editingCatalogItem ? 'Update Item' : 'Add Item'}
              </button>
            </form>
          </div>
          {editingCatalogItem ? (
            <button
              onClick={() => { setEditingCatalogItem(null); setCatalogForm(emptyCatalogItem); }}
              className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Cancel edit
            </button>
          ) : null}
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {catalogItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                <div>
                  <p className="font-semibold text-slate-950">{item.item_name}</p>
                  <p className="font-mono text-xs text-slate-500">{item.item_code}</p>
                  <p className="text-xs font-semibold text-teal-700">Rs. {Number(item.unit_price || 0).toLocaleString()}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEditCatalogItem(item)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" title="Edit item"><Edit3 size={16} /></button>
                  <button onClick={() => removeCatalogItem(item)} className="rounded-md p-2 text-rose-600 hover:bg-rose-50" title="Delete item"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
            {!catalogItems.length ? <p className="text-sm text-slate-500">No master items added yet.</p> : null}
          </div>
        </section>
      ) : null}

      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div> : null}
      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Branches</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{branches.length}</p>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total Item Quantity</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{totalQuantity}</p>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((branch) => (
          <section key={branch.id} className={`rounded-md border bg-white p-5 shadow-sm ${selectedBranch?.id === branch.id ? 'border-teal-400 ring-2 ring-teal-100' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                  <Warehouse size={21} />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-950">{branch.branch_name}</h4>
                  <p className="text-sm text-slate-500">{branch.short_code} · {branch.item_count || 0} items</p>
                </div>
              </div>
              <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">Qty {branch.quantity}</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => openBranch(branch)} className="flex items-center gap-2 rounded-md border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Eye size={16} /> Open Items</button>
              {isOwner ? (
                <>
                  <button onClick={() => openEditBranch(branch)} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Edit3 size={16} /> Edit</button>
                  <button onClick={() => removeBranch(branch)} className="flex items-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={16} /> Delete</button>
                </>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      {selectedBranch ? (
        <section className="rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{selectedBranch.short_code}</p>
              <h4 className="text-lg font-semibold text-slate-950">{selectedBranch.branch_name} Items</h4>
              <p className="mt-1 text-sm text-slate-500">Total quantity: {selectedQuantity}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => downloadStockReport('branch', 'pdf')} className="flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={16} /> Branch PDF</button>
              <button onClick={() => downloadStockReport('branch', 'excel')} className="flex items-center justify-center gap-2 rounded-md border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Download size={16} /> Branch Excel</button>
              {canAddBranchItems ? (
                <button onClick={openCreateItem} className="flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  <Plus size={17} />
                  Add Item
                </button>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Item Code</th>
                  <th className="px-5 py-3">Quantity</th>
                  <th className="px-5 py-3">Unit Price</th>
                  <th className="px-5 py-3">Stock Value</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700"><Package size={17} /></div>
                        <span className="font-semibold text-slate-950">{item.item_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-slate-700">{item.item_code}</td>
                    <td className="px-5 py-4 font-semibold text-slate-950">{item.quantity}</td>
                    <td className="px-5 py-4 font-semibold text-teal-700">Rs. {Number(item.unit_price || 0).toLocaleString()}</td>
                    <td className="px-5 py-4 font-semibold text-slate-950">Rs. {(Number(item.quantity || 0) * Number(item.unit_price || 0)).toLocaleString()}</td>
                    <td className="px-5 py-4 text-slate-500">{item.updated_at ? new Date(item.updated_at).toLocaleString() : '-'}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canAdjust ? (
                          <>
                            <button onClick={() => openAdjustItem(item, 'ADD')} className="rounded-md border border-emerald-200 px-3 py-2 font-semibold text-emerald-700 hover:bg-emerald-50"><Plus size={15} /></button>
                            <button onClick={() => openAdjustItem(item, 'REDUCE')} className="rounded-md border border-orange-200 px-3 py-2 font-semibold text-orange-700 hover:bg-orange-50"><Minus size={15} /></button>
                          </>
                        ) : null}
                        <button onClick={() => openItemHistory(item)} className="rounded-md border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"><History size={15} /></button>
                        {isOwner ? (
                          <>
                            <button onClick={() => openEditItem(item)} className="rounded-md border border-slate-200 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"><Edit3 size={15} /></button>
                            <button onClick={() => removeItem(item)} className="rounded-md border border-rose-200 px-3 py-2 font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={15} /></button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length ? <p className="p-5 text-sm text-slate-500">No items added for this branch yet.</p> : null}
          </div>
        </section>
      ) : null}

      <Modal title={editingBranch ? 'Edit Branch' : 'Add Branch'} open={branchModalOpen} onClose={() => setBranchModalOpen(false)}>
        <form onSubmit={saveBranch} className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch name"><input className={inputClass} value={branchForm.branch_name} onChange={(event) => setBranchForm({ ...branchForm, branch_name: event.target.value })} placeholder="Kurunegala Branch" required /></Field>
          <Field label="Short code"><input className={inputClass} value={branchForm.short_code} onChange={(event) => setBranchForm({ ...branchForm, short_code: event.target.value })} placeholder="KUR" required /></Field>
          <div className="sm:col-span-2 flex justify-end border-t border-slate-200 pt-4">
            <button disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save Branch'}</button>
          </div>
        </form>
      </Modal>

      <Modal title={editingItem ? 'Edit Item' : `Add Item ${selectedBranch ? `- ${selectedBranch.branch_name}` : ''}`} open={itemModalOpen} onClose={() => setItemModalOpen(false)}>
        <form onSubmit={saveItem} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Search existing item by name or code">
              <input
                className={inputClass}
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="Type item name or item code"
              />
            </Field>
            {filteredCatalogItems.length ? (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-slate-200 bg-white">
                {filteredCatalogItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setItemForm({ ...itemForm, item_name: item.item_name, item_code: item.item_code, unit_price: item.unit_price || 0 });
                      setCatalogSearch(`${item.item_name} (${item.item_code})`);
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-teal-50"
                  >
                    <span className="font-semibold text-slate-900">{item.item_name}</span>
                    <span className="text-right">
                      <span className="block font-mono text-xs text-slate-500">{item.item_code}</span>
                      <span className="block text-xs font-semibold text-teal-700">Rs. {Number(item.unit_price || 0).toLocaleString()}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : catalogSearch ? (
              <p className="mt-2 text-xs text-slate-500">No existing item found. You can type a new item below.</p>
            ) : null}
          </div>
          <Field label="Item name"><input className={inputClass} value={itemForm.item_name} onChange={(event) => setItemForm({ ...itemForm, item_name: event.target.value })} placeholder="Frame board" required /></Field>
          <Field label="Item code"><input className={inputClass} value={itemForm.item_code} onChange={(event) => setItemForm({ ...itemForm, item_code: event.target.value })} placeholder="FRM-001" required /></Field>
          <Field label="Quantity"><input type="number" min="0" className={inputClass} value={itemForm.quantity} onChange={(event) => setItemForm({ ...itemForm, quantity: event.target.value })} required /></Field>
          <Field label="Unit price"><input type="number" min="0" step="0.01" className={inputClass} value={itemForm.unit_price} onChange={(event) => setItemForm({ ...itemForm, unit_price: event.target.value })} placeholder="0.00" /></Field>
          <div className="sm:col-span-2 rounded-md border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">
            Full amount preview: <strong>Rs. {itemFormTotal.toLocaleString()}</strong>
          </div>
          <div className="sm:col-span-2 flex justify-end border-t border-slate-200 pt-4">
            <button disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save Item'}</button>
          </div>
        </form>
      </Modal>

      <Modal title={`${adjustForm.type === 'ADD' ? 'Add Stock' : 'Reduce Stock'} - ${adjustItem?.item_name || ''}`} open={Boolean(adjustItem)} onClose={() => setAdjustItem(null)}>
        <form onSubmit={saveItemAdjustment} className="grid gap-4 sm:grid-cols-2">
          <Field label="Action"><select className={inputClass} value={adjustForm.type} onChange={(event) => setAdjustForm({ ...adjustForm, type: event.target.value })}><option value="ADD">Add stock</option><option value="REDUCE">Reduce stock</option></select></Field>
          <Field label="Quantity"><input type="number" min="1" className={inputClass} value={adjustForm.quantity} onChange={(event) => setAdjustForm({ ...adjustForm, quantity: event.target.value })} required /></Field>
          <div className="sm:col-span-2"><Field label="Note"><input className={inputClass} value={adjustForm.note} onChange={(event) => setAdjustForm({ ...adjustForm, note: event.target.value })} placeholder="Optional note" /></Field></div>
          <div className="sm:col-span-2 flex justify-end border-t border-slate-200 pt-4">
            <button disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save Stock'}</button>
          </div>
        </form>
      </Modal>

      <Modal title={`Stock History ${historyItem?.item_name || ''}`} open={Boolean(historyItem)} onClose={() => { setHistoryItem(null); setHistoryRows([]); }}>
        <div className="overflow-x-auto">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Change</th><th className="px-3 py-2">Previous</th><th className="px-3 py-2">New</th><th className="px-3 py-2">By</th><th className="px-3 py-2">Note</th><th className="px-3 py-2">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 font-semibold">{row.movement_type}</td>
                  <td className="px-3 py-2">{row.quantity_change}</td>
                  <td className="px-3 py-2">{row.previous_quantity}</td>
                  <td className="px-3 py-2">{row.new_quantity}</td>
                  <td className="px-3 py-2">{row.changed_by_name} ({row.changed_by_role})</td>
                  <td className="px-3 py-2">{row.note || '-'}</td>
                  <td className="px-3 py-2">{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!historyRows.length ? <p className="p-4 text-sm text-slate-500">No stock history yet.</p> : null}
        </div>
      </Modal>
    </div>
  );
}
