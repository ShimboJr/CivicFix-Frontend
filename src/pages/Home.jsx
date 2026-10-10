import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import PublicNav from '../components/PublicNav';
import api from '../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatStat(n) {
  if (n < 50) return String(n);
  if (n < 1000) return `${Math.floor(n / 10) * 10}+`;
  return `${(Math.floor(n / 100) * 100).toLocaleString()}+`;
}

const FALLBACK = {
  totalIssues: '2,400+',
  resolvedIssues: '1,800+',
  activeCitizens: '12,000+',
};

// ─── Live Location Map Demo (pure CSS/SVG animation) ─────────────────────────
function LiveLocationMapDemo() {
  const [pingCount, setPingCount] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const pingTimer = setInterval(() => {
      setPingCount((c) => c + 1);
      setPulseKey((k) => k + 1);
    }, 4000);
    return () => clearInterval(pingTimer);
  }, []);

  const fmtElapsed = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div style={{
      position: 'relative',
      borderRadius: 20,
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #e8f4f8 0%, #d6eaf3 100%)',
      border: '1px solid rgba(11,79,108,0.15)',
      boxShadow: '0 20px 60px rgba(11,79,108,0.18), 0 4px 16px rgba(11,79,108,0.1)',
      height: 380,
    }}>
      {/* Map background (grid pattern) */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(11,79,108,0.08)" strokeWidth="1"/>
          </pattern>
          <radialGradient id="pulseGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0B4F6C" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#0B4F6C" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)"/>

        {/* Road-like lines for map feel */}
        <line x1="0" y1="140" x2="100%" y2="140" stroke="rgba(255,255,255,0.7)" strokeWidth="12"/>
        <line x1="0" y1="280" x2="100%" y2="280" stroke="rgba(255,255,255,0.7)" strokeWidth="8"/>
        <line x1="120" y1="0" x2="120" y2="100%" stroke="rgba(255,255,255,0.7)" strokeWidth="10"/>
        <line x1="320" y1="0" x2="320" y2="100%" stroke="rgba(255,255,255,0.6)" strokeWidth="7"/>

        {/* Road dashes */}
        <line x1="0" y1="140" x2="100%" y2="140" stroke="rgba(11,79,108,0.15)" strokeWidth="1" strokeDasharray="20,15"/>
        <line x1="120" y1="0" x2="120" y2="100%" stroke="rgba(11,79,108,0.15)" strokeWidth="1" strokeDasharray="20,15"/>

        {/* Building blocks */}
        <rect x="20" y="20" width="80" height="50" rx="4" fill="rgba(11,79,108,0.06)" stroke="rgba(11,79,108,0.1)" strokeWidth="1"/>
        <rect x="20" y="170" width="60" height="80" rx="4" fill="rgba(11,79,108,0.06)" stroke="rgba(11,79,108,0.1)" strokeWidth="1"/>
        <rect x="150" y="20" width="140" height="100" rx="4" fill="rgba(11,79,108,0.06)" stroke="rgba(11,79,108,0.1)" strokeWidth="1"/>
        <rect x="150" y="170" width="100" height="90" rx="4" fill="rgba(11,79,108,0.06)" stroke="rgba(11,79,108,0.1)" strokeWidth="1"/>
        <rect x="340" y="20" width="90" height="65" rx="4" fill="rgba(11,79,108,0.06)" stroke="rgba(11,79,108,0.1)" strokeWidth="1"/>
        <rect x="340" y="170" width="120" height="90" rx="4" fill="rgba(11,79,108,0.06)" stroke="rgba(11,79,108,0.1)" strokeWidth="1"/>
        <rect x="20" y="300" width="100%" height="80" rx="0" fill="rgba(11,79,108,0.04)"/>

        {/* Admin watcher marker */}
        <circle cx="330" cy="260" r="18" fill="rgba(242,165,65,0.15)" stroke="#F2A541" strokeWidth="2"/>
        <text x="330" y="264" textAnchor="middle" fontSize="14" fill="#F2A541">👮</text>

        {/* Animated pulse rings around user */}
        <circle key={`ring1-${pulseKey}`} cx="220" cy="185" r="8" fill="none" stroke="#0B4F6C" strokeWidth="2"
          style={{ animation: 'liveRingExpand 2s ease-out infinite', opacity: 0 }}/>
        <circle key={`ring2-${pulseKey}`} cx="220" cy="185" r="8" fill="none" stroke="#0B4F6C" strokeWidth="1.5"
          style={{ animation: 'liveRingExpand 2s ease-out 0.5s infinite', opacity: 0 }}/>
        <circle key={`ring3-${pulseKey}`} cx="220" cy="185" r="8" fill="none" stroke="#0B4F6C" strokeWidth="1"
          style={{ animation: 'liveRingExpand 2s ease-out 1s infinite', opacity: 0 }}/>

        {/* Accuracy circle */}
        <circle cx="220" cy="185" r="35" fill="rgba(11,79,108,0.08)" stroke="rgba(11,79,108,0.2)" strokeWidth="1" strokeDasharray="4,3"/>

        {/* User dot */}
        <circle cx="220" cy="185" r="10" fill="#0B4F6C" stroke="#fff" strokeWidth="3"/>
        <circle cx="220" cy="185" r="4" fill="#fff"/>

        {/* Signal line from user to admin */}
        <line x1="220" y1="185" x2="330" y2="260" stroke="#F2A541" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.6"
          style={{ animation: 'dashFlow 1.5s linear infinite' }}/>
      </svg>

      {/* Live Status Badge */}
      <div style={{
        position: 'absolute', top: 16, left: 16,
        background: '#0B4F6C', borderRadius: 10, padding: '0.5rem 0.85rem',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        boxShadow: '0 4px 12px rgba(11,79,108,0.3)',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: '#4ade80',
          animation: 'liveDot 1.4s ease-in-out infinite',
          boxShadow: '0 0 6px #4ade80',
        }}/>
        <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em' }}>
          LIVE
        </span>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>
          {fmtElapsed(elapsed)}
        </span>
      </div>

      {/* Ping counter */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
        borderRadius: 10, padding: '0.5rem 0.85rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', gap: '0.4rem',
      }}>
        <i className="bi bi-arrow-up-circle-fill" style={{ color: '#0B4F6C', fontSize: '0.85rem' }}/>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0B4F6C' }}>
          {pingCount} pings sent
        </span>
      </div>

      {/* User info card */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(10px)',
        borderRadius: 12, padding: '0.7rem 1rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        minWidth: 180,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'linear-gradient(135deg, #0B4F6C, #1a7fa8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '0.7rem', fontWeight: 700,
          }}>AO</div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1a202c' }}>Amara Okafor</div>
            <div style={{ fontSize: '0.68rem', color: '#6b7280' }}>Sharing location</div>
          </div>
        </div>
        <div style={{ fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <i className="bi bi-geo-alt-fill" style={{ color: '#0B4F6C' }}/>
          Victoria Island, Lagos
        </div>
      </div>

      {/* Admin monitoring badge */}
      <div style={{
        position: 'absolute', bottom: 16, right: 16,
        background: 'rgba(242,165,65,0.15)', border: '1.5px solid rgba(242,165,65,0.5)',
        borderRadius: 10, padding: '0.5rem 0.75rem',
        display: 'flex', alignItems: 'center', gap: '0.4rem',
      }}>
        <i className="bi bi-shield-check-fill" style={{ color: '#F2A541', fontSize: '0.85rem' }}/>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#d4882a' }}>
          Admin monitoring
        </span>
      </div>

      {/* Accuracy label */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '55%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(11,79,108,0.85)',
        color: '#fff', fontSize: '0.65rem', fontWeight: 600,
        borderRadius: 20, padding: '0.2rem 0.55rem',
        whiteSpace: 'nowrap', marginTop: 42,
        pointerEvents: 'none',
      }}>
        ±12m accuracy
      </div>

      {/* CSS animations embedded inline via style tag trick via a style element */}
      <style>{`
        @keyframes liveRingExpand {
          0%   { r: 10; opacity: 0.8; }
          100% { r: 55; opacity: 0; }
        }
        @keyframes liveDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.7); }
        }
        @keyframes dashFlow {
          to { stroke-dashoffset: -20; }
        }
        @keyframes live-ping {
          0%   { box-shadow: 0 0 0 0 rgba(11,79,108,0.4); }
          70%  { box-shadow: 0 0 0 14px rgba(11,79,108,0); }
          100% { box-shadow: 0 0 0 0 rgba(11,79,108,0); }
        }
        @keyframes floatUp {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lls-feature-card {
          transition: transform 220ms ease, box-shadow 220ms ease;
        }
        .lls-feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 40px rgba(11,79,108,0.15) !important;
        }
        .lls-step-item {
          transition: transform 200ms ease;
        }
        .lls-step-item:hover {
          transform: scale(1.03);
        }
        .lls-cta-btn {
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }
        .lls-cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(11,79,108,0.35) !important;
        }
        .lls-section-animate {
          animation: fadeInUp 0.6s ease both;
        }
      `}</style>
    </div>
  );
}

