const columnMap = {
  external_id: "ID",
  current_team_name: "Current Team Name",
  club_name: "Club Name",
  event_team_name: "Event Team Name",
  short_name: "Short Name",
  created_at_source: "Created",
  complete: "Complete",
  submitted: "Submitted",
  submitted_at: "Submitted At",
  enrolled_by_name: "Enrolled By Name",
  enrolled_by_email: "Enrolled By Email",
  enrolled_by_phone: "Enrolled By Phone",
  event_age: "Event Age",
  team_id: "Team ID",
  club_id: "Club ID",
  team_age: "Team Age",
  gender: "Gender",
  state: "State",
  division: "Division",
  bracket: "Bracket",
  flags: "Flags",
  billing_name: "Billing Name",
  fee_group: "Fee Group",
  invoiced_reg_fee: "Invoiced Reg Fee",
  account_payment_method: "Account Payment Method",
  payment_status: "Payment Status",
  last_payment_check_id: "Last Payment Check/ID",
  last_payment_method: "Last Payment Method",
  last_payment_date_received: "Last Payment Date Received",
  features_invoiced_total: "Features Invoiced Total",
  invoiced_total: "Invoiced Total",
  transaction_ids: "Transaction IDs",
  accounting_codes: "Accounting Codes",
  preferred_division: "Preferred Division",
  optional_notes: "Optional Notes",
  coach_name_1: "Coach Name 1",
  coach_email_1: "Coach Email 1",
  coach_phone_1: "Coach Phone 1",
  coach_name_2: "Coach Name 2",
  coach_email_2: "Coach Email 2",
  coach_phone_2: "Coach Phone 2",
  manager_name_1: "Manager Name 1",
  manager_email_1: "Manager Email 1",
  manager_phone_1: "Manager Phone 1",
  manager_name_2: "Manager Name 2",
  manager_email_2: "Manager Email 2",
  manager_phone_2: "Manager Phone 2",
  arrival_date: "Arrival Date",
  departure_date: "Departure Date",
  current_league_platform: "Current league/platform:",
  standings_link: "Please provide a link to your team’s current league standings:",
  preferred_level: "Preferred level of play? (No specific level guaranteed)",
  birth_year: "What is the birth year of your team?",
  payment_acknowledged: "I understand payment must be submitted to complete this application but it will not be charged until my team is accepted.",
  schedule_acknowledged: "I understand my team could play 1 game on Saturday and 2 on Sunday or 2 on Saturday and 1 on Sunday.",
  finals_acknowledged: "I understand semis and finals are scheduled for Monday.",
  guest_player_documents: "Guest Player Documents - Please upload all guest player cards and required loan documents for any guest players listed on your roster.",
  player_passes: "Please upload all player passes that match your submitted roster. (All players listed on your roster must have a corresponding valid player pass.)",
  official_roster: "Please upload your Official Roster (USYS/US Club /MLS Next /ECNL Etc)",
};

export async function parseRegistrationsWorkbook(file) {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerRowIndex = rows.findIndex((row) => row.includes("ID") && row.includes("Club Name"));

  if (headerRowIndex === -1) {
    throw new Error("Could not find the GotSport header row. Expected columns like ID and Club Name.");
  }

  const headers = rows[headerRowIndex].map((header) => String(header || "").trim());
  const dataRows = rows.slice(headerRowIndex + 1).filter((row) => row.some((cell) => cell !== ""));

  return dataRows.map((row) => {
    const raw = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    return normalizeRegistration(raw);
  });
}

