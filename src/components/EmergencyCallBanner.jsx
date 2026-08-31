/**
 * EmergencyCallBanner.jsx
 *
 * Full-width, impossible-to-miss banner that is always the FIRST element
 * rendered on the ReportEmergency page — above every form field.
 *
 * Props:
 *   phoneNumber {string|null} — E.164 or local dial string for the tel: link.
 *     - If supplied, renders a clickable tel: anchor on mobile and a formatted
 *       number for desktop users.
 *     - If null/undefined, renders a generic "dial your local emergency number"
 *       message (Prompt 5's country-detection will fill this in later).
 *
 * Design intent: this must be unmissable even on a small screen, so it uses
 * a solid red background, large bold text, and a pulsing ring animation on
 * the call button.  It is NOT dismissable — a user must see it before seeing
 * any form field.
 */

import { useEffect, useRef } from 'react';

export default function EmergencyCallBanner({ phoneNumber = null }) {
  const pulseRef = useRef(null);

  // Pulse animation via CSS keyframes injected once per mount
  useEffect(() => {
    const styleId = 'ecb-pulse-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes ecb-ring {
          0%   { box-shadow: 0 0 0 0   rgba(255,255,255,0.7); }
          70%  { box-shadow: 0 0 0 14px rgba(255,255,255,0);   }
          100% { box-shadow: 0 0 0 0   rgba(255,255,255,0);   }
        }
        .ecb-call-btn {
          animation: ecb-ring 1.6s ease-out infinite;
        }
        .ecb-call-btn:hover {
          transform: scale(1.04);
          box-shadow: 0 0 0 0 rgba(255,255,255,0.7);
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      style={{
        /* Full-width red banner — must be impossible to miss */
        background:   'linear-gradient(135deg, #b91c1c 0%, #dc2626 60%, #ef4444 100%)',
        color:        '#fff',
        borderRadius: 'var(--cf-radius-lg)',
        padding:      'clamp(1.25rem, 4vw, 2rem) clamp(1rem, 4vw, 2rem)',
        marginBottom: '1.5rem',
        boxShadow:    '0 4px 24px rgba(185,28,28,0.35)',
        display:      'flex',
        flexDirection: 'column',
        gap:          '1rem',
      }}
    >
      {/* Top row — siren icon + headline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', lineHeight: 1 }}>🚨</span>
        <div>
          <p style={{
            margin: 0,
            fontFamily:  'var(--cf-font-heading)',
            fontWeight:  800,
            fontSize:    'clamp(1.1rem, 3vw, 1.45rem)',
            lineHeight:  1.2,
            letterSpacing: '-0.02em',
          }}>
            In immediate danger? Call emergency services NOW.
          </p>
          <p style={{
            margin: '0.35rem 0 0',
            fontSize: 'clamp(0.82rem, 2vw, 0.95rem)',
            opacity: 0.9,
          }}>
            This online form is NOT a substitute for calling 112 / 999 / 911 or your local emergency number.
          </p>
        </div>
      </div>

      {/* Call button row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {phoneNumber ? (
          /* Rendered as an <a> so it activates the phone dialler on mobile */
          <a
            id="ecb-call-link"
            href={`tel:${phoneNumber}`}
            className="ecb-call-btn"
            style={{
              display:        'inline-flex',
              alignItems:     'center',
              gap:            '0.5rem',
              padding:        '0.7rem 1.5rem',
              background:     '#fff',
              color:          '#b91c1c',
              fontWeight:     800,
              fontSize:       '1.05rem',
              borderRadius:   '999px',
              textDecoration: 'none',
              flexShrink:     0,
              transition:     'transform 150ms',
            }}
          >
            <i className="bi bi-telephone-fill" style={{ fontSize: '1.1rem' }} />
            Call {phoneNumber}
          </a>
        ) : (
          /* No number yet — generic prompt */
          <div
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          '0.5rem',
              padding:      '0.7rem 1.5rem',
              background:   'rgba(255,255,255,0.18)',
              borderRadius: '999px',
              fontWeight:   700,
              fontSize:     '1rem',
              flexShrink:   0,
            }}
          >
            <i className="bi bi-telephone-fill" style={{ fontSize: '1.1rem' }} />
            Dial your local emergency number now
          </div>
        )}

        <span style={{
          fontSize: '0.82rem',
          opacity:  0.85,
          lineHeight: 1.4,
          maxWidth:   360,
        }}>
          Only continue to this form <em>after</em> you have called or determined that calling
          is not applicable to your situation.
        </span>
      </div>
    </div>
  );
}
