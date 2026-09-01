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
 *                              constraints; server-side Admin API duration check
 *                              in createEmergencyReport is the real backstop)
 *
 * Media upload flow (direct-to-Cloudinary, three phases):
 *   Phase 0: Client-side pre-check — estimate video duration from file.size;
 *            show a friendly error immediately for obviously-overlong clips.
 *            (UX nicety only — not security; server re-verifies all durations.)
 *   Phase 1: Fetch a server-signed upload payload from GET /upload-signature.
 *   Phase 2: POST each file directly to Cloudinary's upload API using the
 *            signature.  File bytes never pass through the serverless function,
 *            sidestepping Vercel's platform-level ~4.5 MB request body limit.
 *   Phase 3: Submit the report as a plain JSON POST (title/description/location/
 *            media array of Cloudinary URLs) — no file bytes in this request.
 *
 * NOTE (gallery path):
 *   Client-side compression for gallery-selected videos (e.g. via ffmpeg.wasm)
 *   would be valuable here to reduce upload size, but the library adds ~20 MB to
 *   the bundle.  Flagged as a follow-up.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate }        from 'react-router-dom';
import PhoneInput             from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
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
  video: {
    width:      { ideal: 1280 },
    height:     { ideal: 720 },
    frameRate:  { ideal: 30 },
    // Explicitly request the rear/environment camera.
    // Without this, mobile browsers (especially iOS Safari) default to the
    // front/selfie camera, which is wrong for capturing evidence.
    facingMode: { ideal: 'environment' },
  },
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
  const [type,         setType]         = useState('');
  const [description,  setDescription]  = useState('');
  // contactPhone holds the E.164-formatted value produced by PhoneInput
  // (e.g. "+2348012345678"), or undefined when the field is empty.
  // Optional — not required for submission.
  const [contactPhone, setContactPhone] = useState(undefined);
  const [location,     setLocation]     = useState({ address: '', latitude: null, longitude: null });
  const [errors,       setErrors]       = useState({});
  const [apiError,     setApiError]     = useState('');
  // ── Upload progress state ───────────────────────────────────────────────
  // null = not uploading; 0–100 = upload in progress
  const [uploadProgress,  setUploadProgress]  = useState(null);
  const [uploadStatus,    setUploadStatus]    = useState('');  // descriptive label
  const [submitting,      setSubmitting]      = useState(false);
  const [success,         setSuccess]         = useState(false);

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
  // Holds the live MediaStream so it can be bound to the <video> element
  // inside a useEffect that runs AFTER the element mounts (i.e. after
  // recording flips to true and React inserts the conditional <video> into
  // the DOM).  A plain state variable is not used here because writing state
  // in the middle of startRecording would schedule an async re-render and
  // still not guarantee the ref is populated before the assignment runs.
  const activeStreamRef   = useRef(null);
  // Tracks elapsed recording seconds independently of the countdown display.
  // Used by the watchdog in the countdown interval as a second auto-stop layer.
  const elapsedSecondsRef = useRef(0);
  // ── Single source of truth: has this recording session been finalized? ────
  //
  // PREVIOUS BUG (regression from last fix):
  //   hasFinalizedRef was being set to true at each TRIGGER SITE (Layer 1
  //   timer, Layer 2 interval, manual Stop button) — before mediaRecorder.stop()
  //   was called.  When onstop fired, it found the flag already true and returned
  //   immediately, skipping blob assembly, evidence push, and stream track release.
  //   This is why: no video appeared in the evidence list, and the OS-level
  //   "camera and microphone in use" indicator never cleared — on BOTH stop paths.
  //
  // Current architecture:
  //   - hasFinalizedRef is set to true ONLY inside the onstop handler.
  //   - Trigger sites (Layer 1 timer / Layer 2 interval / manual Stop) are
  //     READ-ONLY: they check the flag as a "has .stop() already been called?"
  //     gate, then call mediaRecorder.stop() — nothing else.
  //   - onstop is the SINGLE finalization site: builds Blob, pushes evidence,
  //     stops all stream tracks (releasing the OS camera/mic indicator), clears
  //     timers, resets UI, and resets the flag to false for the next session.
  const hasFinalizedRef   = useRef(false);
  const photoRef          = useRef();
  const galleryRef        = useRef();
  // Hidden <video> element used for client-side duration check after recording.
  const durationCheckRef  = useRef(null);

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
  //
  // ROOT CAUSE NOTE (confirmed): the previous version called stopAllTimers()
  // inside this effect's cleanup.  When startRecording() called setCameraStream(stream),
  // React scheduled a re-render, which triggered the cleanup of the PREVIOUS
  // cameraStream effect run — which called stopAllTimers() and immediately cleared
  // stopTimerRef.current.  That destroyed the 15-second auto-stop timer the moment
  // it was set, every single time recording started.
  //
  // Fix: this cleanup ONLY stops the media tracks.  Timers are managed exclusively
  // inside startRecording / stopRecording so their lifecycle is deterministic.
  useEffect(() => {
    return () => {
      // Do NOT call stopAllTimers() here — that cleared stopTimerRef right after
      // startRecording set it (see root cause note above).
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

  // ── Bind stream to <video> once the recording overlay mounts ─────────────
  //
  // ROOT CAUSE OF THE BLACK-BOX BUG (Candidate 3 — null-ref timing):
  //
  // The live-preview <video> element is conditionally rendered: it only exists
  // in the DOM when `recording === true`.  In the previous code, the stream was
  // assigned to livePreviewRef.current BEFORE setRecording(true) was called —
  // so at the moment of assignment, recording was still false, the <video> was
  // not in the DOM, and livePreviewRef.current was null.  The null-guard
  //   if (livePreviewRef.current) { ... }
  // silently skipped the assignment every time, leaving srcObject unset and
  // the video permanently black.
  //
  // Fix: store the stream in activeStreamRef (a stable ref, not state), then
  // let this effect run after React has committed the <video> to the DOM
  // (i.e. after recording flips to true).  By that point livePreviewRef.current
  // is guaranteed to be the real <video> element.
  useEffect(() => {
    if (!recording) return;
    const video  = livePreviewRef.current;
    const stream = activeStreamRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    // play() returns a Promise; swallow the AbortError that fires when the
    // element is removed from the DOM before playback begins (e.g. if the
    // user stops recording very quickly).
    video.play().catch(() => {});
  }, [recording]);

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

    // Store the stream in a ref so the useEffect above can bind it to the
    // <video> element once React has mounted it (after setRecording(true)
    // triggers a re-render and the conditional <video> appears in the DOM).
    activeStreamRef.current = stream;
    setCameraStream(stream);
    // Do NOT try to assign livePreviewRef.current.srcObject here — the
    // <video> element does not exist yet at this point in the call stack.

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
      activeStreamRef.current = null;
      setRecorderError('MediaRecorder is not supported in this browser: ' + err.message);
      return;
    }

    // ── ondataavailable: accumulate encoded chunks ─────────────────────────
    // Each chunk is appended to chunksRef so the final Blob can be assembled
    // in onstop.  The interval of 200 ms matches recorder.start(200).
    recorder.ondataavailable = (e) => {
      if (e.data?.size > 0) chunksRef.current.push(e.data);
    };

    // ── onstop: THE SINGLE finalization site ─────────────────────────────
    //
    // THIS is the only place that:
    //   1. Builds the final Blob from accumulated chunks
    //   2. Pushes the evidence item into state
    //   3. Stops every track on the camera/mic stream (releases OS indicator)
    //   4. Clears the countdown/fallback interval
    //   5. Resets hasFinalizedRef to false for the next recording
    //
    // Trigger sites (Layer 1 timer, Layer 2 interval, manual Stop button)
    // only call mediaRecorder.stop() — they never finalize themselves.
    // hasFinalizedRef at the trigger sites is a "stop already requested?"
    // gate only — it is NOT set to true there; only here.
    //
    // Layer 3 (client-side duration gate): after the Blob is assembled, load it
    // into a hidden <video> element and read its .duration.  If it somehow
    // exceeds VIDEO_MAX_SECONDS, reject it client-side with a clear error.
    recorder.onstop = () => {
      // ── Idempotency guard ─────────────────────────────────────────────────
      // hasFinalizedRef is set HERE — nowhere else — so this guard only
      // triggers if the browser fires onstop more than once (which is
      // non-standard but possible).  Trigger sites never set this flag.
      if (hasFinalizedRef.current) return;
      hasFinalizedRef.current = true;

      // 1. Kill timers — no further auto-stop ticks should fire.
      clearInterval(countdownTimerRef.current);
      clearTimeout(stopTimerRef.current);

      // 2. Build Blob + File from accumulated chunks.
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      const ext  = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `emergency-video-${Date.now()}.${ext}`, { type: blob.type });

      // 3. Stop every camera/mic track — this is what releases the OS-level
      //    "camera and microphone in use" indicator.  Calling mediaRecorder.stop()
      //    alone does NOT release the underlying stream; tracks must be stopped
      //    explicitly on the original stream object.
      stream.getTracks().forEach((t) => t.stop());
      activeStreamRef.current = null;
      setCameraStream(null);
      if (livePreviewRef.current) livePreviewRef.current.srcObject = null;

      // 4. Update UI.
      setRecording(false);
      setCountdown(VIDEO_MAX_SECONDS);

      // 5. Reset flag so the next recording session can finalize normally.
      hasFinalizedRef.current = false;

      // ── Layer 3: hidden-video duration check ─────────────────────────────
      const objectUrl = URL.createObjectURL(blob);
      const checker   = durationCheckRef.current;
      if (checker) {
        checker.src = objectUrl;
        checker.onloadedmetadata = () => {
          URL.revokeObjectURL(objectUrl);
          checker.src = '';
          const dur = checker.duration;
          if (Number.isFinite(dur) && dur > VIDEO_MAX_SECONDS + 0.5) {
            // Duration exceeded even after both stop mechanisms — reject fast.
            setRecorderError(
              `Recording exceeded the ${VIDEO_MAX_SECONDS}-second limit (got ${Math.round(dur)}s). ` +
              'Please try again — it will auto-stop at 15 seconds.'
            );
            // Do NOT add to mediaFiles.
          } else {
            addMediaFile(file, 'video');
          }
        };
        checker.onerror = () => {
          // Could not determine duration (some browsers/codecs); accept the file
          // and let the server-side check be the backstop.
          URL.revokeObjectURL(objectUrl);
          checker.src = '';
          addMediaFile(file, 'video');
        };
      } else {
        // Hidden checker element not in DOM (should not happen); accept and let
        // server verify.
        URL.revokeObjectURL(objectUrl);
        addMediaFile(file, 'video');
      }
    };

    recorder.start(200);
    mediaRecorderRef.current = recorder;
    elapsedSecondsRef.current = 0;   // reset elapsed counter for watchdog
    hasFinalizedRef.current   = false; // new recording session — allow exactly one finalization
    // setRecording(true) triggers a re-render.  After React commits the DOM,
    // the useEffect above fires and binds activeStreamRef.current to the
    // <video> element that has now mounted.
    setRecording(true);
    setCountdown(VIDEO_MAX_SECONDS);

    // ── Layer 1: primary auto-stop (setTimeout) ───────────────────────────
    // Sole responsibility: call mediaRecorder.stop() if not already stopped.
    // ALL finalization (blob, evidence, stream release, UI reset) happens in
    // onstop — never here.  hasFinalizedRef is read only, never written here.
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      // Guard: if onstop already ran (or another trigger already called
      // .stop() and onstop is in-flight), do nothing.
      if (hasFinalizedRef.current) return;
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.stop(); // triggers onstop → all finalization happens there
      }
    }, VIDEO_MAX_SECONDS * 1000);

    // ── Layer 2: watchdog inside the countdown interval ────────────────────
    // Sole responsibility: call mediaRecorder.stop() if Layer 1 somehow
    // didn't fire by 15 s.  ALL finalization happens in onstop.
    // hasFinalizedRef is read only, never written here.
    countdownTimerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1;
      const elapsed = elapsedSecondsRef.current;

      if (elapsed >= VIDEO_MAX_SECONDS) {
        // Guard: if onstop already ran (or .stop() was already called by
        // another trigger), bail without doing anything.
        if (hasFinalizedRef.current) {
          clearInterval(countdownTimerRef.current); // stale tick — clean up
          return;
        }
        const rec = mediaRecorderRef.current;
        if (rec && rec.state !== 'inactive') {
          rec.stop(); // triggers onstop → all finalization happens there
        }
        return;
      }

      // Normal tick: decrement the visible countdown display.
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(countdownTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const stopRecording = useCallback(() => {
    // ── Manual Stop ───────────────────────────────────────────────────────
    // Sole responsibility: call mediaRecorder.stop() if not already stopped.
    // ALL finalization (blob, evidence, stream release, UI reset) happens in
    // onstop — never here.  hasFinalizedRef is read only, never written here.
    if (hasFinalizedRef.current) return; // onstop already ran or .stop() already called
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop(); // triggers onstop → all finalization happens there
    }
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

  // ── Submit (three-phase direct-to-Cloudinary upload) ─────────────────────
  //
  // Phase 0: Client-side pre-check on video file sizes (UX nicety, not security)
  // Phase 1: Fetch a signed upload payload from the backend
  // Phase 2: POST each file directly to Cloudinary (file bytes never touch
  //          the serverless function — sidesteps Vercel's 4.5 MB body limit)
  // Phase 3: Submit the report as a plain JSON POST with the Cloudinary URLs
  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    // ── Phase 0: Client-side video size pre-check (UX gate, not enforcement) ──
    // Estimate duration from file size at the 2 Mbps bitrate used by the
    // MediaRecorder path.  Gallery videos may differ; this is intentionally
    // approximate — the real check is server-side via the Cloudinary Admin API.
    const VIDEO_BYTES_PER_SECOND = VIDEO_BITS_PER_SECOND / 8; // 250 000 B/s at 2 Mbps
    const obviouslyOverlong = mediaFiles.filter(
      ({ file, kind }) =>
        kind === 'video' &&
        file.size / VIDEO_BYTES_PER_SECOND > VIDEO_MAX_SECONDS + 5 // +5 s grace for compression
    );
    if (obviouslyOverlong.length) {
      setApiError(
        `One or more videos appear to be longer than ${VIDEO_MAX_SECONDS} seconds. ` +
        'Please trim the clip before uploading. ' +
        '(The server will verify the exact duration and reject anything over 15 s.)'
      );
      return;
    }

    setSubmitting(true);
    setUploadProgress(null);
    setUploadStatus('');

    try {
      // ── Phase 1: Fetch server-signed upload credentials ───────────────────
      // The backend signs a { timestamp, folder } pair with CLOUDINARY_API_SECRET.
      // We receive the signature + the public params needed for the upload POST.
      // The secret itself is NEVER sent to the client.
      setUploadStatus('Preparing upload…');
      const { data: sig } = await api.get('/uploads/signature', {
        params: { folder: 'civicfix/emergency-reports' },
      });
      const { signature, timestamp, apiKey, cloudName, folder } = sig;

      // ── Phase 2: POST each file directly to Cloudinary ────────────────────
      // We reuse the SAME signature for all files in this submission — Cloudinary
      // validates the timestamp+folder+signature triple for each upload.
      const uploadedAssets = [];
      const total = mediaFiles.length;

      for (let i = 0; i < total; i++) {
        const { file } = mediaFiles[i];
        setUploadStatus(
          total === 1
            ? 'Uploading media…'
            : `Uploading media (${i + 1}\u202f/\u202f${total})…`
        );
        setUploadProgress(Math.round((i / total) * 80)); // 0–80% is the upload phase

        const fd = new FormData();
        fd.append('file',      file);
        fd.append('api_key',   apiKey);
        fd.append('timestamp', timestamp);
        fd.append('signature', signature);
        fd.append('folder',    folder);

        // POST directly to Cloudinary's upload endpoint using the native fetch API
        // (not our axios instance) because this request goes to Cloudinary, not
        // our backend, and we want Cloudinary's raw error body on failure.
        const uploadRes = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
          { method: 'POST', body: fd }
        );

        if (!uploadRes.ok) {
          const errBody = await uploadRes.json().catch(() => ({}));
          throw new Error(
            errBody.error?.message ||
            `Media upload failed (HTTP ${uploadRes.status}) — please try again.`
          );
        }

        const asset = await uploadRes.json();
        // Cloudinary response fields we need:
        //   asset.secure_url    — CDN URL to store in the DB
        //   asset.public_id     — needed by the server to re-fetch authoritative duration
        //   asset.resource_type — 'image' or 'video'
        //   asset.duration      — seconds (present only for video resources)
        uploadedAssets.push({
          url:      asset.secure_url,
          type:     asset.resource_type === 'video' ? 'video' : 'image',
          publicId: asset.public_id,
          // Include the Cloudinary-reported duration for reference;
          // the server NEVER trusts this value — it re-fetches from Admin API.
          ...(asset.resource_type === 'video' && typeof asset.duration === 'number'
            ? { durationSeconds: asset.duration }
            : {}),
        });
      }

      // ── Phase 3: Submit report as plain JSON (no file bytes) ──────────────
      // The final POST contains only small JSON — well under Vercel's body limit.
      // The server re-fetches video durations from Cloudinary's Admin API and
      // rejects (+ destroys) any clip > 15 s, even if the client lied.
      setUploadProgress(90);
      setUploadStatus('Submitting report…');

      await api.post('/emergency-reports', {
        type,
        description: description.trim(),
        location: {
          address:   location.address,
          latitude:  location.latitude,
          longitude: location.longitude,
        },
        media: uploadedAssets,
        // Only include contactPhone when the reporter provided a number.
        // PhoneInput sets value to undefined when the field is cleared.
        ...(contactPhone ? { contactPhone } : {}),
        // Content-Type: application/json is the axios instance default
      });

      setUploadProgress(100);
      setSuccess(true);

    } catch (err) {
      setApiError(err.message || 'Submission failed — please try again.');
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
      setUploadStatus('');
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
                  setType(''); setDescription(''); setContactPhone(undefined);
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

            {/* ── Contact phone (optional) ──────────────────────────────────
                react-phone-number-input v3: the <PhoneInput> component
                combines a country-select flag and a formatted number input
                into a single controlled component.  `value` is an E.164
                string or undefined; `onChange(value)` is the same.

                We use `defaultCountry` to pre-select the flag based on the
                country we already detected for the emergency-number banner —
                one less tap for the majority of reporters.  */}
            <div style={{ marginBottom: '0.25rem' }}>
              <label
                className="cf-form-label"
                htmlFor="er-contact-phone"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <i className="bi bi-telephone" style={{ color: '#dc2626' }} />
                Contact Phone
                <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--cf-text-muted)', marginLeft: '0.15rem' }}>
                  (optional — so the admin can call you back)
                </span>
              </label>

              {/* PhoneInput renders: [🇳🇬 ▾] [ +234 ____________ ]
                  The outer wrapper needs cf-input border/radius styling;
                  the library's own CSS handles the flag + select layout.
                  We suppress its default border via a wrapping div override so
                  the input fits the existing CivicFix design language.       */}
              <div
                style={{
                  border:       '1.5px solid var(--cf-border)',
                  borderRadius: 'var(--cf-radius-md)',
                  background:   'var(--cf-surface)',
                  padding:      '0.1rem 0.75rem',
                  display:      'flex',
                  alignItems:   'center',
                  minHeight:    42,
                }}
              >
                <PhoneInput
                  id="er-contact-phone"
                  value={contactPhone}
                  onChange={setContactPhone}
                  defaultCountry={detectedCountry ?? 'NG'}
                  international
                  countryCallingCodeEditable={false}
                  style={{
                    // Reset the library's border so our wrapper div provides it
                    '--PhoneInput-color--focus': 'transparent',
                    width: '100%',
                  }}
                />
              </div>

              <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: 'var(--cf-text-muted)', lineHeight: 1.4 }}>
                <i className="bi bi-info-circle me-1" />
                This is stored securely and shared only with CivicFix administrators
                responding to your report.
              </p>
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

          {/* Hidden video element for Layer 3 duration check (see onstop handler).
              Must NOT use display:none — the browser won't load metadata for hidden
              media.  position:absolute + zero size keeps it invisible but parseable. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={durationCheckRef}
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
          />

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="submit" id="er-submit-btn" className="cf-btn" disabled={submitting || recording} style={{ background: '#b91c1c', color: '#fff' }}>
              {submitting
                ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" /> {uploadStatus || 'Submitting…'}</>
                : <><i className="bi bi-send-fill" /> Submit Emergency Report</>
              }
            </button>
            <button type="button" className="cf-btn cf-btn-outline" onClick={() => navigate('/dashboard')} disabled={submitting}>
              Cancel
            </button>
          </div>

          {/* Upload progress bar — visible only during phases 1–2 */}
          {submitting && uploadProgress !== null && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{
                height: 6, borderRadius: 3,
                background: 'var(--cf-border-light)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${uploadProgress}%`,
                  background: '#b91c1c',
                  borderRadius: 3,
                  transition: 'width 300ms ease',
                }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--cf-text-muted)', marginTop: '0.3rem' }}>
                {uploadStatus}
              </p>
            </div>
          )}

        </form>
      </div>
    </DashboardLayout>
  );
}