export function summarizeRegistrations(rows) {
  const total = rows.length;
  const paid = rows.filter((row) => String(row.payment_status || "").toLowerCase() === "paid").length;
  const submitted = rows.filter((row) => row.submitted).length;
  const complete = rows.filter((row) => row.complete).length;
  const revenue = rows.reduce((sum, row) => sum + Number(row.invoiced_total || 0), 0);
  const missingDocs = rows.filter((row) => getReadinessIssues(row).some((issue) => issue.includes("doc") || issue.includes("roster") || issue.includes("passes"))).length;
  const missingStandings = rows.filter((row) => !row.standings_link).length;
  const missingContact = rows.filter((row) => !row.manager_email_1 && !row.coach_email_1 && !row.enrolled_by_email).length;

  return { total, paid, submitted, complete, revenue, missingDocs, missingStandings, missingContact };
}

export function getReadinessIssues(row) {
  const issues = [];
  if (String(row.payment_status || "").toLowerCase() !== "paid") issues.push("payment");
  if (!row.official_roster) issues.push("roster");
  if (!row.player_passes) issues.push("player passes");
  if (!row.standings_link) issues.push("standings link");
  if (!row.manager_email_1 && !row.coach_email_1 && !row.enrolled_by_email) issues.push("contact");
  return issues;
}

export function groupCounts(rows, field, limit = 10) {
  const counts = rows.reduce((acc, row) => {
    const value = row[field] || "Unassigned";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

export function findReturningCoaches(currentRows, comparisonRows, currentTournamentDate = null) {
  const otherByEmail = new Map();

  for (const row of comparisonRows) {
    for (const email of coachEmails(row)) {
      const matches = otherByEmail.get(email) || [];
      matches.push(row);
      otherByEmail.set(email, matches);
    }
  }

  const results = [];
  const seen = new Set();

  for (const row of currentRows) {
    for (const email of coachEmails(row)) {
      for (const other of otherByEmail.get(email) || []) {
        if (currentTournamentDate && other.tournaments?.start_date && other.tournaments.start_date <= currentTournamentDate) {
          continue;
        }
        const key = `${email}|${other.tournament_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          email,
          currentTeam: row.event_team_name || row.current_team_name || "Unknown team",
          currentClub: row.club_name || "",
          otherTeam: other.event_team_name || other.current_team_name || "Unknown team",
          otherClub: other.club_name || "",
          tournamentName: other.tournaments?.name || "Other tournament",
          tournamentDate: other.tournaments?.start_date || null,
        });
      }
    }
  }

  return results.sort((a, b) => String(b.tournamentDate || "").localeCompare(String(a.tournamentDate || "")));
}

export function uniqueCoachEmailCount(rows) {
  return new Set(rows.flatMap(coachEmails)).size;
}

function coachEmails(row) {
  return [row.coach_email_1, row.coach_email_2]
    .map((email) => String(email || "").trim().toLowerCase())
    .filter(Boolean);
}

function normalizeRegistration(raw) {
  const normalized = {};
  for (const [field, column] of Object.entries(columnMap)) {
    normalized[field] = raw[column] ?? "";
  }

  normalized.external_id = String(normalized.external_id || "").trim();
  normalized.team_id = stringOrNull(normalized.team_id);
  normalized.club_id = stringOrNull(normalized.club_id);
  normalized.complete = toBoolean(normalized.complete);
  normalized.submitted = toBoolean(normalized.submitted);
  normalized.payment_acknowledged = toBoolean(normalized.payment_acknowledged);
  normalized.schedule_acknowledged = toBoolean(normalized.schedule_acknowledged);
  normalized.finals_acknowledged = toBoolean(normalized.finals_acknowledged);
  normalized.invoiced_reg_fee = toNumber(normalized.invoiced_reg_fee);
  normalized.features_invoiced_total = toNumber(normalized.features_invoiced_total);
  normalized.invoiced_total = toNumber(normalized.invoiced_total);
  normalized.gender = String(normalized.gender || "").toLowerCase();
  normalized.birth_year = stringOrNull(normalized.birth_year);
  normalized.raw_data = raw;
  return normalized;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "y", "1"].includes(String(value || "").trim().toLowerCase());
}

function toNumber(value) {
  if (typeof value === "number") return value;
  const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function stringOrNull(value) {
  const next = String(value || "").trim();
  return next || null;
}
