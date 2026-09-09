/**
 * SessionMessagingPanel.jsx
 *
 * Admin-only panel rendered inside EmergencyDetail during (and after) an active
 * Live Location session.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * DESIGN CONTRACT
 * ──────────────────────────────────────────────────────────────────────────────
 * This component is ONE HALF of a strictly one-way communication channel:
 *
 *   Admin → resident : presets + free-text  (POST /:id/messages)
 *   Resident → admin : single "I'm Safe" tap (POST /:id/confirm-safe)
 *                      reflected here as `reporterConfirmedSafeAt` on the session
 *
 * The resident side NEVER receives an OS notification, push alert, sound, or
 * vibration for incoming messages.  Delivery is poll-only on the resident's
 * device.  This component itself does not touch the resident's device at all —
 * it only sends to the server and reads back the thread.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * PRESET WORDING POLICY
 * ──────────────────────────────────────────────────────────────────────────────
 * Presets are honest about what CivicFix can actually do (monitor, review).
 * They MUST NOT imply guarantees the platform cannot back up:
 *   ❌  "Help is on the way"
 *   ❌  "Police have been dispatched"
 * If an admin has genuinely confirmed police attendance, they use the free-text
 * field to say so in their own words.
 *
 * Props:
 *   sessionId          {string}        — LiveLocationSession._id
 *   sessionStatus      {string}        — 'active' | 'ended' | 'expired'
 *   confirmedSafeAt    {string|null}   — ISO timestamp or null
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000; // 10 s — matches the location-ping cadence

/**
 * Canned messages.  Honest, calm, and actionable.  See wording policy above.
 */
