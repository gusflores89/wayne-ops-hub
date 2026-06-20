import { Activity, CircleDollarSign, Gauge, ReceiptText, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { buildTournamentMetrics } from "../lib/analytics.js";
import { money } from "../lib/format.js";
import { supabase } from "../lib/supabase.js";
import { useAsync } from "../hooks/useAsync.js";

async function loadExecutiveData() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, tournament_registrations(invoiced_total,payment_status), tournament_finances(category,amount), tournament_teams(id,status)")
    .order("start_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export default function ExecutiveDashboard() {
  const { data, loading, error } = useAsync(loadExecutiveData, []);
  const events = (data ?? []).map(buildTournamentMetrics);
  const totals = events.reduce((acc, event) => ({
    revenue: acc.revenue + event.revenue,
    expenses: acc.expenses + event.expenses,
    profit: acc.profit + event.profit,
    revenueTarget: acc.revenueTarget + event.revenueTarget,
    expenseBudget: acc.expenseBudget + event.expenseBudget,
    profitTarget: acc.profitTarget + event.profitTarget,
    actualTeams: acc.actualTeams + event.actualTeams,
    teamTarget: acc.teamTarget + event.teamTarget,
  }), { revenue: 0, expenses: 0, profit: 0, revenueTarget: 0, expenseBudget: 0, profitTarget: 0, actualTeams: 0, teamTarget: 0 });
  totals.margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  const overallStatus = aggregateStatus(events);

  return (
    <div className="page-stack executive-page">
      <PageHeader eyebrow={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} title="Executive Operating Dashboard" />
      {error && <p className="error-text">{error}</p>}
      {loading ? <div className="screen-loader">Loading executive rollup...</div> : events.length === 0 ? (
        <EmptyState title="No operating data yet" description="Create a tournament and import registrations to populate the executive dashboard." />
      ) : (
        <>
          <section className="executive-kpis">
            <ExecutiveKpi label="Collected Revenue" value={money(totals.revenue)} icon={CircleDollarSign} delta={targetDelta(totals.revenue, totals.revenueTarget, "vs target")} tone="green" />
            <ExecutiveKpi label="Total Expenses" value={money(totals.expenses)} icon={ReceiptText} delta={budgetDelta(totals.expenses, totals.expenseBudget)} tone="red" />
            <ExecutiveKpi label="Operating Profit" value={money(totals.profit)} icon={TrendingUp} delta={targetDelta(totals.profit, totals.profitTarget, "vs target")} tone={totals.profit >= 0 ? "green" : "red"} />
            <ExecutiveKpi label="Operating Margin" value={`${totals.margin.toFixed(1)}%`} icon={Gauge} delta="Revenue less recorded expenses" tone="amber" />
            <ExecutiveKpi label="Overall Status" value={statusLabel(overallStatus)} icon={Activity} delta={overallStatus === "unrated" ? "Add targets to score performance" : "Based on the weakest event signal"} tone={statusTone(overallStatus)} status />
          </section>

          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h3>Executive Summary</h3>
                <span>Roll-up by operating area</span>
              </div>
              <span className="data-note">Live from registrations and finances</span>
            </div>
            <div className="table-wrap">
              <table className="executive-table">
                <thead><tr><th>Area</th><th>Revenue Target</th><th>Actual Revenue</th><th>Expense Budget</th><th>Actual Expenses</th><th>Profit Target</th><th>Actual Profit</th><th>Margin</th><th>Status</th></tr></thead>
                <tbody>
                  <tr>
                    <td><strong>Events</strong></td>
                    <td>{targetMoney(totals.revenueTarget)}</td>
                    <td>{money(totals.revenue)}</td>
                    <td>{targetMoney(totals.expenseBudget)}</td>
                    <td>{money(totals.expenses)}</td>
                    <td>{targetMoney(totals.profitTarget)}</td>
                    <td>{money(totals.profit)}</td>
                    <td>{totals.margin.toFixed(1)}%</td>
                    <td><StatusIndicator value={overallStatus} /></td>
                  </tr>
                  <tr className="placeholder-row"><td>Facilities <span>Future</span></td><td colSpan="8">Not enabled</td></tr>
                  <tr className="placeholder-row"><td>Leagues <span>Future</span></td><td colSpan="8">Not enabled</td></tr>
                  <tr className="total-row"><td>Total</td><td>{targetMoney(totals.revenueTarget)}</td><td>{money(totals.revenue)}</td><td>{targetMoney(totals.expenseBudget)}</td><td>{money(totals.expenses)}</td><td>{targetMoney(totals.profitTarget)}</td><td>{money(totals.profit)}</td><td>{totals.margin.toFixed(1)}%</td><td><StatusIndicator value={overallStatus} /></td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="analytics-panel">
            <div className="analytics-panel-head">
              <div>
                <h3>Events Detail</h3>
                <span>{events.length} tournaments</span>
              </div>
              <Link to="/tournaments" className="text-action">Manage events</Link>
            </div>
            <div className="events-detail-grid">
              <div className="table-wrap">
                <table className="executive-table">
                  <thead><tr><th>Event</th><th>Team Target</th><th>Actual</th><th>Revenue</th><th>Profit</th><th>Margin</th><th>Status</th></tr></thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td><Link to={`/tournaments/${event.id}`} className="event-link">{event.name}</Link></td>
                        <td>{event.teamTarget || "—"}</td>
                        <td>{event.actualTeams}</td>
                        <td>{money(event.revenue)}</td>
                        <td>{money(event.profit)}</td>
                        <td className={event.margin < 0 ? "red-text" : event.margin >= event.marginTarget && event.marginTarget > 0 ? "green-text" : ""}>{event.margin.toFixed(1)}%</td>
                        <td><StatusIndicator value={event.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="target-board">
                <div className="target-board-title">Team Count vs Target</div>
                {events.map((event) => {
                  const target = event.teamTarget || Math.max(event.actualTeams, 1);
                  const progress = Math.min(100, (event.actualTeams / target) * 100);
                  return (
                    <div className="target-row" key={event.id}>
                      <div className="target-copy"><span>{event.name}</span><strong>{event.actualTeams} / {event.teamTarget || "—"}</strong></div>
                      <div className="target-track"><div className={`target-fill status-${event.status}`} style={{ width: `${progress}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ExecutiveKpi({ label, value, icon: Icon, delta, tone, status }) {
  return (
    <article className={`executive-kpi tone-${tone} ${status ? "status-kpi" : ""}`}>
      <div className="executive-kpi-top"><span>{label}</span><Icon size={17} /></div>
      <strong>{status && <i className={`status-light status-${tone}`} />}{value}</strong>
      <small>{delta}</small>
    </article>
  );
}

function StatusIndicator({ value }) {
  return <span className={`status-indicator status-${statusTone(value)}`}><i />{statusLabel(value)}</span>;
}

function aggregateStatus(events) {
  if (events.some((event) => event.status === "red")) return "red";
  if (events.some((event) => event.status === "yellow")) return "yellow";
  if (events.some((event) => event.status === "green")) return "green";
  return "unrated";
}

function statusLabel(value) {
  return ({ green: "Green", yellow: "Yellow", red: "Red", unrated: "Needs Targets" })[value] || "Needs Targets";
}

function statusTone(value) {
  return value === "unrated" ? "neutral" : value;
}

function targetMoney(value) {
  return Number(value || 0) > 0 ? money(value) : "—";
}

function targetDelta(actual, target, suffix) {
  if (!target) return "Target not configured";
  const delta = ((actual - target) / target) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% ${suffix}`;
}

function budgetDelta(actual, budget) {
  if (!budget) return "Budget not configured";
  const delta = ((budget - actual) / budget) * 100;
  return delta >= 0 ? `${delta.toFixed(1)}% under budget` : `${Math.abs(delta).toFixed(1)}% over budget`;
}
