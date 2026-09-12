import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from '@/guards/RequireAuth';
import RequireRole from '@/guards/RequireRole';
import ScanOverlayHost from '@/components/layout/ScanOverlayHost';
import Landing from '@/routes/marketing/Landing';
import WhatsAppAuth from '@/routes/auth/WhatsAppAuth';
import InstallPromptBanner from '@/components/pwa/InstallPromptBanner';
import { isNative } from '@/lib/native';
import AppDeepLink from '@/components/navigation/AppDeepLink';

// Load business screens when opened, keeping the public landing page lightweight.
const AppShell = lazy(() => import('@/components/layout/AppShell'));
const WaLogin = lazy(() => import('@/routes/auth/WaLogin'));
const BusinessSignup = lazy(() => import('@/routes/auth/BusinessSignup'));
const ClaimsInbox = lazy(() => import('@/routes/claims/ClaimsInbox'));
const ProjectsList = lazy(() => import('@/routes/projects/ProjectsList'));
const NewProject = lazy(() => import('@/routes/projects/NewProject'));
const EditProject = lazy(() => import('@/routes/projects/EditProject'));
const ProjectDetail = lazy(() => import('@/routes/projects/ProjectDetail'));
const ReceiptsPage = lazy(() => import('@/routes/receipts/ReceiptsPage'));
const ManualReceipt = lazy(() => import('@/routes/receipts/ManualReceipt'));
const Dashboard = lazy(() => import('@/routes/dashboard/Dashboard'));
const InvoicesPage = lazy(() => import('@/routes/invoices/InvoicesPage'));
const InvoiceEditor = lazy(() => import('@/routes/invoices/InvoiceEditor'));
const PublicInvoice = lazy(() => import('@/routes/invoices/PublicInvoice'));
const PettyCashPage = lazy(() => import('@/routes/pettyCash/PettyCashPage'));
const SettingsPage = lazy(() => import('@/routes/settings/SettingsPage'));
const BillingPage = lazy(() => import('@/routes/billing/BillingPage'));
const NotificationsPage = lazy(() => import('@/routes/notifications/NotificationsPage'));
const RetirementsPage = lazy(() => import('@/routes/retirements/RetirementsPage'));
const ReimbursementsPage = lazy(() => import('@/routes/reimbursements/ReimbursementsPage'));
const DailyRecordsPage = lazy(() => import('@/routes/dailyRecords/DailyRecordsPage'));
const ProductsPage = lazy(() => import('@/routes/products/ProductsPage'));
const ScanPage = lazy(() => import('@/routes/products/ScanPage'));
const SellPage = lazy(() => import('@/routes/products/SellPage'));
const ChatPage = lazy(() => import('@/routes/chat/ChatPage'));
const LegalPage = lazy(() => import('@/routes/legal/LegalPage'));

/**
 * Branded launch screen shown only inside the installed app while a business
 * screen's chunk is downloading. It is a plain paper surface just like the
 * sign-in page — never a logo flash — so the installed app never shows a
 * black gap or a dead preloader between screens.
 */
function NativeBootScreen() {
  return <div className="h-dvh w-full" style={{ background: '#f6f5f0' }} aria-hidden="true" />;
}

/**
 * Installed-app entry point. The marketing landing page is a website touch:
 * inside the native shell we boot straight into the sign-in form — it is
 * loaded eagerly, so the splash melts right into it, and it already redirects
 * signed-in sessions to the dashboard. The web stays as-is.
 */
function HomeEntry() {
  if (!isNative()) return <Landing />;
  return <WhatsAppAuth mode="login" />;
}

export default function App() {
  // Route chunks lazy-load on first visit. On the web that flash of the
  // branded loading screen is a deliberate touch; inside the native app it
  // becomes a plain paper surface so nothing ever looks like a preloader or
  // a black hole.
  const fallback = isNative()
    ? <NativeBootScreen />
    : <div className="grid min-h-screen place-items-center bg-white" role="status" aria-label="Loading Risip"><span className="text-xl font-semibold text-role-admin">Risip</span></div>;
  return (
    <>
      <Suspense fallback={fallback}>
      <Routes>
      {/* Public routes */}
      <Route path="/" element={<HomeEntry />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/policies" element={<Navigate to="/privacy" replace />} />
      <Route path="/login" element={<WhatsAppAuth mode="login" />} />
      <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
      {/* Spends a one-shot WhatsApp login token and starts a session. Public
          because the token is the credential; it lives 5 minutes and works once. */}
      <Route path="/wa-login" element={<WaLogin />} />
      <Route path="/signup" element={<BusinessSignup />} />
      {/* Retired public entry points never expose the old company directory or
          shared-password flow. Existing links land on WhatsApp onboarding. */}
      <Route path="/find-company" element={<Navigate to="/signup" replace />} />
      <Route path="/supplier-claims" element={<Navigate to="/login" replace />} />
      <Route path="/join/:token" element={<Navigate to="/signup" replace />} />
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
        <Route path="/chat" element={<ChatPage />} />

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
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/retirements" element={<RetirementsPage />} />
        <Route path="/reimbursements" element={<ReimbursementsPage />} />
        <Route path="/daily-records" element={<DailyRecordsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/sell" element={<SellPage />} />
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
        {/* Billing is the owner's business: a worker who guesses this URL is
            turned away here, and RLS turns them away again underneath. */}
        <Route
          path="/billing"
          element={(
            <RequireRole allowed={['owner']}>
              <BillingPage />
            </RequireRole>
          )}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AppDeepLink />
      <ScanOverlayHost />
      </Suspense>
      <InstallPromptBanner />
    </>
  );
}