const PRESETS = [
  "We've seen your report and are monitoring your location.",
  "Please confirm you're safe if you can.",
  'Stay where you are if it\'s safe to do so.',
  "We're reviewing your situation now.",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function fmtFull(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day:    'numeric',
    month:  'long',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SessionMessagingPanel({
  sessionId,
  sessionStatus,
  confirmedSafeAt: confirmedSafeAtProp,
}) {
  const isActive = sessionStatus === 'active';

  // ── Message thread state ──────────────────────────────────────────────────
  const [messages,     setMessages]     = useState([]);
  const [msgLoading,   setMsgLoading]   = useState(true);
  const [msgError,     setMsgError]     = useState('');

  // ── Safe-confirmation — can arrive either from prop (initial session fetch)
  //    or from the poll (resident taps while admin has the panel open).
  const [confirmedSafeAt, setConfirmedSafeAt] = useState(confirmedSafeAtProp ?? null);

  // Keep the prop in sync when the parent re-fetches the session
  useEffect(() => {
    setConfirmedSafeAt(confirmedSafeAtProp ?? null);
  }, [confirmedSafeAtProp]);

  // ── Free-text input ───────────────────────────────────────────────────────
  const [freeText,      setFreeText]      = useState('');
  const [sending,       setSending]       = useState(false); // covers presets + free-text
  const [sendError,     setSendError]     = useState('');
  const [lastSentId,    setLastSentId]    = useState(null);  // flashes green on the sent msg

  // ── Scroll-to-bottom ref ──────────────────────────────────────────────────
  const listBottomRef = useRef(null);

  // ── Fetch / poll messages ─────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await api.get(`/live-location/${sessionId}/messages`);
      setMessages(data.messages ?? []);
      setMsgError('');
    } catch (err) {
      // Only surface the error on first load; silent on subsequent polls so
      // a single network glitch doesn't flash an error at the admin.
      setMsgError((prev) =>
        prev || (err.response?.data?.message ?? 'Could not load messages.')
      );
    } finally {
      setMsgLoading(false);
    }
  }, [sessionId]);

  // ── Also fetch the session itself on each poll to pick up confirmedSafeAt
  //    even if the parent doesn't re-render.
  const fetchSessionSafeFlag = useCallback(async () => {
    try {
      const { data } = await api.get(`/live-location/${sessionId}`);
      if (data?.reporterConfirmedSafeAt) {
        setConfirmedSafeAt(data.reporterConfirmedSafeAt);
      }
    } catch {
      // Non-critical — ignore; we already have the prop value
    }
  }, [sessionId]);

  useEffect(() => {
    fetchMessages();
    fetchSessionSafeFlag();

    if (!isActive) return; // no polling once ended/expired

    const interval = setInterval(() => {
      fetchMessages();
      fetchSessionSafeFlag();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchMessages, fetchSessionSafeFlag, isActive]);

  // ── Auto-scroll to bottom whenever messages grow ──────────────────────────
  useEffect(() => {
    listBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ── Send helpers ──────────────────────────────────────────────────────────

  /**
   * Core send function — used by both presets and free-text.
   * @param {string}  text
   * @param {boolean} isPreset
   */
  const sendMessage = useCallback(async (text, isPreset) => {
    if (sending || !text.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const { data } = await api.post(`/live-location/${sessionId}/messages`, {
        text: text.trim(),
        isPreset,
      });
      // Optimistically append, then refresh to get canonical server doc
      const newMsg = data.data;
      setMessages((prev) => [...prev, newMsg]);
      setLastSentId(newMsg._id);
      setTimeout(() => setLastSentId(null), 2500);
    } catch (err) {
      setSendError(err.response?.data?.message ?? 'Failed to send — please try again.');
    } finally {
      setSending(false);
      // Full refresh to reconcile with any messages that arrived during the send
      fetchMessages();
    }
  }, [sessionId, sending, fetchMessages]);

  const handlePreset = useCallback((text) => {
    sendMessage(text, true);
  }, [sendMessage]);

  const handleFreeText = useCallback((e) => {
    e.preventDefault();
    if (!freeText.trim()) return;
    sendMessage(freeText, false).then(() => setFreeText(''));
  }, [sendMessage, freeText]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      id="session-messaging-panel"
      style={{
        border:        `1.5px solid ${isActive ? '#0B4F6C44' : '#94a3b844'}`,
        borderRadius:  12,
        background:    isActive ? '#f0f7fb' : '#f8fafc',
        marginBottom:  '1.25rem',
        overflow:      'hidden',
      }}
    >

      {/* ── Panel header ───────────────────────────────────────────────────── */}
      <div style={{
        padding:    '0.6rem 1rem',
        background: isActive ? '#0B4F6C' : '#64748b',
        display:    'flex',
        alignItems: 'center',
        gap:        '0.55rem',
      }}>
        <i
          className={`bi ${isActive ? 'bi-chat-square-dots-fill' : 'bi-chat-square-dots'}`}
          style={{ color: isActive ? '#bae6fd' : '#cbd5e1', fontSize: '0.9rem' }}
        />
        <span style={{
          color:      '#fff',
          fontWeight: 700,
          fontSize:   '0.875rem',
          fontFamily: 'var(--cf-font-heading)',
        }}>
          Status Updates to Resident
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize:   '0.7rem',
          color:      isActive ? '#bae6fd' : '#cbd5e1',
          fontStyle:  'italic',
        }}>
          {isActive ? 'Session active — messages delivered silently' : 'Session ended — read-only'}
        </span>
      </div>

      <div style={{ padding: '0.85rem 1rem' }}>

        {/* ── Safe-confirmation banner — shown prominently when set ────────── */}
        {confirmedSafeAt && (
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '0.6rem',
            padding:      '0.6rem 0.9rem',
            marginBottom: '0.85rem',
            background:   '#dcfce7',
            border:       '1.5px solid #16a34a',
            borderRadius: 8,
          }}>
            <i className="bi bi-shield-check-fill" style={{ color: '#15803d', fontSize: '1.1rem', flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#14532d' }}>
                Resident confirmed safe
              </p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534' }}>
                at {fmtFull(confirmedSafeAt)}
              </p>
            </div>
            <span style={{
              marginLeft:   'auto',
              fontSize:     '0.7rem',
              color:        '#166534',
              fontStyle:    'italic',
              textAlign:    'right',
              flexShrink:   0,
            }}>
              Tracking still active
            </span>
          </div>
        )}

        {/* ── Message history ───────────────────────────────────────────────── */}
        <div style={{
          maxHeight:    240,
          overflowY:    'auto',
          marginBottom: '0.85rem',
          borderRadius: 6,
          border:       '1px solid var(--cf-border-light)',
          background:   'var(--cf-surface)',
        }}>
          {msgLoading ? (
            <div style={{
              display:    'flex',
              alignItems: 'center',
              gap:        '0.6rem',
              padding:    '1rem',
              color:      'var(--cf-text-muted)',
              fontSize:   '0.82rem',
            }}>
              <div className="cf-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              Loading messages…
            </div>
          ) : msgError ? (
            <div style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: '#b91c1c' }}>
              <i className="bi bi-exclamation-circle me-1" />
              {msgError}
            </div>
          ) : messages.length === 0 ? (
            <p style={{
              margin:   0,
              padding:  '0.85rem 1rem',
              fontSize: '0.8rem',
              color:    'var(--cf-text-muted)',
              fontStyle:'italic',
            }}>
              No messages sent yet.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: '0.4rem 0', listStyle: 'none' }}>
              {messages.map((msg) => {
                const isNew = msg._id === lastSentId;
                return (
                  <li
                    key={msg._id}
                    style={{
                      padding:         '0.45rem 0.9rem',
                      borderBottom:    '1px solid var(--cf-border-light)',
                      transition:      'background 600ms',
                      background:      isNew ? '#dcfce7' : 'transparent',
                    }}
                  >
                    {/* Message text */}
                    <p style={{
                      margin:     '0 0 0.15rem',
                      fontSize:   '0.85rem',
                      color:      'var(--cf-text)',
                      lineHeight: 1.5,
                    }}>
                      {msg.isPreset && (
                        <span style={{
                          display:      'inline-block',
                          marginRight:  '0.3rem',
                          fontSize:     '0.65rem',
                          fontWeight:   700,
                          textTransform:'uppercase',
                          letterSpacing:'0.04em',
                          color:        '#0B4F6C',
                          background:   '#d6eaf3',
                          borderRadius: 4,
                          padding:      '0.05rem 0.3rem',
                          verticalAlign:'middle',
                        }}>
                          Preset
                        </span>
                      )}
                      {msg.text}
                    </p>
                    {/* Metadata row */}
                    <p style={{
                      margin:   0,
                      fontSize: '0.7rem',
                      color:    'var(--cf-text-muted)',
                      display:  'flex',
                      gap:      '0.5rem',
                    }}>
                      <i className="bi bi-person-fill" />
                      {msg.sender?.name ?? 'Admin'}
                      <span>·</span>
                      <i className="bi bi-clock" />
                      {fmtTime(msg.createdAt)}
                    </p>
                  </li>
                );
              })}
              {/* Anchor for auto-scroll */}
              <li ref={listBottomRef} style={{ padding: 0, border: 'none' }} />
            </ul>
          )}
        </div>

        {/* ── Active-only sending UI ─────────────────────────────────────────
             Replaced with a read-only note once the session has ended/expired  */}
        {isActive ? (
          <>
            {/* Send error */}
            {sendError && (
              <div style={{
                padding:      '0.4rem 0.7rem',
                marginBottom: '0.65rem',
                background:   '#fff5f5',
                border:       '1px solid #fecaca',
                borderRadius: 6,
                fontSize:     '0.8rem',
                color:        '#b91c1c',
                display:      'flex',
                alignItems:   'center',
                gap:          '0.35rem',
              }}>
                <i className="bi bi-exclamation-circle-fill" />
                {sendError}
              </div>
            )}

            {/* ── Preset buttons ─────────────────────────────────────────── */}
            <p style={{
              margin:        '0 0 0.45rem',
              fontSize:      '0.72rem',
              fontWeight:    700,
              color:         'var(--cf-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              <i className="bi bi-lightning-fill me-1" style={{ color: '#F2A541' }} />
              Quick send — no confirmation
            </p>
            <div style={{
              display:       'flex',
              flexDirection: 'column',
              gap:           '0.4rem',
              marginBottom:  '0.85rem',
            }}>
              {PRESETS.map((text) => (
                <button
                  key={text}
                  onClick={() => handlePreset(text)}
                  disabled={sending}
                  title={text}
                  style={{
                    textAlign:    'left',
                    padding:      '0.45rem 0.75rem',
                    borderRadius: 7,
                    border:       '1.5px solid #0B4F6C44',
                    background:   '#fff',
                    color:        '#0B4F6C',
                    fontSize:     '0.82rem',
                    fontWeight:   500,
                    cursor:       sending ? 'not-allowed' : 'pointer',
                    opacity:      sending ? 0.65 : 1,
                    lineHeight:   1.45,
                    transition:   'background 140ms, border-color 140ms',
                    display:      'flex',
                    alignItems:   'flex-start',
                    gap:          '0.45rem',
                  }}
                  onMouseEnter={(e) => {
                    if (!sending) {
                      e.currentTarget.style.background    = '#d6eaf3';
                      e.currentTarget.style.borderColor   = '#0B4F6C88';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background    = '#fff';
                    e.currentTarget.style.borderColor   = '#0B4F6C44';
                  }}
                >
                  <i className="bi bi-send" style={{ flexShrink: 0, marginTop: '0.1rem', fontSize: '0.8rem' }} />
                  {text}
                </button>
              ))}
            </div>

            {/* ── Free-text fallback ────────────────────────────────────── */}
            <p style={{
              margin:        '0 0 0.4rem',
              fontSize:      '0.72rem',
              fontWeight:    700,
              color:         'var(--cf-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              <i className="bi bi-keyboard me-1" />
              Custom message
            </p>
            <form
              id="session-messaging-freetext"
              onSubmit={handleFreeText}
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}
            >
              <textarea
                id="session-messaging-input"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => {
                  // Ctrl/Cmd+Enter submits; plain Enter adds a newline
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleFreeText(e);
                  }
                }}
                placeholder="Type a message… (Ctrl+Enter to send)"
                rows={2}
                maxLength={500}
                disabled={sending}
                style={{
                  flex:         1,
                  resize:       'vertical',
                  padding:      '0.5rem 0.7rem',
                  border:       '1.5px solid var(--cf-border)',
                  borderRadius: 'var(--cf-radius-md)',
                  fontSize:     '0.875rem',
                  fontFamily:   'var(--cf-font-body)',
                  color:        'var(--cf-text)',
                  background:   'var(--cf-surface)',
                  outline:      'none',
                  lineHeight:   1.5,
                  transition:   'border-color 150ms, box-shadow 150ms',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--cf-primary)';
                  e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(11,79,108,.12)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--cf-border)';
                  e.currentTarget.style.boxShadow   = 'none';
                }}
              />
              <button
                type="submit"
                id="session-messaging-send"
                disabled={sending || !freeText.trim()}
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          '0.3rem',
                  padding:      '0.5rem 0.9rem',
                  borderRadius: 'var(--cf-radius-md)',
                  border:       'none',
                  background:   '#0B4F6C',
                  color:        '#fff',
                  fontWeight:   700,
                  fontSize:     '0.82rem',
                  cursor:       (sending || !freeText.trim()) ? 'not-allowed' : 'pointer',
                  opacity:      (sending || !freeText.trim()) ? 0.55 : 1,
                  flexShrink:   0,
                  alignSelf:    'flex-end',
                  transition:   'background 140ms',
                }}
                onMouseEnter={(e) => {
                  if (!sending && freeText.trim()) e.currentTarget.style.background = '#083a52';
                }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0B4F6C'; }}
              >
                {sending
                  ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                  : <i className="bi bi-send-fill" />
                }
                Send
              </button>
            </form>

            {/* Character count */}
            <p style={{
              margin:    '0.3rem 0 0',
              fontSize:  '0.7rem',
              color:     freeText.length > 450 ? '#b91c1c' : 'var(--cf-text-muted)',
              textAlign: 'right',
            }}>
              {freeText.length}/500
            </p>
          </>
        ) : (
          /* ── Read-only notice — session ended/expired ───────────────────── */
          <div style={{
            display:    'flex',
            alignItems: 'center',
            gap:        '0.5rem',
            padding:    '0.6rem 0.8rem',
            background: '#f1f5f9',
            borderRadius: 6,
            fontSize:   '0.8rem',
            color:      '#475569',
          }}>
            <i className="bi bi-lock-fill" style={{ flexShrink: 0 }} />
            Session {sessionStatus} — message history preserved for review, but no new messages can be sent.
          </div>
        )}
      </div>
    </div>
  );
}
