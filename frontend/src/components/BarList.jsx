// A labelled horizontal bar per row, all on one baseline (a "meter list").
// One series, so no legend: the title says what's plotted. The highlighted row
// uses the accent; the rest are grey, and the highlight is also named in text
// (`tag`), so it never relies on colour alone. Every value is printed, so the
// chart doubles as its own table view.
export default function BarList({ title, rows, max, formatValue, emptyText = "No data yet." }) {
  const top = max ?? Math.max(0, ...rows.map((r) => r.value ?? 0));

  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((row) => {
            const pct = row.value === null || top <= 0 ? 0 : Math.max(0, Math.min(100, (row.value / top) * 100));
            return (
              <li key={row.key} className="grid grid-cols-[5rem_1fr_7.5rem] items-center gap-3 text-sm">
                <span className="truncate text-muted-foreground">{row.label}</span>
                <span className="block h-3" title={row.value === null ? "Not available" : formatValue(row.value)}>
                  {row.value !== null && (
                    <span
                      className="block h-full rounded-r-[4px]"
                      style={{
                        width: `${pct}%`,
                        minWidth: row.value > 0 ? "2px" : 0,
                        background: row.highlight ? "var(--chart-2)" : "var(--chart-muted)",
                      }}
                    />
                  )}
                </span>
                <span className="whitespace-nowrap text-right font-mono text-xs tabular-nums text-foreground">
                  {row.value === null ? "—" : formatValue(row.value)}
                  {row.tag && <span className="ml-1.5 font-sans font-semibold">{row.tag}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
