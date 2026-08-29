/**
 * NotificationBell.jsx
 *
 * A bell icon in the sidebar footer area (or any nav header) that:
 *  • Fetches the 5 most recent notifications on mount + polls every 30 s
 *  • Shows an unread-count badge
 *  • Opens a small dropdown on click with:
 *      - The 5 most recent notifications, each linking to /issue/:id
 *      - "Mark all as read" action
 *      - "View all" link → /notifications
 *  • Calls PUT /api/notifications/:id/read on individual click
 *
 * Designed to be dropped into any layout sidebar footer.
 * Requires the user to be logged in (only mount when useAuth().user is truthy).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [open,          setOpen]          = useState(false);
  const dropdownRef = useRef(null);
  const navigate    = useNavigate();

  // ── Fetch latest 5 notifications + unread count ─────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications?page=1');
      // We only need 5 for the dropdown preview; full list lives on /notifications
      setNotifications((data.notifications || []).slice(0, 5));
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Silently fail — bell should not break the layout
    }
  }, []);

  // On mount + polling
  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // ── Mark single as read then navigate ───────────────────────────────────
  const handleNotifClick = async (notif) => {
    setOpen(false);
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
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* ── Bell button ──────────────────────────────────────────────── */}
      <button
        id="cf-notif-bell"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        style={{
          position:   'relative',
          background: 'rgba(255,255,255,0.08)',
          border:     '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color:   'rgba(255,255,255,0.75)',
          cursor:  'pointer',
          transition: 'background 150ms',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
      >
        <i className="bi bi-bell" style={{ fontSize: '1rem' }} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 16, height: 16, borderRadius: 999,
            background: 'var(--cf-status-rejected)',
            color: '#fff', fontSize: '0.6rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', border: '2px solid transparent',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown ─────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'absolute',
          bottom: '110%',
          left: 0,
          width: 300,
          background: 'var(--cf-surface)',
          border: '1px solid var(--cf-border)',
          borderRadius: 'var(--cf-radius-lg)',
          boxShadow: 'var(--cf-shadow-lg)',
          zIndex: 9999,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '0.65rem 0.9rem',
            borderBottom: '1px solid var(--cf-border-light)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--cf-text)' }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{
                  marginLeft: '0.4rem',
                  background: 'var(--cf-primary-light)', color: 'var(--cf-primary)',
                  borderRadius: 999, padding: '0.1rem 0.45rem',
                  fontSize: '0.7rem', fontWeight: 600,
                }}>
                  {unreadCount} new
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.75rem', color: 'var(--cf-primary)', fontWeight: 600,
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '1.5rem', textAlign: 'center',
                color: 'var(--cf-text-muted)', fontSize: '0.8125rem',
              }}>
                <i className="bi bi-bell-slash" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.4rem' }} />
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif._id}
                  onClick={() => handleNotifClick(notif)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '0.65rem 0.9rem',
                    background: notif.read ? 'transparent' : 'var(--cf-primary-light)',
                    border: 'none', borderBottom: '1px solid var(--cf-border-light)',
                    cursor: 'pointer', transition: 'background 120ms',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cf-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = notif.read ? 'transparent' : 'var(--cf-primary-light)')}
                >
                  {!notif.read && (
                    <span style={{
                      display: 'inline-block', width: 7, height: 7,
                      borderRadius: '50%', background: 'var(--cf-primary)',
                      marginRight: '0.5rem', verticalAlign: 'middle', flexShrink: 0,
                    }} />
                  )}
                  <span style={{ fontSize: '0.8125rem', color: 'var(--cf-text)', lineHeight: 1.45 }}>
                    {notif.message}
                  </span>
                  <div style={{ fontSize: '0.7rem', color: 'var(--cf-text-muted)', marginTop: '0.2rem' }}>
                    {new Date(notif.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer — View all */}
          <div style={{
            padding: '0.55rem 0.9rem',
            borderTop: '1px solid var(--cf-border-light)',
            textAlign: 'center',
          }}>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cf-primary)' }}
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
