/**
 * EmergencyDetail.jsx
 *
 * Admin-only detail view for a single EmergencyReport.
 * Accessible at /admin/emergency-reports/:id — linked from every card/row in
 * AdminEmergencyReports regardless of the report's current status.
 *
 * Layout mirrors IssueDetail.jsx:
 *   - Back button → /admin/emergency-reports
 *   - Two-column grid (stacks on mobile):
 *       Left  (main): type badge, description, media gallery, reporter info
 *       Right (sidebar): status + controls, location (address + "Open in Maps"), meta
 *
 * Status controls are embedded here so admins can act without returning to the
 * list view. Changes update local state optimistically and re-fetch on error.
 *
 * API endpoints used:
 *   GET /api/emergency-reports/:id            → getEmergencyReportById (admin only)
 *   PUT /api/emergency-reports/:id/acknowledge → acknowledgeReport
 *   PUT /api/emergency-reports/:id/status      → updateReportStatus
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link }      from 'react-router-dom';
import api                                   from '../services/api';
import DashboardLayout                       from '../components/DashboardLayout';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function minutesAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
}

function formatAge(dateStr) {
  const m = minutesAgo(dateStr);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m} min ago`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m ago` : `${h}h ago`;
}

// Status chip colours — kept in sync with AdminEmergencyReports
const STATUS_COLORS = {
  New:           { bg: '#fff5f5', border: '#fecaca',  text: '#b91c1c' },
  Acknowledged:  { bg: '#eff6ff', border: '#93c5fd',  text: '#1e40af' },
  Escalated:     { bg: '#fff7ed', border: '#fdba74',  text: '#c2410c' },
  Resolved:      { bg: '#f0fdf4', border: '#86efac',  text: '#15803d' },
  'False Alarm': { bg: '#f8fafc', border: '#cbd5e1',  text: '#475569' },
};

const VALID_STATUSES = ['Acknowledged', 'Escalated', 'Resolved', 'False Alarm'];

// ── Subcomponent: expandable media item ──────────────────────────────────────
function MediaItem({ item, idx, onLightbox }) {
  if (item.type === 'image') {
    return (
      <div style={{ flex: '0 0 auto' }}>
        <img
          src={item.url}
          alt={`Evidence ${idx + 1}`}
          onClick={() => onLightbox(item.url)}
          style={{
            width: 120, height: 90,
            objectFit: 'cover',
            borderRadius: 8,
            cursor: 'zoom-in',
            border: '1.5px solid var(--cf-border)',
            transition: 'opacity 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.82'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          title="Click to enlarge"
        />
      </div>
    );
  }

  // Video
  return (
    <div style={{ flex: '0 0 auto' }}>
      <video
        src={item.url}
        controls
        playsInline
        style={{
          maxWidth: 320, width: '100%',
          borderRadius: 8,
          border: '1.5px solid var(--cf-border)',
          display: 'block',
        }}
      />
      {typeof item.durationSeconds === 'number' && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--cf-text-muted)' }}>
          {Math.round(item.durationSeconds)}s
        </p>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function EmergencyDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();

  const [report,        setReport]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [notFound,      setNotFound]      = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [lightbox,      setLightbox]      = useState(null); // image URL or null

  // ── Fetch report ────────────────────────────────────────────────────────────
  const fetchReport = useCallback(async () => {
    if (!id || id === 'null' || id === 'undefined') {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/emergency-reports/${id}`);
      setReport(data);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError('Could not load this report. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleAcknowledge = async () => {
    setActionError('');
    setActionSuccess('');
    setActionLoading(true);
    try {
      const res    = await api.put(`/emergency-reports/${id}/acknowledge`);
      const updated = res.data?.report ?? res.data;
      setReport(updated);
      setActionSuccess('Report acknowledged.');
    } catch (err) {
      setActionError(err.message || 'Could not acknowledge report.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (status) => {
    setActionError('');
    setActionSuccess('');
    setActionLoading(true);
    try {
      const { data } = await api.put(`/emergency-reports/${id}/status`, { status });
      setReport(data);
      setActionSuccess(`Status updated to "${status}".`);
    } catch (err) {
      setActionError(err.message || 'Could not update status.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout title="Emergency Report">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '3rem 0', color: 'var(--cf-text-muted)' }}>
          <div className="cf-spinner" />
          Loading report…
        </div>
      </DashboardLayout>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <DashboardLayout title="Report Not Found">
        <div style={{ maxWidth: 480, margin: '3rem auto', textAlign: 'center', padding: '2.5rem', background: 'var(--cf-surface)', borderRadius: 'var(--cf-radius-lg)', border: '1px solid var(--cf-border-light)' }}>
          <i className="bi bi-file-earmark-x" style={{ fontSize: '2.75rem', color: 'var(--cf-text-muted)', display: 'block', marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Report not found</h1>
          <p style={{ color: 'var(--cf-text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            This report couldn't be found. It may have been removed or the link is no longer valid.
          </p>
          <Link to="/admin/emergency-reports" className="cf-btn cf-btn-outline" style={{ fontSize: '0.875rem' }}>
            <i className="bi bi-arrow-left" /> Back to list
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <DashboardLayout title="Emergency Report">
        <div className="cf-alert cf-alert-error" style={{ maxWidth: 500 }}>
          <i className="bi bi-exclamation-circle-fill" />
          {error}
        </div>
      </DashboardLayout>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  const col = STATUS_COLORS[report.status] ?? STATUS_COLORS['False Alarm'];
  const hasCoords = report.location?.latitude != null && report.location?.longitude != null;

  return (
    <DashboardLayout title="Emergency Report Detail">

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.87)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img src={lightbox} alt="Full view"
            style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: 8, boxShadow: 'var(--cf-shadow-lg)' }} />
        </div>
      )}

      {/* ── Back nav ──────────────────────────────────────────────────────── */}
      <Link
        to="/admin/emergency-reports"
        className="cf-btn cf-btn-outline"
        style={{ marginBottom: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
      >
        <i className="bi bi-arrow-left" /> All Emergency Reports
      </Link>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="row g-4 align-items-start">

        {/* ── LEFT: main content ─────────────────────────────────────────── */}
        <div className="col-12 col-lg-8">

          {/* Header card */}
          <div className="cf-card" style={{ marginBottom: '1rem' }}>

            {/* Type badge + report ID */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                background: '#b91c1c', color: '#fff',
                padding: '0.3rem 0.9rem', borderRadius: '999px',
                fontWeight: 800, fontSize: '0.9rem',
              }}>
                <i className="bi bi-exclamation-triangle-fill" />
                {report.type}
              </div>

              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.2rem 0.65rem',
                background: col.bg, border: `1px solid ${col.border}`,
                borderRadius: '999px', color: col.text,
                fontSize: '0.75rem', fontWeight: 700,
              }}>
                {report.status}
              </span>

              <span style={{ marginLeft: 'auto', fontSize: '0.73rem', color: 'var(--cf-text-muted)', fontFamily: 'monospace' }}>
                #{String(report._id).slice(-8).toUpperCase()}
              </span>
            </div>

            {/* Description */}
            <h2 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
              <i className="bi bi-card-text me-1" style={{ color: '#dc2626' }} />Description
            </h2>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--cf-text)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {report.description}
            </p>

            {/* Timestamps */}
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cf-text-muted)' }}>
              <i className="bi bi-clock me-1" />
              Submitted {formatAge(report.createdAt)} · {formatDate(report.createdAt)}
            </p>
          </div>

          {/* Media gallery */}
          {report.media?.length > 0 && (
            <div className="cf-card" style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.85rem' }}>
                <i className="bi bi-camera-video me-2" style={{ color: '#dc2626' }} />
                Evidence
                <span style={{ fontWeight: 400, color: 'var(--cf-text-muted)', marginLeft: '0.35rem' }}>
                  ({report.media.length} file{report.media.length !== 1 ? 's' : ''})
                </span>
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-start' }}>
                {report.media.map((item, idx) => (
                  <MediaItem key={idx} item={item} idx={idx} onLightbox={setLightbox} />
                ))}
              </div>
            </div>
          )}

          {/* Reporter contact card */}
          <div className="cf-card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem' }}>
              <i className="bi bi-person-fill me-2" style={{ color: '#dc2626' }} />Reporter
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.6rem 1.5rem' }}>
              {/* Name */}
              <div>
                <p style={{ margin: '0 0 0.15rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</p>
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--cf-text)' }}>
                  {report.reporter?.name ?? '—'}
                </p>
              </div>

              {/* Email */}
              <div>
                <p style={{ margin: '0 0 0.15rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</p>
                {report.reporter?.email
                  ? <a href={`mailto:${report.reporter.email}`} style={{ fontSize: '0.85rem', color: 'var(--cf-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <i className="bi bi-envelope" />{report.reporter.email}
                    </a>
                  : <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cf-text-muted)' }}>—</p>
                }
              </div>

              {/* Contact phone — report-level field (E.164, set at submission) */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ margin: '0 0 0.15rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Contact Phone
                </p>
                {report.contactPhone
                  ? <a
                      href={`tel:${report.contactPhone}`}
                      style={{ fontSize: '0.88rem', color: 'var(--cf-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                    >
                      <i className="bi bi-telephone-fill" style={{ color: '#dc2626' }} />
                      {report.contactPhone}
                    </a>
                  : <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cf-text-muted)' }}>Not provided</p>
                }
              </div>
            </div>
          </div>

          {/* Acknowledgement info (if set) */}
          {report.acknowledgedBy && (
            <div className="cf-card" style={{ marginBottom: '1rem', border: '1px solid #bfdbfe', background: '#eff6ff' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="bi bi-check2-circle" style={{ fontSize: '1.1rem', flexShrink: 0 }} />
                <span>
                  Acknowledged by <strong>{report.acknowledgedBy?.name}</strong>
                  {report.acknowledgedAt && <> on {formatDate(report.acknowledgedAt)}</>}
                </span>
              </p>
            </div>
          )}

        </div>{/* /col-lg-8 */}

        {/* ── RIGHT: sidebar ─────────────────────────────────────────────── */}
        <div className="col-12 col-lg-4 d-flex flex-column gap-3">

          {/* Status + controls */}
          <div className="cf-card">
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.85rem', color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Status &amp; Actions
            </h3>

            {/* Current status chip */}
            <div style={{ marginBottom: '1rem' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.3rem 0.85rem',
                background: col.bg, border: `1.5px solid ${col.border}`,
                borderRadius: '999px', color: col.text,
                fontSize: '0.85rem', fontWeight: 700,
              }}>
                {report.status}
              </span>
            </div>

            {/* Feedback messages */}
            {actionSuccess && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, fontSize: '0.82rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <i className="bi bi-check-circle-fill" />{actionSuccess}
              </div>
            )}
            {actionError && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 6, fontSize: '0.82rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <i className="bi bi-exclamation-circle-fill" />{actionError}
              </div>
            )}

            {/* Acknowledge button — only shown for New reports */}
            {report.status === 'New' && (
              <button
                onClick={handleAcknowledge}
                disabled={actionLoading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
                  width: '100%', padding: '0.6rem',
                  background: '#b91c1c', color: '#fff',
                  border: 'none', borderRadius: 'var(--cf-radius-md)',
                  fontWeight: 700, fontSize: '0.9rem',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  opacity: actionLoading ? 0.65 : 1,
                  marginBottom: '0.65rem',
                  transition: 'background 150ms',
                }}
                onMouseEnter={(e) => { if (!actionLoading) e.currentTarget.style.background = '#991b1b'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#b91c1c'; }}
              >
                {actionLoading
                  ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                  : <i className="bi bi-check2-circle" />
                }
                Acknowledge
              </button>
            )}

            {/* Status dropdown */}
            {report.status !== 'Resolved' && report.status !== 'False Alarm' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--cf-text-secondary)', marginBottom: '0.35rem' }}>
                  Change status
                </label>
                <select
                  id="er-detail-status-select"
                  defaultValue=""
                  disabled={actionLoading}
                  onChange={(e) => {
                    if (e.target.value) handleStatusChange(e.target.value);
                    e.target.value = '';
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1.5px solid var(--cf-border)',
                    borderRadius: 'var(--cf-radius-md)',
                    background: 'var(--cf-surface)',
                    color: 'var(--cf-text)',
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Select new status…</option>
                  {VALID_STATUSES
                    .filter((s) => s !== report.status)
                    .map((s) => <option key={s} value={s}>{s}</option>)
                  }
                </select>
              </div>
            )}

            {/* Terminal-status message */}
            {(report.status === 'Resolved' || report.status === 'False Alarm') && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--cf-text-muted)' }}>
                <i className="bi bi-lock me-1" />
                This report is {report.status.toLowerCase()} and no further actions are available.
              </p>
            )}
          </div>

          {/* Location */}
          <div className="cf-card">
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <i className="bi bi-geo-alt-fill me-1" style={{ color: '#dc2626' }} />Location
            </h3>

            <p style={{ margin: '0 0 0.25rem', fontSize: '0.88rem', color: 'var(--cf-text)', wordBreak: 'break-word', lineHeight: 1.5 }}>
              {report.location?.address || '—'}
            </p>

            {hasCoords && (
              <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', color: 'var(--cf-text-muted)', fontFamily: 'monospace' }}>
                {report.location.latitude.toFixed(6)}, {report.location.longitude.toFixed(6)}
              </p>
            )}

            {hasCoords && (
              <a
                href={`https://www.google.com/maps?q=${report.location.latitude},${report.location.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.8rem', color: 'var(--cf-primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <i className="bi bi-map" /> Open in Maps
              </a>
            )}
          </div>

          {/* Meta details */}
          <div className="cf-card" style={{ fontSize: '0.8125rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Details
            </h3>
            {[
              { label: 'Report ID',   value: `#${String(report._id).slice(-8).toUpperCase()}` },
              { label: 'Submitted',   value: formatDate(report.createdAt) },
              { label: 'Last updated',value: formatDate(report.updatedAt) },
              { label: 'Reporter',    value: report.reporter?.name || '—' },
              { label: 'Ack. by',     value: report.acknowledgedBy?.name || '—' },
              { label: 'Ack. at',     value: formatDate(report.acknowledgedAt) },
              { label: 'Media files', value: report.media?.length ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--cf-border-light)' }}>
                <span style={{ color: 'var(--cf-text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 500, color: 'var(--cf-text)', textAlign: 'right', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(value)}
                </span>
              </div>
            ))}
          </div>

        </div>{/* /col-lg-4 */}
      </div>{/* /row */}

    </DashboardLayout>
  );
}
