/**
 * ReportEmergency.jsx
 *
 * Resident-only page for submitting an EmergencyReport to CivicFix.
 * Entirely separate from the existing ReportIssue flow — different model,
 * different API endpoint, different visibility rules.
 *
 * Rendering order (critical — must not be changed):
 *   1. EmergencyCallBanner — unconditional, always first, with a real phone
 *      number for the user's detected country (or a generic fallback).
 *   2. Framing notice      — "This is not a replacement for calling emergency services"
 *   3. NearbyHelpPanel     — supplementary nearby facilities (police/hospital)
 *   4. Report form         — type, description, location, media capture
 *
 * Country detection flow:
 *   A. Browser Geolocation API → Nominatim reverse geocode → ISO country code
 *   B. If A is denied/fails → IP geolocation via ipapi.co (free, no key needed)
 *   C. If B also fails → EmergencyCallBanner receives phoneNumber=null and
 *      shows its built-in generic fallback. No wrong number is ever displayed.
 *
 * Media capture provides THREE distinct paths:
 *   A. "Take Photo"          — file input with capture="environment" (camera)
 *   B. "Record Video (15s)"  — MediaRecorder API with enforced constraints:
 *                              720p, ~2 Mbps, auto-stop + countdown timer
 *   C. "Choose from Gallery" — plain file input (gallery videos bypass capture
 *                              constraints; server-side checks in Prompt 2 are
 *                              the backstop for oversized/overlong gallery files)
 *
 * NOTE (gallery path):
 *   Client-side compression for gallery-selected videos (e.g. via ffmpeg.wasm)
 *   would be valuable here to reduce upload size, but the library adds ~20 MB to
 *   the bundle.  This is flagged as a follow-up; the server-side duration/size
 *   gate in emergencyUploadMiddleware.js is the current backstop.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate }        from 'react-router-dom';
import api                   from '../services/api';
import DashboardLayout       from '../components/DashboardLayout';
import LocationPicker        from '../components/LocationPicker';
import EmergencyCallBanner   from '../components/EmergencyCallBanner';
import NearbyHelpPanel       from '../components/NearbyHelpPanel';

// ── Constants ─────────────────────────────────────────────────────────────────
const EMERGENCY_TYPES = [
  'Armed Robbery',
  'Physical Assault / Violence',
  'Domestic Violence',
  'Fire',
  'Medical Emergency',
  'Kidnapping / Abduction',
  'Active Threat',
  'Other Life-Threatening Emergency',
];

const VIDEO_MAX_SECONDS   = 15;
const MAX_MEDIA_FILES     = 5;
const VIDEO_CONSTRAINTS   = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  audio: true,
};
const VIDEO_BITS_PER_SECOND = 2_000_000; // 2 Mbps

const NOMINATIM = 'https://nominatim.openstreetmap.org';

// ── Country-detection helpers ─────────────────────────────────────────────────

/**
 * Attempt to get the user's country code via:
 *   1. navigator.geolocation → Nominatim reverse geocode
 *   2. Fallback: ipapi.co IP-geolocation (no key required)
 *
 * Returns an ISO 3166-1 alpha-2 code (e.g. "NG", "GB") or null on failure.
 * NEVER returns a guessed or hallucinated value — null means "unknown".
 */
async function detectCountryCode() {
  // ── Path A: GPS + Nominatim ───────────────────────────────────────────────
  try {
    const coords = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000 })
    );
    const { latitude: lat, longitude: lng } = coords.coords;

    const res = await fetch(
      `${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=3`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (res.ok) {
      const data = await res.json();
      const code = data.address?.country_code?.toUpperCase();
      if (code && code.length === 2) return code;
    }
  } catch {
    // Geolocation denied or Nominatim failed — fall through to IP fallback
  }

  // ── Path B: IP geolocation (free tier, no API key) ────────────────────────
  // ipapi.co is used as a last resort only — less accurate than GPS but
  // sufficient for national-level country detection.
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const code = data.country_code?.toUpperCase();
      if (code && code.length === 2) return code;
    }
  } catch {
    // IP geolocation also failed — return null, banner shows generic fallback
  }

  return null;
}

/**
 * Fetch the verified emergency number(s) for a given ISO country code
 * from the CivicFix backend's static dataset.
 * Returns the `numbers` object (e.g. { general:"999", police:"999", ... })
 * or null if the country is not in the dataset or on network error.
 */
