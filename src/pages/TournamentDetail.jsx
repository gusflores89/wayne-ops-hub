import { AlertTriangle, ExternalLink, FileSpreadsheet, Plus, RefreshCw, Save, Trash2, Upload, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Badge from "../components/Badge.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Field from "../components/Field.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatCard from "../components/StatCard.jsx";
import { CAMPAIGN_TYPES, CONTACT_ROLES, FINANCE_CATEGORIES, OPERATION_CATEGORIES, OPERATION_STATUSES, TEAM_STATUSES, TOURNAMENT_STATUSES } from "../lib/constants.js";
import { formatDate, money, titleize } from "../lib/format.js";
import { findReturningCoaches, getReadinessIssues, groupCounts, parseRegistrationsWorkbook, summarizeRegistrations, uniqueCoachEmailCount } from "../lib/registrations.js";
import { supabase } from "../lib/supabase.js";
import { useAsync } from "../hooks/useAsync.js";

const tabs = ["Overview", "Registrations", "Teams", "Contacts", "Campaigns", "Finances", "Operations", "Links"];
const generatedImportMarker = "Generated from registration import";
const initialManualRegistration = {
  event_team_name: "",
  club_name: "",
  event_age: "",
  gender: "",
  state: "",
  division: "",
  preferred_level: "",
  coach_name_1: "",
  coach_email_1: "",
  coach_phone_1: "",
  payment_status: "PENDING",
  invoiced_total: 0,
  standings_link: "",
};

async function loadTournament(id) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, tournament_teams(*), tournament_contacts(*), tournament_campaigns(*), tournament_finances(*), tournament_operations(*), tournament_links(*)")
    .eq("id", id)
    .single();
  if (error) throw error;

  const { data: registrations, error: registrationsError } = await supabase
    .from("tournament_registrations")
    .select("*")
    .eq("tournament_id", id)
    .order("division", { ascending: true })
    .order("event_team_name", { ascending: true });

  if (registrationsError) {
    console.warn("Registrations table unavailable", registrationsError);
  }

  const { data: comparisonRegistrations, error: comparisonError } = await supabase
    .from("tournament_registrations")
    .select("tournament_id,current_team_name,event_team_name,club_name,coach_email_1,coach_email_2,tournaments(name,start_date)")
    .neq("tournament_id", id);

  if (comparisonError) {
    console.warn("Registration comparisons unavailable", comparisonError);
  }

  return {
    ...data,
    tournament_registrations: registrationsError ? [] : registrations ?? [],
    comparison_registrations: comparisonError ? [] : comparisonRegistrations ?? [],
  };
}

export default function TournamentDetail() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("Overview");
  const { data: tournament, loading, error, refresh } = useAsync(() => loadTournament(id), [id]);

  if (loading) return <div className="screen-loader">Loading tournament file...</div>;
  if (error) return <p className="error-text">{error}</p>;
  if (!tournament) return <EmptyState title="Tournament not found" description="The requested tournament file is unavailable." />;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={[tournament.city, tournament.country].filter(Boolean).join(", ") || "Tournament file"}
        title={tournament.name}
        action={<Badge value={tournament.status} />}
      />
      <div className="tabs scroll-tabs">
        {tabs.map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </div>
      {activeTab === "Overview" && <OverviewTab tournament={tournament} refresh={refresh} />}
      {activeTab === "Registrations" && <RegistrationsTab tournament={tournament} refresh={refresh} />}
      {activeTab === "Teams" && <TeamsTab tournament={tournament} refresh={refresh} />}
      {activeTab === "Contacts" && <ContactsTab tournament={tournament} refresh={refresh} />}
      {activeTab === "Campaigns" && <CampaignsTab tournament={tournament} refresh={refresh} />}
      {activeTab === "Finances" && <FinancesTab tournament={tournament} refresh={refresh} />}
      {activeTab === "Operations" && <OperationsTab tournament={tournament} refresh={refresh} />}
      {activeTab === "Links" && <LinksTab tournament={tournament} refresh={refresh} />}
    </div>
  );
}

