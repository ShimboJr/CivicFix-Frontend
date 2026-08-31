import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import StaffLayout from '../components/StaffLayout';
import StatusBadge  from '../components/StatusBadge';

// Forward-only transitions the server enforces — mirrored here to drive the UI
const STAFF_TRANSITIONS = {
  'Assigned':    'In Progress',
  'In Progress': 'Resolved',
};

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const SEVERITY_COLOR = { Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444' };

// Cloudinary URLs are already fully-qualified (https://…).
// Only prepend the local dev server origin for legacy /uploads/… paths.
const resolveImg = (src) =>
  src?.startsWith('http') ? src : `http://localhost:5000${src}`;

export default function StaffIssueDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const proofRef   = useRef();

  const [issue,      setIssue]      = useState(null);
  const [comments,   setComments]   = useState([]);
  const [auditLog,   setAuditLog]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [lightbox,   setLightbox]   = useState(null);

  // Progress controls
  const [note,        setNote]        = useState('');
  const [progressing, setProgressing] = useState(false);
  const [progError,   setProgError]   = useState('');
  const [progSuccess, setProgSuccess] = useState('');

  // Proof upload
  const [proofFile,     setProofFile]     = useState(null);
  const [proofPreview,  setProofPreview]  = useState(null);
  const [uploading,     setUploading]     = useState(false);
  const [uploadError,   setUploadError]   = useState('');

  // Comment
  const [commentText, setCommentText] = useState('');
  const [posting,     setPosting]     = useState(false);

  // ── Load issue + comments ─────────────────────────────────────────────────
  const load = () => {
    setLoading(true);
    api.get(`/issues/${id}`)
      .then(({ data }) => { setIssue(data.issue); setComments(data.comments); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  // ── Load audit log (separate, non-blocking) ─────────────────────────────────
  const loadAuditLog = () =>
    api.get(`/issues/${id}/audit-log`)
      .then(({ data }) => setAuditLog(data))
      .catch(() => {});

  useEffect(() => { loadAuditLog(); }, [id]);

  // ── Advance status ────────────────────────────────────────────────────────
  const handleProgress = async () => {
    setProgressing(true); setProgError(''); setProgSuccess('');
    try {
      const { data } = await api.patch(`/staff/issues/${id}/progress`, { note: note.trim() || undefined });
      setIssue(data);
      setProgSuccess(`Status advanced to "${data.status}"`);
      setNote('');
      // Reload comments so the progress note appears in thread
      api.get(`/issues/${id}/comments`).then(({ data: c }) => setComments(c)).catch(() => {});
      // Reload audit log so the new entry appears immediately
      loadAuditLog();
    } catch (err) { setProgError(err.message); }
    finally { setProgressing(false); }
  };

  // ── Proof upload ──────────────────────────────────────────────────────────
  const handleProofSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setProofPreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleProofUpload = async () => {
    if (!proofFile) return;
    setUploading(true); setUploadError('');
    const fd = new FormData();
    fd.append('afterImage', proofFile);
    try {
      const { data } = await api.patch(`/staff/issues/${id}/proof`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setIssue(data);
      setProofFile(null); setProofPreview(null);
    } catch (err) { setUploadError(err.message); }
    finally { setUploading(false); }
  };

  // ── Add comment ───────────────────────────────────────────────────────────
  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      const { data } = await api.post(`/issues/${id}/comments`, { text: commentText.trim() });
      setComments((prev) => [...prev, data]);
      setCommentText('');
    } catch {}
    setPosting(false);
  };

  const nextStatus  = issue ? STAFF_TRANSITIONS[issue.status] : null;
  const canAdvance  = !!nextStatus;

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <StaffLayout>
        <div className="cf-spinner-wrap" style={{ minHeight: '60vh' }}><div className="cf-spinner"></div></div>
      </StaffLayout>
    );
  }

  if (error || !issue) {
    return (
      <StaffLayout>
        <div className="cf-alert cf-alert-error" style={{ maxWidth: 500 }}>
          <i className="bi bi-exclamation-circle-fill"></i> {error || 'Issue not found.'}
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout>

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightbox} alt="Full view" style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: 8 }} />
        </div>
      )}

      {/* Back */}
      <button onClick={() => navigate('/staff/assigned')} className="cf-btn cf-btn-outline"
        style={{ marginBottom: '1.25rem', fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}>
        <i className="bi bi-arrow-left"></i> Back to Assigned Issues
      </button>

      {/* ── Two-column layout ───────────────────────────────────────────────
           Below lg (<992 px): cols stack — right sidebar goes below the main content.
           At lg+:             side-by-side at 8/4 col ratio. */}
      <div className="row g-4 align-items-start">

        {/* ── Left column (main content) ────────────────────────────────── */}
        <div className="col-12 col-lg-8">
          {/* Issue header */}
          <div className="cf-card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
              <StatusBadge status={issue.status} size="lg" />
              <span style={{ background: SEVERITY_COLOR[issue.severity] + '20', color: SEVERITY_COLOR[issue.severity], borderRadius: 999, padding: '0.2rem 0.65rem', fontSize: '0.75rem', fontWeight: 600 }}>
                {issue.severity} Severity
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--cf-primary)', fontWeight: 600 }}>{issue.issueId}</span>
            </div>

            <h1 style={{ fontSize: '1.2rem', marginBottom: '0.7rem' }}>{issue.title}</h1>

            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--cf-text-secondary)', marginBottom: '1rem' }}>
              <span><i className="bi bi-geo-alt me-1"></i>{issue.location?.address}</span>
              <span><i className="bi bi-tag me-1"></i>{issue.category?.name}</span>
              <span><i className="bi bi-calendar me-1"></i>{formatDate(issue.createdAt)}</span>
              <span><i className="bi bi-person me-1"></i>Reported by {issue.reportedBy?.name}</span>
            </div>

            <p style={{ color: 'var(--cf-text)', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>{issue.description}</p>
          </div>

          {/* Issue photos */}
          {issue.images?.length > 0 && (
            <div className="cf-card" style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.85rem' }}>
                <i className="bi bi-images me-2" style={{ color: 'var(--cf-primary)' }}></i>Reporter's Photos
              </h2>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                 {issue.images.map((src, i) => (
                  <img key={i} src={resolveImg(src)} alt={`Photo ${i + 1}`}
                    onClick={() => setLightbox(resolveImg(src))}
                    style={{
                      flex: '1 1 calc(50% - 0.3rem)',
                      maxWidth: 110,
                      height: 90, objectFit: 'cover',
                      borderRadius: 'var(--cf-radius-md)', cursor: 'zoom-in',
                      border: '1px solid var(--cf-border)',
                    }} />
                ))}
              </div>
            </div>
          )}

          {/* Before / After (once proof uploaded) */}
          {issue.beforeImage && issue.afterImage && (
            <div className="cf-card" style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.85rem' }}>
                <i className="bi bi-arrow-left-right me-2" style={{ color: 'var(--cf-primary)' }}></i>Before / After
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[['Before', issue.beforeImage], ['After', issue.afterImage]].map(([label, src]) => (
                  <div key={label}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--cf-text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                    <img src={resolveImg(src)} alt={label}
                      onClick={() => setLightbox(resolveImg(src))}
                      style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 'var(--cf-radius-md)', cursor: 'zoom-in', border: '1px solid var(--cf-border)' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Staff controls ─────────────────────────────────────────── */}
          <div className="cf-card" style={{ marginBottom: '1rem', border: '1.5px solid var(--cf-primary-light)' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--cf-border-light)' }}>
              <i className="bi bi-tools me-2" style={{ color: 'var(--cf-primary)' }}></i>
              Staff Controls
            </h2>

            {/* Status advance */}
            {canAdvance ? (
              <div style={{ marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--cf-text-secondary)', marginBottom: '0.75rem' }}>
                  Advance status: <strong>{issue.status}</strong> → <strong>{nextStatus}</strong>
                </p>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="cf-form-label">Progress note (optional — visible to reporter)</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)}
                    className="cf-input" rows={2} style={{ resize: 'vertical' }}
                    placeholder={`Describe what you're doing on this issue…`} />
                </div>

                {progError   && <div className="cf-alert cf-alert-error"   style={{ marginBottom: '0.75rem' }}><i className="bi bi-exclamation-circle-fill me-1"></i>{progError}</div>}
                {progSuccess && <div className="cf-alert cf-alert-success" style={{ marginBottom: '0.75rem' }}><i className="bi bi-check-circle-fill me-1"></i>{progSuccess}</div>}

                <button onClick={handleProgress} disabled={progressing} className="cf-btn cf-btn-primary">
                  {progressing
                    ? <><span className="spinner-border spinner-border-sm me-2"></span>Updating…</>
                    : <><i className="bi bi-arrow-right-circle"></i> Mark as {nextStatus}</>}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#10b981', marginBottom: '1.25rem', fontSize: '0.9rem', fontWeight: 500 }}>
                <i className="bi bi-check-circle-fill" style={{ fontSize: '1.1rem' }}></i>
                This issue is <strong>{issue.status}</strong> — no further status advances available.
              </div>
            )}

            {/* Proof upload */}
            <div style={{ borderTop: '1px solid var(--cf-border-light)', paddingTop: '1rem' }}>
              <label className="cf-form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                {issue.afterImage ? 'Replace After-Photo' : 'Upload After-Photo (Resolution Proof)'}
              </label>

              {proofPreview ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <img src={proofPreview} alt="Proof preview"
                    style={{ width: 100, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--cf-border)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--cf-text-secondary)' }}>{proofFile?.name}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={handleProofUpload} disabled={uploading} className="cf-btn cf-btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}>
                        {uploading ? 'Uploading…' : <><i className="bi bi-cloud-upload"></i> Upload</>}
                      </button>
                      <button onClick={() => { setProofFile(null); setProofPreview(null); }} className="cf-btn cf-btn-outline" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => proofRef.current.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    width: '100%',
                    padding: '0.6rem 1.1rem', border: '1.5px dashed var(--cf-border)',
                    borderRadius: 'var(--cf-radius-md)', background: 'transparent',
                    color: 'var(--cf-text-secondary)', cursor: 'pointer', fontSize: '0.875rem',
                    transition: 'border-color 150ms, color 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--cf-primary)'; e.currentTarget.style.color = 'var(--cf-primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--cf-border)';  e.currentTarget.style.color = 'var(--cf-text-secondary)'; }}
                >
                  <i className="bi bi-camera"></i>
                  {issue.afterImage ? 'Replace after-photo' : 'Select after-photo'}
                </button>
              )}
              <input ref={proofRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProofSelect} />
              {uploadError && <p className="cf-field-error" style={{ marginTop: '0.4rem' }}>{uploadError}</p>}
            </div>
          </div>

          {/* Comments */}
          <div className="cf-card">
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem' }}>
              <i className="bi bi-chat-dots me-2" style={{ color: 'var(--cf-primary)' }}></i>
              Comments ({comments.length})
            </h2>
            {comments.length === 0 ? (
              <p style={{ color: 'var(--cf-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>No comments yet.</p>
            ) : (
              <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {comments.map((c) => (
                  <div key={c._id} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem', background: 'var(--cf-bg)', borderRadius: 'var(--cf-radius-md)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: c.user?.role === 'staff' ? '#10b981' : 'var(--cf-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
                      {c.user?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.user?.name}</span>
                        {c.user?.role !== 'resident' && (
                          <span style={{ fontSize: '0.7rem', background: c.user?.role === 'staff' ? '#d1fae5' : 'var(--cf-primary-light)', color: c.user?.role === 'staff' ? '#065f46' : 'var(--cf-primary)', padding: '0.1rem 0.45rem', borderRadius: 999, fontWeight: 600 }}>
                            {c.user?.role}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'var(--cf-text-muted)', marginLeft: 'auto' }}>{formatDate(c.createdAt)}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.6 }}>{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleComment} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
              <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
                className="cf-input" rows={2} style={{ resize: 'vertical', flex: 1 }} placeholder="Add a comment visible to residents and admins…" />
              <button type="submit" disabled={posting || !commentText.trim()} className="cf-btn cf-btn-primary" style={{ fontSize: '0.8125rem', padding: '0.45rem 1rem', marginTop: 2 }}>
                {posting ? '…' : <><i className="bi bi-send"></i> Post</>}
              </button>
            </form>
          </div>
        </div>{/* /col-lg-8 */}

        {/* ── Right column (sidebar) ─────────────────────────────────── */}
        {/* d-flex flex-column gap-3 reproduces the old gap:'1rem' inner wrapper */}
        <div className="col-12 col-lg-4 d-flex flex-column gap-3">

          {/* Status card */}
          <div className="cf-card" style={{ textAlign: 'center', padding: '1.25rem 1rem' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
              Current Status
            </p>
            <StatusBadge status={issue.status} size="lg" />
            {canAdvance && (
              <p style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', marginTop: '0.5rem' }}>
                Next: <strong>{nextStatus}</strong>
              </p>
            )}
          </div>

          {/* Meta */}
          <div className="cf-card" style={{ fontSize: '0.8125rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</h3>
            {[
              { label: 'Reference',   value: issue.issueId },
              { label: 'Category',    value: issue.category?.name },
              { label: 'Severity',    value: issue.severity },
              { label: 'Reported by', value: issue.reportedBy?.name },
              { label: 'Upvotes',     value: `${issue.upvotes?.length || 0} resident${issue.upvotes?.length !== 1 ? 's' : ''}` },
              { label: 'Reported',    value: formatDate(issue.createdAt) },
              { label: 'Updated',     value: formatDate(issue.updatedAt) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--cf-border-light)' }}>
                <span style={{ color: 'var(--cf-text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 500, color: 'var(--cf-text)', textAlign: 'right', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Change History (audit log) */}
          {auditLog.length > 0 && (
            <div className="cf-card">
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.85rem', color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <i className="bi bi-clock-history me-1" style={{ color: 'var(--cf-primary)' }} />
                Change History
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {auditLog.map((entry) => (
                  <div key={entry._id} style={{
                    padding: '0.6rem 0.75rem',
                    background: 'var(--cf-bg)',
                    borderRadius: 'var(--cf-radius-md)',
                    border: '1px solid var(--cf-border-light)',
                    fontSize: '0.8rem',
                  }}>
                    {/* who + when */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--cf-text)' }}>
                        {entry.changedBy?.name || 'Unknown'}
                      </span>
                      {entry.changedBy?.role && entry.changedBy.role !== 'resident' && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 600,
                          background: entry.changedBy.role === 'staff' ? '#d1fae5' : 'var(--cf-primary-light)',
                          color:      entry.changedBy.role === 'staff' ? '#065f46' : 'var(--cf-primary)',
                          padding: '0.1rem 0.4rem', borderRadius: 999,
                        }}>
                          {entry.changedBy.role}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--cf-text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                    {/* transition */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ background: 'var(--cf-border-light)', padding: '0.1rem 0.45rem', borderRadius: 4, fontSize: '0.75rem' }}>
                        {entry.fromStatus}
                      </span>
                      <i className="bi bi-arrow-right" style={{ fontSize: '0.7rem', color: 'var(--cf-text-muted)' }} />
                      <span style={{
                        background: entry.toStatus === 'Rejected' ? '#fee2e2' : entry.toStatus === 'Resolved' ? '#d1fae5' : 'var(--cf-primary-light)',
                        color:      entry.toStatus === 'Rejected' ? '#b91c1c' : entry.toStatus === 'Resolved' ? '#065f46' : 'var(--cf-primary)',
                        padding: '0.1rem 0.45rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                      }}>
                        {entry.toStatus}
                      </span>
                    </div>
                    {entry.reason && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--cf-text-secondary)', fontStyle: 'italic' }}>
                        “{entry.reason}”
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>{/* /col-lg-4 */}
      </div>{/* /row */}
    </StaffLayout>
  );
}
