import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, Bell, Boxes, ClipboardList, FileSpreadsheet, LogOut, Settings, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';

const adminLinks = [
  { to: '/admin', label: 'Dashboard', icon: BarChart3 },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet },
  { to: '/admin/settings', label: 'Settings', icon: Settings }
];

const productionLinks = [
  { to: '/production', label: 'Production', icon: Boxes }
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const links = isAdminRole(user?.role) ? adminLinks : productionLinks;

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside className="bg-studio-panel text-white lg:fixed lg:inset-y-0 lg:w-72">
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">Naveen</p>
            <h1 className="mt-1 text-xl font-semibold">Digital Studio</h1>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-4 py-4 lg:flex-1 lg:flex-col lg:overflow-visible">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/admin' || to === '/production'}
                className={({ isActive }) =>
                  `flex min-w-max items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-white text-studio-ink' : 'text-slate-200 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-white/10 p-4">
            <div className="flex items-center justify-between gap-3 rounded-md bg-white/8 p-3">
              <div>
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs capitalize text-slate-300">{user?.role}</p>
              </div>
              <button onClick={logout} className="rounded-md p-2 text-slate-200 hover:bg-white/10" title="Log out">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-h-screen flex-1 lg:ml-72">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Order and Production</p>
            <h2 className="text-lg font-semibold text-slate-950">Management System</h2>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-50 text-studio-coral">
            <Bell size={19} />
          </div>
        </header>
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
