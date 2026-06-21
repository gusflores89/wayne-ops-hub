import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ImagePlus, LoaderCircle, Paperclip, RefreshCw, Send, Trash2, X } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import { applyIntakeActions } from "../lib/intakeActions.js";
import { supabase } from "../lib/supabase.js";

const ACTION_FIELDS = {
  registration: [
    ["team_name", "Team name"],
    ["club_name", "Club"],
    ["event_age", "Age group"],
    ["gender", "Gender"],
    ["state", "State"],
    ["division", "Division"],
    ["preferred_level", "Preferred level"],
    ["coach_name", "Coach name"],
    ["coach_email", "Coach email", "email"],
    ["coach_phone", "Coach phone"],
    ["payment_status", "Payment status", "select", ["PAID", "PARTIAL", "UNPAID", "REFUNDED"]],
    ["amount", "Registration amount", "number"],
    ["date", "Payment date", "date"],
    ["notes", "Notes", "textarea"],
  ],
  expense: [
    ["description", "Description"],
    ["amount", "Amount", "number"],
    ["date", "Date", "date"],
    ["category", "Expense category"],
    ["notes", "Notes", "textarea"],
  ],
  contact: [
    ["contact_name", "Name"],
    ["role", "Role", "select", ["referee", "vendor", "investor", "field_manager", "logistics", "staff", "sponsor", "other"]],
    ["email", "Email", "email"],
    ["phone", "Phone"],
    ["notes", "Notes", "textarea"],
  ],
  operation: [
    ["operation_title", "Task"],
    ["operation_category", "Category", "select", ["logistics", "field", "referee", "vendor", "sponsor", "media", "security", "other"]],
    ["operation_status", "Status", "select", ["pending", "in_progress", "done"]],
    ["assigned_to", "Assigned to"],
    ["description", "Description", "textarea"],
  ],
  link: [
    ["label", "Label"],
    ["url", "URL", "url"],
    ["description", "Description", "textarea"],
  ],
};

function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function prepareImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);

  const source = await readFile(file);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = source;
  });

  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    name: file.name,
    type: "image/jpeg",
    dataUrl: canvas.toDataURL("image/jpeg", 0.76),
  };
}

