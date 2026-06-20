import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Field from "../components/Field.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { TOURNAMENT_STATUSES } from "../lib/constants.js";
import { supabase } from "../lib/supabase.js";

const initialForm = {
  name: "",
  status: "planning",
  series_name: "",
  start_date: "",
  end_date: "",
  city: "",
  host_state: "",
  country: "",
  venue: "",
  total_slots: 0,
  revenue_target: 0,
  expense_budget: 0,
  profit_target: 0,
  margin_target: 0,
  notes: "",
};

export default function TournamentCreate() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      total_slots: Number(form.total_slots || 0),
      revenue_target: Number(form.revenue_target || 0),
      expense_budget: Number(form.expense_budget || 0),
      profit_target: Number(form.profit_target || 0),
      margin_target: Number(form.margin_target || 0),
    };
    const { data, error: insertError } = await supabase.from("tournaments").insert(payload).select("id").single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    navigate(`/tournaments/${data.id}`);
  }

  return (
    <div className="page-stack narrow">
      <PageHeader eyebrow="New Operation" title="Create Tournament" />
      <form className="form-grid panel" onSubmit={handleSubmit}>
        <Field label="Name"><input value={form.name} onChange={(event) => updateField("name", event.target.value)} required /></Field>
        <Field label="Series Name"><input value={form.series_name} onChange={(event) => updateField("series_name", event.target.value)} placeholder="e.g. Surf Cup Texas" /></Field>
        <Field label="Status">
          <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
            {TOURNAMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </Field>
        <Field label="Start Date"><input type="date" value={form.start_date} onChange={(event) => updateField("start_date", event.target.value)} /></Field>
        <Field label="End Date"><input type="date" value={form.end_date} onChange={(event) => updateField("end_date", event.target.value)} /></Field>
        <Field label="City"><input value={form.city} onChange={(event) => updateField("city", event.target.value)} /></Field>
        <Field label="Host State"><input value={form.host_state} onChange={(event) => updateField("host_state", event.target.value)} placeholder="e.g. TX" /></Field>
        <Field label="Country"><input value={form.country} onChange={(event) => updateField("country", event.target.value)} /></Field>
        <Field label="Venue"><input value={form.venue} onChange={(event) => updateField("venue", event.target.value)} /></Field>
        <Field label="Team Target"><input type="number" min="0" value={form.total_slots} onChange={(event) => updateField("total_slots", event.target.value)} /></Field>
        <Field label="Revenue Target"><input type="number" min="0" step="0.01" value={form.revenue_target} onChange={(event) => updateField("revenue_target", event.target.value)} /></Field>
        <Field label="Expense Budget"><input type="number" min="0" step="0.01" value={form.expense_budget} onChange={(event) => updateField("expense_budget", event.target.value)} /></Field>
        <Field label="Profit Target"><input type="number" step="0.01" value={form.profit_target} onChange={(event) => updateField("profit_target", event.target.value)} /></Field>
        <Field label="Margin Target %"><input type="number" min="0" max="100" step="0.1" value={form.margin_target} onChange={(event) => updateField("margin_target", event.target.value)} /></Field>
        <Field label="Notes"><textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} /></Field>
        {error && <p className="error-text full-span">{error}</p>}
        <button type="submit" className="primary-button full-span" disabled={saving}>{saving ? "Creating..." : "Create Tournament"}</button>
      </form>
    </div>
  );
}
