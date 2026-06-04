import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import Badge from "./Badge.jsx";
import { daysUntil, formatDate } from "../lib/format.js";

export default function TournamentCard({ tournament }) {
  const confirmed = tournament.tournament_teams?.filter((team) => team.status === "confirmed").length ?? tournament.confirmed_count ?? 0;
  const slots = Number(tournament.total_slots || 0);
  const progress = slots > 0 ? Math.min(100, Math.round((confirmed / slots) * 100)) : 0;
  const days = daysUntil(tournament.start_date);
  const urgent = days !== null && days >= 0 && days < 14;

  return (
    <Link to={`/tournaments/${tournament.id}`} className="tournament-card">
      <div className="card-topline">
        <h3>{tournament.name}</h3>
        <Badge value={tournament.status} />
      </div>
      <div className="meta-row">
        <MapPin size={15} />
        <span>{[tournament.city, tournament.country].filter(Boolean).join(", ") || "Location pending"}</span>
      </div>
      <div className="card-grid">
        <div>
          <span className="mini-label">Start</span>
          <strong>{formatDate(tournament.start_date)}</strong>
        </div>
        <div>
          <span className="mini-label">Countdown</span>
          <strong className={urgent ? "amber-text" : ""}>{days === null ? "TBD" : days < 0 ? "Started" : `${days} days`}</strong>
        </div>
      </div>
      <div className="progress-block">
        <div className="progress-copy">
          <span>Registration</span>
          <span>{confirmed}/{slots || 0}</span>
        </div>
        <div className="progress-track">
          <div style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Link>
  );
}
