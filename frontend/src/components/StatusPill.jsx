// The dot carries the status colour; the label stays in the text colour so it
// meets contrast in both themes (yellow text on white would be ~2:1).
const STATUS_STYLES = {
  UPLOADED: { label: "Uploaded", color: "var(--muted-foreground)" },
  SCORED: { label: "Scored", color: "var(--chart-2)" },
  TESTING: { label: "Testing", color: "var(--chart-3)" },
  COMPLETED: { label: "Completed", color: "var(--chart-4)" },
  RUNNING: { label: "Running", color: "var(--chart-3)" },
  CANCELLED: { label: "Cancelled", color: "var(--muted-foreground)" },
};

export const THUMBNAIL_STATUSES = ["UPLOADED", "SCORED", "TESTING", "COMPLETED"];

export function statusLabel(status) {
  return STATUS_STYLES[status]?.label || status;
}

export default function StatusPill({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.UPLOADED;
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: style.color }} aria-hidden="true" />
      {style.label}
    </span>
  );
}