async function fetchEmergencyNumbers(countryCode) {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/emergency-reports/emergency-number?country=${countryCode}`
    );
    if (!res.ok) return null; // 404 = country not in dataset; client shows generic fallback
    const data = await res.json();
    return data.found ? data.numbers : null;
  } catch {
    return null;
  }
}

export default function ReportEmergency() {
  const navigate = useNavigate();

  // ── Country detection + emergency number state ────────────────────────────
  const [emergencyNumbers,  setEmergencyNumbers]  = useState(null);  // { general, police, ... } | null
  const [detectedCountry,   setDetectedCountry]   = useState(null);  // ISO code | null
  const [numberLoading,     setNumberLoading]      = useState(true);

  // ── Form state ───────────────────────────────────────────────────────────
  const [type,        setType]        = useState('');
  const [description, setDescription] = useState('');
  const [location,    setLocation]    = useState({ address: '', latitude: null, longitude: null });
  const [errors,      setErrors]      = useState({});
  const [apiError,    setApiError]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [success,     setSuccess]     = useState(false);

  // ── Media state ──────────────────────────────────────────────────────────
  const [mediaFiles,  setMediaFiles]  = useState([]);

  // ── Video recording state ────────────────────────────────────────────────
  const [recording,       setRecording]       = useState(false);
  const [countdown,       setCountdown]       = useState(VIDEO_MAX_SECONDS);
  const [recorderError,   setRecorderError]   = useState('');
  const [cameraStream,    setCameraStream]    = useState(null);

  const mediaRecorderRef  = useRef(null);
  const chunksRef         = useRef([]);
  const countdownTimerRef = useRef(null);
  const stopTimerRef      = useRef(null);
  const livePreviewRef    = useRef(null);
  const photoRef          = useRef();
  const galleryRef        = useRef();

  // ── Detect country + fetch emergency number on mount ─────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const code = await detectCountryCode();
        if (!mounted) return;
        setDetectedCountry(code);

        if (code) {
          const numbers = await fetchEmergencyNumbers(code);
          if (mounted) setEmergencyNumbers(numbers);
        }
      } catch {
        // Both detection paths failed — banner will show generic fallback
      } finally {
        if (mounted) setNumberLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ── Camera stream cleanup ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopAllTimers();
      if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraStream]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const stopAllTimers = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    if (stopTimerRef.current)      clearTimeout(stopTimerRef.current);
  };

  const addMediaFile = useCallback((file, kind) => {
    if (mediaFiles.length >= MAX_MEDIA_FILES) return;
    const preview = URL.createObjectURL(file);
    setMediaFiles((prev) => [...prev, { file, preview, kind }]);
  }, [mediaFiles.length]);

  const removeMediaFile = (idx) => {
    setMediaFiles((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── Derive the phone number to pass to the banner ─────────────────────────
  // Priority: general → police → first available field.
  // While detection is still loading, pass null so the banner shows a spinner-
  // or-generic message until we know. After loading, null means "use generic".
  const bannerPhoneNumber = emergencyNumbers
    ? (emergencyNumbers.general || emergencyNumbers.police || null)
    : null;

  // ── Photo capture ─────────────────────────────────────────────────────────
  const handlePhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (mediaFiles.length >= MAX_MEDIA_FILES) {
      setApiError(`Maximum ${MAX_MEDIA_FILES} media files allowed.`);
      return;
    }
    addMediaFile(file, 'photo');
    e.target.value = '';
  };

  // ── Gallery video picker ──────────────────────────────────────────────────
  // NOTE: gallery videos bypass capture-time constraints. Server-side backstop
  // (25 MB size limit + 16 s duration gate) is in emergencyUploadMiddleware.js.
  const handleGalleryPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (mediaFiles.length >= MAX_MEDIA_FILES) {
      setApiError(`Maximum ${MAX_MEDIA_FILES} media files allowed.`);
      return;
    }
    addMediaFile(file, 'video');
    e.target.value = '';
  };

  // ── MediaRecorder video capture ───────────────────────────────────────────
  const startRecording = async () => {
    setRecorderError('');
    chunksRef.current = [];

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
    } catch (err) {
      setRecorderError(
        'Camera/microphone access denied. Please allow access and try again. ' +
        '(Error: ' + err.message + ')'
      );
      return;
    }

    setCameraStream(stream);
    if (livePreviewRef.current) {
      livePreviewRef.current.srcObject = stream;
      livePreviewRef.current.play().catch(() => {});
    }

    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find((m) => MediaRecorder.isTypeSupported(m)) ?? '';

    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setRecorderError('MediaRecorder is not supported in this browser: ' + err.message);
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data?.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      const ext  = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `emergency-video-${Date.now()}.${ext}`, { type: blob.type });
      addMediaFile(file, 'video');
      stream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
      if (livePreviewRef.current) livePreviewRef.current.srcObject = null;
    };

    recorder.start(200);
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setCountdown(VIDEO_MAX_SECONDS);

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(countdownTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);

    // Auto-stop at exactly VIDEO_MAX_SECONDS (server-side backstop also enforces this)
    stopTimerRef.current = setTimeout(() => stopRecording(), VIDEO_MAX_SECONDS * 1000);
  };

  const stopRecording = useCallback(() => {
    stopAllTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    setCountdown(VIDEO_MAX_SECONDS);
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!type)               errs.type        = 'Please select an emergency type';
    if (!description.trim()) errs.description = 'Description is required';
    if (!location.address)   errs.address     = 'Please pick a location on the map or type an address';
    if (location.latitude == null || location.longitude == null) {
      errs.address = 'Please pick a location — coordinates are required';
    }
    return errs;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const fd = new FormData();
    fd.append('type',        type);
    fd.append('description', description.trim());
    fd.append('location',    JSON.stringify({
      address:   location.address,
      latitude:  location.latitude,
      longitude: location.longitude,
    }));
    mediaFiles.forEach(({ file }) => fd.append('media', file));

    setSubmitting(true);
    try {
      await api.post('/emergency-reports', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess(true);
    } catch (err) {
      setApiError(err.message || 'Submission failed — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <DashboardLayout title="Report Submitted">
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {/* Repeat call banner on success screen */}
          <EmergencyCallBanner phoneNumber={bannerPhoneNumber} />

          <div className="cf-card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#fee2e2', margin: '0 auto 1.25rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="bi bi-check-lg" style={{ fontSize: '2rem', color: '#b91c1c' }} />
            </div>

            <h2 style={{ marginBottom: '0.5rem', color: '#b91c1c' }}>Emergency Report Received</h2>
            <p style={{ color: 'var(--cf-text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Your report has been submitted. CivicFix administrators have been alerted
              and will follow up as soon as possible.
            </p>

            {/* Required safety repeat */}
            <div style={{
              background: '#fff5f5', border: '1.5px solid #fecaca',
              borderRadius: 'var(--cf-radius-md)', padding: '0.85rem 1rem',
              marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: 600,
              color: '#b91c1c', display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            }}>
              <i className="bi bi-exclamation-triangle-fill" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                If you are in immediate danger, please call emergency services now.
                This report is a supplement to — not a replacement for — calling 112 / 999 / 911.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="cf-btn cf-btn-outline" onClick={() => navigate('/dashboard')}>
                <i className="bi bi-house" /> Go to Dashboard
              </button>
              <button
                className="cf-btn"
                style={{ background: '#b91c1c', color: '#fff' }}
                onClick={() => {
                  setSuccess(false);
                  setType(''); setDescription('');
                  setLocation({ address: '', latitude: null, longitude: null });
                  setMediaFiles([]); setErrors({}); setApiError('');
                }}
              >
                <i className="bi bi-plus-circle" /> Submit Another
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Form screen ───────────────────────────────────────────────────────────
  const canAddMore = mediaFiles.length < MAX_MEDIA_FILES;

  return (
    <DashboardLayout title="Report Emergency">
      <div style={{ maxWidth: 720 }}>

        {/* ── 1. Call banner — UNCONDITIONAL, FIRST ───────────────────────
            Shows the real number once detection resolves; generic fallback
            while loading or if detection completely fails.               */}
        <EmergencyCallBanner
          phoneNumber={numberLoading ? null : bannerPhoneNumber}
        />

        {/* ── 2. Framing notice ──────────────────────────────────────────── */}
        <div style={{
          background:   '#fff5f5',
          border:       '1.5px solid #fecaca',
          borderRadius: 'var(--cf-radius-md)',
          padding:      '0.75rem 1rem',
          marginBottom: '1rem',
          fontSize:     '0.875rem',
          color:        '#7f1d1d',
          display:      'flex', alignItems: 'flex-start', gap: '0.5rem',
          lineHeight:   1.5,
        }}>
          <i className="bi bi-info-circle-fill" style={{ flexShrink: 0, marginTop: 2, color: '#b91c1c' }} />
          <span>
            <strong>This report goes to CivicFix administrators for follow-up.</strong>{' '}
            It is not a replacement for calling emergency services. If you are in
            immediate danger, call your local emergency number first.
          </span>
        </div>

        {/* ── 3. Nearby facilities — supplementary, visually subordinate ──── */}
        <NearbyHelpPanel
          lat={location.latitude}
          lng={location.longitude}
        />

        {/* ── 4. API error banner ────────────────────────────────────────── */}
        {apiError && (
          <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.25rem' }}>
            <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }} />
            <span>{apiError}</span>
          </div>
        )}

        {/* ── 5. Form ────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} noValidate>

          {/* Emergency type + description */}
          <div className="cf-card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--cf-border-light)', color: '#b91c1c' }}>
              <i className="bi bi-exclamation-triangle-fill me-2" />
              Emergency Details
            </h2>

            <div style={{ marginBottom: '1.1rem' }}>
              <label className="cf-form-label" htmlFor="er-type">Emergency Type</label>
              <select
                id="er-type"
                value={type}
                onChange={(e) => { setType(e.target.value); setErrors((p) => ({ ...p, type: '' })); }}
                className={`cf-input ${errors.type ? 'is-invalid' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <option value="">Select emergency type…</option>
                {EMERGENCY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {errors.type && <p className="cf-field-error">{errors.type}</p>}
            </div>

            <div style={{ marginBottom: '1.1rem' }}>
              <label className="cf-form-label" htmlFor="er-description">What is happening?</label>
              <textarea
                id="er-description"
                value={description}
                onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: '' })); }}
                rows={4}
                className={`cf-input ${errors.description ? 'is-invalid' : ''}`}
                style={{ resize: 'vertical', minHeight: 100 }}
                placeholder="Describe the emergency — who is involved, what is happening, any identifying details…"
              />
              {errors.description && <p className="cf-field-error">{errors.description}</p>}
            </div>
          </div>

          {/* Location */}
          <div className="cf-card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--cf-border-light)', color: '#b91c1c' }}>
              <i className="bi bi-geo-alt-fill me-2" />
              Location <span style={{ fontWeight: 400, color: 'var(--cf-text-muted)' }}>(required — be as precise as possible)</span>
            </h2>
            <LocationPicker
              value={location}
              onChange={({ address, latitude, longitude }) => {
                setLocation({ address, latitude, longitude });
                setErrors((p) => ({ ...p, address: '' }));
              }}
            />
            {errors.address && <p className="cf-field-error">{errors.address}</p>}
          </div>

          {/* Media capture */}
          <div className="cf-card" style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--cf-border-light)', color: '#b91c1c' }}>
              <i className="bi bi-camera-video-fill me-2" />
              Evidence{' '}
              <span style={{ fontWeight: 400, color: 'var(--cf-text-muted)' }}>
                (optional — photos &amp; video, up to {MAX_MEDIA_FILES} files)
              </span>
            </h2>

            {/* Thumbnails */}
            {mediaFiles.length > 0 && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {mediaFiles.map(({ preview, kind }, idx) => (
                  <div key={idx} style={{ position: 'relative', width: 90, height: 90, borderRadius: 'var(--cf-radius-md)', overflow: 'hidden', border: '1px solid var(--cf-border)' }}>
                    {kind === 'photo'
                      ? <img src={preview} alt={`Evidence ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <video src={preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
                    }
                    <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: '0.65rem', color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 3, padding: '0 3px' }}>
                      {kind === 'video' ? '▶ video' : '📷 photo'}
                    </span>
                    <button type="button" onClick={() => removeMediaFile(idx)}
                      style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', background: '#b91c1c', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', padding: 0 }}>
                      <i className="bi bi-x" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Live viewfinder */}
            {recording && (
              <div style={{ position: 'relative', marginBottom: '1rem', borderRadius: 'var(--cf-radius-md)', overflow: 'hidden', border: '2px solid #dc2626', maxWidth: 360 }}>
                <video ref={livePreviewRef} autoPlay muted playsInline style={{ width: '100%', display: 'block', background: '#000' }} />
                <div style={{ position: 'absolute', top: 8, right: 10, background: countdown <= 5 ? '#dc2626' : 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 'var(--cf-radius-md)', padding: '0.15rem 0.55rem', fontFamily: 'var(--cf-font-heading)', fontWeight: 800, fontSize: '1.1rem', transition: 'background 300ms' }}>
                  {countdown}s
                </div>
                <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'ecb-ring 1s ease-out infinite' }} />
                  REC
                </div>
              </div>
            )}

            {/* Capture buttons */}
            {canAddMore && !recording && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.75rem' }}>

                {/* A. Take Photo */}
                <button type="button" id="er-take-photo-btn" onClick={() => photoRef.current.click()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', border: '1.5px solid var(--cf-border)', borderRadius: 'var(--cf-radius-md)', background: 'var(--cf-surface)', color: 'var(--cf-text-secondary)', fontSize: '0.875rem', cursor: 'pointer', transition: 'border-color 150ms, color 150ms' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#b91c1c'; e.currentTarget.style.color = '#b91c1c'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--cf-border)'; e.currentTarget.style.color = 'var(--cf-text-secondary)'; }}>
                  <i className="bi bi-camera-fill" /> Take Photo
                </button>

                {/* B. Record Video — MediaRecorder, 720p, 2 Mbps, 15 s auto-stop */}
                <button type="button" id="er-record-video-btn" onClick={startRecording}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', border: '1.5px solid #dc2626', borderRadius: 'var(--cf-radius-md)', background: '#fff5f5', color: '#dc2626', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', transition: 'background 150ms' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff5f5'; }}>
                  <i className="bi bi-record-circle-fill" /> Record Video (max {VIDEO_MAX_SECONDS}s)
                </button>

                {/* C. Choose from Gallery
                    NOTE: gallery videos bypass capture-time 720p/2Mbps constraints.
                    Server-side backstop: 25 MB (Multer) + 16 s duration gate (Cloudinary).
                    Client-side ffmpeg.wasm compression is a deferred follow-up
                    (deferred due to ~20 MB bundle size cost). */}
                <button type="button" id="er-gallery-btn" onClick={() => galleryRef.current.click()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', border: '1.5px dashed var(--cf-border)', borderRadius: 'var(--cf-radius-md)', background: 'transparent', color: 'var(--cf-text-secondary)', fontSize: '0.875rem', cursor: 'pointer', transition: 'border-color 150ms, color 150ms' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--cf-primary)'; e.currentTarget.style.color = 'var(--cf-primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--cf-border)'; e.currentTarget.style.color = 'var(--cf-text-secondary)'; }}>
                  <i className="bi bi-folder2-open" /> Choose from Gallery
                </button>
              </div>
            )}

            {/* Stop recording button */}
            {recording && (
              <button type="button" id="er-stop-recording-btn" onClick={stopRecording}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 'var(--cf-radius-md)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
                <i className="bi bi-stop-circle-fill" /> Stop Recording
              </button>
            )}

            {recorderError && (
              <div className="cf-alert cf-alert-error" style={{ marginTop: '0.5rem' }}>
                <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }} />
                <span>{recorderError}</span>
              </div>
            )}

            {mediaFiles.length > 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)', margin: '0.35rem 0 0' }}>
                {mediaFiles.length}/{MAX_MEDIA_FILES} files added{!canAddMore ? ' — limit reached' : ''}
              </p>
            )}
          </div>

          {/* Hidden file inputs */}
          <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }} onChange={handlePhotoCapture} />
          <input ref={galleryRef} type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} onChange={handleGalleryPick} />

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="submit" id="er-submit-btn" className="cf-btn" disabled={submitting || recording} style={{ background: '#b91c1c', color: '#fff' }}>
              {submitting
                ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" /> Submitting…</>
                : <><i className="bi bi-send-fill" /> Submit Emergency Report</>
              }
            </button>
            <button type="button" className="cf-btn cf-btn-outline" onClick={() => navigate('/dashboard')} disabled={submitting}>
              Cancel
            </button>
          </div>

        </form>
      </div>
    </DashboardLayout>
  );
}
