import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import MyCase from "./pages/MyCase.jsx";
import MyCaseUploads from "./pages/MyCaseUploads.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CaseDetail from "./pages/CaseDetail.jsx";

function RequireAuth({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/cases" : "/case"} replace />;
  }
  return children;
}

function AdminCaseDetail() {
  const { caseId } = useParams();
  return <CaseDetail caseId={caseId} />;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/cases" : "/case"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/case"
        element={
          <RequireAuth role="student">
            <MyCase />
          </RequireAuth>
        }
      />
      <Route
        path="/case/uploads"
        element={
          <RequireAuth role="student">
            <MyCaseUploads />
          </RequireAuth>
        }
      />
      <Route
        path="/cases"
        element={
          <RequireAuth role="admin">
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/cases/:caseId"
        element={
          <RequireAuth role="admin">
            <AdminCaseDetail />
          </RequireAuth>
        }
      />
      <Route path="/" element={<Home />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
