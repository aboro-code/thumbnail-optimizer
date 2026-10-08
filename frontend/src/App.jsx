import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import ABTestDetailPage from "./pages/ABTestDetailPage";
import ABTestsListPage from "./pages/ABTestsListPage";
import CompleteProfilePage from "./pages/CompleteProfilePage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import OptimizePage from "./pages/OptimizePage";
import UploadPage from "./pages/UploadPage";
import { getToken } from "./lib/api";

function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/complete-profile"
          element={
            <RequireAuth>
              <CompleteProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/thumbnails/new"
          element={
            <RequireAuth>
              <UploadPage />
            </RequireAuth>
          }
        />
        <Route
          path="/thumbnails/optimize"
          element={
            <RequireAuth>
              <OptimizePage />
            </RequireAuth>
          }
        />
        <Route
          path="/abtests"
          element={
            <RequireAuth>
              <ABTestsListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/abtests/:id"
          element={
            <RequireAuth>
              <ABTestDetailPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
