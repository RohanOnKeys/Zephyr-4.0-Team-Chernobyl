/* Original hand-authored macOS-style app icons.
   All artwork here is drawn from scratch with SVG primitives and gradients -
   no third-party logo files, no remote images. We only borrow the visual
   *language* of modern desktop icons: squircle tile, vertical gradient,
   1px inner top highlight, crisp centred glyph.

   Gradient ids are namespaced per icon (mi-<id>-<slot>) because every icon is
   inlined into the same document; duplicate defs ids across inlined SVGs
   resolve to whichever node parsed first and silently paint the wrong fill. */

const VB = "0 0 48 48";

/* Squircle-ish tile + top highlight shared by every icon. `grad` is the id of
   the caller's vertical body gradient. */
function Tile({ grad }) {
  return (
    <>
      <rect x="2" y="2" width="44" height="44" rx="11" fill={`url(#${grad})`} />
      {/* inner top highlight: a 1px inset stroke faded out before the bottom */}
      <path
        d="M4.5 13.5A9 9 0 0 1 13.5 4.5h21a9 9 0 0 1 9 9"
        fill="none"
        stroke="rgba(255,255,255,.55)"
        strokeWidth="1"
      />
    </>
  );
}

function Browser() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mi-browser-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc6f5" />
          <stop offset="1" stopColor="#1d6fc4" />
        </linearGradient>
        <radialGradient id="mi-browser-b" cx="0.5" cy="0.38" r="0.62">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfe6f8" />
        </radialGradient>
      </defs>
      <Tile grad="mi-browser-a" />
      <circle cx="24" cy="24" r="16" fill="url(#mi-browser-b)" />
      <circle cx="24" cy="24" r="16" fill="none" stroke="rgba(10,60,110,.22)" />
      {/* tick marks around the dial */}
      <g stroke="#5d7f9c" strokeWidth="1.1" strokeLinecap="round">
        <path d="M24 9.5v2.6M24 35.9v2.6M9.5 24h2.6M35.9 24h2.6" />
        <path d="M13.8 13.8l1.9 1.9M32.3 32.3l1.9 1.9M34.2 13.8l-1.9 1.9M15.7 32.3l-1.9 1.9" strokeWidth=".8" />
      </g>
      {/* needle at ~45deg: red half points NE, white half SW */}
      <path d="M33 15L22.2 22.2 15 33l10.8-7.2z" fill="#ec3b3b" />
      <path d="M15 33l10.8-7.2L33 15l-10.8 7.2z" fill="#f6fbff" stroke="rgba(20,60,100,.2)" strokeWidth=".5" />
      <circle cx="24" cy="24" r="1.5" fill="#2a4a64" />
    </svg>
  );
}

function Spotify() {
  /* Generic "music" glyph: an abstract equaliser waveform. Deliberately NOT
     any existing brand mark - just bars of varying height on a green tile. */
  const bars = [
    [13, 9], [17.5, 15], [22, 23], [26.5, 17], [31, 11], [35.5, 6],
  ];
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mi-spotify-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3ce87c" />
          <stop offset="1" stopColor="#11a34c" />
        </linearGradient>
      </defs>
      <Tile grad="mi-spotify-a" />
      <g fill="#ffffff">
        {bars.map(([x, h]) => (
          <rect key={x} x={x} y={24 - h / 2} width="3.2" height={h} rx="1.6" />
        ))}
      </g>
    </svg>
  );
}

function Calendar({ day }) {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mi-calendar-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e4e6ea" />
        </linearGradient>
        <linearGradient id="mi-calendar-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3574f" />
          <stop offset="1" stopColor="#d8332d" />
        </linearGradient>
        {/* clip keeps the header band inside the tile's rounded top corners */}
        <clipPath id="mi-calendar-clip">
          <rect x="2" y="2" width="44" height="44" rx="11" />
        </clipPath>
      </defs>
      <Tile grad="mi-calendar-a" />
      <g clipPath="url(#mi-calendar-clip)">
        <rect x="2" y="2" width="44" height="10" fill="url(#mi-calendar-b)" />
      </g>
      <text
        x="24"
        y="36.5"
        textAnchor="middle"
        fill="#26292e"
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        fontSize="21"
        fontWeight="500"
        letterSpacing="-1"
      >
        {day}
      </text>
    </svg>
  );
}

