/**
 * Logo.jsx — CivicFix brand logo component.
 *
 * Props:
 *   variant   "full" | "mark"   — full = mark + wordmark, mark = icon only
 *   size      number            — controls height in px (width scales proportionally)
 *   className string            — additional CSS classes
 *   reversed  boolean           — use white/reversed palette (for dark surfaces)
 *   mono      boolean           — render in currentColor (inherits CSS color)
 *
 * The SVG is rendered inline so `currentColor` and CSS variables work correctly.
 * No raster images, no hardcoded width/height attributes.
 */
export default function Logo({
  variant   = 'full',
  size      = 32,
  className = '',
  reversed  = false,
  mono      = false,
}) {
  // ── Colour palette ─────────────────────────────────────────────────────────
  // mono mode: everything uses currentColor so the parent's CSS color controls it
  const primary = mono ? 'currentColor' : reversed ? '#ffffff' : '#0B4F6C';
  const accent  = mono ? 'currentColor' : '#D97706';
  const dot     = mono ? 'white'        : reversed ? '#0B4F6C' : '#ffffff';
  const ring    = mono
    ? 'currentColor'
    : reversed
      ? 'rgba(255,255,255,0.30)'
      : 'rgba(255,255,255,0.30)';
  const ringOpacity = mono ? 0.25 : 1;

  // ── Wordmark colours ────────────────────────────────────────────────────────
  const wordCivic = mono ? 'currentColor' : reversed ? '#ffffff' : '#0B4F6C';
  const wordFix   = mono ? 'currentColor' : reversed ? '#D97706' : '#D97706';

  // ── Mark element (48×48 viewBox) ────────────────────────────────────────────
  const markHeight = size;
  const markWidth  = size; // square viewBox

  const Mark = (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ height: markHeight, width: markWidth, flexShrink: 0 }}
    >
      {/* Open community arc */}
      <path
        d="M 12.5 20 A 11.5 11.5 0 1 1 35.5 20"
        stroke={primary}
        strokeWidth="1.75"
        strokeLinecap="round"
        fill="none"
      />
      {/* Pin teardrop body */}
      <path
        d="M 17 20 A 7 7 0 0 1 31 20 C 31 26.5 24 34 24 34 C 24 34 17 26.5 17 20 Z"
        fill={primary}
      />
      {/* Inner crosshair dot */}
      <circle cx="24" cy="20" r="2.5" fill={dot} />
      {/* Inner ring accent */}
      <circle
        cx="24"
        cy="20"
        r="4.5"
        stroke={ring}
        strokeOpacity={ringOpacity}
        strokeWidth="1"
        fill="none"
      />
      {/* Community node dots on arc ends */}
      <circle cx="12.5" cy="20" r="2" fill={accent} />
      <circle cx="35.5" cy="20" r="2" fill={accent} />
    </svg>
  );

  if (variant === 'mark') {
    return (
      <span
        className={className}
        role="img"
        aria-label="CivicFix"
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        {Mark}
      </span>
    );
  }

  // ── Full variant: mark + wordmark ───────────────────────────────────────────
  const fontSize   = Math.round(size * 0.58);   // ~22px at size=38
  const letterGap  = Math.round(size * 0.19);   // gap between mark and text

  return (
    <span
      className={className}
      role="img"
      aria-label="CivicFix"
      style={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        letterGap,
        lineHeight: 1,
      }}
    >
      {Mark}
      <span
        aria-hidden="true"
        style={{
          fontFamily:    "'DM Sans', 'Inter', system-ui, sans-serif",
          fontWeight:    700,
          fontSize:      fontSize,
          letterSpacing: '-0.3px',
          lineHeight:    1,
          whiteSpace:    'nowrap',
        }}
      >
        <span style={{ color: wordCivic }}>Civic</span>
        <span style={{ color: wordFix }}>Fix</span>
      </span>
    </span>
  );
}
