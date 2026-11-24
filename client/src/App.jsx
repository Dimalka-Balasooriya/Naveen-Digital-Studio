import CallingDashboard from './pages/calling/CallingDashboard';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import DashboardLayout from './components/DashboardLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import OrdersPage from './pages/admin/OrdersPage';
import SettingsPage from './pages/admin/SettingsPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import ReportsPage from './pages/admin/ReportsPage';
import DesignerPerformanceReport from './pages/admin/DesignerPerformanceReport';
import ProductionDashboard from './pages/production/ProductionDashboard';
import CorrectionPanel from './pages/production/CorrectionPanel';
import HelpPage from './pages/HelpPage';
import StockPage from './pages/StockPage';
import MessagesPage from './pages/MessagesPage';
import CommissionPage from './pages/CommissionPage';
import { homePath, normalizeRole } from './utils/roles';

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const role = normalizeRole(user.role);
  if (roles && !roles.map(normalizeRole).includes(role)) {
    return <Navigate to={homePath(role)} replace />;
  }
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homePath(user.role)} replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={homePath(user?.role)} replace />} />
        <Route path="admin" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="admin/orders" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><OrdersPage /></ProtectedRoute>} />
        <Route path="admin/employees" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><EmployeesPage /></ProtectedRoute>} />
        <Route path="admin/reports" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><ReportsPage /></ProtectedRoute>} />
        <Route path="admin/designer-performance" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><DesignerPerformanceReport /></ProtectedRoute>} />
        <Route path="admin/settings" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><SettingsPage /></ProtectedRoute>} />
        <Route path="calling" element={<ProtectedRoute roles={['CALLING_AGENT']}><CallingDashboard /></ProtectedRoute>} />
        <Route path="production" element={<ProtectedRoute roles={['PRODUCTION_EMPLOYEE', 'DESIGN_TEAM', 'OWNER', 'CO_ADMIN']}><ProductionDashboard /></ProtectedRoute>} />
        <Route path="correction" element={<ProtectedRoute roles={['DESIGN_TEAM']}><CorrectionPanel /></ProtectedRoute>} />
        <Route path="stock" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN']}><StockPage /></ProtectedRoute>} />
        <Route path="messages" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE', 'DESIGN_TEAM']}><MessagesPage /></ProtectedRoute>} />
        <Route path="commissions" element={<ProtectedRoute roles={['OWNER', 'CO_ADMIN', 'PRODUCTION_EMPLOYEE', 'DESIGN_TEAM']}><CommissionPage /></ProtectedRoute>} />
        <Route path="help" element={<HelpPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
