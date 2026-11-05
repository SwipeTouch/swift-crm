import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './auth';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LeadsPool from './pages/LeadsPool';
import Funnels from './pages/Funnels';
import ImportPage from './pages/ImportPage';
import Users from './pages/Users';
import Configuration from './pages/Configuration';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 120 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leads" element={<LeadsPool />} />
        <Route
          path="/funnels"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'MANAGER']}>
              <Funnels />
            </RequireRole>
          }
        />
        <Route
          path="/import"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'MANAGER']}>
              <ImportPage />
            </RequireRole>
          }
        />
        <Route
          path="/users"
          element={
            <RequireRole roles={['SUPER_ADMIN', 'MANAGER']}>
              <Users />
            </RequireRole>
          }
        />
        <Route
          path="/config"
          element={
            <RequireRole roles={['SUPER_ADMIN']}>
              <Configuration />
            </RequireRole>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
