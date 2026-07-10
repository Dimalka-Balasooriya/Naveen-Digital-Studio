import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import DashboardLayout from './components/DashboardLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import OrdersPage from './pages/admin/OrdersPage';
import SettingsPage from './pages/admin/SettingsPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import ReportsPage from './pages/admin/ReportsPage';
import ProductionDashboard from './pages/production/ProductionDashboard';
import HelpPage from './pages/HelpPage';
import StockPage from './pages/StockPage';
import MessagesPage from './pages/MessagesPage';
import CommissionPage from './pages/CommissionPage';
import { isAdminRole, normalizeRole } from './utils/roles';

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const role = normalizeRole(user.role);
  if (roles && !roles.map(normalizeRole).includes(role)) {
    return <Navigate to={isAdminRole(role) ? '/admin' : '/production'} replace />;
  }
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={isAdminRole(user.role) ? '/admin' : '/production'} replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={isAdminRole(user?.role) ? '/admin' : '/production'} replace />} />
        <Route path="admin" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="admin/orders" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><OrdersPage /></ProtectedRoute>} />
        <Route path="admin/employees" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><EmployeesPage /></ProtectedRoute>} />
        <Route path="admin/reports" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><ReportsPage /></ProtectedRoute>} />
        <Route path="admin/settings" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><SettingsPage /></ProtectedRoute>} />
        <Route path="production" element={<ProtectedRoute roles={['PRODUCTION_EMPLOYEE', 'OWNER', 'CO_ADMIN']}><ProductionDashboard /></ProtectedRoute>} />
        <Route path="stock" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><StockPage /></ProtectedRoute>} />
        <Route path="messages" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE']}><MessagesPage /></ProtectedRoute>} />
        <Route path="commissions" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE']}><CommissionPage /></ProtectedRoute>} />
        <Route path="help" element={<HelpPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
