import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatCard from "../components/StatCard.jsx";
import TournamentCard from "../components/TournamentCard.jsx";
import { supabase } from "../lib/supabase.js";
import { useAsync } from "../hooks/useAsync.js";

async function loadOverview() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, tournament_teams(status)")
    .order("start_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

export default function Overview() {
  const { data, loading, error } = useAsync(loadOverview, []);
  const tournaments = data ?? [];
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  const teamsRegistered = tournaments.reduce((sum, tournament) => sum + (tournament.tournament_teams?.length ?? 0), 0);
  const active = tournaments.filter((tournament) => tournament.status === "active");
  const planning = tournaments.filter((tournament) => tournament.status === "planning");
  const closed = tournaments.filter((tournament) => tournament.status === "closed");

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={format(now, "EEEE, MMMM d")}
        title={`${greeting}, Wayne.`}
        action={<Link to="/tournaments/new" className="primary-button"><Plus size={17} />New Tournament</Link>}
      />

      {error && <p className="error-text">{error}</p>}
      {loading ? <div className="screen-loader">Loading operations...</div> : (
        <>
          <section className="stat-grid">
            <StatCard label="Total Tournaments" value={tournaments.length} />
            <StatCard label="In Planning" value={planning.length} tone="blue" />
            <StatCard label="Active" value={active.length} tone="green" />
            <StatCard label="Teams Registered" value={teamsRegistered} tone="amber" />
          </section>

          {tournaments.length === 0 ? (
            <EmptyState title="No tournaments yet" description="Create the first operation file to begin tracking teams, contacts, campaigns, finances, operations, and links." />
          ) : (
            <div className="section-stack">
              <TournamentGroup title="Active" pulse tournaments={active} />
              <TournamentGroup title="Upcoming" tournaments={planning} />
              <TournamentGroup title="Closed" tournaments={closed} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TournamentGroup({ title, tournaments, pulse }) {
  if (!tournaments.length) return null;
  return (
    <section>
      <div className="section-title">
        {pulse && <span className="pulse-dot" />}
        <h3>{title}</h3>
      </div>
      <div className="card-grid-list">
        {tournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}
      </div>
    </section>
  );
}
