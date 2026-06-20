import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import AppLayout from "./components/AppLayout.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import TournamentList from "./pages/TournamentList.jsx";
import TournamentCreate from "./pages/TournamentCreate.jsx";
import TournamentDetail from "./pages/TournamentDetail.jsx";
import ExecutiveDashboard from "./pages/ExecutiveDashboard.jsx";

const Reports = lazy(() => import("./pages/Reports.jsx"));

function ProtectedRoute({ session, children }) {
  if (session === undefined) {
    return <div className="screen-loader">Initializing operations...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout session={session}>{children}</AppLayout>;
}

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch((error) => {
        console.error("Unable to initialize Supabase session", error);
        setSession(null);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute session={session}><ExecutiveDashboard /></ProtectedRoute>} />
      <Route path="/operations" element={<ProtectedRoute session={session}><Overview /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute session={session}><Suspense fallback={<div className="screen-loader">Loading reports...</div>}><Reports /></Suspense></ProtectedRoute>} />
      <Route path="/tournaments" element={<ProtectedRoute session={session}><TournamentList /></ProtectedRoute>} />
      <Route path="/tournaments/new" element={<ProtectedRoute session={session}><TournamentCreate /></ProtectedRoute>} />
      <Route path="/tournaments/:id" element={<ProtectedRoute session={session}><TournamentDetail /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
