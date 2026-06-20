import { useMemo, useState } from "react";
import { BarChart, Bar, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { ageDistribution, buildReportsModel, inferSeriesName, stateSplit, tournamentYear } from "../lib/analytics.js";
import { supabase } from "../lib/supabase.js";
import { useAsync } from "../hooks/useAsync.js";

const colors = ["#F0A500", "#1E9CF0", "#8B949E", "#00C47D", "#A371F7"];

async function loadReportsData() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, tournament_registrations(created_at_source,submitted_at,gender,event_age,team_age,state)")
    .order("start_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export default function Reports() {
  const { data, loading, error } = useAsync(loadReportsData, []);
  const tournaments = data ?? [];
  const initialSeries = tournaments[0] ? inferSeriesName(tournaments[0]) : "";
  const [series, setSeries] = useState("");
  const [gender, setGender] = useState("all");
  const [age, setAge] = useState("all");
  const [selectedYears, setSelectedYears] = useState([]);
  const model = useMemo(() => buildReportsModel(tournaments, { series: series || initialSeries, gender, age, years: selectedYears }), [tournaments, series, gender, age, selectedYears, initialSeries]);
  const availableYears = model.editions.map((edition) => edition.year);
  const ages = [...new Set(model.editions.flatMap((edition) => (edition.tournament_registrations ?? []).map((row) => row.event_age || row.team_age).filter(Boolean)))].sort();
  const teamsPerYear = [...model.visibleEditions].reverse().map((edition) => ({ year: String(edition.year), target: Number(edition.total_slots || 0), actual: edition.tournament_registrations.length }));
  const genderByYear = [...model.visibleEditions].reverse().map((edition) => ({
    year: String(edition.year),
    boys: edition.tournament_registrations.filter((row) => String(row.gender).toLowerCase() === "m").length,
    girls: edition.tournament_registrations.filter((row) => String(row.gender).toLowerCase() === "f").length,
  }));
  const ageRows = ageDistribution(model.visibleEditions);
  const stateRows = stateSplit(model.current);

  function toggleYear(year) {
    setSelectedYears((current) => current.includes(year) ? current.filter((value) => value !== year) : [...current, year]);
  }

  return (
    <div className="page-stack reports-page">
      <PageHeader
        eyebrow="Multi-Year Analytics"
        title="Reports"
        action={model.series.length > 0 ? (
          <label className="series-control">
            <span>Tournament Series</span>
            <select value={model.selectedSeries} onChange={(event) => { setSeries(event.target.value); setSelectedYears([]); }}>
              {model.series.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        ) : null}
      />
      {error && <p className="error-text">{error}</p>}
      {loading ? <div className="screen-loader">Building historical reports...</div> : tournaments.length === 0 ? (
        <EmptyState title="No report data yet" description="Create tournament editions and import registrations to build multi-year analytics." />
      ) : (
        <>
          <section className="report-filters">
            <FilterGroup label="Year">
              {availableYears.map((year) => <button key={year} className={!selectedYears.length || selectedYears.includes(year) ? "on" : ""} onClick={() => toggleYear(year)}>{year}</button>)}
            </FilterGroup>
            <FilterGroup label="Gender">
              {["all", "m", "f"].map((value) => <button key={value} className={gender === value ? "on" : ""} onClick={() => setGender(value)}>{value === "m" ? "Boys" : value === "f" ? "Girls" : "All"}</button>)}
            </FilterGroup>
            <FilterGroup label="Age">
              <select value={age} onChange={(event) => setAge(event.target.value)}><option value="all">All ages</option>{ages.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            </FilterGroup>
            <button className="reset-filters" onClick={() => { setGender("all"); setAge("all"); setSelectedYears([]); }}>Reset</button>
          </section>

          <section className="report-kpis">
            <ReportKpi label="This Year" year={model.current?.year} value={model.currentCount} suffix="teams" note={`${model.weeksOut} weeks out`} tone="amber" />
            <ReportKpi label="Last Year Same Point" year={model.previous?.year} value={model.previousSamePoint} suffix="teams" note={deltaText(model.currentCount, model.previousSamePoint)} />
            <ReportKpi label="Projected Total" year={model.current?.year} value={model.projection} suffix="teams" note={model.current?.total_slots ? `Target ${model.current.total_slots}` : "Pace-based estimate"} />
          </section>

          <ChartPanel title="Registration Pace by Year" subtitle="Cumulative teams · weeks before event" wide>
            <ResponsiveContainer width="100%" height={390}>
              <LineChart data={model.paceData} margin={{ top: 18, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="#21262D" vertical={false} />
                <XAxis dataKey="weeksOut" stroke="#8B949E" tick={{ fontSize: 11 }} label={{ value: "Weeks before event", position: "insideBottom", offset: -2, fill: "#8B949E" }} />
                <YAxis stroke="#8B949E" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {model.visibleEditions.map((edition, index) => <Line key={edition.year} type="monotone" dataKey={String(edition.year)} stroke={colors[index % colors.length]} strokeWidth={index === 0 ? 3 : 2} strokeDasharray={index === 0 ? undefined : `${4 + index * 2} 4`} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </ChartPanel>

          <section className="report-chart-grid">
            <ChartPanel title="Teams per Year" subtitle="Target vs actual">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={teamsPerYear}><CartesianGrid stroke="#21262D" vertical={false} /><XAxis dataKey="year" stroke="#8B949E" /><YAxis stroke="#8B949E" allowDecimals={false} /><Tooltip contentStyle={tooltipStyle} /><Legend /><Bar dataKey="target" fill="#30363D" /><Bar dataKey="actual" fill="#F0A500" /></BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Boys vs Girls per Year" subtitle="Team count by gender">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={genderByYear}><CartesianGrid stroke="#21262D" vertical={false} /><XAxis dataKey="year" stroke="#8B949E" /><YAxis stroke="#8B949E" allowDecimals={false} /><Tooltip contentStyle={tooltipStyle} /><Legend /><Bar dataKey="boys" fill="#1E9CF0" /><Bar dataKey="girls" fill="#A371F7" /></BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Age-Group Distribution" subtitle="Selected editions">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ageRows} layout="vertical" margin={{ left: 12 }}><CartesianGrid stroke="#21262D" horizontal={false} /><XAxis type="number" stroke="#8B949E" allowDecimals={false} /><YAxis dataKey="age" type="category" stroke="#8B949E" width={48} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="teams" fill="#F0A500" /></BarChart>
              </ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="In-State vs Out-of-State" subtitle={model.current?.host_state ? `${model.current.year} · host ${model.current.host_state}` : "Set host state on tournament"}>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart><Pie data={stateRows} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={2}>{stateRows.map((row, index) => <Cell key={row.name} fill={model.current?.host_state ? [colors[3], colors[1]][index] : "#484F58"} />)}</Pie><Tooltip contentStyle={tooltipStyle} /><Legend /></PieChart>
              </ResponsiveContainer>
            </ChartPanel>
          </section>

          <section className="analytics-panel">
            <div className="analytics-panel-head"><div><h3>Series Editions</h3><span>Configuration and data readiness</span></div></div>
            <div className="table-wrap">
              <table className="executive-table"><thead><tr><th>Edition</th><th>Series</th><th>Event Date</th><th>Teams</th><th>Target</th><th>Host State</th><th>Registration Dates</th></tr></thead>
                <tbody>{model.editions.map((edition) => {
                  const dated = edition.tournament_registrations.filter((row) => row.created_at_source || row.submitted_at).length;
                  return <tr key={edition.id}><td>{edition.name}</td><td>{inferSeriesName(edition)}</td><td>{edition.start_date || "Missing"}</td><td>{edition.tournament_registrations.length}</td><td>{edition.total_slots || "—"}</td><td>{edition.host_state || "Missing"}</td><td>{dated}/{edition.tournament_registrations.length}</td></tr>;
                })}</tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function FilterGroup({ label, children }) {
  return <div className="filter-group"><span>{label}</span>{children}</div>;
}

function ReportKpi({ label, year, value, suffix, note, tone }) {
  return <article className={`report-kpi ${tone ? `tone-${tone}` : ""}`}><div><span>{label}</span><small>{year || "—"}</small></div><strong>{value}<em>{suffix}</em></strong><p>{note}</p></article>;
}

function ChartPanel({ title, subtitle, children, wide }) {
  return <section className={`chart-panel ${wide ? "wide" : ""}`}><header><h3>{title}</h3><span>{subtitle}</span></header><div className="chart-body">{children}</div></section>;
}

function deltaText(current, previous) {
  const delta = current - previous;
  return `${delta >= 0 ? "+" : ""}${delta} vs last year`;
}

const tooltipStyle = { background: "#161B22", border: "1px solid #30363D", borderRadius: 6, color: "#E6EDF3", fontSize: 12 };
