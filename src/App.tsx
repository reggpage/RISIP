import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import RequireAuth from '@/guards/RequireAuth';
import RequireRole from '@/guards/RequireRole';
import Login from '@/routes/auth/Login';
import SignupCompany from '@/routes/auth/SignupCompany';
import JoinPage from '@/routes/join/JoinPage';
import Landing from '@/routes/marketing/Landing';
import ProjectsList from '@/routes/projects/ProjectsList';
import NewProject from '@/routes/projects/NewProject';
import ProjectDetail from '@/routes/projects/ProjectDetail';
import ReceiptsPage from '@/routes/receipts/ReceiptsPage';
import Dashboard from '@/routes/dashboard/Dashboard';
import InvoicesPage from '@/routes/invoices/InvoicesPage';
import { sw } from '@/i18n/sw';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-ink-muted">{sw.common.comingSoon}</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignupCompany />} />
      <Route path="/join/:token" element={<JoinPage />} />

      {/* Authed app */}
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/projects" element={<ProjectsList />} />
        <Route
          path="/projects/new"
          element={
            <RequireRole allowed={['owner']}>
              <NewProject />
            </RequireRole>
          }
        />
        <Route path="/projects/:id" element={<ProjectDetail />} />

        <Route path="/receipts" element={<ReceiptsPage />} />

        <Route
          path="/invoices"
          element={
            <RequireRole allowed={['owner', 'accountant']}>
              <InvoicesPage />
            </RequireRole>
          }
        />

        <Route path="/settings" element={<Placeholder title={sw.nav.settings} />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
