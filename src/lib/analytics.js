const yearPattern = /\b(20\d{2})\b/g;

export function inferSeriesName(tournament) {
  if (tournament.series_name?.trim()) return tournament.series_name.trim();
  return String(tournament.name || "Untitled Series")
    .replace(yearPattern, "")
    .replace(/\s*[-|–—]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function tournamentYear(tournament) {
  if (tournament.start_date) return new Date(`${tournament.start_date}T12:00:00`).getFullYear();
  const match = String(tournament.name || "").match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function buildTournamentMetrics(tournament) {
  const registrations = tournament.tournament_registrations ?? [];
  const teams = tournament.tournament_teams ?? [];
  const finances = tournament.tournament_finances ?? [];
  const actualTeams = registrations.length || teams.length;
  const revenue = registrations.length
    ? registrations
        .filter((row) => String(row.payment_status || "").toLowerCase() === "paid")
        .reduce((sum, row) => sum + Number(row.invoiced_total || 0), 0)
    : finances
        .filter((row) => row.category === "income")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenses = finances
    .filter((row) => row.category === "expense")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const profit = revenue - expenses;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const teamTarget = Number(tournament.total_slots || 0);
  const revenueTarget = Number(tournament.revenue_target || 0);
  const expenseBudget = Number(tournament.expense_budget || 0);
  const profitTarget = Number(tournament.profit_target || 0);
  const marginTarget = Number(tournament.margin_target || 0);
  const status = metricStatus({ actualTeams, teamTarget, revenue, revenueTarget, margin, marginTarget });

  return {
    ...tournament,
    actualTeams,
    revenue,
    expenses,
    profit,
    margin,
    teamTarget,
    revenueTarget,
    expenseBudget,
    profitTarget,
    marginTarget,
    status,
  };
}

export function buildRegistrationPace(tournament, maxWeeks = 20) {
  const eventDate = dateFromIso(tournament.start_date);
  if (!eventDate) return [];
  const registrations = tournament.tournament_registrations ?? [];

  return Array.from({ length: maxWeeks + 1 }, (_, index) => maxWeeks - index).map((weeksOut) => {
    const cutoff = new Date(eventDate);
    cutoff.setDate(cutoff.getDate() - weeksOut * 7);
    return {
      weeksOut,
      count: registrations.filter((row) => {
        const created = parseGotSportDate(row.created_at_source) || parseGotSportDate(row.submitted_at);
        return created ? created <= cutoff : weeksOut === 0;
      }).length,
    };
  });
}

export function buildReportsModel(tournaments, filters = {}) {
  const series = [...new Set(tournaments.map(inferSeriesName))].sort();
  const selectedSeries = filters.series || series[0] || "";
  const editions = tournaments
    .filter((tournament) => inferSeriesName(tournament) === selectedSeries)
    .map((tournament) => ({
      ...tournament,
      year: tournamentYear(tournament),
      tournament_registrations: filterRegistrations(tournament.tournament_registrations ?? [], filters),
    }))
    .filter((tournament) => tournament.year)
    .sort((a, b) => b.year - a.year);

  const selectedYears = filters.years?.length ? new Set(filters.years.map(Number)) : null;
  const visibleEditions = selectedYears ? editions.filter((edition) => selectedYears.has(edition.year)) : editions;
  const weeks = Array.from({ length: 21 }, (_, index) => 20 - index);
  const paceByEdition = new Map(visibleEditions.map((edition) => [edition.year, buildRegistrationPace(edition)]));
  const paceData = weeks.map((weeksOut) => {
    const point = { weeksOut };
    for (const edition of visibleEditions) {
      point[String(edition.year)] = paceByEdition.get(edition.year)?.find((row) => row.weeksOut === weeksOut)?.count ?? 0;
    }
    return point;
  });

  const current = editions[0] ?? null;
  const previous = editions[1] ?? null;
  const weeksOut = current?.start_date ? Math.max(0, Math.ceil((dateFromIso(current.start_date) - new Date()) / 604800000)) : 0;
  const currentCount = current?.tournament_registrations?.length ?? 0;
  const previousPace = previous ? buildRegistrationPace(previous) : [];
  const previousSamePoint = previousPace.find((point) => point.weeksOut === Math.min(20, weeksOut))?.count ?? previous?.tournament_registrations?.length ?? 0;
  const projection = projectTotal(current, previous, previousSamePoint, currentCount);

  return {
    series,
    selectedSeries,
    editions,
    visibleEditions,
    paceData,
    current,
    previous,
    weeksOut,
    currentCount,
    previousSamePoint,
    projection,
  };
}

export function ageDistribution(editions) {
  const counts = new Map();
  for (const edition of editions) {
    for (const row of edition.tournament_registrations ?? []) {
      const age = row.event_age || row.team_age || "Unknown";
      counts.set(age, (counts.get(age) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([age, teams]) => ({ age, teams }))
    .sort((a, b) => ageNumber(a.age) - ageNumber(b.age));
}

export function stateSplit(edition) {
  const hostState = String(edition?.host_state || "").trim().toUpperCase();
  const rows = edition?.tournament_registrations ?? [];
  if (!hostState) return [{ name: "Unclassified", value: rows.length }];
  const inState = rows.filter((row) => hostState && String(row.state || "").trim().toUpperCase() === hostState).length;
  return [
    { name: "In-state", value: inState },
    { name: "Out-of-state", value: Math.max(0, rows.length - inState) },
  ];
}

function metricStatus({ actualTeams, teamTarget, revenue, revenueTarget, margin, marginTarget }) {
  const ratios = [];
  if (teamTarget > 0) ratios.push(actualTeams / teamTarget);
  if (revenueTarget > 0) ratios.push(revenue / revenueTarget);
  if (marginTarget > 0) ratios.push(margin / marginTarget);
  if (!ratios.length) return "unrated";
  const minimum = Math.min(...ratios);
  if (minimum >= 1) return "green";
  if (minimum >= 0.85) return "yellow";
  return "red";
}

function filterRegistrations(rows, filters) {
  return rows.filter((row) => {
    const gender = String(row.gender || "").toLowerCase();
    const age = String(row.event_age || row.team_age || "");
    const genderMatches = !filters.gender || filters.gender === "all" || gender === filters.gender;
    const ageMatches = !filters.age || filters.age === "all" || age === filters.age;
    return genderMatches && ageMatches;
  });
}

function projectTotal(current, previous, previousSamePoint, currentCount) {
  if (!current) return 0;
  const target = Number(current.total_slots || 0);
  if (previous && previousSamePoint > 0) {
    return Math.round(currentCount * ((previous.tournament_registrations?.length || previousSamePoint) / previousSamePoint));
  }
  return Math.max(currentCount, target);
}

function dateFromIso(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseGotSportDate(value) {
  if (!value) return null;
  const normalized = String(value).replace(/\s+(PST|PDT|CST|CDT|EST|EDT|MST|MDT)$/i, "").trim();
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!match) {
    const fallback = new Date(normalized);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  let hour = Number(match[4]);
  const meridiem = match[6].toLowerCase();
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]), hour, Number(match[5]));
}

function ageNumber(value) {
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : 999;
}
