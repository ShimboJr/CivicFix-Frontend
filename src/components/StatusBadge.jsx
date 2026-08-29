/**
 * StatusBadge — maps every issue status to a distinct pill colour.
 * Uses CSS classes defined in index.css for consistency.
 */
const STATUS_CONFIG = {
  'Pending':      { cls: 'cf-badge-pending',    icon: 'bi-clock',            label: 'Pending' },
  'Under Review': { cls: 'cf-badge-review',     icon: 'bi-eye',              label: 'Under Review' },
  'Assigned':     { cls: 'cf-badge-assigned',   icon: 'bi-person-check',     label: 'Assigned' },
  'In Progress':  { cls: 'cf-badge-inprogress', icon: 'bi-arrow-repeat',     label: 'In Progress' },
  'Resolved':     { cls: 'cf-badge-resolved',   icon: 'bi-check-circle',     label: 'Resolved' },
  'Rejected':     { cls: 'cf-badge-rejected',   icon: 'bi-x-circle',         label: 'Rejected' },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const config = STATUS_CONFIG[status] || { cls: '', icon: 'bi-question-circle', label: status };
  const fontSize = size === 'lg' ? '0.8125rem' : '0.6875rem';

  return (
    <span className={`cf-badge ${config.cls}`} style={{ fontSize }}>
      <i className={`bi ${config.icon}`}></i>
      {config.label}
    </span>
  );
}
