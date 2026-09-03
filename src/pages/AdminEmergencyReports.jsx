/**
 * AdminEmergencyReports.jsx
 *
 * Admin-only triage dashboard for EmergencyReport documents.
 * Deliberately NOT a data table — this is an urgency-first view.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  🚨 URGENT — Unacknowledged (N)                         │
 *   │  [Large card per 'New' report, sorted newest first]     │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  Other Reports  (Acknowledged / Escalated / Resolved /  │
 *   │                  False Alarm)                           │
 *   │  [Compact list rows]                                    │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Each 'New' card shows:
 *   - Type (bold, red)
 *   - Age since submission — reports > 10 min old with no acknowledgment
 *     show a red "⚠ X min old — not yet acknowledged" warning badge
 *   - Description
 *   - Location (address + lat/lng)
 *   - Reporter name + email
 *   - Media (image thumbnail or video player)
 *   - [Acknowledge] button (primary action, most prominent)
 *   - [Status] dropdown → Escalated / Resolved / False Alarm
 *
 * Auto-refresh every 60 seconds so admins on the page see new reports
 * without manual reload.
 *
 * API endpoints used:
 *   GET  /api/emergency-reports           → getAllEmergencyReports (admin only)
 *   PUT  /api/emergency-reports/:id/acknowledge → acknowledge
 *   PUT  /api/emergency-reports/:id/status     → update status
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout from '../components/DashboardLayout';

// ── Constants ─────────────────────────────────────────────────────────────────
const STALE_MINUTES = 10; // reports older than this (if still New) get a warning
const REFRESH_MS    = 60_000; // auto-refresh interval

const VALID_STATUSES = ['Acknowledged', 'Escalated', 'Resolved', 'False Alarm'];

// Ordinal sort for the "other" section (non-New)
const STATUS_ORDER = { Acknowledged: 0, Escalated: 1, Resolved: 2, 'False Alarm': 3 };

// ── Helpers ───────────────────────────────────────────────────────────────────
function minutesAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
}

function formatAge(dateStr) {
  const m = minutesAgo(dateStr);
  if (m < 1)    return 'just now';
  if (m < 60)   return `${m} min ago`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m ago` : `${h}h ago`;
}

// ── Subcomponent: operational stats strip ────────────────────────────────────
// Deliberately plain and factual — this is a monitoring readout, not an
// analytics dashboard. No chart colors, no animations (except the stale-count
// warning accent which should catch the admin's eye for operational reasons).
function StatsStrip({ stats, loading }) {
  if (loading && !stats) {
    return (
      <div style={{
        display:       'flex',
        alignItems:    'center',
        gap:           '0.5rem',
        padding:       '0.65rem 1rem',
        background:    'var(--cf-surface)',
        border:        '1px solid var(--cf-border-light)',
        borderRadius:  'var(--cf-radius-md)',
        marginBottom:  '1.25rem',
        color:         'var(--cf-text-muted)',
        fontSize:      '0.82rem',
      }}>
        <span className="spinner-border spinner-border-sm" style={{ width: 13, height: 13, borderWidth: 2 }} />
        Loading stats…
      </div>
    );
  }
  if (!stats) return null;

  const { avgAckMinutes, staleNewCount, byType } = stats;
  const isStale = staleNewCount > 0;

  // Card shared style
  const cardBase = {
    flex:          '1 1 160px',
    padding:       '0.75rem 1rem',
    borderRadius:  'var(--cf-radius-md)',
    background:    'var(--cf-surface)',
    border:        '1px solid var(--cf-border-light)',
    minWidth:      0,
  };

  return (
    <div
      style={{
        display:       'flex',
        gap:           '0.75rem',
        flexWrap:      'wrap',
        marginBottom:  '1.25rem',
      }}
      aria-label="Emergency reports operational stats"
    >
      {/* Card 1 — avg acknowledgment time */}
      <div style={cardBase}>
        <p style={{
          margin:      '0 0 0.25rem',
          fontSize:    '0.68rem',
          fontWeight:  700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color:       'var(--cf-text-secondary)',
        }}>
          <i className="bi bi-clock-history me-1" />
          Avg. Ack. Time
        </p>
        <p style={{
          margin:    0,
          fontSize:  '1.45rem',
          fontWeight: 800,
          lineHeight: 1.1,
          color:     'var(--cf-text)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {avgAckMinutes === null ? '—' : `${avgAckMinutes}`}
          {avgAckMinutes !== null && (
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--cf-text-muted)', marginLeft: '0.3rem' }}>min</span>
          )}
        </p>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: 'var(--cf-text-muted)' }}>
          {avgAckMinutes === null ? 'No acknowledged reports yet' : 'across all acknowledged reports'}
        </p>
      </div>

      {/* Card 2 — stale unacknowledged count (warning accent when > 0) */}
      <div style={{
        ...cardBase,
        background: isStale ? '#fff5f5'                    : 'var(--cf-surface)',
        border:     isStale ? '1.5px solid #fca5a5'        : '1px solid var(--cf-border-light)',
      }}>
        <p style={{
          margin:      '0 0 0.25rem',
          fontSize:    '0.68rem',
          fontWeight:  700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color:       isStale ? '#b91c1c' : 'var(--cf-text-secondary)',
        }}>
          <i className={`bi ${isStale ? 'bi-exclamation-triangle-fill' : 'bi-hourglass-split'} me-1`} />
          Stale &amp; Unacked (&gt;{STALE_MINUTES} min)
        </p>
        <p style={{
          margin:     0,
          fontSize:   '1.45rem',
          fontWeight: 800,
          lineHeight: 1.1,
          color:      isStale ? '#b91c1c' : 'var(--cf-text)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {staleNewCount}
        </p>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: isStale ? '#dc2626' : 'var(--cf-text-muted)' }}>
          {isStale ? 'Needs attention' : 'All within threshold'}
        </p>
      </div>

      {/* Card 3 — type breakdown */}
      <div style={{ ...cardBase, flex: '2 1 260px' }}>
        <p style={{
          margin:      '0 0 0.35rem',
          fontSize:    '0.68rem',
          fontWeight:  700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color:       'var(--cf-text-secondary)',
        }}>
          <i className="bi bi-bar-chart-steps me-1" />
          By Type (all time)
        </p>
        {byType.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--cf-text-muted)' }}>No reports yet</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {byType.slice(0, 6).map(({ type, count }) => (
              <li
                key={type}
                style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        '0.5rem',
                  fontSize:   '0.78rem',
                }}
              >
                <span style={{
                  minWidth:   22,
                  textAlign:  'right',
                  fontWeight: 700,
                  color:      'var(--cf-text)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                }}>
                  {count}
                </span>
                <span style={{
                  color:        'var(--cf-text-secondary)',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}>
                  {type}
                </span>
              </li>
            ))}
            {byType.length > 6 && (
              <li style={{ fontSize: '0.68rem', color: 'var(--cf-text-muted)', marginTop: '0.1rem' }}>
                +{byType.length - 6} more type{byType.length - 6 !== 1 ? 's' : ''}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Subcomponent: media attachment (image or video) ───────────────────────────
function MediaAttachment({ item, idx }) {
  const [expanded, setExpanded] = useState(false);

  if (item.type === 'image') {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <img
          src={item.url}
          alt={`Evidence ${idx + 1}`}
          onClick={() => setExpanded(!expanded)}
          style={{
            width:        expanded ? '100%' : 96,
            height:       expanded ? 'auto' : 72,
            objectFit:    'cover',
            borderRadius: 6,
            cursor:       'pointer',
            border:       '1.5px solid var(--cf-border)',
            transition:   'width 200ms, height 200ms',
          }}
          title="Click to expand"
        />
      </div>
    );
  }

  return (
    <video
      src={item.url}
      controls
      style={{
        width:        '100%',
        maxWidth:     320,
        borderRadius: 6,
        border:       '1.5px solid var(--cf-border)',
        display:      'block',
        marginTop:    '0.35rem',
      }}
    />
  );
}

// ── Subcomponent: prominent card for a 'New' unacknowledged report ────────────
function NewReportCard({ report, onAcknowledge, onStatusChange, actionLoading, hasLive }) {
  const age   = minutesAgo(report.createdAt);
  const stale = age >= STALE_MINUTES;

  return (
    <div
      style={{
        background:   stale ? '#fff5f5' : '#fff',
        border:       `2px solid ${stale ? '#ef4444' : '#dc2626'}`,
        borderRadius: 'var(--cf-radius-lg)',
        padding:      '1.25rem 1.5rem',
        marginBottom: '1rem',
        boxShadow:    stale
          ? '0 0 0 4px rgba(239,68,68,0.12), 0 4px 16px rgba(185,28,28,0.12)'
          : '0 2px 10px rgba(185,28,28,0.10)',
        position: 'relative',
        transition: 'box-shadow 300ms',
      }}
    >
      {/* ── Top row: type + age ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
        {/* Type badge */}
        <div style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          '0.4rem',
          background:   '#b91c1c',
          color:        '#fff',
          padding:      '0.3rem 0.85rem',
          borderRadius: '999px',
          fontWeight:   800,
          fontSize:     '0.9rem',
          flexShrink:   0,
        }}>
          <i className="bi bi-exclamation-triangle-fill" />
          {report.type}
        </div>

        {/* LIVE badge — only when an active LiveLocationSession is linked */}
        {hasLive && (
          <span style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '0.3rem',
            padding:      '0.25rem 0.65rem',
            background:   '#dc2626',
            color:        '#fff',
            borderRadius: '999px',
            fontWeight:   800,
            fontSize:     '0.75rem',
            letterSpacing:'0.06em',
            textTransform:'uppercase',
            flexShrink:   0,
            animation:    'er-live-badge 1.8s ease-in-out infinite',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', flexShrink: 0 }} />
            LIVE
          </span>
        )}

        {/* Age indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {stale ? (
            /* Stale warning — cannot be missed */
            <span style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          '0.35rem',
              background:   '#fef2f2',
              color:        '#b91c1c',
              border:       '1.5px solid #fecaca',
              borderRadius: '999px',
              padding:      '0.25rem 0.75rem',
              fontWeight:   800,
              fontSize:     '0.82rem',
              animation:    'er-pulse-border 2s ease-in-out infinite',
            }}>
              <i className="bi bi-clock-history" />
              ⚠ {age} min old — not yet acknowledged
            </span>
          ) : (
            <span style={{
              fontSize: '0.8rem',
              color:    'var(--cf-text-muted)',
              display:  'inline-flex', alignItems: 'center', gap: '0.3rem',
            }}>
              <i className="bi bi-clock" />
              {formatAge(report.createdAt)}
            </span>
          )}

          {/* Report ID */}
          <span style={{ fontSize: '0.73rem', color: 'var(--cf-text-muted)', fontFamily: 'monospace' }}>
            #{String(report._id).slice(-8).toUpperCase()}
          </span>
        </div>
      </div>

      {/* ── Body grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.75rem 1.5rem' }}>

        {/* Description */}
        <div style={{ gridColumn: '1 / -1' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--cf-text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {report.description}
          </p>
        </div>

        {/* Location */}
        <div>
          <p style={{ margin: '0 0 0.2rem', fontSize: '0.73rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <i className="bi bi-geo-alt-fill me-1" style={{ color: '#dc2626' }} />Location
          </p>
          <p style={{ margin: '0 0 0.15rem', fontSize: '0.84rem', color: 'var(--cf-text)', wordBreak: 'break-word' }}>
            {report.location?.address}
          </p>
          {report.location?.latitude && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--cf-text-muted)', fontFamily: 'monospace' }}>
              {report.location.latitude.toFixed(6)}, {report.location.longitude.toFixed(6)}
            </p>
          )}
          {report.location?.latitude && (
            <a
              href={`https://www.google.com/maps?q=${report.location.latitude},${report.location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.76rem', color: 'var(--cf-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem' }}
            >
              <i className="bi bi-map" /> Open in Maps
            </a>
          )}
        </div>

        {/* Reporter */}
        <div>
          <p style={{ margin: '0 0 0.2rem', fontSize: '0.73rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <i className="bi bi-person-fill me-1" style={{ color: '#dc2626' }} />Reporter
          </p>
          <p style={{ margin: '0 0 0.1rem', fontSize: '0.84rem', fontWeight: 600, color: 'var(--cf-text)' }}>
            {report.reporter?.name ?? '—'}
          </p>
          {report.reporter?.email && (
            <a href={`mailto:${report.reporter.email}`}
              style={{ fontSize: '0.78rem', color: 'var(--cf-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <i className="bi bi-envelope" />
              {report.reporter.email}
            </a>
          )}
        </div>

        {/* Media */}
        {report.media?.length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.73rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <i className="bi bi-camera-video me-1" style={{ color: '#dc2626' }} />Evidence ({report.media.length} file{report.media.length !== 1 ? 's' : ''})
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-start' }}>
              {report.media.map((item, idx) => (
                <MediaAttachment key={idx} item={item} idx={idx} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Action row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.1rem', flexWrap: 'wrap' }}>

        {/* Acknowledge — most prominent action on a New report */}
        <button
          id={`er-ack-${report._id}`}
          onClick={() => onAcknowledge(report._id)}
          disabled={actionLoading === report._id}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '0.45rem',
            padding:      '0.6rem 1.35rem',
            background:   '#b91c1c',
            color:        '#fff',
            border:       'none',
            borderRadius: 'var(--cf-radius-md)',
            fontWeight:   700,
            fontSize:     '0.9rem',
            cursor:       actionLoading === report._id ? 'not-allowed' : 'pointer',
            opacity:      actionLoading === report._id ? 0.65 : 1,
            transition:   'background 150ms, transform 100ms',
          }}
          onMouseEnter={(e) => { if (actionLoading !== report._id) e.currentTarget.style.background = '#991b1b'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#b91c1c'; }}
        >
          {actionLoading === report._id
            ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            : <i className="bi bi-check2-circle" />
          }
          Acknowledge
        </button>

        {/* Status dropdown → skip 'New' and 'Acknowledged' (that's what the btn does) */}
        <select
          id={`er-status-${report._id}`}
          defaultValue=""
          disabled={actionLoading === report._id}
          onChange={(e) => {
            if (e.target.value) onStatusChange(report._id, e.target.value);
            e.target.value = ''; // reset so it stays a prompt
          }}
          style={{
            padding:      '0.55rem 0.85rem',
            border:       '1.5px solid var(--cf-border)',
            borderRadius: 'var(--cf-radius-md)',
            background:   'var(--cf-surface)',
            color:        'var(--cf-text)',
            fontSize:     '0.86rem',
            cursor:       'pointer',
            minWidth:     150,
          }}
        >
          <option value="">Set status…</option>
          <option value="Acknowledged">Acknowledged</option>
          <option value="Escalated">Escalated</option>
          <option value="Resolved">Resolved</option>
          <option value="False Alarm">False Alarm</option>
        </select>

        {/* View Details — always visible regardless of status */}
        <Link
          to={`/admin/emergency-reports/${report._id}`}
          style={{
            marginLeft:   'auto',
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '0.35rem',
            padding:      '0.5rem 0.95rem',
            border:       '1.5px solid var(--cf-border)',
            borderRadius: 'var(--cf-radius-md)',
            background:   'var(--cf-surface)',
            color:        'var(--cf-text-secondary)',
            fontSize:     '0.82rem',
            fontWeight:   600,
            textDecoration: 'none',
            transition:   'border-color 150ms, color 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#b91c1c'; e.currentTarget.style.color = '#b91c1c'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--cf-border)'; e.currentTarget.style.color = 'var(--cf-text-secondary)'; }}
        >
          <i className="bi bi-eye" /> View Details
        </Link>
      </div>
    </div>
  );
}

// ── Subcomponent: compact row for non-New reports ─────────────────────────────
function OtherReportRow({ report, onStatusChange, actionLoading, hasLive }) {
  const STATUS_COLORS = {
    Acknowledged: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
    Escalated:    { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' },
    Resolved:     { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
    'False Alarm':{ bg: '#f8fafc', border: '#cbd5e1', text: '#475569' },
  };
  const col = STATUS_COLORS[report.status] ?? STATUS_COLORS['False Alarm'];

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            '0.75rem',
      padding:        '0.7rem 1rem',
      borderRadius:   'var(--cf-radius-md)',
      border:         '1px solid var(--cf-border-light)',
      background:     'var(--cf-surface)',
      marginBottom:   '0.45rem',
      flexWrap:       'wrap',
    }}>
      {/* Status chip */}
      <span style={{
        display:      'inline-flex',
        alignItems:   'center',
        gap:          '0.3rem',
        padding:      '0.2rem 0.6rem',
        background:   col.bg,
        border:       `1px solid ${col.border}`,
        borderRadius: '999px',
        color:        col.text,
        fontSize:     '0.73rem',
        fontWeight:   700,
        flexShrink:   0,
        whiteSpace:   'nowrap',
      }}>
        {report.status}
      </span>

      {/* LIVE badge for non-New rows */}
      {hasLive && (
        <span style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          '0.3rem',
          padding:      '0.15rem 0.55rem',
          background:   '#dc2626',
          color:        '#fff',
          borderRadius: '999px',
          fontWeight:   800,
          fontSize:     '0.68rem',
          letterSpacing:'0.06em',
          textTransform:'uppercase',
          flexShrink:   0,
          animation:    'er-live-badge 1.8s ease-in-out infinite',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', flexShrink: 0 }} />
          LIVE
        </span>
      )}

      {/* Type */}
      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--cf-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {report.type}
      </span>

      {/* Reporter */}
      <span style={{ fontSize: '0.78rem', color: 'var(--cf-text-secondary)', flexShrink: 0 }}>
        <i className="bi bi-person me-1" />{report.reporter?.name ?? '—'}
      </span>

      {/* Age */}
      <span style={{ fontSize: '0.73rem', color: 'var(--cf-text-muted)', flexShrink: 0 }}>
        {formatAge(report.createdAt)}
      </span>

      {/* Status dropdown */}
      {report.status !== 'Resolved' && report.status !== 'False Alarm' && (
        <select
          id={`er-row-status-${report._id}`}
          defaultValue=""
          disabled={actionLoading === report._id}
          onChange={(e) => {
            if (e.target.value) onStatusChange(report._id, e.target.value);
            e.target.value = '';
          }}
          style={{
            padding:      '0.3rem 0.6rem',
            border:       '1px solid var(--cf-border)',
            borderRadius: 6,
            background:   'var(--cf-surface)',
            fontSize:     '0.78rem',
            cursor:       'pointer',
            flexShrink:   0,
          }}
        >
          <option value="">Change status…</option>
          {VALID_STATUSES.filter((s) => s !== report.status).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}

      {actionLoading === report._id && (
        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"
          style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />
      )}

      {/* View Details — always visible regardless of status */}
      <Link
        to={`/admin/emergency-reports/${report._id}`}
        style={{
          marginLeft:     'auto',
          display:        'inline-flex',
          alignItems:     'center',
          gap:            '0.3rem',
          padding:        '0.28rem 0.7rem',
          border:         '1px solid var(--cf-border)',
          borderRadius:   6,
          background:     'var(--cf-surface)',
          color:          'var(--cf-text-secondary)',
          fontSize:       '0.75rem',
          fontWeight:     600,
          textDecoration: 'none',
          flexShrink:     0,
          transition:     'border-color 150ms, color 150ms',
          whiteSpace:     'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#b91c1c'; e.currentTarget.style.color = '#b91c1c'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--cf-border)'; e.currentTarget.style.color = 'var(--cf-text-secondary)'; }}
      >
        <i className="bi bi-eye" /> View Details
      </Link>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export default function AdminEmergencyReports() {
  const [reports,       setReports]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [actionLoading, setActionLoading] = useState(null); // report._id being mutated
  const [actionError,   setActionError]   = useState('');   // per-action error message

  // ── Stats state — fetched independently so the strip loads even if the
  // report list is slow, and refreshes in sync with the report auto-refresh.
  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Live session ids — Set of report._id strings that have an active session
  // Populated asynchronously after each fetchReports, using Promise.allSettled
  // so one failing query never blocks the rest.  The set is used to render
  // the LIVE badge on cards without blocking the main report list render.
  const [liveIds, setLiveIds] = useState(new Set());

  const refreshTimer = useRef(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/emergency-reports/stats');
      setStats(res.data);
    } catch {
      // Non-fatal: silently skip stats on error; the report list still shows
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchReports = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await api.get('/emergency-reports');
      const data = res.data;
      setReports(data);

      // ── Check which reports have an active live session ─────────────────
      // Run in parallel, silently ignore failures (badge absence is non-critical).
      const checks = data.map((r) =>
        api.get(`/live-location/by-report/${r._id}`)
          .then(({ data: d }) => (d.session ? r._id : null))
          .catch(() => null)
      );
      const results = await Promise.allSettled(checks);
      const ids = new Set(
        results
          .filter((r) => r.status === 'fulfilled' && r.value != null)
          .map((r) => r.value)
      );
      setLiveIds(ids);
    } catch (err) {
      setError(err.message || 'Failed to load emergency reports.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fire both fetches in parallel on mount
    fetchReports();
    fetchStats();

    // Auto-refresh every 60 s — re-runs both so the stats strip stays in sync
    refreshTimer.current = setInterval(() => {
      fetchReports(true);
      fetchStats();
    }, REFRESH_MS);
    return () => clearInterval(refreshTimer.current);
  }, [fetchReports, fetchStats]);

  // Inject pulse-border animation once
  useEffect(() => {
    const styleId = 'er-admin-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes er-pulse-border {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          50%      { box-shadow: 0 0 0 4px rgba(239,68,68,0.35); }
        }
        @keyframes er-live-badge {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.65; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleAcknowledge = async (id) => {
    setActionError('');
    setActionLoading(id);
    try {
      const res = await api.put(`/emergency-reports/${id}/acknowledge`);
      // The endpoint returns either the plain document (normal path) or
      // { message, report } (idempotent path — report was already acknowledged).
      const updated = res.data?.report ?? res.data;
      setReports((prev) => prev.map((r) => r._id === id ? updated : r));
      // Refresh stats so avg ack time and stale count update immediately
      fetchStats();
    } catch (err) {
      setActionError(`Could not acknowledge report: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStatusChange = async (id, status) => {
    setActionError('');
    setActionLoading(id);
    try {
      const res = await api.put(`/emergency-reports/${id}/status`, { status });
      setReports((prev) => prev.map((r) => r._id === id ? res.data : r));
      // Refresh stats after any status change
      fetchStats();
    } catch (err) {
      setActionError(`Could not update status: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Partition into 'New' vs everything else ────────────────────────────────
  const newReports   = reports.filter((r) => r.status === 'New');
  const otherReports = reports
    .filter((r) => r.status !== 'New')
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      || new Date(b.createdAt) - new Date(a.createdAt));

  const staleCount = newReports.filter((r) => minutesAgo(r.createdAt) >= STALE_MINUTES).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Emergency Reports">

      {/* ── Operational stats strip ───────────────────────────────────── */}
      <StatsStrip stats={stats} loading={statsLoading} />

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>

        {/* Unacknowledged badge */}
        {newReports.length > 0 && (
          <span style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '0.4rem',
            padding:      '0.3rem 0.9rem',
            background:   '#b91c1c',
            color:        '#fff',
            borderRadius: '999px',
            fontWeight:   700,
            fontSize:     '0.85rem',
          }}>
            <i className="bi bi-exclamation-triangle-fill" />
            {newReports.length} unacknowledged
            {staleCount > 0 && ` · ${staleCount} stale (>${STALE_MINUTES} min)`}
          </span>
        )}

        {/* Manual refresh */}
        <button
          onClick={() => fetchReports()}
          disabled={loading}
          style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          '0.35rem',
            padding:      '0.4rem 0.85rem',
            border:       '1.5px solid var(--cf-border)',
            borderRadius: 'var(--cf-radius-md)',
            background:   'var(--cf-surface)',
            color:        'var(--cf-text-secondary)',
            fontSize:     '0.82rem',
            cursor:       loading ? 'not-allowed' : 'pointer',
            marginLeft:   'auto',
          }}
        >
          {loading
            ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: 14, height: 14, borderWidth: 2 }} />
            : <i className="bi bi-arrow-clockwise" />
          }
          Refresh
        </button>
      </div>

      {/* ── Global action error ────────────────────────────────────────────── */}
      {actionError && (
        <div className="cf-alert cf-alert-error" style={{ marginBottom: '1rem' }}>
          <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }} />
          <span>{actionError}</span>
          <button
            onClick={() => setActionError('')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
      )}

      {/* ── Loading state ──────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem 0', color: 'var(--cf-text-muted)' }}>
          <div className="cf-spinner" />
          Loading emergency reports…
        </div>
      )}

      {/* ── Error state ────────────────────────────────────────────────────── */}
      {!loading && error && (
        <div className="cf-alert cf-alert-error">
          <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!loading && !error && reports.length === 0 && (
        <div className="cf-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--cf-text-muted)' }}>
          <i className="bi bi-shield-check" style={{ fontSize: '2.5rem', color: '#10b981', display: 'block', marginBottom: '0.75rem' }} />
          <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>No emergency reports</p>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>New reports will appear here as residents submit them. The page auto-refreshes every 60 seconds.</p>
        </div>
      )}

      {/* ── Section A: Unacknowledged (New) ──────────────────────────────── */}
      {!loading && newReports.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          {/* Section heading */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '0.6rem',
            marginBottom: '0.85rem',
            paddingBottom:'0.6rem',
            borderBottom: '2px solid #dc2626',
          }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ color: '#dc2626', fontSize: '1.05rem' }} />
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#b91c1c' }}>
              🚨 URGENT — Unacknowledged
            </h2>
            <span style={{
              background: '#b91c1c', color: '#fff',
              borderRadius: '999px', padding: '0 0.55rem',
              fontSize: '0.78rem', fontWeight: 800,
            }}>
              {newReports.length}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--cf-text-muted)', marginLeft: '0.25rem' }}>
              — click Acknowledge to confirm you've seen a report
            </span>
          </div>

          {newReports.map((report) => (
            <NewReportCard
              key={report._id}
              report={report}
              onAcknowledge={handleAcknowledge}
              onStatusChange={handleStatusChange}
              actionLoading={actionLoading}
              hasLive={liveIds.has(report._id)}
            />
          ))}
        </section>
      )}

      {/* ── Section B: Other reports ──────────────────────────────────────── */}
      {!loading && otherReports.length > 0 && (
        <section>
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '0.6rem',
            marginBottom: '0.75rem',
            paddingBottom:'0.5rem',
            borderBottom: '1px solid var(--cf-border-light)',
          }}>
            <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--cf-text-secondary)' }}>
              Other Reports
            </h2>
            <span style={{
              background: 'var(--cf-surface)', border: '1px solid var(--cf-border)',
              borderRadius: '999px', padding: '0 0.5rem',
              fontSize: '0.73rem', fontWeight: 700, color: 'var(--cf-text-muted)',
            }}>
              {otherReports.length}
            </span>
          </div>

          {otherReports.map((report) => (
            <OtherReportRow
              key={report._id}
              report={report}
              onStatusChange={handleStatusChange}
              actionLoading={actionLoading}
              hasLive={liveIds.has(report._id)}
            />
          ))}
        </section>
      )}

      {/* ── Auto-refresh notice ───────────────────────────────────────────── */}
      {!loading && reports.length > 0 && (
        <p style={{ fontSize: '0.72rem', color: 'var(--cf-text-muted)', marginTop: '1.25rem', textAlign: 'right' }}>
          <i className="bi bi-arrow-repeat me-1" />
          Page auto-refreshes every 60 s &nbsp;·&nbsp; Last loaded: {new Date().toLocaleTimeString()}
        </p>
      )}

    </DashboardLayout>
  );
}