// ─── Feature Card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, iconBg, title, description, delay = '0s' }) {
  return (
    <div
      className="lls-feature-card cf-card"
      style={{
        padding: '1.5rem',
        borderRadius: 16,
        boxShadow: '0 4px 20px rgba(11,79,108,0.08)',
        animationDelay: delay,
        animation: 'fadeInUp 0.6s ease both',
        animationFillMode: 'both',
      }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '1rem',
        animation: 'floatUp 3s ease-in-out infinite',
        animationDelay: delay,
      }}>
        <i className={`bi ${icon}`} style={{ fontSize: '1.4rem', color: '#0B4F6C' }}/>
      </div>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.45rem', color: 'var(--cf-text)' }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--cf-text-secondary)', lineHeight: 1.65, margin: 0 }}>
        {description}
      </p>
    </div>
  );
}

// ─── How It Works Step ────────────────────────────────────────────────────────
function HowItWorksStep({ step, icon, title, description, isLast }) {
  return (
    <div className="lls-step-item" style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #0B4F6C, #1a7fa8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 800, fontSize: '1rem',
          boxShadow: '0 4px 16px rgba(11,79,108,0.3)',
          flexShrink: 0,
        }}>
          <i className={`bi ${icon}`} style={{ fontSize: '1.1rem' }}/>
        </div>
        {!isLast && (
          <div style={{
            width: 2, height: 40, marginTop: 6,
            background: 'linear-gradient(to bottom, #0B4F6C40, transparent)',
          }}/>
        )}
      </div>
      <div style={{ paddingTop: '0.7rem' }}>
        <div style={{
          display: 'inline-block', background: 'var(--cf-primary-light)',
          color: 'var(--cf-primary)', fontSize: '0.7rem', fontWeight: 700,
          letterSpacing: '0.06em', borderRadius: 999, padding: '0.15rem 0.55rem',
          marginBottom: '0.35rem',
        }}>
          STEP {step}
        </div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--cf-text)' }}>
          {title}
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--cf-text-secondary)', lineHeight: 1.65, margin: 0 }}>
          {description}
        </p>
      </div>
    </div>
  );
}

