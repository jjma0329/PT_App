import { Routes, Route } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { ReviewPage } from './pages/ReviewPage';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminPage } from './pages/admin/AdminPage';
import { ProtectedRoute } from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