async function loadWorkspace() {
  const [tournamentsResult, reviewsResult] = await Promise.all([
    supabase.from("tournaments").select("id,name,start_date,end_date,status").order("start_date", { ascending: false }),
    supabase
      .from("ai_intake_reviews")
      .select("*, tournaments(name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (tournamentsResult.error) throw tournamentsResult.error;
  if (reviewsResult.error) throw reviewsResult.error;
  return {
    tournaments: tournamentsResult.data || [],
    reviews: reviewsResult.data || [],
  };
}

export default function AIIntake() {
  const [tournaments, setTournaments] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState([]);
  const [activeReview, setActiveReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [queueFilter, setQueueFilter] = useState("pending");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const workspace = await loadWorkspace();
      setTournaments(workspace.tournaments);
      setReviews(workspace.reviews);
      setSelectedTournamentId((current) => current || workspace.tournaments[0]?.id || "");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedTournamentId),
    [selectedTournamentId, tournaments],
  );

  const filteredReviews = useMemo(
    () => reviews.filter((review) => queueFilter === "all" || review.status === queueFilter),
    [queueFilter, reviews],
  );

  async function attachImages(event) {
    setError("");
    try {
      const remaining = Math.max(0, 2 - images.length);
      const nextImages = await Promise.all(Array.from(event.target.files || []).slice(0, remaining).map(prepareImage));
      setImages((current) => [...current, ...nextImages].slice(0, 2));
    } catch (imageError) {
      setError(imageError.message);
    } finally {
      event.target.value = "";
    }
  }

  async function analyze(event) {
    event.preventDefault();
    setAnalyzing(true);
    setError("");
    setNotice("");

    try {
      if (!selectedTournament) throw new Error("Select a tournament.");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session expired. Sign in again.");

      const response = await fetch("/api/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          images,
          tournament: selectedTournament,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "The intake service did not return a valid response.");

      const { data: review, error: insertError } = await supabase
        .from("ai_intake_reviews")
        .insert({
          tournament_id: selectedTournament.id,
          source_text: message || null,
          attachment_names: images.map((image) => image.name),
          summary: result.summary,
          confidence: Math.round(result.confidence),
          clarification_needed: result.clarification_needed,
          clarification_question: result.clarification_question,
          actions: result.actions,
        })
        .select("*, tournaments(name)")
        .single();
      if (insertError) throw insertError;

      setReviews((current) => [review, ...current]);
      setActiveReview(review);
      setMessage("");
      setImages([]);
      setNotice("Proposal ready for review.");
    } catch (analyzeError) {
      setError(analyzeError.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function updateAction(actionIndex, field, nextValue) {
    setActiveReview((current) => ({
      ...current,
      actions: current.actions.map((action, index) => (
        index === actionIndex
          ? { ...action, payload: { ...action.payload, [field]: nextValue } }
          : action
      )),
    }));
  }

  function removeAction(actionIndex) {
    setActiveReview((current) => ({
      ...current,
      actions: current.actions.filter((_, index) => index !== actionIndex),
    }));
  }

  async function rejectReview() {
    if (!activeReview) return;
    setConfirming(true);
    setError("");
    const { data, error: updateError } = await supabase
      .from("ai_intake_reviews")
      .update({ status: "rejected", actions: activeReview.actions })
      .eq("id", activeReview.id)
      .select("*, tournaments(name)")
      .single();
    setConfirming(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setReviews((current) => current.map((review) => review.id === data.id ? data : review));
    setActiveReview(data);
    setNotice("Proposal rejected. No operational data was changed.");
  }

  async function confirmReview() {
    if (!activeReview || activeReview.status !== "pending") return;
    if (!activeReview.actions.length) {
      setError("There are no actions to confirm.");
      return;
    }

    setConfirming(true);
    setError("");
    setNotice("");
    try {
      const results = await applyIntakeActions(
        activeReview.actions,
        activeReview.tournament_id,
        activeReview.id,
      );
      const { data, error: updateError } = await supabase
        .from("ai_intake_reviews")
        .update({
          actions: activeReview.actions,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          result_log: results,
        })
        .eq("id", activeReview.id)
        .eq("status", "pending")
        .select("*, tournaments(name)")
        .single();
      if (updateError) throw updateError;

      setReviews((current) => current.map((review) => review.id === data.id ? data : review));
      setActiveReview(data);
      setNotice(`${results.length} action${results.length === 1 ? "" : "s"} added to the dashboard.`);
    } catch (confirmError) {
      setError(confirmError.message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="page-stack intake-page">
      <PageHeader
        eyebrow="Assisted Data Entry"
        title="AI Intake"
        action={(
          <button className="icon-button" type="button" onClick={refresh} title="Refresh queue" aria-label="Refresh queue">
            <RefreshCw size={17} />
          </button>
        )}
      />

      {error && <p className="error-text intake-alert">{error}</p>}
      {notice && <p className="success-text intake-alert">{notice}</p>}

      <div className="intake-workspace">
        <section className="intake-compose">
          <form className="panel intake-form" onSubmit={analyze}>
            <div className="panel-toolbar">
              <div>
                <p className="eyebrow">New intake</p>
                <h3>What should be recorded?</h3>
              </div>
              <span className="badge badge-pending">Review first</span>
            </div>

            <label className="field">
              <span>Tournament</span>
              <select value={selectedTournamentId} onChange={(event) => setSelectedTournamentId(event.target.value)} required>
                <option value="">Select tournament</option>
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>{tournament.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Message</span>
              <textarea
                className="intake-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Example: Paid $850 to Central Referees today for Surf Cup Texas."
              />
            </label>

            {images.length > 0 && (
              <div className="attachment-list">
                {images.map((image, index) => (
                  <div className="attachment-chip" key={`${image.name}-${index}`}>
                    <img src={image.dataUrl} alt="" />
                    <span>{image.name}</span>
                    <button type="button" onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${image.name}`}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="intake-submit-row">
              <label className="upload-button">
                <ImagePlus size={17} />
                Receipt or photo
                <input type="file" accept="image/*" multiple onChange={attachImages} disabled={images.length >= 2} />
              </label>
              <button className="primary-button" type="submit" disabled={analyzing || (!message.trim() && images.length === 0)}>
                {analyzing ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
                {analyzing ? "Analyzing..." : "Prepare review"}
              </button>
            </div>
          </form>

          <ReviewEditor
            review={activeReview}
            confirming={confirming}
            onUpdate={updateAction}
            onRemove={removeAction}
            onConfirm={confirmReview}
            onReject={rejectReview}
          />
        </section>

        <aside className="panel intake-queue">
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Saved proposals</p>
              <h3>Review Queue</h3>
            </div>
            <span className="badge">{reviews.filter((review) => review.status === "pending").length} pending</span>
          </div>
          <div className="intake-filters" role="group" aria-label="Review status">
            {["pending", "confirmed", "rejected", "all"].map((filter) => (
              <button key={filter} type="button" className={queueFilter === filter ? "active" : ""} onClick={() => setQueueFilter(filter)}>
                {filter}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="screen-loader">Loading queue...</div>
          ) : filteredReviews.length === 0 ? (
            <div className="intake-empty"><Paperclip size={20} /><span>No {queueFilter === "all" ? "" : queueFilter} proposals</span></div>
          ) : (
            <div className="intake-review-list">
              {filteredReviews.map((review) => (
                <button
                  type="button"
                  className={`intake-review-row ${activeReview?.id === review.id ? "selected" : ""}`}
                  key={review.id}
                  onClick={() => {
                    setActiveReview(review);
                    setSelectedTournamentId(review.tournament_id || "");
                    setError("");
                    setNotice("");
                  }}
                >
                  <span className={`status-light status-${review.status === "confirmed" ? "green" : review.status === "rejected" ? "red" : "yellow"}`} />
                  <span>
                    <strong>{review.summary}</strong>
                    <small>{review.tournaments?.name || "No tournament"} · {dateTime(review.created_at)}</small>
                  </span>
                  <em>{review.confidence}%</em>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ReviewEditor({ review, confirming, onUpdate, onRemove, onConfirm, onReject }) {
  if (!review) {
    return (
      <div className="panel intake-review-empty">
        <Paperclip size={22} />
        <div>
          <h3>No proposal selected</h3>
          <p>New interpretations and saved drafts will open here.</p>
        </div>
      </div>
    );
  }

  const editable = review.status === "pending";

  return (
    <section className="panel intake-review-editor">
      <div className="panel-toolbar">
        <div>
          <p className="eyebrow">Human review</p>
          <h3>{review.summary}</h3>
        </div>
        <span className={`badge badge-${review.status === "confirmed" ? "confirmed" : review.status === "rejected" ? "waitlist" : "pending"}`}>
          {review.status}
        </span>
      </div>

      <div className="confidence-line">
        <span>AI confidence</span>
        <div><i style={{ width: `${review.confidence}%` }} /></div>
        <strong>{review.confidence}%</strong>
      </div>

      {review.clarification_needed && review.clarification_question && (
        <p className="intake-question">{review.clarification_question}</p>
      )}

      <div className="intake-actions">
        {review.actions.map((action, actionIndex) => (
          <article className="intake-action" key={`${action.action_type}-${actionIndex}`}>
            <header>
              <span className="badge">{action.action_type}</span>
              <strong>{action.title}</strong>
              {editable && (
                <button className="icon-button danger" type="button" onClick={() => onRemove(actionIndex)} title="Remove action" aria-label="Remove action">
                  <Trash2 size={15} />
                </button>
              )}
            </header>
            <div className="form-grid intake-action-fields">
              {(ACTION_FIELDS[action.action_type] || []).map(([field, label, type = "text", options]) => (
                <label className={`field ${type === "textarea" ? "full-span" : ""}`} key={field}>
                  <span>{label}</span>
                  {type === "select" ? (
                    <select value={action.payload[field] ?? ""} onChange={(event) => onUpdate(actionIndex, field, event.target.value || null)} disabled={!editable}>
                      <option value="">Not specified</option>
                      {options.map((option) => <option value={option} key={option}>{option}</option>)}
                    </select>
                  ) : type === "textarea" ? (
                    <textarea value={action.payload[field] ?? ""} onChange={(event) => onUpdate(actionIndex, field, event.target.value || null)} disabled={!editable} />
                  ) : (
                    <input
                      type={type}
                      min={type === "number" ? "0" : undefined}
                      step={type === "number" ? "0.01" : undefined}
                      value={action.payload[field] ?? ""}
                      onChange={(event) => onUpdate(actionIndex, field, type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : (event.target.value || null))}
                      disabled={!editable}
                    />
                  )}
                </label>
              ))}
            </div>
          </article>
        ))}
      </div>

      {editable && (
        <div className="intake-review-buttons">
          <button className="ghost-button danger" type="button" onClick={onReject} disabled={confirming}>
            <X size={17} />Reject
          </button>
          <button className="primary-button" type="button" onClick={onConfirm} disabled={confirming}>
            {confirming ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
            {confirming ? "Saving..." : "Confirm and add"}
          </button>
        </div>
      )}
    </section>
  );
}
