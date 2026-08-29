/**
 * Notifications.jsx — /notifications
 *
 * Full paginated list of the logged-in user's notifications.
 * Available to any authenticated user (resident, admin, staff).
 *
 * Features:
 *  • Unread / All toggle filter
 *  • "Mark all as read" button
 *  • Clicking a notification marks it read and navigates to /issue/:id
 *  • Pagination
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// Use DashboardLayout as the shell — it's the shared authenticated layout
import DashboardLayout from '../components/DashboardLayout';

export default function Notifications() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [pages,         setPages]         = useState(1);
  const [loading,       setLoading]       = useState(true);
  const [onlyUnread,    setOnlyUnread]    = useState(false);
  const [markingAll,    setMarkingAll]    = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(() => {
    setLoading(true);
    api.get(`/notifications?page=${page}&unread=${onlyUnread}`)
      .then(({ data }) => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, onlyUnread]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Reset to page 1 when filter changes
  useEffect(() => { setPage(1); }, [onlyUnread]);

  // ── Mark single as read + navigate ──────────────────────────────────────
  const handleClick = async (notif) => {
    if (!notif.read) {
      try {
        await api.put(`/notifications/${notif._id}/read`);
        setNotifications((prev) =>
          prev.map((n) => n._id === notif._id ? { ...n, read: true } : n)
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch { /* ignore */ }
    }
    navigate(`/issue/${notif.issue?._id || notif.issue}`);
  };

  // ── Mark all as read ────────────────────────────────────────────────────
  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await api.put('/notifications/read-all');
      setUnreadCount(0);
      fetchNotifications();
    } catch { /* ignore */ }
    setMarkingAll(false);
  };

  return (
    <DashboardLayout title="Notifications">
      <div style={{ maxWidth: 680 }}>

        {/* ── Toolbar ────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          marginBottom: '1.25rem', flexWrap: 'wrap',
        }}>
          {/* Filter toggle */}
          <div style={{
            display: 'flex', background: 'var(--cf-surface)',
            border: '1.5px solid var(--cf-border)', borderRadius: 'var(--cf-radius-md)',
            overflow: 'hidden',
          }}>
            {[
              { label: 'All',    value: false },
              { label: 'Unread', value: true  },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setOnlyUnread(value)}
                style={{
                  padding: '0.45rem 1rem',
                  border: 'none', cursor: 'pointer',
                  fontSize: '0.8375rem', fontWeight: onlyUnread === value ? 700 : 400,
                  background: onlyUnread === value ? 'var(--cf-primary)' : 'transparent',
                  color:      onlyUnread === value ? '#fff' : 'var(--cf-text-secondary)',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {label}
                {label === 'Unread' && unreadCount > 0 && (
                  <span style={{
                    marginLeft: '0.4rem',
                    background: onlyUnread ? 'rgba(255,255,255,0.25)' : 'var(--cf-primary-light)',
                    color:      onlyUnread ? '#fff' : 'var(--cf-primary)',
                    borderRadius: 999, padding: '0 0.4rem',
                    fontSize: '0.7rem', fontWeight: 700,
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Mark all read */}
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              disabled={markingAll}
              className="cf-btn cf-btn-outline"
              style={{ fontSize: '0.8125rem', padding: '0.45rem 1rem' }}
            >
              {markingAll
                ? <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" /> Marking…</>
                : <><i className="bi bi-check2-all" /> Mark all read</>
              }
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--cf-text-muted)' }}>
            {total} notification{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── List ───────────────────────────────────────────────────── */}
        <div className="cf-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <div className="cf-spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--cf-text-muted)' }}>
              <i className="bi bi-bell-slash" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }} />
              {onlyUnread ? 'No unread notifications' : 'No notifications yet'}
            </div>
          ) : (
            notifications.map((notif, i) => (
              <button
                key={notif._id}
                onClick={() => handleClick(notif)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  width: '100%', textAlign: 'left',
                  padding: '0.9rem 1.1rem',
                  background: notif.read ? 'transparent' : 'var(--cf-primary-light)',
                  border: 'none',
                  borderBottom: i < notifications.length - 1 ? '1px solid var(--cf-border-light)' : 'none',
                  cursor: 'pointer', transition: 'background 120ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cf-bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = notif.read ? 'transparent' : 'var(--cf-primary-light)')}
              >
                {/* Unread dot */}
                <div style={{ paddingTop: 4, flexShrink: 0 }}>
                  {notif.read
                    ? <i className="bi bi-bell" style={{ fontSize: '1rem', color: 'var(--cf-text-muted)' }} />
                    : <i className="bi bi-bell-fill" style={{ fontSize: '1rem', color: 'var(--cf-primary)' }} />
                  }
                </div>

                <div style={{ flex: 1 }}>
                  <p style={{
                    margin: '0 0 0.2rem',
                    fontSize: '0.875rem',
                    fontWeight: notif.read ? 400 : 600,
                    color: 'var(--cf-text)',
                    lineHeight: 1.45,
                  }}>
                    {notif.message}
                  </p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--cf-text-muted)' }}>
                    {new Date(notif.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>

                <i className="bi bi-chevron-right" style={{ color: 'var(--cf-text-muted)', fontSize: '0.75rem', paddingTop: 4, flexShrink: 0 }} />
              </button>
            ))
          )}
        </div>

        {/* ── Pagination ─────────────────────────────────────────────── */}
        {pages > 1 && (
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '1rem', alignItems: 'center' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="cf-btn cf-btn-outline"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            >
              <i className="bi bi-chevron-left" />
            </button>
            {[...Array(pages)].map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                style={{
                  width: 32, height: 32, borderRadius: 6, border: '1.5px solid',
                  fontSize: '0.82rem', cursor: 'pointer',
                  fontWeight: page === i + 1 ? 700 : 400,
                  background:   page === i + 1 ? 'var(--cf-primary)' : 'var(--cf-surface)',
                  color:        page === i + 1 ? '#fff' : 'var(--cf-text)',
                  borderColor:  page === i + 1 ? 'var(--cf-primary)' : 'var(--cf-border)',
                }}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="cf-btn cf-btn-outline"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
            >
              <i className="bi bi-chevron-right" />
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
