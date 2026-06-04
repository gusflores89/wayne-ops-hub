export default function StatCard({ label, value, tone }) {
  return (
    <div className={`stat-card ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