function Cards() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mi-cards-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a47bf5" />
          <stop offset="1" stopColor="#4a40d8" />
        </linearGradient>
      </defs>
      <Tile grad="mi-cards-a" />
      {/* back card offset up-right, front card overlapping it */}
      <rect x="18" y="11" width="20" height="24" rx="3.5" fill="rgba(255,255,255,.45)" transform="rotate(8 28 23)" />
      <rect x="11" y="14" width="20" height="24" rx="3.5" fill="#ffffff" />
      <g stroke="#6b62e0" strokeWidth="2" strokeLinecap="round">
        <path d="M15.5 21h11M15.5 26h8M15.5 31h5.5" />
      </g>
    </svg>
  );
}

function Trackers() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mi-trackers-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34e0a1" />
          <stop offset="1" stopColor="#04875c" />
        </linearGradient>
      </defs>
      <Tile grad="mi-trackers-a" />
      <g fill="rgba(255,255,255,.92)">
        <rect x="11" y="28" width="5" height="9" rx="1.6" />
        <rect x="18.5" y="23" width="5" height="14" rx="1.6" />
        <rect x="26" y="18" width="5" height="19" rx="1.6" />
        <rect x="33.5" y="12" width="5" height="25" rx="1.6" />
      </g>
      <path d="M12 26l7-5 7.5-5 9-5.5" fill="none" stroke="#0a3f2f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
      <circle cx="35.5" cy="10.5" r="2.2" fill="#ffffff" stroke="#0a3f2f" strokeWidth="1" />
    </svg>
  );
}

function Notes() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mi-notes-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf4" />
          <stop offset="1" stopColor="#f2ebd7" />
        </linearGradient>
        <linearGradient id="mi-notes-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe06a" />
          <stop offset="1" stopColor="#f0bf2c" />
        </linearGradient>
        <clipPath id="mi-notes-clip">
          <rect x="2" y="2" width="44" height="44" rx="11" />
        </clipPath>
      </defs>
      <Tile grad="mi-notes-a" />
      <g clipPath="url(#mi-notes-clip)">
        <rect x="2" y="2" width="44" height="12" fill="url(#mi-notes-b)" />
        {/* faint ruled lines, shortened on the last row like a trailing sentence */}
        <g stroke="rgba(120,110,86,.3)" strokeWidth="1.4" strokeLinecap="round">
          <path d="M10 20h28M10 26h28M10 32h28M10 38h17" />
        </g>
      </g>
    </svg>
  );
}

function Files() {
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mi-files-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9ed8fb" />
          <stop offset="1" stopColor="#5fb0e6" />
        </linearGradient>
        <linearGradient id="mi-files-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f93d6" />
          <stop offset="1" stopColor="#2b65ab" />
        </linearGradient>
        <clipPath id="mi-files-clip">
          <rect x="2" y="2" width="44" height="44" rx="11" />
        </clipPath>
      </defs>
      <Tile grad="mi-files-a" />
      {/* two-tone split: darker left half, lighter right half */}
      <g clipPath="url(#mi-files-clip)">
        <rect x="2" y="2" width="22" height="44" fill="url(#mi-files-b)" />
      </g>
      {/* simple stylised face straddling the split */}
      <g stroke="#f4fbff" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M17 18v5M31 18v5" />
        <path d="M17.5 30c2.2 2.6 4.4 3.9 6.5 3.9s4.3-1.3 6.5-3.9" />
      </g>
      <path d="M24 4.5v39" stroke="rgba(255,255,255,.35)" strokeWidth="1" />
    </svg>
  );
}

function Settings() {
  /* 8-tooth gear built procedurally so the teeth stay evenly spaced. */
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg viewBox={VB} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mi-settings-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8e9aa8" />
          <stop offset="1" stopColor="#3b4552" />
        </linearGradient>
      </defs>
      <Tile grad="mi-settings-a" />
      <g fill="#eef2f7">
        {teeth.map((a) => (
          <rect key={a} x="22.2" y="7.5" width="3.6" height="7" rx="1.2" transform={`rotate(${a} 24 24)`} />
        ))}
        <circle cx="24" cy="24" r="12" />
      </g>
      <circle cx="24" cy="24" r="8.6" fill="url(#mi-settings-a)" />
      <circle cx="24" cy="24" r="4" fill="#eef2f7" />
    </svg>
  );
}

export default function MacAppIcon({ app }) {
  const glyph = {
    browser: <Browser />,
    spotify: <Spotify />,
    /* live day number, so the Calendar tile behaves like the real desktop */
    calendar: <Calendar day={new Date().getDate()} />,
    cards: <Cards />,
    trackers: <Trackers />,
    notes: <Notes />,
    files: <Files />,
    settings: <Settings />,
  }[app.id];

  return (
    <span className={`mac-app-icon icon-${app.id}`} aria-hidden="true" title={app.label}>
      {glyph}
    </span>
  );
}
