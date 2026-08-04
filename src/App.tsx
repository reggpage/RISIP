import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import RequireAuth from '@/guards/RequireAuth';
import RequireRole from '@/guards/RequireRole';
import Login from '@/routes/auth/Login';
import ForgotPassword from '@/routes/auth/ForgotPassword';
import SignupCompany from '@/routes/auth/SignupCompany';
import JoinPage from '@/routes/join/JoinPage';
import FindCompany from '@/routes/find/FindCompany';
import SupplierPortal from '@/routes/claims/SupplierPortal';
import ClaimsInbox from '@/routes/claims/ClaimsInbox';
import Landing from '@/routes/marketing/Landing';
import ProjectsList from '@/routes/projects/ProjectsList';
import NewProject from '@/routes/projects/NewProject';
import EditProject from '@/routes/projects/EditProject';
import ProjectDetail from '@/routes/projects/ProjectDetail';
import ReceiptsPage from '@/routes/receipts/ReceiptsPage';
import ManualReceipt from '@/routes/receipts/ManualReceipt';
import Dashboard from '@/routes/dashboard/Dashboard';
import InvoicesPage from '@/routes/invoices/InvoicesPage';
import InvoiceEditor from '@/routes/invoices/InvoiceEditor';
import PublicInvoice from '@/routes/invoices/PublicInvoice';
import PettyCashPage from '@/routes/pettyCash/PettyCashPage';
import SettingsPage from '@/routes/settings/SettingsPage';

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/signup" element={<SignupCompany />} />
      <Route path="/find-company" element={<FindCompany />} />
      <Route path="/supplier-claims" element={<SupplierPortal />} />
      <Route path="/join/:token" element={<JoinPage />} />
      {/* Public, no-login invoice view opened by the client via secure token. */}
      <Route path="/public/invoices/:token" element={<PublicInvoice />} />

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
        <Route
          path="/projects/:id/edit"
          element={
            <RequireRole allowed={['owner']}>
              <EditProject />
            </RequireRole>
          }
        />

        <Route path="/receipts" element={<ReceiptsPage />} />
        <Route path="/receipts/new" element={<ManualReceipt />} />
        <Route
          path="/claims"
          element={
            <RequireRole allowed={['owner', 'accountant']}>
              <ClaimsInbox />
            </RequireRole>
          }
        />

        <Route
          path="/invoices"
          element={
            <RequireRole allowed={['owner', 'accountant']}>
              <InvoicesPage />
            </RequireRole>
          }
        />
        <Route
          path="/invoices/:id/edit"
          element={
            <RequireRole allowed={['owner', 'accountant']}>
              <InvoiceEditor />
            </RequireRole>
          }
        />
        <Route
          path="/petty-cash"
          element={
            <RequireRole allowed={['owner', 'accountant']}>
              <PettyCashPage />
            </RequireRole>
          }
        />

        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
