import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import StatusBadge from '../components/StatusBadge';
import DashboardLayout from '../components/DashboardLayout';

const STATUS_ORDER = ['Pending', 'Under Review', 'Assigned', 'In Progress', 'Resolved'];

const SEVERITY_COLOR = {
  Low: '#10b981', Medium: '#f59e0b', High: '#f97316', Critical: '#ef4444',
};

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function IssueDetail() {
  const { id }       = useParams();
  const { user }     = useAuth();
  const navigate     = useNavigate();

  const [issue,      setIssue]      = useState(null);
  const [comments,   setComments]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [upvoting,   setUpvoting]   = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting,    setPosting]    = useState(false);
  const [lightbox,   setLightbox]   = useState(null); // image src or null

  // ── Load issue + comments ─────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    api.get(`/issues/${id}`)
      .then(({ data }) => { setIssue(data.issue); setComments(data.comments); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Upvote toggle ─────────────────────────────────────────────────────────
  const handleUpvote = async () => {
    if (!user) { navigate('/login'); return; }
    setUpvoting(true);
    try {
      const { data } = await api.post(`/issues/${id}/upvote`);
      setIssue((prev) => ({
        ...prev,
        upvotes: data.upvoted
          ? [...(prev.upvotes || []), user._id]
          : (prev.upvotes || []).filter((uid) => uid !== user._id && uid?._id !== user._id),
      }));
    } catch {}
    setUpvoting(false);
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

  const hasUpvoted = user && issue?.upvotes?.some(
    (uid) => (uid?._id || uid)?.toString() === user._id?.toString()
  );

  const currentStatusIdx = STATUS_ORDER.indexOf(issue?.status);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="cf-spinner-wrap" style={{ minHeight: '60vh' }}>
          <div className="cf-spinner"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !issue) {
    return (
      <DashboardLayout>
        <div className="cf-alert cf-alert-error" style={{ maxWidth: 500 }}>
          <i className="bi bi-exclamation-circle-fill"></i>
          {error || 'Issue not found.'}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img src={lightbox} alt="Full view"
            style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: 8, boxShadow: 'var(--cf-shadow-lg)' }} />
        </div>
      )}

      {/* ── Back nav ──────────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate(-1)}
        className="cf-btn cf-btn-outline"
        style={{ marginBottom: '1.25rem', fontSize: '0.8125rem', padding: '0.4rem 0.9rem' }}
      >
        <i className="bi bi-arrow-left"></i> Back
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Left column ───────────────────────────────────────────────── */}
        <div>
          {/* Header card */}
          <div className="cf-card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
              <StatusBadge status={issue.status} size="lg" />
              <span style={{
                background: SEVERITY_COLOR[issue.severity] + '20',
                color:      SEVERITY_COLOR[issue.severity],
                borderRadius: 999, padding: '0.2rem 0.65rem',
                fontSize: '0.75rem', fontWeight: 600,
              }}>
                {issue.severity} Severity
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--cf-text-muted)' }}>
                {issue.issueId}
              </span>
            </div>

            <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{issue.title}</h1>

            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--cf-text-secondary)', marginBottom: '1rem' }}>
              <span><i className="bi bi-geo-alt me-1"></i>{issue.location?.address}</span>
              <span><i className="bi bi-tag me-1"></i>{issue.category?.name}</span>
              <span><i className="bi bi-calendar me-1"></i>{formatDate(issue.createdAt)}</span>
              <span><i className="bi bi-person me-1"></i>Reported by {issue.reportedBy?.name}</span>
            </div>

            <p style={{ color: 'var(--cf-text)', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>
              {issue.description}
            </p>

            {/* Rejection reason */}
            {issue.status === 'Rejected' && issue.rejectionReason && (
              <div className="cf-alert cf-alert-error" style={{ marginTop: '1rem' }}>
                <i className="bi bi-x-circle-fill" style={{ flexShrink: 0 }}></i>
                <div><strong>Rejection reason:</strong> {issue.rejectionReason}</div>
              </div>
            )}
          </div>

          {/* Image gallery */}
          {issue.images?.length > 0 && (
            <div className="cf-card" style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.85rem' }}>
                <i className="bi bi-images me-2" style={{ color: 'var(--cf-primary)' }}></i>Photos
              </h2>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {issue.images.map((src, i) => (
                  <img
                    key={i}
                    src={`http://localhost:5000${src}`}
                    alt={`Issue photo ${i + 1}`}
                    onClick={() => setLightbox(`http://localhost:5000${src}`)}
                    style={{
                      width: 110, height: 90, objectFit: 'cover',
                      borderRadius: 'var(--cf-radius-md)', cursor: 'zoom-in',
                      border: '1px solid var(--cf-border)',
                      transition: 'opacity 150ms',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Before / After */}
          {issue.beforeImage && issue.afterImage && (
            <div className="cf-card" style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.85rem' }}>
                <i className="bi bi-arrow-left-right me-2" style={{ color: 'var(--cf-primary)' }}></i>
                Before / After
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {[['Before', issue.beforeImage], ['After', issue.afterImage]].map(([label, src]) => (
                  <div key={label}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--cf-text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {label}
                    </p>
                    <img
                      src={`http://localhost:5000${src}`}
                      alt={label}
                      onClick={() => setLightbox(`http://localhost:5000${src}`)}
                      style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 'var(--cf-radius-md)', cursor: 'zoom-in', border: '1px solid var(--cf-border)' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="cf-card">
            <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem' }}>
              <i className="bi bi-chat-dots me-2" style={{ color: 'var(--cf-primary)' }}></i>
              Comments ({comments.length})
            </h2>

            {/* Comment list */}
            {comments.length === 0 ? (
              <p style={{ color: 'var(--cf-text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                No comments yet. Be the first to respond.
              </p>
            ) : (
              <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {comments.map((c) => (
                  <div key={c._id} style={{
                    display: 'flex', gap: '0.75rem',
                    padding: '0.75rem',
                    background: 'var(--cf-bg)', borderRadius: 'var(--cf-radius-md)',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'var(--cf-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
                    }}>
                      {c.user?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.user?.name}</span>
                        {c.user?.role !== 'resident' && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--cf-primary)', fontWeight: 600, background: 'var(--cf-primary-light)', padding: '0.1rem 0.45rem', borderRadius: 999 }}>
                            {c.user?.role}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'var(--cf-text-muted)', marginLeft: 'auto' }}>
                          {formatDate(c.createdAt)}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--cf-text)' }}>
                        {c.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment form */}
            {user ? (
              <form onSubmit={handleComment} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'var(--cf-accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0, marginTop: 2,
                }}>
                  {user.name?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="cf-input"
                    rows={2}
                    style={{ resize: 'vertical', marginBottom: '0.5rem' }}
                    placeholder="Add a comment…"
                  />
                  <button type="submit" className="cf-btn cf-btn-primary"
                    style={{ fontSize: '0.8125rem', padding: '0.45rem 1rem' }}
                    disabled={posting || !commentText.trim()}>
                    {posting ? 'Posting…' : <><i className="bi bi-send"></i> Post</>}
                  </button>
                </div>
              </form>
            ) : (
              <p style={{ fontSize: '0.875rem', color: 'var(--cf-text-muted)' }}>
                <a href="/login">Sign in</a> to leave a comment.
              </p>
            )}
          </div>
        </div>

        {/* ── Right sidebar ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Upvote card */}
          <div className="cf-card" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <button
              onClick={handleUpvote}
              disabled={upvoting}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--cf-radius-md)',
                border: `2px solid ${hasUpvoted ? 'var(--cf-primary)' : 'var(--cf-border)'}`,
                background: hasUpvoted ? 'var(--cf-primary-light)' : 'transparent',
                color: hasUpvoted ? 'var(--cf-primary)' : 'var(--cf-text-secondary)',
                cursor: 'pointer',
                fontWeight: 600, fontSize: '0.9rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                transition: 'all 150ms',
              }}
            >
              <i className={`bi ${hasUpvoted ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up'}`} style={{ fontSize: '1.1rem' }}></i>
              {hasUpvoted ? 'You reported this too' : 'I also experience this'}
            </button>
            <p style={{ margin: '0.6rem 0 0', fontSize: '0.8125rem', color: 'var(--cf-text-muted)' }}>
              <strong style={{ color: 'var(--cf-text)' }}>{issue.upvotes?.length || 0}</strong> {(issue.upvotes?.length || 0) === 1 ? 'person has' : 'people have'} reported this issue
            </p>
          </div>

          {/* Status timeline */}
          <div className="cf-card">
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Status Timeline
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {STATUS_ORDER.map((s, i) => {
                const isPast    = i < currentStatusIdx;
                const isCurrent = i === currentStatusIdx;
                const isFuture  = i > currentStatusIdx;
                const rejected  = issue.status === 'Rejected';
                return (
                  <div key={s} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', paddingBottom: i < STATUS_ORDER.length - 1 ? '0.85rem' : 0 }}>
                    {/* Dot + line */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        border: `2px solid ${isCurrent && rejected ? '#ef4444' : isCurrent ? 'var(--cf-primary)' : isPast ? 'var(--cf-primary)' : 'var(--cf-border)'}`,
                        background: isPast ? 'var(--cf-primary)' : isCurrent && rejected ? '#fee2e2' : isCurrent ? 'var(--cf-primary-light)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem', color: '#fff',
                      }}>
                        {isPast && <i className="bi bi-check"></i>}
                        {isCurrent && !rejected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cf-primary)' }}></div>}
                      </div>
                      {i < STATUS_ORDER.length - 1 && (
                        <div style={{ width: 2, height: 28, background: isPast ? 'var(--cf-primary)' : 'var(--cf-border)', margin: '2px 0' }}></div>
                      )}
                    </div>
                    {/* Label */}
                    <div style={{ paddingTop: '1px' }}>
                      <div style={{
                        fontSize: '0.8125rem',
                        fontWeight: isCurrent ? 700 : 400,
                        color: isCurrent ? 'var(--cf-text)' : isPast ? 'var(--cf-primary)' : 'var(--cf-text-muted)',
                      }}>
                        {s}
                      </div>
                    </div>
                  </div>
                );
              })}
              {issue.status === 'Rejected' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <StatusBadge status="Rejected" size="lg" />
                </div>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="cf-card" style={{ fontSize: '0.8125rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Details
            </h3>
            {[
              { label: 'Reference',   value: issue.issueId },
              { label: 'Category',    value: issue.category?.name },
              { label: 'Severity',    value: issue.severity },
              { label: 'Reported by', value: issue.reportedBy?.name },
              { label: 'Assigned to', value: issue.assignedTo?.name || '—' },
              { label: 'Updated',     value: formatDate(issue.updatedAt) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--cf-border-light)' }}>
                <span style={{ color: 'var(--cf-text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 500, color: 'var(--cf-text)', textAlign: 'right', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
