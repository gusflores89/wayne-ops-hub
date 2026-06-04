import { titleize } from "../lib/format.js";

export default function Badge({ value, variant = value }) {
  return <span className={`badge badge-${variant}`}>{titleize(value)}</span>;
}