function RegistrationsTab({ tournament, refresh }) {
  const rows = tournament.tournament_registrations ?? [];
  const summary = summarizeRegistrations(rows);
  const returningCoaches = findReturningCoaches(rows, tournament.comparison_registrations ?? [], tournament.start_date);
  const uniqueCoaches = uniqueCoachEmailCount(rows);
  const returningCoachCount = new Set(returningCoaches.map((row) => row.email)).size;
  const expenses = (tournament.tournament_finances ?? [])
    .filter((row) => row.category === "expense")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const projectedNet = summary.revenue - expenses;
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [manualForm, setManualForm] = useState(initialManualRegistration);
  const [savingManual, setSavingManual] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");
    setMessage("");

    try {
      const parsed = await parseRegistrationsWorkbook(file);
      const payload = parsed.map((row) => ({ ...row, tournament_id: tournament.id }));

      if (replaceExisting) {
        const { error: deleteError } = await supabase.from("tournament_registrations").delete().eq("tournament_id", tournament.id);
        if (deleteError) throw deleteError;
      }

      for (let index = 0; index < payload.length; index += 500) {
        const chunk = payload.slice(index, index + 500);
        const { error: upsertError } = await supabase
          .from("tournament_registrations")
          .upsert(chunk, { onConflict: "tournament_id,external_id" });
        if (upsertError) throw upsertError;
      }

      const syncResult = await syncImportedRegistrationData(tournament.id, payload);
      setMessage(`Imported ${payload.length} registrations from ${file.name}. Synced ${syncResult.teams} teams, ${syncResult.contacts} contacts, and ${syncResult.finances} finance summary.`);
      refresh();
    } catch (err) {
      setError(err.message || "Could not import registrations.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError("");
    setMessage("");

    try {
      const syncResult = await syncImportedRegistrationData(tournament.id, rows);
      setMessage(`Synced ${syncResult.teams} teams, ${syncResult.contacts} contacts, and ${syncResult.finances} finance summary from registrations.`);
      refresh();
    } catch (err) {
      setError(err.message || "Could not sync registrations to ops tabs.");
    } finally {
      setSyncing(false);
    }
  }

  function updateManual(field, value) {
    setManualForm((current) => ({ ...current, [field]: value }));
  }

  async function handleManualSubmit(event) {
    event.preventDefault();
    setSavingManual(true);
    setError("");
    setMessage("");

    const registration = {
      ...manualForm,
      tournament_id: tournament.id,
      external_id: `manual-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
      current_team_name: manualForm.event_team_name,
      team_age: manualForm.event_age || null,
      submitted: true,
      complete: true,
      invoiced_reg_fee: Number(manualForm.invoiced_total || 0),
      invoiced_total: Number(manualForm.invoiced_total || 0),
      raw_data: { source: "manual" },
    };

    try {
      const { error: insertError } = await supabase.from("tournament_registrations").insert(registration);
      if (insertError) throw insertError;

      const syncResult = await syncImportedRegistrationData(tournament.id, [...rows, registration]);
      setMessage(`Added ${registration.event_team_name}. Synced ${syncResult.teams} teams, ${syncResult.contacts} contacts, and finance summary.`);
      setManualForm(initialManualRegistration);
      setAddingManual(false);
      refresh();
    } catch (err) {
      setError(err.message || "Could not add the registration.");
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div>
          <h3>Registrations</h3>
          <p className="panel-subtitle">Import GotSport exports and track bracket, payment, contact, and document readiness.</p>
        </div>
        <div className="button-row">
          <button className="ghost-button" onClick={() => setAddingManual((value) => !value)} disabled={importing || syncing}>
            <UserPlus size={16} />
            {addingManual ? "Cancel" : "Add Team"}
          </button>
          {rows.length > 0 && (
            <button className="ghost-button" onClick={handleSync} disabled={syncing || importing}>
              <RefreshCw size={16} />
              {syncing ? "Syncing..." : "Sync Ops Tabs"}
            </button>
          )}
          <label className="upload-button">
            <Upload size={16} />
            <span>{importing ? "Importing..." : "Import Excel"}</span>
            <input type="file" accept=".xlsx,.xls" disabled={importing} onChange={handleFile} />
          </label>
        </div>
      </div>

      {addingManual && (
        <form className="form-grid inline-form" onSubmit={handleManualSubmit}>
          <Field label="Team Name"><input value={manualForm.event_team_name} onChange={(event) => updateManual("event_team_name", event.target.value)} required /></Field>
          <Field label="Club Name"><input value={manualForm.club_name} onChange={(event) => updateManual("club_name", event.target.value)} required /></Field>
          <Field label="Event Age"><input value={manualForm.event_age} onChange={(event) => updateManual("event_age", event.target.value)} placeholder="e.g. U12" /></Field>
          <Field label="Gender">
            <select value={manualForm.gender} onChange={(event) => updateManual("gender", event.target.value)}>
              <option value="">Unspecified</option>
              <option value="m">Boys</option>
              <option value="f">Girls</option>
            </select>
          </Field>
          <Field label="State"><input value={manualForm.state} onChange={(event) => updateManual("state", event.target.value)} placeholder="e.g. TX" /></Field>
          <Field label="Division"><input value={manualForm.division} onChange={(event) => updateManual("division", event.target.value)} /></Field>
          <Field label="Preferred Level"><input value={manualForm.preferred_level} onChange={(event) => updateManual("preferred_level", event.target.value)} placeholder="e.g. Best of the Best" /></Field>
          <Field label="Payment Status">
            <select value={manualForm.payment_status} onChange={(event) => updateManual("payment_status", event.target.value)}>
              <option value="PENDING">Pending</option>
              <option value="PAID">Paid</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </Field>
          <Field label="Invoiced Total"><input type="number" min="0" step="0.01" value={manualForm.invoiced_total} onChange={(event) => updateManual("invoiced_total", event.target.value)} /></Field>
          <Field label="Standings Link"><input type="url" value={manualForm.standings_link} onChange={(event) => updateManual("standings_link", event.target.value)} /></Field>
          <Field label="Coach Name"><input value={manualForm.coach_name_1} onChange={(event) => updateManual("coach_name_1", event.target.value)} /></Field>
          <Field label="Coach Email"><input type="email" value={manualForm.coach_email_1} onChange={(event) => updateManual("coach_email_1", event.target.value)} /></Field>
          <Field label="Coach Phone"><input value={manualForm.coach_phone_1} onChange={(event) => updateManual("coach_phone_1", event.target.value)} /></Field>
          <button className="primary-button full-span" type="submit" disabled={savingManual}>
            {savingManual ? "Adding Team..." : "Add Registered Team"}
          </button>
        </form>
      )}

      <label className="check-row">
        <input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} />
        <span>Replace existing registrations for this tournament</span>
      </label>

      {message && <p className="success-text">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      {rows.length === 0 ? (
        <EmptyState title="No registrations imported" description="Upload Wayne's GotSport registration export to unlock intake, finance, bracket, and document readiness views." />
      ) : (
        <div className="page-stack">
          <section className="stat-grid registration-stats">
            <StatCard label="Teams" value={summary.total} />
            <StatCard label="Paid" value={`${summary.paid}/${summary.total}`} tone="green" />
            <StatCard label="Submitted" value={`${summary.submitted}/${summary.total}`} tone="blue" />
            <StatCard label="Invoiced Total" value={money(summary.revenue)} tone="amber" />
            <StatCard label="Recorded Expenses" value={money(expenses)} tone="red" />
            <StatCard label="Projected Net" value={money(projectedNet)} tone={projectedNet >= 0 ? "green" : "red"} />
            <StatCard label="Returning Coaches" value={`${returningCoachCount}/${uniqueCoaches}`} tone="blue" />
            <StatCard label="Missing Docs" value={summary.missingDocs} tone={summary.missingDocs ? "red" : "green"} />
            <StatCard label="Missing Standings" value={summary.missingStandings} tone={summary.missingStandings ? "red" : "green"} />
          </section>

          <section className="ops-grid">
            <BreakdownCard title="States Represented" rows={groupCounts(rows, "state", 10)} />
            <BreakdownCard title="Divisions" rows={groupCounts(rows, "division", 8)} />
            <BreakdownCard title="Event Age" rows={groupCounts(rows, "event_age", 8)} />
            <BreakdownCard title="Preferred Level" rows={groupCounts(rows, "preferred_level", 8)} />
            <BreakdownCard title="League Platform" rows={groupCounts(rows, "current_league_platform", 8)} />
          </section>

          <section className="panel-subsection">
            <div className="section-title compact-title">
              <RefreshCw size={18} />
              <h3>Returning Coaches</h3>
            </div>
            {returningCoaches.length === 0 ? (
              <EmptyState
                title="No cross-tournament returns yet"
                description="Import registrations from another tournament or season. Matching coach emails will appear here automatically."
              />
            ) : (
              <DataTable headers={["Coach Email", "Current Team", "Current Club", "Returned In", "Other Team", "Other Club"]} empty="No returning coaches found.">
                {returningCoaches.slice(0, 50).map((row) => (
                  <tr key={`${row.email}-${row.tournamentName}-${row.otherTeam}`}>
                    <td>{row.email}</td>
                    <td>{row.currentTeam}</td>
                    <td>{row.currentClub}</td>
                    <td>{row.tournamentName}{row.tournamentDate ? ` (${String(row.tournamentDate).slice(0, 4)})` : ""}</td>
                    <td>{row.otherTeam}</td>
                    <td>{row.otherClub}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </section>

          <section className="panel-subsection">
            <div className="section-title compact-title">
              <AlertTriangle size={18} />
              <h3>Readiness Watchlist</h3>
            </div>
            <DataTable headers={["Team", "Club", "Division", "Payment", "Issues", "Primary Contact"]} empty="Every imported team looks ready.">
              {rows
                .map((row) => ({ row, issues: getReadinessIssues(row) }))
                .filter((item) => item.issues.length > 0)
                .slice(0, 25)
                .map(({ row, issues }) => (
                  <tr key={row.id}>
                    <td>{row.event_team_name || row.current_team_name}</td>
                    <td>{row.club_name}</td>
                    <td>{row.division}</td>
                    <td><Badge value={row.payment_status || "unknown"} variant={String(row.payment_status).toLowerCase() === "paid" ? "confirmed" : "pending"} /></td>
                    <td>{issues.join(", ")}</td>
                    <td>{row.manager_email_1 || row.coach_email_1 || row.enrolled_by_email}</td>
                  </tr>
                ))}
            </DataTable>
          </section>

          <section className="panel-subsection">
            <div className="section-title compact-title">
              <FileSpreadsheet size={18} />
              <h3>Registration Detail</h3>
            </div>
            <DataTable headers={["Team", "Club", "Age", "Gender", "Division", "Level", "Total", "Contact"]} empty="No registration rows available.">
              {rows.slice(0, 60).map((row) => (
                <tr key={row.id}>
                  <td>{row.event_team_name || row.current_team_name}</td>
                  <td>{row.club_name}</td>
                  <td>{row.event_age || row.team_age}</td>
                  <td>{row.gender}</td>
                  <td>{row.division}</td>
                  <td>{row.preferred_division || row.preferred_level}</td>
                  <td>{money(row.invoiced_total)}</td>
                  <td>{row.manager_email_1 || row.coach_email_1 || row.enrolled_by_email}</td>
                </tr>
              ))}
            </DataTable>
          </section>
        </div>
      )}
    </section>
  );
}

async function syncImportedRegistrationData(tournamentId, registrations) {
  const rows = registrations ?? [];
  const generatedLike = `%${generatedImportMarker}%`;

  await deleteGeneratedRows("tournament_teams", tournamentId, generatedLike);
  await deleteGeneratedRows("tournament_contacts", tournamentId, generatedLike);
  await deleteGeneratedRows("tournament_finances", tournamentId, generatedLike);

  const teams = rows
    .filter((row) => row.club_name || row.event_team_name || row.current_team_name)
    .map((row) => ({
      tournament_id: tournamentId,
      club_name: row.club_name || "Unknown Club",
      contact_name: row.manager_name_1 || row.coach_name_1 || row.enrolled_by_name || null,
      contact_email: row.manager_email_1 || row.coach_email_1 || row.enrolled_by_email || null,
      age_group: row.event_age || row.team_age || row.birth_year || null,
      status: String(row.payment_status || "").toLowerCase() === "paid" && row.submitted ? "confirmed" : "pending",
      notes: [
        generatedImportMarker,
        row.external_id ? `Registration ID: ${row.external_id}` : null,
        row.event_team_name ? `Team: ${row.event_team_name}` : null,
        row.division ? `Division: ${row.division}` : null,
        row.gender ? `Gender: ${row.gender}` : null,
        row.preferred_level ? `Preferred level: ${row.preferred_level}` : null,
      ].filter(Boolean).join(" | "),
    }));

  const contacts = [];
  for (const row of rows) {
    addRegistrationContact(contacts, tournamentId, row, "Enroller", row.enrolled_by_name, row.enrolled_by_email, row.enrolled_by_phone);
    addRegistrationContact(contacts, tournamentId, row, "Coach 1", row.coach_name_1, row.coach_email_1, row.coach_phone_1);
    addRegistrationContact(contacts, tournamentId, row, "Coach 2", row.coach_name_2, row.coach_email_2, row.coach_phone_2);
    addRegistrationContact(contacts, tournamentId, row, "Manager 1", row.manager_name_1, row.manager_email_1, row.manager_phone_1);
    addRegistrationContact(contacts, tournamentId, row, "Manager 2", row.manager_name_2, row.manager_email_2, row.manager_phone_2);
  }

  const uniqueContacts = dedupeContacts(contacts);
  const financeRows = buildRegistrationFinanceRows(tournamentId, rows);

  await insertInChunks("tournament_teams", teams);
  await insertInChunks("tournament_contacts", uniqueContacts);
  await insertInChunks("tournament_finances", financeRows);

  return { teams: teams.length, contacts: uniqueContacts.length, finances: financeRows.length };
}

async function deleteGeneratedRows(table, tournamentId, generatedLike) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("tournament_id", tournamentId)
    .ilike("notes", generatedLike);
  if (error) throw error;
}

async function insertInChunks(table, rows) {
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    if (chunk.length === 0) continue;
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

function addRegistrationContact(contacts, tournamentId, row, sourceRole, name, email, phone) {
  if (!name && !email && !phone) return;
  contacts.push({
    tournament_id: tournamentId,
    name: name || email || phone,
    role: "staff",
    email: email || null,
    phone: phone || null,
    notes: [
      generatedImportMarker,
      sourceRole,
      row.event_team_name || row.current_team_name || null,
      row.club_name || null,
      row.external_id ? `Registration ID: ${row.external_id}` : null,
    ].filter(Boolean).join(" | "),
  });
}

function dedupeContacts(contacts) {
  const seen = new Set();
  return contacts.filter((contact) => {
    const key = `${contact.email || ""}|${contact.phone || ""}|${contact.name || ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRegistrationFinanceRows(tournamentId, rows) {
  const invoicedTotal = rows.reduce((sum, row) => sum + Number(row.invoiced_total || 0), 0);
  const regFees = rows.reduce((sum, row) => sum + Number(row.invoiced_reg_fee || 0), 0);
  const featureFees = rows.reduce((sum, row) => sum + Number(row.features_invoiced_total || 0), 0);
  const paidTeams = rows.filter((row) => String(row.payment_status || "").toLowerCase() === "paid").length;
  const notes = `${generatedImportMarker} | ${rows.length} registrations | ${paidTeams} paid | Reg fees ${money(regFees)} | Feature fees ${money(featureFees)}`;

  if (invoicedTotal <= 0) return [];
  return [{
    tournament_id: tournamentId,
    description: "Registration import invoiced total",
    category: "income",
    amount: invoicedTotal,
    date: new Date().toISOString().slice(0, 10),
    notes,
  }];
}

function BreakdownCard({ title, rows }) {
  return (
    <article className="info-card breakdown-card">
      <h3>{title}</h3>
      <div className="breakdown-list">
        {rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function OverviewTab({ tournament, refresh }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(tournament);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setError("");
    const payload = pick(form, ["name", "series_name", "status", "start_date", "end_date", "city", "host_state", "country", "venue", "total_slots", "revenue_target", "expense_budget", "profit_target", "margin_target", "notes"]);
    payload.total_slots = Number(payload.total_slots || 0);
    payload.revenue_target = Number(payload.revenue_target || 0);
    payload.expense_budget = Number(payload.expense_budget || 0);
    payload.profit_target = Number(payload.profit_target || 0);
    payload.margin_target = Number(payload.margin_target || 0);
    const { error: updateError } = await supabase.from("tournaments").update(payload).eq("id", tournament.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditing(false);
    refresh();
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <h3>Overview</h3>
        <div className="button-row">
          {editing ? (
            <>
              <button className="ghost-button" onClick={() => { setForm(tournament); setEditing(false); }}><X size={16} />Cancel</button>
              <button className="primary-button" onClick={save}><Save size={16} />Save</button>
            </>
          ) : <button className="ghost-button" onClick={() => setEditing(true)}>Edit</button>}
        </div>
      </div>
      <div className="form-grid">
        <Field label="Name"><input disabled={!editing} value={form.name || ""} onChange={(event) => update("name", event.target.value)} /></Field>
        <Field label="Series Name"><input disabled={!editing} value={form.series_name || ""} onChange={(event) => update("series_name", event.target.value)} placeholder="e.g. Surf Cup Texas" /></Field>
        <Field label="Status"><select disabled={!editing} value={form.status || "planning"} onChange={(event) => update("status", event.target.value)}>{TOURNAMENT_STATUSES.map(option)}</select></Field>
        <Field label="Start Date"><input disabled={!editing} type="date" value={form.start_date || ""} onChange={(event) => update("start_date", event.target.value)} /></Field>
        <Field label="End Date"><input disabled={!editing} type="date" value={form.end_date || ""} onChange={(event) => update("end_date", event.target.value)} /></Field>
        <Field label="City"><input disabled={!editing} value={form.city || ""} onChange={(event) => update("city", event.target.value)} /></Field>
        <Field label="Host State"><input disabled={!editing} value={form.host_state || ""} onChange={(event) => update("host_state", event.target.value)} placeholder="e.g. TX" /></Field>
        <Field label="Country"><input disabled={!editing} value={form.country || ""} onChange={(event) => update("country", event.target.value)} /></Field>
        <Field label="Venue"><input disabled={!editing} value={form.venue || ""} onChange={(event) => update("venue", event.target.value)} /></Field>
        <Field label="Team Target"><input disabled={!editing} type="number" value={form.total_slots || 0} onChange={(event) => update("total_slots", event.target.value)} /></Field>
        <Field label="Revenue Target"><input disabled={!editing} type="number" value={form.revenue_target || 0} onChange={(event) => update("revenue_target", event.target.value)} /></Field>
        <Field label="Expense Budget"><input disabled={!editing} type="number" value={form.expense_budget || 0} onChange={(event) => update("expense_budget", event.target.value)} /></Field>
        <Field label="Profit Target"><input disabled={!editing} type="number" value={form.profit_target || 0} onChange={(event) => update("profit_target", event.target.value)} /></Field>
        <Field label="Margin Target %"><input disabled={!editing} type="number" min="0" max="100" step="0.1" value={form.margin_target || 0} onChange={(event) => update("margin_target", event.target.value)} /></Field>
        <Field label="Notes"><textarea disabled={!editing} value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} /></Field>
      </div>
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function TeamsTab({ tournament, refresh }) {
  const rows = tournament.tournament_teams ?? [];
  const counts = countBy(rows, "status");
  return (
    <CrudSection
      title="Teams"
      table="tournament_teams"
      tournamentId={tournament.id}
      refresh={refresh}
      initial={{ club_name: "", contact_name: "", contact_email: "", age_group: "", status: "pending", notes: "" }}
      renderForm={(form, update) => <>
        <Field label="Club"><input value={form.club_name} onChange={(e) => update("club_name", e.target.value)} required /></Field>
        <Field label="Contact"><input value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} /></Field>
        <Field label="Email"><input type="email" value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} /></Field>
        <Field label="Age Group"><input value={form.age_group} onChange={(e) => update("age_group", e.target.value)} /></Field>
        <Field label="Status"><select value={form.status} onChange={(e) => update("status", e.target.value)}>{TEAM_STATUSES.map(option)}</select></Field>
        <Field label="Notes"><input value={form.notes} onChange={(e) => update("notes", e.target.value)} /></Field>
      </>}
      header={<div className="badge-row">{TEAM_STATUSES.map((status) => <span className="badge" key={status}>{titleize(status)} {counts[status] || 0}</span>)}</div>}
    >
      <DataTable headers={["Club", "Contact", "Email", "Age Group", "Status", ""]} empty="No teams registered yet.">
        {rows.map((row) => <tr key={row.id}><td>{row.club_name}</td><td>{row.contact_name}</td><td>{row.contact_email}</td><td>{row.age_group}</td><td><InlineSelect table="tournament_teams" row={row} field="status" options={TEAM_STATUSES} refresh={refresh} /></td><td><DeleteButton table="tournament_teams" id={row.id} refresh={refresh} /></td></tr>)}
      </DataTable>
    </CrudSection>
  );
}

function ContactsTab({ tournament, refresh }) {
  const rows = tournament.tournament_contacts ?? [];
  return (
    <CrudSection title="Contacts" table="tournament_contacts" tournamentId={tournament.id} refresh={refresh} initial={{ name: "", role: "other", email: "", phone: "", notes: "" }} renderForm={(form, update) => <>
      <Field label="Name"><input value={form.name} onChange={(e) => update("name", e.target.value)} required /></Field>
      <Field label="Role"><select value={form.role} onChange={(e) => update("role", e.target.value)}>{CONTACT_ROLES.map(option)}</select></Field>
      <Field label="Email"><input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></Field>
      <Field label="Phone"><input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></Field>
      <Field label="Notes"><input value={form.notes} onChange={(e) => update("notes", e.target.value)} /></Field>
    </>}>
      <DataTable headers={["Name", "Role", "Email", "Phone", "Notes", ""]} empty="No contacts saved yet.">
        {rows.map((row) => <tr key={row.id}><td>{row.name}</td><td><Badge value={row.role} variant="neutral" /></td><td>{row.email}</td><td>{row.phone}</td><td>{row.notes}</td><td><DeleteButton table="tournament_contacts" id={row.id} refresh={refresh} /></td></tr>)}
      </DataTable>
    </CrudSection>
  );
}

function CampaignsTab({ tournament, refresh }) {
  const rows = tournament.tournament_campaigns ?? [];
  return (
    <CrudSection title="Campaigns" table="tournament_campaigns" tournamentId={tournament.id} refresh={refresh} initial={{ name: "", type: "email", sent_date: "", recipients_count: 0, open_rate: 0, notes: "" }} renderForm={(form, update) => <>
      <Field label="Name"><input value={form.name} onChange={(e) => update("name", e.target.value)} required /></Field>
      <Field label="Type"><select value={form.type} onChange={(e) => update("type", e.target.value)}>{CAMPAIGN_TYPES.map(option)}</select></Field>
      <Field label="Sent Date"><input type="date" value={form.sent_date} onChange={(e) => update("sent_date", e.target.value)} /></Field>
      <Field label="Recipients"><input type="number" value={form.recipients_count} onChange={(e) => update("recipients_count", e.target.value)} /></Field>
      <Field label="Open Rate"><input type="number" step="0.01" value={form.open_rate} onChange={(e) => update("open_rate", e.target.value)} /></Field>
      <Field label="Notes"><input value={form.notes} onChange={(e) => update("notes", e.target.value)} /></Field>
    </>}>
      <div className="card-grid-list">
        {rows.length === 0 ? <EmptyState title="No campaigns" description="Add outreach history for this tournament." /> : rows.map((row) => (
          <article className="info-card" key={row.id}>
            <div className="card-topline"><h3>{row.name}</h3><Badge value={row.type} variant="neutral" /></div>
            <p>{formatDate(row.sent_date, "Date pending")}</p>
            <div className="card-grid"><strong>{row.recipients_count || 0} recipients</strong><strong className="green-text">{row.open_rate || 0}% open</strong></div>
            <p>{row.notes}</p>
            <DeleteButton table="tournament_campaigns" id={row.id} refresh={refresh} />
          </article>
        ))}
      </div>
    </CrudSection>
  );
}

function FinancesTab({ tournament, refresh }) {
  const rows = tournament.tournament_finances ?? [];
  const income = sum(rows.filter((row) => row.category === "income"));
  const expenses = sum(rows.filter((row) => row.category === "expense"));
  const net = income - expenses;
  return (
    <CrudSection title="Finances" table="tournament_finances" tournamentId={tournament.id} refresh={refresh} initial={{ description: "", category: "income", amount: 0, date: "", notes: "" }} renderForm={(form, update) => <>
      <Field label="Description"><input value={form.description} onChange={(e) => update("description", e.target.value)} required /></Field>
      <Field label="Category"><select value={form.category} onChange={(e) => update("category", e.target.value)}>{FINANCE_CATEGORIES.map(option)}</select></Field>
      <Field label="Amount"><input type="number" step="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} /></Field>
      <Field label="Date"><input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} /></Field>
      <Field label="Notes"><input value={form.notes} onChange={(e) => update("notes", e.target.value)} /></Field>
    </>}>
      <div className="stat-grid compact"><StatCard label="Income" value={money(income)} tone="green" /><StatCard label="Expenses" value={money(expenses)} tone="red" /><StatCard label="Net" value={money(net)} tone={net >= 0 ? "green" : "red"} /></div>
      <DataTable headers={["Description", "Category", "Amount", "Date", "Notes", ""]} empty="No finance entries yet.">
        {rows.map((row) => <tr key={row.id}><td>{row.description}</td><td><Badge value={row.category} variant={row.category === "income" ? "confirmed" : "waitlist"} /></td><td className={row.category === "income" ? "green-text" : "red-text"}>{row.category === "income" ? "+" : "-"}{money(row.amount)}</td><td>{formatDate(row.date, "TBD")}</td><td>{row.notes}</td><td><DeleteButton table="tournament_finances" id={row.id} refresh={refresh} /></td></tr>)}
      </DataTable>
    </CrudSection>
  );
}

function OperationsTab({ tournament, refresh }) {
  const rows = tournament.tournament_operations ?? [];
  return (
    <CrudSection title="Operations" table="tournament_operations" tournamentId={tournament.id} refresh={refresh} initial={{ title: "", category: "logistics", status: "pending", description: "", assigned_to: "" }} renderForm={(form, update) => <>
      <Field label="Title"><input value={form.title} onChange={(e) => update("title", e.target.value)} required /></Field>
      <Field label="Category"><select value={form.category} onChange={(e) => update("category", e.target.value)}>{OPERATION_CATEGORIES.map(option)}</select></Field>
      <Field label="Status"><select value={form.status} onChange={(e) => update("status", e.target.value)}>{OPERATION_STATUSES.map(option)}</select></Field>
      <Field label="Assigned To"><input value={form.assigned_to} onChange={(e) => update("assigned_to", e.target.value)} /></Field>
      <Field label="Description"><input value={form.description} onChange={(e) => update("description", e.target.value)} /></Field>
    </>}>
      <div className="card-grid-list">
        {rows.length === 0 ? <EmptyState title="No operation items" description="Track field, referee, vendor, sponsor, media, and security tasks here." /> : rows.map((row) => (
          <article className="info-card" key={row.id}>
            <div className="card-topline"><h3>{row.title}</h3><Badge value={row.category} variant="neutral" /></div>
            <p>{row.description}</p>
            <span className="mini-label">Assigned to {row.assigned_to || "Unassigned"}</span>
            <div className="button-row"><InlineSelect table="tournament_operations" row={row} field="status" options={OPERATION_STATUSES} refresh={refresh} /><DeleteButton table="tournament_operations" id={row.id} refresh={refresh} /></div>
          </article>
        ))}
      </div>
    </CrudSection>
  );
}

function LinksTab({ tournament, refresh }) {
  const rows = tournament.tournament_links ?? [];
  return (
    <CrudSection title="Links" table="tournament_links" tournamentId={tournament.id} refresh={refresh} initial={{ label: "", url: "", description: "" }} renderForm={(form, update) => <>
      <Field label="Label"><input value={form.label} onChange={(e) => update("label", e.target.value)} required /></Field>
      <Field label="URL"><input type="url" value={form.url} onChange={(e) => update("url", e.target.value)} required /></Field>
      <Field label="Description"><input value={form.description} onChange={(e) => update("description", e.target.value)} /></Field>
    </>}>
      <div className="link-grid">
        {rows.length === 0 ? <EmptyState title="No links" description="Add schedules, maps, documents, and external operation resources." /> : rows.map((row) => (
          <article className="info-card" key={row.id}>
            <div className="card-topline"><h3>{row.label}</h3><DeleteButton table="tournament_links" id={row.id} refresh={refresh} /></div>
            <p>{row.description}</p>
            <a className="external-link" href={row.url} target="_blank" rel="noreferrer">{row.url}<ExternalLink size={15} /></a>
          </article>
        ))}
      </div>
    </CrudSection>
  );
}

function CrudSection({ title, table, tournamentId, initial, renderForm, refresh, header, children }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function add(event) {
    event.preventDefault();
    setError("");
    const payload = normalizePayload({ ...form, tournament_id: tournamentId });
    const { error: insertError } = await supabase.from(table).insert(payload);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setForm(initial);
    setAdding(false);
    refresh();
  }

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div><h3>{title}</h3>{header}</div>
        <button className="ghost-button" onClick={() => setAdding((value) => !value)}><Plus size={16} />Add</button>
      </div>
      {adding && <form className="form-grid inline-form" onSubmit={add}>{renderForm(form, update)}<button className="primary-button full-span" type="submit">Save {title.slice(0, -1)}</button></form>}
      {error && <p className="error-text">{error}</p>}
      {children}
    </section>
  );
}

function DataTable({ headers, empty, children }) {
  const hasRows = useMemo(() => Array.isArray(children) ? children.length > 0 : Boolean(children), [children]);
  if (!hasRows) return <EmptyState title={empty} description="Use the add button to create the first record." />;
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function InlineSelect({ table, row, field, options, refresh }) {
  async function update(value) {
    const { error } = await supabase.from(table).update({ [field]: value }).eq("id", row.id);
    if (!error) refresh();
  }
  return <select className="inline-select" value={row[field]} onChange={(event) => update(event.target.value)}>{options.map(option)}</select>;
}

function DeleteButton({ table, id, refresh }) {
  async function remove() {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (!error) refresh();
  }
  return <button className="icon-button danger" onClick={remove} aria-label="Delete" title="Delete"><Trash2 size={16} /></button>;
}

function option(value) {
  return <option key={value} value={value}>{titleize(value)}</option>;
}

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));
}

function normalizePayload(payload) {
  const numericFields = new Set(["total_slots", "recipients_count", "open_rate", "amount"]);
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => {
    if (value === "") return [key, null];
    if (numericFields.has(key)) return [key, Number(value || 0)];
    return [key, value];
  }));
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => ({ ...acc, [row[field]]: (acc[row[field]] || 0) + 1 }), {});
}

function sum(rows) {
  return rows.reduce((total, row) => total + Number(row.amount || 0), 0);
}
