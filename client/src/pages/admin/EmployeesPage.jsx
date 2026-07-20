import { useEffect, useState } from 'react';
import { Edit3, Plus, RotateCcw, Trash2, UserRoundX } from 'lucide-react';
import { api } from '../../services/api';
import Modal from '../../components/Modal';
import { Field, inputClass } from '../../components/FormFields';
import PasswordField from '../../components/PasswordField';

const emptyEmployee = { name: '', email: '', phone: '', address: '', role: 'PRODUCTION_EMPLOYEE', password: '', confirm_password: '', is_active: true };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyEmployee);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);

  async function load() {
    const { data } = await api.get('/employees');
    setEmployees(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (saving) return;
    if (form.password !== form.confirm_password) {
      setError('Password and confirm password must match.');
      return;
    }
    if (!editingEmployee && !form.password) {
      setError('Password is required when creating a user.');
      return;
    }
    setSaving(true);
    try {
      const { confirm_password, ...payload } = form;
      if (editingEmployee && !payload.password) delete payload.password;
      if (editingEmployee) {
        await api.put(`/employees/${editingEmployee.id}`, payload);
        setNotice('Employee updated successfully.');
      } else {
        await api.post('/employees', payload);
        setNotice(form.role === 'CO_ADMIN' ? 'CO_ADMIN created successfully.' : form.role === 'DESIGN_TEAM' ? 'Design team member created successfully.' : 'Employee created successfully.');
      }
      setForm(emptyEmployee);
      setEditingEmployee(null);
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Employee could not be saved. Check the details and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id) {
    await api.patch(`/employees/${id}/status`, { is_active: false });
    await load();
  }

  async function activate(id) {
    await api.patch(`/employees/${id}/status`, { is_active: true });
    await load();
  }

  async function deleteEmployee(id) {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    await api.delete(`/employees/${id}`);
    await load();
  }

  function openCreate() {
    setEditingEmployee(null);
    setForm(emptyEmployee);
    setError('');
    setModalOpen(true);
  }

  function openEdit(employee) {
    setEditingEmployee(employee);
    setForm({
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      address: employee.address || '',
      role: employee.role || 'PRODUCTION_EMPLOYEE',
      password: '',
      confirm_password: '',
      is_active: Boolean(employee.is_active)
    });
    setError('');
    setModalOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-slate-950">Employee Management</h3>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-md bg-studio-mint px-4 py-2 text-sm font-semibold text-white">
          <Plus size={17} />
          Add Employee
        </button>
      </div>

      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {employees.filter((employee) => employee.role !== 'OWNER').map((employee) => (
          <div key={employee.id} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-950">{employee.name}</h4>
                <p className="text-sm text-slate-500">{employee.email}</p>
                <p className="mt-1 text-xs capitalize text-slate-500">{employee.role}</p>
              </div>
              <span className={`rounded px-2 py-1 text-xs font-semibold ${employee.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                {employee.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded bg-slate-50 p-3">
                <p className="text-slate-500">Assigned</p>
                <p className="text-lg font-semibold">{employee.assigned_orders || 0}</p>
              </div>
              <div className="rounded bg-slate-50 p-3">
                <p className="text-slate-500">Completed</p>
                <p className="text-lg font-semibold">{employee.completed_orders || 0}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {employee.is_active ? (
                <button onClick={() => deactivate(employee.id)} className="flex items-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                  <UserRoundX size={16} />
                  Deactivate
                </button>
              ) : (
                <>
                  <button onClick={() => activate(employee.id)} className="flex items-center gap-2 rounded-md border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                    <RotateCcw size={16} />
                    Activate
                  </button>
                  <button onClick={() => deleteEmployee(employee.id)} className="flex items-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                    <Trash2 size={16} />
                    Delete
                  </button>
                </>
              )}
              <button onClick={() => openEdit(employee)} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Edit3 size={16} />
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal title={editingEmployee ? 'Edit Employee' : 'Add Employee'} open={modalOpen} onClose={() => { setModalOpen(false); setError(''); setEditingEmployee(null); }}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error ? <div className="sm:col-span-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          <Field label="Name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
          <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Address"><input className={inputClass} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
          <Field label="Role"><select className={inputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="CO_ADMIN">Co-admin</option>
            <option value="PRODUCTION_EMPLOYEE">Production Employee</option>
            <option value="DESIGN_TEAM">Design Team</option>
          </select></Field>
          <Field label={editingEmployee ? 'New password' : 'Password'}>
            <PasswordField autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editingEmployee} />
          </Field>
          <Field label="Confirm password">
            <PasswordField autoComplete="new-password" value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required={!editingEmployee || Boolean(form.password)} />
          </Field>
          <div className="sm:col-span-2 flex justify-end border-t border-slate-200 pt-4">
            <button disabled={saving} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Saving...' : editingEmployee ? 'Update employee' : 'Save employee'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
