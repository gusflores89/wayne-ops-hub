import { ChevronRight, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../components/Badge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { supabase } from "../lib/supabase.js";
import { formatDate } from "../lib/format.js";
import { useAsync } from "../hooks/useAsync.js";

async function loadTournaments() {
  const { data, error } = await supabase.from("tournaments").select("*").order("start_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export default function TournamentList() {
  const [filter, setFilter] = useState("all");
  const { data, loading, error } = useAsync(loadTournaments, []);
  const tournaments = data ?? [];
  const filtered = useMemo(() => filter === "all" ? tournaments : tournaments.filter((tournament) => tournament.status === filter), [filter, tournaments]);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Tournament Control" title="Tournaments" action={<Link to="/tournaments/new" className="primary-button">New Tournament</Link>} />
      <div className="tabs">
        {["all", "planning", "active", "closed"].map((value) => (
          <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value}</button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      {loading ? <div className="screen-loader">Loading tournaments...</div> : filtered.length === 0 ? (
        <EmptyState title="No matches for this filter" description="Switch filters or create a tournament to populate the operations board." />
      ) : (
        <div className="row-list">
          {filtered.map((tournament) => (
            <Link to={`/tournaments/${tournament.id}`} className="tournament-row" key={tournament.id}>
              <Trophy size={22} />
              <div className="row-main">
                <div>
                  <strong>{tournament.name}</strong>
                  <Badge value={tournament.status} />
                </div>
                <span>{[tournament.city, tournament.country].filter(Boolean).join(", ") || "Location pending"} - {formatDate(tournament.start_date)} to {formatDate(tournament.end_date, "TBD")}</span>
              </div>
              <ChevronRight size={20} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