// ─── Trust Indicator ──────────────────────────────────────────────────────────
function TrustBadge({ icon, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.5rem 1rem',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 999,
    }}>
      <i className={`bi ${icon}`} style={{ color: '#F2A541', fontSize: '0.9rem' }}/>
      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.82rem', fontWeight: 500 }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main Home Component ──────────────────────────────────────────────────────
export default function Home() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .get('/public/stats')
      .then(({ data }) => setStats(data))
      .catch(() => {
        console.warn('Could not fetch live homepage stats; using fallback values.');
      });
  }, []);

  const display = {
    totalIssues:    stats ? formatStat(stats.totalIssues)    : FALLBACK.totalIssues,
    resolvedIssues: stats ? formatStat(stats.resolvedIssues) : FALLBACK.resolvedIssues,
    activeCitizens: stats ? formatStat(stats.activeCitizens) : FALLBACK.activeCitizens,
  };

  const statItems = [
    { label: 'Issues Reported',  value: display.totalIssues,    icon: 'bi-flag-fill' },
    { label: 'Issues Resolved',  value: display.resolvedIssues, icon: 'bi-check-circle-fill' },
    { label: 'Active Citizens',  value: display.activeCitizens, icon: 'bi-people-fill' },
  ];

  const features = [
    {
      icon: 'bi-broadcast',
      iconBg: 'linear-gradient(135deg, #d6eaf3, #b8d9ec)',
      title: 'Real-Time GPS Tracking',
      description: 'High-accuracy GPS updates sent every 12 seconds to our monitoring team — so help always knows exactly where you are.',
      delay: '0.05s',
    },
    {
      icon: 'bi-shield-lock-fill',
      iconBg: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
      title: 'Privacy-First Design',
      description: 'Location sharing is strictly opt-in, session-bound, and auto-expires. Your data is never stored after a session ends.',
      delay: '0.1s',
    },
    {
      icon: 'bi-clock-history',
      iconBg: 'linear-gradient(135deg, #fef3e2, #fde68a)',
      title: 'Flexible Session Duration',
      description: 'Start with a 30-minute session and extend up to 8 hours in-app. You can stop sharing at any moment with one tap.',
      delay: '0.15s',
    },
    {
      icon: 'bi-chat-square-text-fill',
      iconBg: 'linear-gradient(135deg, #ede9fe, #ddd6fe)',
      title: 'Admin Messaging',
      description: 'Receive quiet check-in messages from the monitoring team while sharing. No distracting sounds — just discreet, visible updates.',
      delay: '0.2s',
    },
    {
      icon: 'bi-wifi-off',
      iconBg: 'linear-gradient(135deg, #fce7f3, #fbcfe8)',
      title: 'Offline-Resilient Pings',
      description: 'Pings use navigator.sendBeacon where supported, surviving brief network drops and screen locks to keep your signal alive.',
      delay: '0.25s',
    },
    {
      icon: 'bi-check2-circle',
      iconBg: 'linear-gradient(135deg, #cffafe, #a5f3fc)',
      title: '"I\'m Safe" Confirmation',
      description: 'Instantly notify your monitoring team you\'re safe without stopping location sharing — keeping both you and them informed.',
      delay: '0.3s',
    },
  ];

  const steps = [
    {
      step: 1, icon: 'bi-file-earmark-text',
      title: 'Submit an Emergency Report',
      description: 'Report your emergency with details, photos, or a short video. Our team is alerted immediately.',
    },
    {
      step: 2, icon: 'bi-geo-alt-fill',
      title: 'Activate Live Location Sharing',
      description: 'Choose to share your GPS location in real time. A secure, timed session begins — fully in your control.',
    },
    {
      step: 3, icon: 'bi-eye-fill',
      title: 'Admin Team Monitors Your Position',
      description: 'Our staff see your location on a live map and can send you discreet check-in messages at any time.',
    },
    {
      step: 4, icon: 'bi-shield-check-fill',
      title: 'Stop Sharing When You\'re Safe',
      description: 'Tap "I\'m Safe" to notify the team, or simply end the session. Sharing stops and all location data is cleared.',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cf-bg)' }}>
      <PublicNav />

      {/* ── HERO SECTION ─────────────────────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(160deg, #0B4F6C 0%, #083a52 55%, #052b3d 100%)',
        padding: '5rem 1.5rem 4rem',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative background orbs */}
        <div style={{
          position: 'absolute', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(242,165,65,0.12) 0%, transparent 70%)',
          top: -100, right: -80, pointerEvents: 'none',
        }}/>
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
          bottom: -60, left: -40, pointerEvents: 'none',
        }}/>

        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '3rem', alignItems: 'center',
          }}
            className="hero-grid"
          >
            {/* Left — copy */}
            <div style={{ animation: 'slideInLeft 0.7s ease both' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'rgba(242,165,65,0.15)', border: '1px solid rgba(242,165,65,0.35)',
                borderRadius: 999, padding: '0.3rem 0.9rem',
                fontSize: '0.78rem', fontWeight: 700, color: '#F2A541',
                marginBottom: '1.5rem', letterSpacing: '0.04em',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', background: '#4ade80',
                  animation: 'liveDot 1.4s ease-in-out infinite',
                }}/>
                NOW LIVE — Real-Time Location Sharing
              </div>

              <h1 style={{
                fontSize: 'clamp(2rem, 4vw, 2.9rem)',
                fontWeight: 800, lineHeight: 1.18,
                color: '#fff', marginBottom: '1.25rem',
                fontFamily: 'var(--cf-font-heading)',
              }}>
                Your Community.<br/>
                <span style={{
                  background: 'linear-gradient(90deg, #F2A541, #f8c97a)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>Your Safety.</span>{' '}
                Our Priority.
              </h1>

              <p style={{
                color: 'rgba(255,255,255,0.75)', fontSize: '1.05rem',
                lineHeight: 1.75, marginBottom: '2rem', maxWidth: 480,
              }}>
                Report potholes, broken streetlights, water leaks — and in emergencies,
                share your real-time GPS location with our monitoring team so help
                always knows where you are.
              </p>

              <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
                <Link
                  to="/register"
                  className="cf-btn lls-cta-btn"
                  style={{
                    background: 'linear-gradient(135deg, #F2A541, #f8c97a)',
                    color: '#0B4F6C', padding: '0.85rem 1.75rem',
                    fontSize: '0.95rem', fontWeight: 700,
                    boxShadow: '0 4px 20px rgba(242,165,65,0.4)',
                    borderRadius: 10,
                  }}
                >
                  <i className="bi bi-shield-plus"/>  Get Started Free
                </Link>
                <Link
                  to="/issues"
                  className="cf-btn lls-cta-btn"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: '#fff', border: '1.5px solid rgba(255,255,255,0.25)',
                    padding: '0.85rem 1.75rem', fontSize: '0.95rem',
                    borderRadius: 10,
                  }}
                >
                  Browse Issues <i className="bi bi-arrow-right"/>
                </Link>
              </div>

              {/* Trust indicators */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                <TrustBadge icon="bi-lock-fill" label="End-to-end encrypted"/>
                <TrustBadge icon="bi-geo-alt-fill" label="GPS ±5m accuracy"/>
                <TrustBadge icon="bi-clock" label="Auto-expires safely"/>
              </div>
            </div>

            {/* Right — animated map demo */}
            <div style={{ animation: 'slideInRight 0.7s ease 0.1s both' }}>
              <LiveLocationMapDemo />
            </div>
          </div>

          {/* Stat strip */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '0rem',
            marginTop: '4rem', paddingTop: '2.5rem',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            flexWrap: 'wrap',
          }}>
            {statItems.map(({ label, value, icon }, idx) => (
              <div key={label} style={{
                textAlign: 'center', flex: '1 1 160px',
                padding: '0 2rem',
                borderRight: idx < statItems.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                animation: 'fadeInUp 0.6s ease both',
                animationDelay: `${0.2 + idx * 0.1}s`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <i className={`bi ${icon}`} style={{ color: '#F2A541', fontSize: '1rem' }}/>
                </div>
                <div style={{
                  fontSize: 'clamp(1.6rem, 3vw, 2.1rem)', fontWeight: 800,
                  color: '#fff', fontFamily: 'var(--cf-font-heading)',
                  lineHeight: 1.1,
                }}>{value}</div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.3rem', fontWeight: 500 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE LOCATION FEATURE SHOWCASE ───────────────────────────────── */}
      <section style={{ padding: '5rem 1.5rem', background: 'var(--cf-bg)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: '3.5rem', animation: 'fadeInUp 0.6s ease both' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              background: 'var(--cf-accent-light)', color: 'var(--cf-accent-dark)',
              borderRadius: 999, padding: '0.35rem 1rem',
              fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em',
              marginBottom: '1rem',
            }}>
              <i className="bi bi-broadcast-pin"/> FEATURE SPOTLIGHT
            </div>
            <h2 style={{
              fontSize: 'clamp(1.7rem, 3.5vw, 2.4rem)', fontWeight: 800,
              color: 'var(--cf-text)', marginBottom: '0.75rem',
              fontFamily: 'var(--cf-font-heading)',
            }}>
              Live Location Sharing —
              <span style={{ color: 'var(--cf-primary)' }}> Built for Emergencies</span>
            </h2>
            <p style={{
              color: 'var(--cf-text-secondary)', fontSize: '1.05rem',
              lineHeight: 1.7, maxWidth: 580, margin: '0 auto',
            }}>
              When every second matters, CivicFix keeps your monitoring team
              informed with continuous, privacy-first GPS location sharing.
            </p>
          </div>

          {/* Detailed split layout */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '4rem', alignItems: 'center', marginBottom: '5rem',
          }}
            className="hero-grid"
          >
            {/* Left — detailed feature panel */}
            <div style={{ animation: 'slideInLeft 0.6s ease 0.1s both' }}>
              {/* Active session banner mockup */}
              <div style={{
                background: '#dcfce7', border: '2px solid #16a34a',
                borderRadius: 14, padding: '1rem 1.25rem',
                marginBottom: '1.25rem',
                display: 'flex', alignItems: 'center', gap: '0.85rem',
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#16a34a', flexShrink: 0,
                  animation: 'live-ping 1.6s ease-out infinite',
                }}/>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#166534' }}>
                    Live location sharing is active
                  </p>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#166534' }}>
                    Elapsed: <strong>4:22</strong> &nbsp;·&nbsp; Expires in:{' '}
                    <strong style={{ color: '#166534' }}>25:38</strong>
                  </p>
                </div>
                <span style={{
                  background: '#16a34a', color: '#fff',
                  borderRadius: 999, fontSize: '0.68rem', fontWeight: 700,
                  padding: '0.2rem 0.6rem', letterSpacing: '0.05em',
                }}>LIVE</span>
              </div>

              {/* Warning notice mockup */}
              <div style={{
                background: '#fffbeb', border: '1.5px solid #f59e0b',
                borderRadius: 10, padding: '0.85rem 1rem',
                marginBottom: '1.25rem',
                display: 'flex', gap: '0.65rem', alignItems: 'flex-start',
              }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#d97706', marginTop: 2 }}/>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#92400e', lineHeight: 1.55 }}>
                  <strong>Keep this page open for sharing to continue.</strong> Web browsers do not
                  reliably track location in the background or with the screen locked.
                </p>
              </div>

              {/* Ping heartbeat mockup */}
              <div className="cf-card" style={{ padding: '0.9rem 1.1rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <i className="bi bi-arrow-up-circle" style={{ color: 'var(--cf-primary)' }}/>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Location pings sent</span>
                  </div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--cf-primary)' }}>22</span>
                </div>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: 'var(--cf-text-muted)' }}>
                  Last ping: 2:14:08 PM &nbsp;·&nbsp; Next ping in ~12 s
                </p>
              </div>

              {/* Action buttons mockup */}
              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                <div style={{
                  flex: 1, minWidth: 120,
                  background: 'transparent', border: '1.5px solid #16a34a',
                  color: '#15803d', borderRadius: 9, padding: '0.6rem 1rem',
                  fontWeight: 600, fontSize: '0.85rem', textAlign: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                }}>
                  <i className="bi bi-shield-check"/> I'm Safe
                </div>
                <div style={{
                  flex: 1, minWidth: 120,
                  background: 'var(--cf-primary-light)', border: '1.5px solid var(--cf-primary)',
                  color: 'var(--cf-primary)', borderRadius: 9, padding: '0.6rem 1rem',
                  fontWeight: 600, fontSize: '0.85rem', textAlign: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                }}>
                  <i className="bi bi-clock"/> +15 min
                </div>
                <div style={{
                  flex: 1, minWidth: 120,
                  background: '#fee2e2', border: '1.5px solid #dc2626',
                  color: '#dc2626', borderRadius: 9, padding: '0.6rem 1rem',
                  fontWeight: 600, fontSize: '0.85rem', textAlign: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                }}>
                  <i className="bi bi-stop-circle"/> Stop
                </div>
              </div>
            </div>

            {/* Right — feature bullet points */}
            <div style={{ animation: 'slideInRight 0.6s ease 0.15s both' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {[
                  {
                    icon: 'bi-broadcast',
                    color: '#0B4F6C',
                    bg: '#d6eaf3',
                    title: 'Throttled 12-second pings',
                    desc: 'Location updates are sent every 12 seconds — balancing accuracy with battery life. navigator.sendBeacon keeps pings alive even when the tab loses focus.',
                  },
                  {
                    icon: 'bi-person-lock',
                    color: '#7c3aed',
                    bg: '#ede9fe',
                    title: 'Strict opt-in, zero passive tracking',
                    desc: 'Location sharing only activates when you explicitly start a session from your emergency report. No background tracking is ever triggered without your action.',
                  },
                  {
                    icon: 'bi-chat-square-dots',
                    color: '#0e7490',
                    bg: '#cffafe',
                    title: 'Two-way silent messaging',
                    desc: 'Admins can send discreet text check-ins to your screen. Messages arrive via both ping responses and a separate polling fallback — no message is ever lost.',
                  },
                  {
                    icon: 'bi-arrow-clockwise',
                    color: '#059669',
                    bg: '#d1fae5',
                    title: 'Session extension up to 8 hours',
                    desc: 'Add 15 minutes, 1 hour, or 2 hours without restarting. Sessions are capped at 8 hours from start time to prevent accidental indefinite tracking.',
                  },
                ].map((item) => (
                  <div key={item.title} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12,
                      background: item.bg, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <i className={`bi ${item.icon}`} style={{ color: item.color, fontSize: '1.15rem' }}/>
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--cf-text)' }}>
                        {item.title}
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--cf-text-secondary)', margin: 0, lineHeight: 1.65 }}>
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Feature cards grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}>
            {features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section style={{
        padding: '5rem 1.5rem',
        background: 'linear-gradient(180deg, #f0f7fb 0%, #e8f4f8 100%)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '4rem', alignItems: 'start',
          }}
            className="hero-grid"
          >
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                background: 'var(--cf-primary-light)', color: 'var(--cf-primary)',
                borderRadius: 999, padding: '0.35rem 1rem',
                fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em',
                marginBottom: '1.25rem',
              }}>
                <i className="bi bi-map"/> HOW IT WORKS
              </div>
              <h2 style={{
                fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800,
                color: 'var(--cf-text)', marginBottom: '0.75rem',
                fontFamily: 'var(--cf-font-heading)',
              }}>
                From Report to<br/>
                <span style={{ color: 'var(--cf-primary)' }}>Monitored Safety</span>
              </h2>
              <p style={{
                color: 'var(--cf-text-secondary)', fontSize: '1rem',
                lineHeight: 1.7, marginBottom: '2.5rem',
              }}>
                In four simple steps, CivicFix connects you to a monitoring team
                that can see your real-time position and send you discreet check-ins.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                {steps.map((s, i) => (
                  <HowItWorksStep key={s.step} {...s} isLast={i === steps.length - 1}/>
                ))}
              </div>
            </div>

            {/* Privacy emphasis panel */}
            <div style={{ position: 'sticky', top: 100 }}>
              <div className="cf-card" style={{
                borderRadius: 20, overflow: 'hidden',
                boxShadow: '0 12px 40px rgba(11,79,108,0.12)',
                border: '1px solid var(--cf-border-light)',
              }}>
                {/* Header */}
                <div style={{
                  background: 'linear-gradient(135deg, #0B4F6C, #083a52)',
                  padding: '1.75rem',
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '1rem',
                  }}>
                    <i className="bi bi-shield-shaded" style={{ color: '#F2A541', fontSize: '1.6rem' }}/>
                  </div>
                  <h3 style={{ color: '#fff', margin: '0 0 0.4rem', fontFamily: 'var(--cf-font-heading)' }}>
                    Privacy by Default
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, fontSize: '0.875rem', lineHeight: 1.6 }}>
                    Your location is your data. We built every safeguard in from the start.
                  </p>
                </div>

                {/* Privacy commitments */}
                <div style={{ padding: '1.5rem' }}>
                  {[
                    { icon: 'bi-lock-fill',         color: '#0B4F6C', text: 'Sessions expire automatically — no location is stored after sharing ends.' },
                    { icon: 'bi-toggle-on',          color: '#059669', text: 'Sharing is 100% voluntary. You start it, you stop it — no one else can.' },
                    { icon: 'bi-person-fill-slash',  color: '#7c3aed', text: 'Only authorised monitoring staff can view your live position.' },
                    { icon: 'bi-database-slash',     color: '#d97706', text: 'Location history is purged from the database when a session ends.' },
                    { icon: 'bi-eye-slash-fill',     color: '#dc2626', text: 'No passive background tracking. If the page is closed, pings stop instantly.' },
                  ].map((item) => (
                    <div key={item.text} style={{
                      display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                      padding: '0.75rem 0',
                      borderBottom: '1px solid var(--cf-border-light)',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: `${item.color}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <i className={`bi ${item.icon}`} style={{ color: item.color, fontSize: '0.9rem' }}/>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--cf-text-secondary)', lineHeight: 1.6 }}>
                        {item.text}
                      </p>
                    </div>
                  ))}

                  <Link
                    to="/register"
                    className="cf-btn cf-btn-primary lls-cta-btn"
                    style={{ width: '100%', marginTop: '1.25rem', padding: '0.8rem', justifyContent: 'center', borderRadius: 10 }}
                  >
                    <i className="bi bi-shield-plus"/> Start Reporting Issues
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA SECTION ─────────────────────────────────────────────── */}
      <section style={{
        padding: '5rem 1.5rem',
        background: 'linear-gradient(135deg, #0B4F6C 0%, #052b3d 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative element */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'radial-gradient(circle at 25% 50%, #fff 1px, transparent 1px), radial-gradient(circle at 75% 50%, #fff 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }}/>

        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(242,165,65,0.15)', border: '2px solid rgba(242,165,65,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem',
            animation: 'floatUp 3s ease-in-out infinite',
          }}>
            <i className="bi bi-geo-alt-fill" style={{ color: '#F2A541', fontSize: '1.8rem' }}/>
          </div>

          <h2 style={{
            color: '#fff', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
            fontWeight: 800, marginBottom: '1rem',
            fontFamily: 'var(--cf-font-heading)',
          }}>
            Ready to Make Your Community Safer?
          </h2>
          <p style={{
            color: 'rgba(255,255,255,0.72)', fontSize: '1.05rem',
            lineHeight: 1.75, marginBottom: '2.25rem',
          }}>
            Join thousands of residents who use CivicFix to report local issues,
            share emergencies safely, and hold their city accountable — in real time.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
            <Link
              to="/register"
              className="cf-btn lls-cta-btn"
              style={{
                background: 'linear-gradient(135deg, #F2A541, #f8c97a)',
                color: '#0B4F6C', padding: '0.9rem 2rem',
                fontSize: '1rem', fontWeight: 700,
                boxShadow: '0 4px 20px rgba(242,165,65,0.35)',
                borderRadius: 10,
              }}
            >
              <i className="bi bi-person-plus-fill"/> Create Free Account
            </Link>
            <Link
              to="/issues"
              className="cf-btn lls-cta-btn"
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)',
                padding: '0.9rem 2rem', fontSize: '1rem',
                borderRadius: 10,
              }}
            >
              <i className="bi bi-map"/> View Community Map
            </Link>
          </div>

          {/* Bottom trust row — uses the same `display` object as the stat strip.
               Falls back to FALLBACK constants until the API response arrives. */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.6rem',
            justifyContent: 'center',
          }}>
            <TrustBadge icon="bi-people-fill"       label={`${display.activeCitizens} active citizens`}/>
            <TrustBadge icon="bi-check-circle-fill"  label={`${display.resolvedIssues} issues resolved`}/>
            <TrustBadge icon="bi-shield-check-fill"  label="Privacy-first design"/>
          </div>
        </div>
      </section>

      {/* Responsive grid override */}
      <style>{`
        @media (max-width: 768px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
