import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Field from "../components/Field.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { TOURNAMENT_STATUSES } from "../lib/constants.js";
import { supabase } from "../lib/supabase.js";

const initialForm = {
  name: "",
  status: "planning",
  start_date: "",
  end_date: "",
  city: "",
  country: "",
  venue: "",
  total_slots: 0,
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
    const payload = { ...form, total_slots: Number(form.total_slots || 0) };
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
        <Field label="Status">
          <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
            {TOURNAMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </Field>
        <Field label="Start Date"><input type="date" value={form.start_date} onChange={(event) => updateField("start_date", event.target.value)} /></Field>
        <Field label="End Date"><input type="date" value={form.end_date} onChange={(event) => updateField("end_date", event.target.value)} /></Field>
        <Field label="City"><input value={form.city} onChange={(event) => updateField("city", event.target.value)} /></Field>
        <Field label="Country"><input value={form.country} onChange={(event) => updateField("country", event.target.value)} /></Field>
        <Field label="Venue"><input value={form.venue} onChange={(event) => updateField("venue", event.target.value)} /></Field>
        <Field label="Total Slots"><input type="number" min="0" value={form.total_slots} onChange={(event) => updateField("total_slots", event.target.value)} /></Field>
        <Field label="Notes"><textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} /></Field>
        {error && <p className="error-text full-span">{error}</p>}
        <button type="submit" className="primary-button full-span" disabled={saving}>{saving ? "Creating..." : "Create Tournament"}</button>
      </form>
    </div>
  );
}
