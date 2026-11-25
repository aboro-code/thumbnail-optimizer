// Original inline SVG art for the "darkroom light table" look (D-48).
// Decorative only: every piece is aria-hidden and the pages say the same
// thing in text.

// The mark: a loupe resting over a single film frame.
export function BrandMark({ size = 28 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="2" y="7" width="20" height="15" rx="1.5" fill="var(--film)" />
      <rect x="5" y="10" width="14" height="9" rx="0.5" fill="var(--amber)" opacity="0.9" />
      <circle cx="21" cy="17" r="7.5" fill="var(--film)" fillOpacity="0.55" stroke="var(--primary)" strokeWidth="2.5" />
      <circle cx="18.6" cy="14.6" r="2" fill="#fff" fillOpacity="0.35" />
      <path d="M26.3 22.3l3.4 3.4" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark />
      <span className="text-base font-extrabold [font-stretch:118%]">Thumbnail Optimizer</span>
    </span>
  );
}

// Six candidate frames on a contact sheet. Each frame is a tiny abstract
// "thumbnail": a face shape, bold text bars, a split layout.
function ContactFrame({ x, y, variant }) {
  const w = 74;
  const h = 42;
  const art = {
    face: (
      <>
        <rect x={x} y={y} width={w} height={h} fill="#2e5c8a" />
        <circle cx={x + 52} cy={y + 18} r="9" fill="#f2c9a1" />
        <rect x={x + 40} y={y + 28} width="24" height="14" rx="6" fill="#f2c9a1" />
        <rect x={x + 6} y={y + 8} width="26" height="7" fill="#fbf3e8" />
        <rect x={x + 6} y={y + 18} width="18" height="7" fill="#fbf3e8" />
      </>
    ),
    bold: (
      <>
        <rect x={x} y={y} width={w} height={h} fill="#d8452f" />
        <rect x={x + 8} y={y + 10} width="44" height="10" fill="#fbf3e8" />
        <rect x={x + 8} y={y + 24} width="30" height="8" fill="#17110f" />
      </>
    ),
    split: (
      <>
        <rect x={x} y={y} width={w / 2} height={h} fill="#1d6b5a" />
        <rect x={x + w / 2} y={y} width={w / 2} height={h} fill="#e9a23b" />
        <circle cx={x + 18} cy={y + 21} r="10" fill="#f2c9a1" />
        <path d={`M${x + 44} ${y + 30} l10 -16 l10 16 z`} fill="#17110f" />
      </>
    ),
    dim: (
      <>
        <rect x={x} y={y} width={w} height={h} fill="#5b5049" />
        <rect x={x + 10} y={y + 15} width="54" height="12" fill="#7a6d64" />
      </>
    ),
    busy: (
      <>
        <rect x={x} y={y} width={w} height={h} fill="#6d4a8c" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={x + 4 + i * 14} y={y + 6 + (i % 2) * 14} width="11" height="11" fill="#c9b6e8" />
        ))}
      </>
    ),
    sky: (
      <>
        <rect x={x} y={y} width={w} height={h} fill="#3c86b8" />
        <circle cx={x + 56} cy={y + 12} r="6" fill="#ffd36b" />
        <path d={`M${x} ${y + h} l24 -20 l18 14 l14 -10 l18 16 z`} fill="#24485f" />
      </>
    ),
  }[variant];
  return <g>{art}</g>;
}

// The login / sign-up hero: a contact sheet on a glowing light table, a red
// safelight glow in the corner and a loupe over the strongest frame.
export function LightTableArt({ className = "" }) {
  const frames = [
    { x: 46, y: 70, v: "dim" },
    { x: 130, y: 70, v: "face" },
    { x: 214, y: 70, v: "busy" },
    { x: 46, y: 150, v: "sky" },
    { x: 130, y: 150, v: "bold" },
    { x: 214, y: 150, v: "split" },
  ];
  return (
    <svg aria-hidden="true" viewBox="0 0 340 270" className={className} role="presentation">
      <defs>
        <radialGradient id="lt-glow" cx="50%" cy="45%" r="65%">
          <stop offset="0" stopColor="#fff6e2" />
          <stop offset="0.7" stopColor="#f0dcb6" />
          <stop offset="1" stopColor="#c9ad83" />
        </radialGradient>
        <radialGradient id="lt-safelight" cx="100%" cy="0%" r="70%">
          <stop offset="0" stopColor="#ef5a44" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ef5a44" stopOpacity="0" />
        </radialGradient>
        <clipPath id="lt-lens">
          <circle cx="167" cy="171" r="33" />
        </clipPath>
      </defs>

      {/* the table */}
      <rect x="14" y="30" width="312" height="226" rx="10" fill="url(#lt-glow)" />
      <rect x="14" y="30" width="312" height="226" rx="10" fill="url(#lt-safelight)" />

      {/* contact sheet: two strips of film */}
      {[60, 140].map((y) => (
        <g key={y}>
          <rect x="34" y={y} width="266" height="62" rx="2" fill="#0f0b0a" />
          {Array.from({ length: 22 }, (_, i) => (
            <g key={i}>
              <rect x={38 + i * 12} y={y + 3} width="6" height="4" rx="1" fill="#f1e7da" opacity="0.75" />
              <rect x={38 + i * 12} y={y + 55} width="6" height="4" rx="1" fill="#f1e7da" opacity="0.75" />
            </g>
          ))}
        </g>
      ))}
      {frames.map((f) => (
        <ContactFrame key={`${f.x}-${f.y}`} x={f.x} y={f.y} variant={f.v} />
      ))}
      {/* frame numbers printed on the film edge */}
      {["7", "8", "9"].map((n, i) => (
        <text key={n} x={83 + i * 84} y="132" fill="#e9a23b" fontSize="7" fontWeight="700" textAnchor="middle">
          {n}
        </text>
      ))}

      {/* the loupe, magnifying the pick (frame 11) */}
      <g clipPath="url(#lt-lens)">
        <g transform="translate(167 171) scale(1.6) translate(-167 -171)">
          <ContactFrame x={130} y={150} variant="bold" />
        </g>
      </g>
      <circle cx="167" cy="171" r="33" fill="none" stroke="#d9cbb8" strokeWidth="6" />
      <circle cx="167" cy="171" r="37" fill="none" stroke="#0f0b0a" strokeWidth="2" opacity="0.7" />
      <path d="M151 155 a22 22 0 0 1 18 -5" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.6" fill="none" />

      {/* grease-pencil circle around the pick */}
      <ellipse cx="167" cy="171" rx="58" ry="46" fill="none" stroke="#ef5a44" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="300 34" transform="rotate(-8 167 171)" />
    </svg>
  );
}

// An empty strip of film, for "nothing here yet" states.
export function EmptyFilmArt({ className = "" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 260 70" className={className}>
      <rect x="0" y="0" width="260" height="70" rx="3" fill="var(--film)" />
      {Array.from({ length: 21 }, (_, i) => (
        <g key={i}>
          <rect x={6 + i * 12} y="4" width="6" height="5" rx="1" fill="#f1e7da" opacity="0.7" />
          <rect x={6 + i * 12} y="61" width="6" height="5" rx="1" fill="#f1e7da" opacity="0.7" />
        </g>
      ))}
      {[10, 94, 178].map((x) => (
        <rect key={x} x={x} y="14" width="72" height="42" fill="none" stroke="#f1e7da" strokeOpacity="0.35" strokeDasharray="4 4" />
      ))}
      <path d="M210 35 h12 M216 29 v12" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
