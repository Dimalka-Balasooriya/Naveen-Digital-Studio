import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { BarChart3, Bell, Boxes, ClipboardList, FileSpreadsheet, HelpCircle, LogOut, Mail, Settings, Users, WalletCards, Warehouse } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { isAdminRole, isCoAdmin } from '../utils/roles';
import StudioLogo from './StudioLogo';

const adminLinks = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3 },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/stock', label: 'Stock', icon: Warehouse },
  { to: '/messages', label: 'Messages', icon: Mail, badge: 'messages' },
  { to: '/commissions', label: 'Commission', icon: WalletCards },
  { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help', icon: HelpCircle }
];

const productionLinks = [
  { to: '/production', label: 'Production', icon: Boxes },
  { to: '/messages', label: 'Messages', icon: Mail, badge: 'messages' },
  { to: '/commissions', label: 'Commission', icon: WalletCards },
  { to: '/help', label: 'Help', icon: HelpCircle }
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const links = isAdminRole(user?.role) ? adminLinks : productionLinks;
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [rearrangeReminders, setRearrangeReminders] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!user) return undefined;
    let isMounted = true;

    async function loadUnreadMessages() {
      const { data } = await api.get('/messages/unread-count');
      if (isMounted) setUnreadMessages(Number(data.unread_count || 0));
    }

    loadUnreadMessages().catch(() => {});
    const intervalId = window.setInterval(() => {
      loadUnreadMessages().catch(() => {});
    }, 60 * 1000);

    window.addEventListener('nds-messages-updated', loadUnreadMessages);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('nds-messages-updated', loadUnreadMessages);
    };
  }, [user]);

  useEffect(() => {
    if (!isCoAdmin(user?.role)) return undefined;

    let isMounted = true;
    async function loadRearrangeReminders() {
      const { data } = await api.get('/notifications/rearrange-reminders');
      if (isMounted) setRearrangeReminders(data);
    }

    loadRearrangeReminders().catch(() => {});
    const intervalId = window.setInterval(() => {
      loadRearrangeReminders().catch(() => {});
    }, 30 * 60 * 1000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [user?.role]);

  useEffect(() => {
    if (!['CO_ADMIN', 'PRODUCTION_EMPLOYEE'].includes(String(user?.role || '').toUpperCase())) return undefined;

    const remindLogout = (event) => {
      event.preventDefault();
      event.returnValue = 'Please logout before leaving so evening attendance can be recorded.';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', remindLogout);
    return () => window.removeEventListener('beforeunload', remindLogout);
  }, [user?.role]);

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside className="bg-[linear-gradient(180deg,#0f172a_0%,#132238_54%,#0f766e_140%)] text-white shadow-2xl shadow-slate-950/25 lg:fixed lg:inset-y-0 lg:h-screen lg:w-72">
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-white/10 px-6 py-6">
            <StudioLogo />
          </div>

          <nav className="flex min-h-0 gap-2 overflow-x-auto px-4 py-5 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
            {links.map(({ to, label, icon: Icon, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/admin' || to === '/production'}
                className={({ isActive }) =>
                  `group relative flex min-w-max items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    isActive ? 'bg-white text-studio-ink shadow-lg shadow-slate-950/10' : 'text-slate-200 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/8 text-teal-100 transition group-hover:bg-white/15 group-hover:text-white">
                  <Icon size={18} />
                </span>
                <span className="flex-1">{label}</span>
                {badge === 'messages' && unreadMessages > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs font-semibold text-white">
                    {unreadMessages}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>

          <div className="shrink-0 border-t border-white/10 p-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 shadow-inner shadow-white/5">
              <div>
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs capitalize text-slate-300">{user?.role}</p>
              </div>
              <button onClick={logout} className="rounded-lg p-2 text-slate-200 transition hover:bg-white/15 hover:text-white" title="Log out">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-screen flex-1 lg:ml-72">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/70 bg-white/90 px-5 py-4 shadow-sm shadow-slate-200/70 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="hidden sm:block"><StudioLogo compact dark /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Order and Production</p>
              <h2 className="text-lg font-semibold text-slate-950">Management System</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NavLink
              to="/messages"
              className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shadow-sm transition hover:bg-teal-50 hover:text-teal-700"
              title="Messages"
            >
              <Mail size={19} />
              {unreadMessages > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-semibold text-white">
                  {unreadMessages}
                </span>
              ) : null}
            </NavLink>
          {isCoAdmin(user?.role) ? <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotificationsOpen((value) => !value)}
              className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-studio-coral shadow-sm transition hover:bg-orange-100"
              title="Rearrange reminders"
            >
              <Bell size={19} />
              {rearrangeReminders.length ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-semibold text-white">
                  {rearrangeReminders.length}
                </span>
              ) : null}
            </button>
            {isNotificationsOpen ? (
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl shadow-slate-950/10">
                <h3 className="text-sm font-semibold text-slate-950">Rearrange reminders</h3>
                {rearrangeReminders.length ? (
                  <div className="mt-3 space-y-2">
                    {rearrangeReminders.map((reminder) => (
                      <div key={`${reminder.order_id}-${reminder.rearranged_at}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm font-semibold text-slate-950">{reminder.order_number}</p>
                        <p className="text-xs text-slate-600">{reminder.customer_name} · {reminder.current_status}</p>
                        <p className="mt-1 text-sm text-amber-800">{reminder.message}</p>
                        <p className="mt-1 text-xs text-slate-500">{new Date(reminder.rearranged_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No rearrange reminders.</p>
                )}
              </div>
            ) : null}
          </div> : null}
          </div>
        </header>
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
          <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p>Copyright {new Date().getFullYear()} Naveen Digital Studio. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
