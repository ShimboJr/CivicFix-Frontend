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
 *   │  [Compact list rows + Load More pagination]             │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Performance improvements over the previous version:
 *   1. Paginated API: GET /api/emergency-reports?page=N&limit=20
 *      - 'New' reports always fully returned (safety: admins must see all urgent)
 *      - 'Other' reports paginated server-side; "Load More" on client
 *   2. Batch live-ids: GET /api/emergency-reports/live-ids
 *      - Replaces N parallel GET /live-location/by-report/:id calls with ONE
 *      - Server does a single MongoDB query across LiveLocationSession collection
 *   3. Skeleton loaders instead of blank white screen during fetch
 *
 * API endpoints used:
 *   GET  /api/emergency-reports?page=N&limit=L  → paginated getAllEmergencyReports
 *   GET  /api/emergency-reports/live-ids        → batch live session check
 *   GET  /api/emergency-reports/stats           → operational stats strip
 *   PUT  /api/emergency-reports/:id/acknowledge → acknowledge
 *   PUT  /api/emergency-reports/:id/status      → update status
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout from '../components/DashboardLayout';

// ── Constants ─────────────────────────────────────────────────────────────────
const STALE_MINUTES  = 10;       // reports older than this (if still New) get a warning
const REFRESH_MS     = 60_000;   // auto-refresh interval
const PAGE_LIMIT     = 20;       // rows per page for "Other Reports"

const VALID_STATUSES = ['Acknowledged', 'Escalated', 'Resolved', 'False Alarm'];

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

// ── Skeleton loaders ──────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background:   '#fff',
      border:       '2px solid #f1f5f9',
      borderRadius: 'var(--cf-radius-lg)',
      padding:      '1.25rem 1.5rem',
      marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="cf-skeleton" style={{ width: 120, height: 28, borderRadius: 999 }} />
        <div className="cf-skeleton" style={{ width: 80,  height: 28, borderRadius: 999 }} />
      </div>
      <div className="cf-skeleton" style={{ width: '90%', height: 16, marginBottom: '0.5rem' }} />
      <div className="cf-skeleton" style={{ width: '60%', height: 16, marginBottom: '1rem' }} />
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div className="cf-skeleton" style={{ width: 130, height: 38, borderRadius: 8 }} />
        <div className="cf-skeleton" style={{ width: 150, height: 38, borderRadius: 8 }} />
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      gap:          '0.75rem',
      padding:      '0.7rem 1rem',
      borderRadius: 'var(--cf-radius-md)',
      border:       '1px solid var(--cf-border-light)',
      background:   'var(--cf-surface)',
      marginBottom: '0.45rem',
    }}>
      <div className="cf-skeleton" style={{ width: 100, height: 22, borderRadius: 999 }} />
      <div className="cf-skeleton" style={{ flex: 1, height: 16 }} />
      <div className="cf-skeleton" style={{ width: 80,  height: 16 }} />
      <div className="cf-skeleton" style={{ width: 60,  height: 16 }} />
      <div className="cf-skeleton" style={{ width: 90,  height: 28, borderRadius: 6 }} />
    </div>
  );
}

