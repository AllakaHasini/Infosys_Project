import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import EKYCVerifyPage from './pages/EKYCVerifyPage'
import DocumentPage from './pages/DocumentPage'
import LivenessPage from './pages/LivenessPage'
import RiskScorePage from './pages/RiskScorePage'
import ApplicationsPage from './pages/ApplicationsPage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'
import BatchVerifyPage from './pages/BatchVerifyPage'
import AuditLogsPage from './pages/AuditLogsPage'
import SettingsPage from './pages/SettingsPage'

function PrivatePage({ children, adminOnly = false }) {
  return (
    <ProtectedRoute adminOnly={adminOnly}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/dashboard" element={<PrivatePage><DashboardPage /></PrivatePage>} />
          <Route path="/ekyc/verify" element={<PrivatePage><EKYCVerifyPage /></PrivatePage>} />
          <Route path="/documents" element={<PrivatePage adminOnly={true}><DocumentPage /></PrivatePage>} />
          <Route path="/liveness" element={<PrivatePage adminOnly={true}><LivenessPage /></PrivatePage>} />
          <Route path="/risk" element={<PrivatePage adminOnly={true}><RiskScorePage /></PrivatePage>} />
          <Route path="/applications" element={<PrivatePage><ApplicationsPage /></PrivatePage>} />
          <Route path="/applications/:id" element={<PrivatePage><ApplicationDetailPage /></PrivatePage>} />
          <Route path="/batch" element={<PrivatePage adminOnly={true}><BatchVerifyPage /></PrivatePage>} />
          <Route path="/audit" element={<PrivatePage adminOnly={true}><AuditLogsPage /></PrivatePage>} />
          <Route path="/settings" element={<PrivatePage adminOnly={true}><SettingsPage /></PrivatePage>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
