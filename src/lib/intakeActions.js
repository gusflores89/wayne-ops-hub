import { supabase } from "./supabase.js";

const CONTACT_ROLES = new Set(["referee", "vendor", "investor", "field_manager", "logistics", "staff", "sponsor", "other"]);
const OPERATION_CATEGORIES = new Set(["logistics", "field", "referee", "vendor", "sponsor", "media", "security", "other"]);
const OPERATION_STATUSES = new Set(["pending", "in_progress", "done"]);

function value(input) {
  const normalized = typeof input === "string" ? input.trim() : input;
  return normalized === "" || normalized === undefined ? null : normalized;
}

function amount(input) {
  const normalized = Number(input);
  return Number.isFinite(normalized) ? Math.abs(normalized) : 0;
}

function sourceNote(reviewId, notes) {
  return [value(notes), `AI Intake review ${reviewId}`].filter(Boolean).join(" | ");
}

async function insertRow(table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select("id").single();
  if (error) throw error;
  return { table, id: data.id };
}

async function saveRegistration(action, tournamentId, reviewId) {
  const payload = action.payload;
  const teamName = value(payload.team_name) || value(payload.club_name);
  if (!teamName) throw new Error("A registration needs a team or club name.");

  const paymentStatus = value(payload.payment_status)?.toUpperCase() || null;
  const registration = await insertRow("tournament_registrations", {
    tournament_id: tournamentId,
    external_id: `ai-${crypto.randomUUID()}`,
    current_team_name: teamName,
    event_team_name: teamName,
    club_name: value(payload.club_name),
    event_age: value(payload.event_age),
    gender: value(payload.gender),
    state: value(payload.state),
    division: value(payload.division),
    preferred_level: value(payload.preferred_level),
    coach_name_1: value(payload.coach_name),
    coach_email_1: value(payload.coach_email),
    coach_phone_1: value(payload.coach_phone),
    payment_status: paymentStatus,
    invoiced_total: amount(payload.amount),
    complete: true,
    submitted: true,
    optional_notes: value(payload.notes),
    raw_data: { source: "ai_intake", review_id: reviewId },
  });

  const results = [registration];
  results.push(await insertRow("tournament_teams", {
    tournament_id: tournamentId,
    club_name: value(payload.club_name) || teamName,
    contact_name: value(payload.coach_name),
    contact_email: value(payload.coach_email),
    age_group: value(payload.event_age),
    status: paymentStatus === "PAID" ? "confirmed" : "pending",
    notes: sourceNote(reviewId, payload.notes),
  }));

  if (value(payload.coach_name) || value(payload.coach_email)) {
    results.push(await insertRow("tournament_contacts", {
      tournament_id: tournamentId,
      name: value(payload.coach_name) || `${teamName} contact`,
      role: "staff",
      email: value(payload.coach_email),
      phone: value(payload.coach_phone),
      notes: sourceNote(reviewId, `Team: ${teamName}`),
    }));
  }

  if (amount(payload.amount) > 0) {
    results.push(await insertRow("tournament_finances", {
      tournament_id: tournamentId,
      description: value(payload.description) || `Registration - ${teamName}`,
      category: "income",
      amount: amount(payload.amount),
      date: value(payload.date),
      notes: sourceNote(reviewId, payload.notes),
    }));
  }

  return results;
}

async function saveExpense(action, tournamentId, reviewId) {
  const payload = action.payload;
  if (!amount(payload.amount)) throw new Error("An expense needs an amount greater than zero.");
  return [await insertRow("tournament_finances", {
    tournament_id: tournamentId,
    description: value(payload.description) || value(action.title) || "Expense",
    category: "expense",
    amount: amount(payload.amount),
    date: value(payload.date),
    notes: sourceNote(reviewId, payload.notes),
  })];
}

async function saveContact(action, tournamentId, reviewId) {
  const payload = action.payload;
  const name = value(payload.contact_name);
  if (!name) throw new Error("A contact needs a name.");
  const role = CONTACT_ROLES.has(payload.role) ? payload.role : "other";
  return [await insertRow("tournament_contacts", {
    tournament_id: tournamentId,
    name,
    role,
    email: value(payload.email),
    phone: value(payload.phone),
    notes: sourceNote(reviewId, payload.notes),
  })];
}

async function saveOperation(action, tournamentId, reviewId) {
  const payload = action.payload;
  const title = value(payload.operation_title) || value(action.title);
  if (!title) throw new Error("An operation needs a title.");
  return [await insertRow("tournament_operations", {
    tournament_id: tournamentId,
    title,
    category: OPERATION_CATEGORIES.has(payload.operation_category) ? payload.operation_category : "other",
    status: OPERATION_STATUSES.has(payload.operation_status) ? payload.operation_status : "pending",
    description: sourceNote(reviewId, payload.description || payload.notes),
    assigned_to: value(payload.assigned_to),
  })];
}

async function saveLink(action, tournamentId, reviewId) {
  const payload = action.payload;
  if (!value(payload.url)) throw new Error("A link needs a URL.");
  return [await insertRow("tournament_links", {
    tournament_id: tournamentId,
    label: value(payload.label) || value(action.title) || "Tournament link",
    url: value(payload.url),
    description: sourceNote(reviewId, payload.description || payload.notes),
  })];
}

export async function applyIntakeActions(actions, tournamentId, reviewId) {
  if (!tournamentId) throw new Error("Select a tournament before confirming.");
  const results = [];

  for (const action of actions) {
    let actionResults;
    if (action.action_type === "registration") actionResults = await saveRegistration(action, tournamentId, reviewId);
    if (action.action_type === "expense") actionResults = await saveExpense(action, tournamentId, reviewId);
    if (action.action_type === "contact") actionResults = await saveContact(action, tournamentId, reviewId);
    if (action.action_type === "operation") actionResults = await saveOperation(action, tournamentId, reviewId);
    if (action.action_type === "link") actionResults = await saveLink(action, tournamentId, reviewId);
    if (!actionResults) throw new Error(`Unsupported action type: ${action.action_type}`);
    results.push({ action_type: action.action_type, records: actionResults });
  }

  return results;
}