// ── Subcomponent: operational stats strip ─────────────────────────────────────
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

      {/* Card 2 — stale unacknowledged count */}
      <div style={{
        ...cardBase,
        background: isStale ? '#fff5f5'             : 'var(--cf-surface)',
        border:     isStale ? '1.5px solid #fca5a5' : '1px solid var(--cf-border-light)',
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

// ── Subcomponent: media attachment ───────────────────────────────────────────
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
      {/* ── Top row ──────────────────────────────────────────────────────── */}
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

        {/* LIVE badge */}
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

          <span style={{ fontSize: '0.73rem', color: 'var(--cf-text-muted)', fontFamily: 'monospace' }}>
            #{String(report._id).slice(-8).toUpperCase()}
          </span>
        </div>
      </div>

      {/* ── Body grid ────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.75rem 1.5rem' }}>

        <div style={{ gridColumn: '1 / -1' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--cf-text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {report.description}
          </p>
        </div>

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

      {/* ── Action row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.1rem', flexWrap: 'wrap' }}>

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

        <select
          id={`er-status-${report._id}`}
          defaultValue=""
          disabled={actionLoading === report._id}
          onChange={(e) => {
            if (e.target.value) onStatusChange(report._id, e.target.value);
            e.target.value = '';
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

      {/* LIVE badge */}
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

      <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--cf-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {report.type}
      </span>

      <span style={{ fontSize: '0.78rem', color: 'var(--cf-text-secondary)', flexShrink: 0 }}>
        <i className="bi bi-person me-1" />{report.reporter?.name ?? '—'}
      </span>

      <span style={{ fontSize: '0.73rem', color: 'var(--cf-text-muted)', flexShrink: 0 }}>
        {formatAge(report.createdAt)}
      </span>

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
  // ── Report state: separated into New (always full) and paginated Others ──
  const [newReports,   setNewReports]   = useState([]);
  const [otherReports, setOtherReports] = useState([]);
  const [pagination,   setPagination]   = useState({ page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });

  const [loading,      setLoading]      = useState(true);   // initial / full refresh
  const [moreLoading,  setMoreLoading]  = useState(false);  // "Load More" button

  const [error,         setError]         = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError,   setActionError]   = useState('');

  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // liveIds: Set<string> of report._id strings with an active live session.
  // Populated by a SINGLE batch call to /emergency-reports/live-ids instead
  // of N parallel calls to /live-location/by-report/:id.
  const [liveIds, setLiveIds] = useState(new Set());

  const refreshTimer = useRef(null);

  // ── Inject CSS animations once ──────────────────────────────────────────
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
        .cf-skeleton {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
          background-size: 200% 100%;
          animation: cf-shimmer 1.4s ease-in-out infinite;
          border-radius: 4px;
          display: block;
        }
        @keyframes cf-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // ── Stats fetch ─────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/emergency-reports/stats');
      setStats(res.data);
    } catch {
      // Non-fatal: silently skip stats on error
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── Batch live-ids fetch ─────────────────────────────────────────────────
  // ONE request replaces N parallel /live-location/by-report/:id calls.
  const fetchLiveIds = useCallback(async () => {
    try {
      const res = await api.get('/emergency-reports/live-ids');
      setLiveIds(new Set(res.data.liveReportIds ?? []));
    } catch {
      // Non-critical: badge absence is acceptable on failure
    }
  }, []);

  // ── Primary report fetch (page 1, replaces all current data) ───────────
  const fetchReports = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await api.get(`/emergency-reports?page=1&limit=${PAGE_LIMIT}`);
      const { newReports: nr, otherReports: or, pagination: pg } = res.data;
      setNewReports(nr   ?? []);
      setOtherReports(or ?? []);
      setPagination(pg   ?? { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load emergency reports.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ── "Load More" handler — appends next page to otherReports ────────────
  const loadMoreOther = useCallback(async () => {
    const nextPage = pagination.page + 1;
    if (nextPage > pagination.totalPages) return;
    setMoreLoading(true);
    try {
      const res = await api.get(`/emergency-reports?page=${nextPage}&limit=${PAGE_LIMIT}`);
      const { otherReports: or, pagination: pg } = res.data;
      setOtherReports((prev) => [...prev, ...(or ?? [])]);
      setPagination(pg ?? pagination);
    } catch (err) {
      setActionError(`Could not load more reports: ${err.message}`);
    } finally {
      setMoreLoading(false);
    }
  }, [pagination]);

  // ── Mount: fire all three fetches in parallel ───────────────────────────
  useEffect(() => {
    Promise.all([fetchReports(), fetchStats(), fetchLiveIds()]);

    // Auto-refresh: reset to page 1 (silent) + refresh stats + live-ids
    refreshTimer.current = setInterval(() => {
      fetchReports(true);
      fetchStats();
      fetchLiveIds();
    }, REFRESH_MS);

    return () => clearInterval(refreshTimer.current);
  }, [fetchReports, fetchStats, fetchLiveIds]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleAcknowledge = async (id) => {
    setActionError('');
    setActionLoading(id);
    try {
      const res  = await api.put(`/emergency-reports/${id}/acknowledge`);
      const updated = res.data?.report ?? res.data;

      // Move from newReports → otherReports (optimistic UI update)
      setNewReports((prev) => prev.filter((r) => r._id !== id));
      setOtherReports((prev) => [updated, ...prev]);
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
      const updated = res.data;

      // Update in whichever list it currently lives in
      setNewReports((prev)   => prev.map((r)   => r._id === id ? updated : r));
      setOtherReports((prev) => prev.map((r)   => r._id === id ? updated : r));
      fetchStats();
    } catch (err) {
      setActionError(`Could not update status: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Derived counts ───────────────────────────────────────────────────────
  const staleCount      = newReports.filter((r) => minutesAgo(r.createdAt) >= STALE_MINUTES).length;
  const hasMoreOther    = pagination.page < pagination.totalPages;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Emergency Reports">

      {/* ── Operational stats strip ──────────────────────────────────────── */}
      <StatsStrip stats={stats} loading={statsLoading} />

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>

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
          onClick={() => { fetchReports(); fetchStats(); fetchLiveIds(); }}
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

      {/* ── Global action error ───────────────────────────────────────────── */}
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

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {!loading && error && (
        <div className="cf-alert cf-alert-error">
          <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Initial skeleton loaders (first load only) ────────────────────── */}
      {loading && (
        <>
          {/* Skeleton for urgent section */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '0.6rem',
            marginBottom: '0.85rem',
            paddingBottom:'0.6rem',
            borderBottom: '2px solid #f1f5f9',
          }}>
            <div className="cf-skeleton" style={{ width: 200, height: 20 }} />
          </div>
          <SkeletonCard />
          <SkeletonCard />

          {/* Skeleton for other reports section */}
          <div style={{ marginTop: '2rem' }}>
            <div className="cf-skeleton" style={{ width: 140, height: 18, marginBottom: '0.75rem' }} />
            {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        </>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!loading && !error && newReports.length === 0 && otherReports.length === 0 && (
        <div className="cf-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--cf-text-muted)' }}>
          <i className="bi bi-shield-check" style={{ fontSize: '2.5rem', color: '#10b981', display: 'block', marginBottom: '0.75rem' }} />
          <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>No emergency reports</p>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>New reports will appear here as residents submit them. The page auto-refreshes every 60 seconds.</p>
        </div>
      )}

      {/* ── Section A: Unacknowledged (New) ──────────────────────────────── */}
      {!loading && newReports.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
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

      {/* ── Section B: Other reports (paginated) ─────────────────────────── */}
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
              {pagination.total}
            </span>
            {/* Show how many pages are loaded */}
            {pagination.totalPages > 1 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--cf-text-muted)', marginLeft: '0.15rem' }}>
                — showing {otherReports.length} of {pagination.total}
              </span>
            )}
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

          {/* Skeleton rows while loading next page */}
          {moreLoading && (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}

          {/* Load More button */}
          {hasMoreOther && !moreLoading && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button
                onClick={loadMoreOther}
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          '0.45rem',
                  padding:      '0.55rem 1.5rem',
                  border:       '1.5px solid var(--cf-border)',
                  borderRadius: 'var(--cf-radius-md)',
                  background:   'var(--cf-surface)',
                  color:        'var(--cf-text-secondary)',
                  fontSize:     '0.84rem',
                  fontWeight:   600,
                  cursor:       'pointer',
                  transition:   'border-color 150ms, color 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--cf-primary)'; e.currentTarget.style.color = 'var(--cf-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--cf-border)'; e.currentTarget.style.color = 'var(--cf-text-secondary)'; }}
              >
                <i className="bi bi-chevron-down" />
                Load more ({pagination.total - otherReports.length} remaining)
              </button>
            </div>
          )}

          {/* End-of-list indicator */}
          {!hasMoreOther && pagination.totalPages > 1 && (
            <p style={{ fontSize: '0.72rem', color: 'var(--cf-text-muted)', marginTop: '0.75rem', textAlign: 'center' }}>
              All {pagination.total} reports loaded
            </p>
          )}
        </section>
      )}

      {/* ── Auto-refresh notice ────────────────────────────────────────────── */}
      {!loading && (newReports.length > 0 || otherReports.length > 0) && (
        <p style={{ fontSize: '0.72rem', color: 'var(--cf-text-muted)', marginTop: '1.25rem', textAlign: 'right' }}>
          <i className="bi bi-arrow-repeat me-1" />
          Page auto-refreshes every 60 s &nbsp;·&nbsp; Last loaded: {new Date().toLocaleTimeString()}
        </p>
      )}

    </DashboardLayout>
  );
}
