import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function titleize(value) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatDate(value, fallback = "Unscheduled") {
  if (!value) return fallback;
  return format(parseISO(value), "MMM d, yyyy");
}

export function daysUntil(value) {
  if (!value) return null;
  return differenceInCalendarDays(parseISO(value), new Date());
}

export function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}
