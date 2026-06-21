import { BarChart3, Bot, LayoutDashboard, ListChecks, LogOut, Trophy } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

export default function AppLayout({ children, session }) {
  const navigate = useNavigate();
  const email = session?.user?.email ?? "wayne@example.com";

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">W</div>
          <div>
            <p className="brand-kicker">OPS HUB</p>
            <h1>Wayne</h1>
          </div>
        </div>

        <nav className="nav-stack">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <LayoutDashboard size={18} />
            <span>Executive</span>
          </NavLink>
          <NavLink to="/operations" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <ListChecks size={18} />
            <span>Operations</span>
          </NavLink>
          <NavLink to="/tournaments" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <Trophy size={18} />
            <span>Tournaments</span>
          </NavLink>
          <NavLink to="/intake" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <Bot size={18} />
            <span>AI Intake</span>
          </NavLink>
          <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <BarChart3 size={18} />
            <span>Reports</span>
          </NavLink>
        </nav>

        <div className="sidebar-user">
          <div className="avatar">WC</div>
          <div className="user-copy">
            <strong>Wayne Crowe</strong>
            <span>{email}</span>
          </div>
          <button className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
