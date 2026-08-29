import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';

const SEVERITY_COLOR = {
  Low:      '#10b981',
  Medium:   '#f59e0b',
  High:     '#f97316',
  Critical: '#ef4444',
};

export default function IssueCard({ issue }) {
  const {
    _id,
    issueId,
    title,
    category,
    status,
    severity,
    location,
    images,
    upvotes,
    createdAt,
  } = issue;

  const thumbnail  = images && images.length > 0
    ? `http://localhost:5000${images[0]}`
    : null;

  const categoryIcon = category?.icon || 'bi-tag';
  const categoryName = category?.name || 'Uncategorized';

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 60)  return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days  < 30)  return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <Link
      to={`/issue/${_id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div
        className="cf-card"
        style={{
          padding:    0,
          overflow:   'hidden',
          transition: 'box-shadow var(--cf-transition), transform var(--cf-transition)',
          cursor:     'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = 'var(--cf-shadow-lg)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'var(--cf-shadow-md)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {/* Thumbnail / Placeholder */}
        <div style={{
          height:     '148px',
          background: thumbnail ? 'none' : 'var(--cf-primary-light)',
          position:   'relative',
          overflow:   'hidden',
          flexShrink:  0,
        }}>
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--cf-primary)',
            }}>
              <i className={`bi ${categoryIcon}`} style={{ fontSize: '2.5rem', opacity: 0.5 }}></i>
            </div>
          )}

          {/* Severity chip — top right */}
          <div style={{
            position:   'absolute', top: 8, right: 8,
            background: SEVERITY_COLOR[severity] || '#6b7280',
            color:      '#fff',
            borderRadius: 999,
            padding:    '0.15rem 0.55rem',
            fontSize:   '0.6875rem',
            fontWeight:  600,
          }}>
            {severity}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '0.9rem 1rem' }}>
          {/* Category pill */}
          <div style={{
            display:    'inline-flex', alignItems: 'center', gap: '0.3rem',
            fontSize:   '0.72rem', fontWeight: 600, color: 'var(--cf-primary)',
            background: 'var(--cf-primary-light)',
            padding:    '0.15rem 0.55rem', borderRadius: 999,
            marginBottom: '0.5rem',
          }}>
            <i className={`bi ${categoryIcon}`}></i> {categoryName}
          </div>

          {/* Title */}
          <h3 style={{
            fontSize:   '0.9375rem', fontWeight: 600, margin: '0 0 0.5rem',
            lineHeight: 1.35,
            display:    '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {title}
          </h3>

          {/* Location */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--cf-text-secondary)', fontSize: '0.8rem', marginBottom: '0.7rem' }}>
            <i className="bi bi-geo-alt"></i>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {location?.address || 'Unknown location'}
            </span>
          </div>

          {/* Footer row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <StatusBadge status={status} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', fontSize: '0.78rem', color: 'var(--cf-text-muted)' }}>
              <span title="Upvotes">
                <i className="bi bi-hand-thumbs-up" style={{ marginRight: '0.2rem' }}></i>
                {upvotes?.length || 0}
              </span>
              <span>{issueId || timeAgo(createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
