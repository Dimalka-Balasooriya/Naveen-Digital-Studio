import { useEffect, useState } from 'react';
import { Plus, UserRoundX } from 'lucide-react';
import { api } from '../../services/api';
import Modal from '../../components/Modal';
import { Field, inputClass } from '../../components/FormFields';
import { isOwner } from '../../utils/roles';
import { useAuth } from '../../context/AuthContext';

const emptyEmployee = { name: '', email: '', phone: '', role: 'PRODUCTION_EMPLOYEE', password: 'password123', is_active: true };

export default function EmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyEmployee);

  async function load() {
    const { data } = await api.get('/employees');
    setEmployees(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event) {
    event.preventDefault();
    await api.post('/employees', form);
    setForm(emptyEmployee);
    setModalOpen(false);
    await load();
  }

  async function deactivate(id) {
    await api.delete(`/employees/${id}`);
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-slate-950">Employee Management</h3>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 rounded-md bg-studio-mint px-4 py-2 text-sm font-semibold text-white">
          <Plus size={17} />
          Add Employee
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {employees.map((employee) => (
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
            {employee.is_active ? (
              <button onClick={() => deactivate(employee.id)} className="mt-4 flex items-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                <UserRoundX size={16} />
                Deactivate
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <Modal title="Add Employee" open={modalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
          <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Role"><select className={inputClass} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            {isOwner(user?.role) ? <option value="OWNER">Owner</option> : null}
            {isOwner(user?.role) ? <option value="CO_ADMIN">Co-admin</option> : null}
            <option value="PRODUCTION_EMPLOYEE">Production Employee</option>
          </select></Field>
          <Field label="Password"><input className={inputClass} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></Field>
          <div className="sm:col-span-2 flex justify-end border-t border-slate-200 pt-4">
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save employee</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
