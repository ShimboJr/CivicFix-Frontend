import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider }  from './context/AuthContext';
import ProtectedRoute    from './components/ProtectedRoute';

// Public pages
import Home           from './pages/Home';
import Login          from './pages/Login';
import Register       from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import CommunityMap   from './pages/CommunityMap';
import PublicIssues   from './pages/PublicIssues';

// Resident pages
import ResidentDashboard from './pages/ResidentDashboard';
import ReportIssue       from './pages/ReportIssue';
import ReportEmergency   from './pages/ReportEmergency';
import MyReports         from './pages/MyReports';
import IssueDetail       from './pages/IssueDetail';
import Notifications     from './pages/Notifications';

// Admin pages
import AdminDashboard    from './pages/AdminDashboard';
import ManageIssues      from './pages/ManageIssues';
import ManageUsers       from './pages/ManageUsers';
import ManageCategories  from './pages/ManageCategories';
import Analytics         from './pages/Analytics';

// Staff pages
import StaffDashboard    from './pages/StaffDashboard';
import AssignedIssues    from './pages/AssignedIssues';
import StaffIssueDetail  from './pages/StaffIssueDetail';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          {/* ── Public routes ──────────────────────────────────────────────── */}
          <Route path="/"         element={<Home />} />
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password"          element={<ForgotPassword />} />
          <Route path="/reset-password/:token"    element={<ResetPassword />} />
          <Route path="/map"      element={<CommunityMap />} />
          <Route path="/issues"   element={<PublicIssues />} />

          {/* ── Issue detail — PUBLIC (API was already public; guests can view
               full reports; only write-actions inside IssueDetail are gated) ── */}
          <Route path="/issue/:id" element={<IssueDetail />} />

          {/* ── Notifications — any authenticated user ──────────────────────── */}
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

          {/* ── Resident zone ──────────────────────────────────────────────── */}
          <Route path="/dashboard"             element={<ProtectedRoute allowedRoles={['resident']}><ResidentDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/report"      element={<ProtectedRoute allowedRoles={['resident']}><ReportIssue /></ProtectedRoute>} />
          <Route path="/dashboard/my-reports"  element={<ProtectedRoute allowedRoles={['resident']}><MyReports /></ProtectedRoute>} />
          <Route path="/dashboard/report-emergency" element={<ProtectedRoute allowedRoles={['resident']}><ReportEmergency /></ProtectedRoute>} />

          {/* ── Admin zone ─────────────────────────────────────────────────── */}
          <Route path="/admin"              element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/issues"       element={<ProtectedRoute allowedRoles={['admin']}><ManageIssues /></ProtectedRoute>} />
          <Route path="/admin/users"        element={<ProtectedRoute allowedRoles={['admin']}><ManageUsers /></ProtectedRoute>} />
          <Route path="/admin/categories"   element={<ProtectedRoute allowedRoles={['admin']}><ManageCategories /></ProtectedRoute>} />
          <Route path="/admin/analytics"    element={<ProtectedRoute allowedRoles={['admin']}><Analytics /></ProtectedRoute>} />

          {/* ── Staff zone ─────────────────────────────────────────────────── */}
          <Route path="/staff"              element={<ProtectedRoute allowedRoles={['staff']}><StaffDashboard /></ProtectedRoute>} />
          <Route path="/staff/assigned"     element={<ProtectedRoute allowedRoles={['staff']}><AssignedIssues /></ProtectedRoute>} />
          {/* Staff get their own detail view with controls; /issue/:id is for residents + admins */}
          <Route path="/staff/issue/:id"    element={<ProtectedRoute allowedRoles={['staff']}><StaffIssueDetail /></ProtectedRoute>} />

          {/* ── Fallback ───────────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
