import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout   from '../components/DashboardLayout';
import LocationPicker    from '../components/LocationPicker';
import StatusBadge       from '../components/StatusBadge';

const SEVERITY_HINTS = {
  Low:      'Minor inconvenience — e.g. a broken park bench or faded road markings.',
  Medium:   'Noticeable problem affecting daily life — e.g. large pothole or faulty streetlight.',
  High:     'Significant hazard — e.g. collapsed pavement or a blocked storm drain flooding the road.',
  Critical: 'Immediate danger — e.g. exposed electrical cable, gas leak, or unsafe structure.',
};

const MAX_IMAGES = 5;

// How long to wait after the last change before firing the nearby check.
// 800 ms feels instant enough without hammering the API on every map drag.
const NEARBY_DEBOUNCE_MS = 800;

export default function ReportIssue() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [form, setForm]             = useState({
    title: '', description: '', category: '', severity: 'Medium',
    address: '', latitude: null, longitude: null,
  });
  const [errors,    setErrors]    = useState({});
  const [images,    setImages]    = useState([]);     // File objects
  const [previews,  setPreviews]  = useState([]);     // Data URLs
  const [submitting,    setSubmitting]   = useState(false);
  const [uploadStatus,  setUploadStatus]  = useState('');   // descriptive label during upload
  const [apiError,      setApiError]     = useState('');
  const [success,       setSuccess]      = useState(null); // { issueId, id }
  const fileRef = useRef();

  // ── Nearby duplicate detection state ──────────────────────────────────────
  const [nearbyIssues,  setNearbyIssues]  = useState([]);   // array of matches
  const [nearbyLoading, setNearbyLoading] = useState(false);
  // Per-issue upvote state: { [issueId]: 'idle' | 'loading' | 'done' | 'already' }
  const [upvoteState,   setUpvoteState]   = useState({});
  const nearbyTimer = useRef(null);

  // ── Fetch categories on mount ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/categories')
      .then(({ data }) => setCategories(data))
      .catch(() => {});
  }, []);

  // ── Debounced nearby check ────────────────────────────────────────────────
  // Fires only when BOTH category and coordinates are set, after the user
  // pauses for NEARBY_DEBOUNCE_MS ms.  Cancelled on unmount.
  const scheduleNearbyCheck = useCallback((category, latitude, longitude) => {
    if (nearbyTimer.current) clearTimeout(nearbyTimer.current);

    // Need all three before bothering the server
    if (!category || latitude == null || longitude == null) {
      setNearbyIssues([]);
      return;
    }

    nearbyTimer.current = setTimeout(async () => {
      setNearbyLoading(true);
      try {
        const { data } = await api.get('/issues/nearby', {
          params: { latitude, longitude, category },
        });
        setNearbyIssues(data);
      } catch {
        // Non-critical — if it fails, just show nothing
        setNearbyIssues([]);
      } finally {
        setNearbyLoading(false);
      }
    }, NEARBY_DEBOUNCE_MS);
  }, []);

  // Cancel the timer on unmount to prevent state updates on an unmounted component
  useEffect(() => () => { if (nearbyTimer.current) clearTimeout(nearbyTimer.current); }, []);

  // ── Field change ──────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...form, [name]: value };
    setForm(next);
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }));
    setApiError('');

    // Re-run nearby check when category changes (lat/lng already set)
    if (name === 'category') {
      scheduleNearbyCheck(value, form.latitude, form.longitude);
    }
  };

  // ── Image selection ───────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files).slice(0, MAX_IMAGES - images.length);
    const newImages   = [...images,   ...selected].slice(0, MAX_IMAGES);
    const newPreviews = [...previews];

    selected.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        newPreviews.push(ev.target.result);
        if (newPreviews.length === newImages.length) setPreviews([...newPreviews]);
      };
      reader.readAsDataURL(file);
    });

    setImages(newImages);
    // Reset file input so the same file can be re-selected after removal
    e.target.value = '';
  };

  const removeImage = (idx) => {
    setImages((p)   => p.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!form.title.trim())       errs.title       = 'Title is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    if (!form.category)           errs.category    = 'Please select a category';
    // Accept any non-empty address — coordinate-only strings are valid
    if (!form.address)            errs.address     = 'Please pick a location on the map or type an address';
    return errs;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  //
  // Three-phase flow (mirrors the emergency-report upload pattern):
  //   Phase 1: Fetch a server-signed payload from GET /api/uploads/signature
  //   Phase 2: POST each image directly to Cloudinary — bytes never touch
  //            the serverless function, so a 413 is impossible regardless
  //            of photo resolution or file size
  //   Phase 3: Submit the report as a plain JSON POST with Cloudinary URLs
  //
  // A report with no photos skips phases 1+2 and goes straight to phase 3.
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    setUploadStatus('');
    setApiError('');

    try {
      let imageUrls = [];

      if (images.length > 0) {
        // Phase 1: Fetch signed upload credentials ─────────────────────────
        setUploadStatus('Preparing upload...');
        const { data: sig } = await api.get('/uploads/signature', {
          params: { folder: 'civicfix/issues' },
        });
        const { signature, timestamp, apiKey, cloudName, folder } = sig;

        // Phase 2: Upload each image directly to Cloudinary ────────────────
        // The same signature covers all files in this submission.
        for (let i = 0; i < images.length; i++) {
          setUploadStatus(`Uploading photo ${i + 1} of ${images.length}...`);

          const fd = new FormData();
          fd.append('file',      images[i]);
          fd.append('api_key',   apiKey);
          fd.append('timestamp', timestamp);
          fd.append('signature', signature);
          fd.append('folder',    folder);

          // POST directly to Cloudinary (not our backend) so file bytes
          // never reach the serverless function and cannot trigger a 413.
          const uploadRes = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            { method: 'POST', body: fd }
          );

          if (!uploadRes.ok) {
            const errBody = await uploadRes.json().catch(() => ({}));
            throw new Error(
              errBody.error?.message ||
              `Photo ${i + 1} upload failed (HTTP ${uploadRes.status}) — please try again.`
            );
          }

          const asset = await uploadRes.json();
          imageUrls.push(asset.secure_url);
        }
      }

      // Phase 3: Submit report as plain JSON (no file bytes) ────────────────
      // Small JSON payload — well under Vercel's body limit.
      setUploadStatus('Submitting report...');
      const { data } = await api.post('/issues', {
        title:       form.title.trim(),
        description: form.description.trim(),
        category:    form.category,
        severity:    form.severity,
        location: {
          address:   form.address,
          latitude:  form.latitude,
          longitude: form.longitude,
        },
        images: imageUrls,
      });

      setSuccess({ issueId: data.issueId, id: data._id });
    } catch (err) {
      setApiError(err.message || 'Submission failed — please try again.');
    } finally {
      setSubmitting(false);
      setUploadStatus('');
    }
  };

  // ── Upvote an existing nearby issue instead of submitting a duplicate ──────
  const handleUpvoteInstead = async (issue) => {
    setUpvoteState((p) => ({ ...p, [issue._id]: 'loading' }));
    try {
      await api.post(`/issues/${issue._id}/upvote`);
      setUpvoteState((p) => ({ ...p, [issue._id]: 'done' }));
      // Update the count optimistically in the nearby list
      setNearbyIssues((prev) =>
        prev.map((i) =>
          i._id === issue._id ? { ...i, upvoteCount: i.upvoteCount + 1 } : i
        )
      );
    } catch (err) {
      // 409 typically means already upvoted
      const alreadyVoted = err.response?.status === 409 || err.message?.toLowerCase().includes('already');
      setUpvoteState((p) => ({ ...p, [issue._id]: alreadyVoted ? 'already' : 'idle' }));
    }
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <DashboardLayout title="Report Submitted">
        <div className="cf-card" style={{ maxWidth: 520, textAlign: 'center', padding: '3rem 2rem', margin: '0 auto' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#d1fae5', margin: '0 auto 1.25rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className="bi bi-check-lg" style={{ fontSize: '1.75rem', color: '#065f46' }}></i>
          </div>
          <h2 style={{ marginBottom: '0.5rem' }}>Issue Reported!</h2>
          <p style={{ color: 'var(--cf-text-secondary)', marginBottom: '0.5rem' }}>
            Your report has been submitted and assigned the reference number:
          </p>
          <div style={{
            fontFamily: 'var(--cf-font-heading)', fontSize: '1.4rem',
            fontWeight: 700, color: 'var(--cf-primary)',
            background: 'var(--cf-primary-light)', borderRadius: 'var(--cf-radius-md)',
            padding: '0.6rem 1.25rem', display: 'inline-block', marginBottom: '1.5rem',
          }}>
            {success.issueId}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="cf-btn cf-btn-primary"
              onClick={() => navigate(`/issue/${success.id}`)}
            >
              <i className="bi bi-eye"></i> View Report
            </button>
            <button
              className="cf-btn cf-btn-outline"
              onClick={() => {
                setSuccess(null);
                setForm({ title: '', description: '', category: '', severity: 'Medium', address: '', latitude: null, longitude: null });
                setImages([]); setPreviews([]);
                setNearbyIssues([]); setUpvoteState({});
              }}
            >
              <i className="bi bi-plus-circle"></i> Report Another
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Report an Issue">
      <div style={{ maxWidth: 680 }}>

        {apiError && (
          <div className="cf-alert cf-alert-error" style={{ marginBottom: '1.25rem' }}>
            <i className="bi bi-exclamation-circle-fill" style={{ flexShrink: 0 }}></i>
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="cf-card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--cf-border-light)' }}>
              <i className="bi bi-info-circle me-2" style={{ color: 'var(--cf-primary)' }}></i>
              Issue Details
            </h2>

            {/* Title */}
            <div style={{ marginBottom: '1.1rem' }}>
              <label className="cf-form-label">Issue Title</label>
              <input name="title" value={form.title} onChange={handleChange}
                className={`cf-input ${errors.title ? 'is-invalid' : ''}`}
                placeholder="e.g. Deep pothole blocking traffic on Main St" />
              {errors.title && <p className="cf-field-error">{errors.title}</p>}
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1.1rem' }}>
              <label className="cf-form-label">Description</label>
              <textarea name="description" value={form.description} onChange={handleChange}
                rows={4}
                className={`cf-input ${errors.description ? 'is-invalid' : ''}`}
                style={{ resize: 'vertical', minHeight: '100px' }}
                placeholder="Describe the issue in detail — when you noticed it, who it affects, how urgent it is…" />
              {errors.description && <p className="cf-field-error">{errors.description}</p>}
            </div>

            {/* Category + Severity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.1rem' }}>
              <div>
                <label className="cf-form-label">Category</label>
                <select name="category" value={form.category} onChange={handleChange}
                  className={`cf-input ${errors.category ? 'is-invalid' : ''}`}
                  style={{ cursor: 'pointer' }}>
                  <option value="">Select category…</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.category && <p className="cf-field-error">{errors.category}</p>}
              </div>

              <div>
                <label className="cf-form-label">Severity</label>
                <select name="severity" value={form.severity} onChange={handleChange} className="cf-input" style={{ cursor: 'pointer' }}>
                  {Object.keys(SEVERITY_HINTS).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <p style={{ fontSize: '0.76rem', color: 'var(--cf-text-muted)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                  {SEVERITY_HINTS[form.severity]}
                </p>
              </div>
            </div>

            {/* Location — interactive map picker */}
            <div>
              <label className="cf-form-label">Location</label>
              <LocationPicker
                value={{
                  address:   form.address,
                  latitude:  form.latitude,
                  longitude: form.longitude,
                }}
                onChange={({ address, latitude, longitude }) => {
                  setForm((p) => ({ ...p, address, latitude, longitude }));
                  if (errors.address) setErrors((p) => ({ ...p, address: '' }));
                  setApiError('');
                  // Trigger nearby check when location changes
                  scheduleNearbyCheck(form.category, latitude, longitude);
                }}
              />
              {errors.address && <p className="cf-field-error">{errors.address}</p>}
            </div>
          </div>

          {/* ── Similar reports nearby panel ──────────────────────────────── */}
          {/* Shows only when the check returns results.                      */}
          {/* Never blocks submission — it's a suggestion, not a gate.        */}
          {(nearbyLoading || nearbyIssues.length > 0) && (
            <div style={{
              marginBottom: '1rem',
              border: '1.5px solid #f59e0b',
              borderRadius: 'var(--cf-radius-md)',
              overflow: 'hidden',
            }}>
              {/* Panel header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.7rem 1rem',
                background: '#fef3c7',
                borderBottom: nearbyIssues.length > 0 ? '1px solid #fde68a' : 'none',
              }}>
                <i className="bi bi-exclamation-triangle-fill" style={{ color: '#d97706', fontSize: '1rem', flexShrink: 0 }} />
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#92400e' }}>
                    Similar reports nearby
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#a16207', marginLeft: '0.5rem' }}>
                    — upvote an existing one instead if it's the same issue
                  </span>
                </div>
                {nearbyLoading && (
                  <div className="cf-spinner" style={{ width: 16, height: 16, marginLeft: 'auto', borderWidth: 2 }} />
                )}
              </div>

              {/* Match list */}
              {nearbyIssues.length > 0 && (
                <div style={{ background: 'var(--cf-surface)' }}>
                  {nearbyIssues.map((issue, idx) => {
                    const state = upvoteState[issue._id] || 'idle';
                    const isDone    = state === 'done';
                    const isAlready = state === 'already';
                    const isLoading = state === 'loading';

                    return (
                      <div key={issue._id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                        padding: '0.75rem 1rem',
                        borderTop: idx > 0 ? '1px solid var(--cf-border-light)' : 'none',
                        background: isDone || isAlready ? '#f0fdf4' : 'transparent',
                        transition: 'background 200ms',
                      }}>
                        {/* Issue info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                            <Link
                              to={`/issue/${issue._id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--cf-text)', textDecoration: 'none' }}
                              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--cf-primary)'}
                              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--cf-text)'}
                            >
                              {issue.title}
                            </Link>
                            <StatusBadge status={issue.status} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', fontSize: '0.75rem', color: 'var(--cf-text-muted)' }}>
                            <span style={{ fontFamily: 'monospace', color: 'var(--cf-primary)', fontWeight: 600 }}>
                              {issue.issueId}
                            </span>
                            <span>
                              <i className="bi bi-hand-thumbs-up me-1" />
                              {issue.upvoteCount} {issue.upvoteCount === 1 ? 'person' : 'people'} affected
                            </span>
                          </div>
                        </div>

                        {/* Upvote action */}
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          {isDone ? (
                            <div style={{ fontSize: '0.78rem', color: '#065f46', fontWeight: 600 }}>
                              <i className="bi bi-check-circle-fill me-1" />
                              Upvoted!{' '}
                              <Link to={`/issue/${issue._id}`} target="_blank" style={{ color: 'var(--cf-primary)', textDecoration: 'underline', fontWeight: 400 }}>
                                View
                              </Link>
                            </div>
                          ) : isAlready ? (
                            <div style={{ fontSize: '0.78rem', color: 'var(--cf-text-muted)' }}>
                              <i className="bi bi-check2 me-1" />
                              Already upvoted
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpvoteInstead(issue)}
                              disabled={isLoading}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                padding: '0.35rem 0.75rem',
                                borderRadius: 'var(--cf-radius-md)',
                                border: '1.5px solid var(--cf-primary)',
                                background: 'transparent',
                                color: 'var(--cf-primary)',
                                fontWeight: 600, fontSize: '0.78rem',
                                cursor: isLoading ? 'wait' : 'pointer',
                                opacity: isLoading ? 0.7 : 1,
                                transition: 'background 120ms, color 120ms',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={(e) => { if (!isLoading) { e.currentTarget.style.background = 'var(--cf-primary)'; e.currentTarget.style.color = '#fff'; }}}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--cf-primary)'; }}
                            >
                              {isLoading
                                ? <><span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12, borderWidth: 2 }} /> Upvoting…</>
                                : <><i className="bi bi-hand-thumbs-up" /> This is the same issue</>}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Explicit "continue anyway" affordance */}
                  <div style={{
                    padding: '0.55rem 1rem',
                    borderTop: '1px solid var(--cf-border-light)',
                    fontSize: '0.76rem', color: 'var(--cf-text-muted)',
                    background: 'var(--cf-bg)',
                  }}>
                    <i className="bi bi-info-circle me-1" />
                    If your issue is different, continue and submit your own report below.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Image upload */}
          <div className="cf-card" style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--cf-border-light)' }}>
              <i className="bi bi-images me-2" style={{ color: 'var(--cf-primary)' }}></i>
              Photos <span style={{ color: 'var(--cf-text-muted)', fontWeight: 400 }}>(optional, up to {MAX_IMAGES})</span>
            </h2>

            {/* Previews */}
            {previews.length > 0 && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {previews.map((src, i) => (
                  <div key={i} style={{ position: 'relative', width: 90, height: 90 }}>
                    <img src={src} alt={`Preview ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--cf-radius-md)', border: '1px solid var(--cf-border)' }} />
                    <button type="button" onClick={() => removeImage(i)}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'var(--cf-status-rejected)',
                        border: 'none', color: '#fff', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', padding: 0,
                      }}>
                      <i className="bi bi-x"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {images.length < MAX_IMAGES && (
              <button type="button"
                onClick={() => fileRef.current.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.6rem 1.1rem',
                  border: '1.5px dashed var(--cf-border)',
                  borderRadius: 'var(--cf-radius-md)',
                  background: 'transparent',
                  color: 'var(--cf-text-secondary)',
                  cursor: 'pointer', fontSize: '0.875rem',
                  transition: 'border-color 150ms, color 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--cf-primary)'; e.currentTarget.style.color = 'var(--cf-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--cf-border)';  e.currentTarget.style.color = 'var(--cf-text-secondary)'; }}
              >
                <i className="bi bi-upload"></i>
                {images.length === 0 ? 'Upload photos' : `Add more (${MAX_IMAGES - images.length} left)`}
              </button>
            )}
            <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={submitting}>
              {submitting
                ? <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>{uploadStatus || 'Submitting...'}</>
                : <><i className="bi bi-send"></i> Submit Report</>}
            </button>
            <button type="button" className="cf-btn cf-btn-outline" onClick={() => navigate('/dashboard')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
