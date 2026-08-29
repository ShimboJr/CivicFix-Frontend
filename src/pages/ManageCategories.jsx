import { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import AdminLayout from '../components/AdminLayout';

const ICON_SUGGESTIONS = [
  'bi-lightbulb', 'bi-droplet', 'bi-trash', 'bi-tree', 'bi-road',
  'bi-lightning', 'bi-building', 'bi-cone-striped', 'bi-water',
  'bi-sign-stop', 'bi-lamp', 'bi-bandaid', 'bi-wifi-off', 'bi-bug',
];

const BLANK = { name: '', icon: 'bi-tag' };

export default function ManageCategories() {
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [form,       setForm]       = useState(BLANK);
  const [editId,     setEditId]     = useState(null); // null = add mode

  const fetchCats = useCallback(() => {
    setLoading(true);
    api.get('/admin/categories')
      .then(({ data }) => setCategories(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCats(); }, [fetchCats]);

  const startEdit = (cat) => { setEditId(cat._id); setForm({ name: cat.name, icon: cat.icon }); setError(''); };
  const cancelEdit = ()  => { setEditId(null); setForm(BLANK); setError(''); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Category name is required'); return; }
    setSaving(true); setError('');
    try {
      if (editId) {
        await api.put(`/admin/categories/${editId}`, form);
      } else {
        await api.post('/admin/categories', form);
      }
      cancelEdit(); fetchCats();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"? Issues using it may be affected.`)) return;
    setError('');
    try {
      await api.delete(`/admin/categories/${cat._id}`);
      fetchCats();
    } catch (err) { setError(err.message); }
  };

  return (
    <AdminLayout title="Manage Categories">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Category list ─────────────────────────────────────────────── */}
        <div>
          {error && (
            <div className="cf-alert cf-alert-error" style={{ marginBottom: '1rem' }}>
              <i className="bi bi-exclamation-circle-fill"></i> {error}
            </div>
          )}

          {loading ? (
            <div className="cf-spinner-wrap" style={{ minHeight: '30vh' }}><div className="cf-spinner"></div></div>
          ) : (
            <div className="cf-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Icon', 'Name', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '0.65rem 1rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--cf-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--cf-bg)', borderBottom: '1px solid var(--cf-border)', textAlign: 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--cf-text-muted)', fontSize: '0.875rem' }}>
                      No categories yet. Add one using the form.
                    </td></tr>
                  ) : categories.map((cat) => (
                    <tr key={cat._id}
                      style={{ background: editId === cat._id ? 'var(--cf-primary-light)' : 'transparent' }}
                      onMouseEnter={(e) => { if (editId !== cat._id) e.currentTarget.style.background = 'var(--cf-bg)'; }}
                      onMouseLeave={(e) => { if (editId !== cat._id) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '0.7rem 1rem', borderBottom: '1px solid var(--cf-border-light)', width: 60 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--cf-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cf-primary)', fontSize: '1.1rem' }}>
                          <i className={`bi ${cat.icon}`}></i>
                        </div>
                      </td>
                      <td style={{ padding: '0.7rem 1rem', fontWeight: 500, borderBottom: '1px solid var(--cf-border-light)' }}>{cat.name}</td>
                      <td style={{ padding: '0.7rem 1rem', borderBottom: '1px solid var(--cf-border-light)' }}>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => startEdit(cat)}
                            style={{ padding: '0.3rem 0.6rem', border: '1px solid var(--cf-border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--cf-primary)' }}>
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button onClick={() => handleDelete(cat)}
                            style={{ padding: '0.3rem 0.6rem', border: '1px solid #fee2e2', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: '0.8rem', color: '#ef4444' }}>
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Add / Edit form ───────────────────────────────────────────── */}
        <div className="cf-card" style={{ position: 'sticky', top: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--cf-border-light)' }}>
            <i className={`bi ${editId ? 'bi-pencil-square' : 'bi-plus-circle'} me-2`} style={{ color: 'var(--cf-primary)' }}></i>
            {editId ? 'Edit Category' : 'Add Category'}
          </h3>

          <form onSubmit={handleSave}>
            <div style={{ marginBottom: '1rem' }}>
              <label className="cf-form-label">Category Name</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="cf-input" placeholder="e.g. Road Infrastructure" />
            </div>

            <div style={{ marginBottom: '1.1rem' }}>
              <label className="cf-form-label">Bootstrap Icon Class</label>
              <input value={form.icon} onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}
                className="cf-input" placeholder="bi-tag" />
              {/* Preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', color: 'var(--cf-text-secondary)', fontSize: '0.875rem' }}>
                Preview: <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--cf-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cf-primary)', fontSize: '1rem' }}>
                  <i className={`bi ${form.icon}`}></i>
                </div>
              </div>
              {/* Quick-pick icons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.6rem' }}>
                {ICON_SUGGESTIONS.map((ic) => (
                  <button key={ic} type="button" title={ic}
                    onClick={() => setForm((p) => ({ ...p, icon: ic }))}
                    style={{
                      width: 30, height: 30, borderRadius: 6, border: '1.5px solid',
                      borderColor: form.icon === ic ? 'var(--cf-primary)' : 'var(--cf-border)',
                      background: form.icon === ic ? 'var(--cf-primary-light)' : 'transparent',
                      color: form.icon === ic ? 'var(--cf-primary)' : 'var(--cf-text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: '0.95rem',
                    }}>
                    <i className={`bi ${ic}`}></i>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button type="submit" disabled={saving} className="cf-btn cf-btn-primary" style={{ flex: 1 }}>
                {saving ? 'Saving…' : editId ? 'Save Changes' : <><i className="bi bi-plus-circle"></i> Add</>}
              </button>
              {editId && (
                <button type="button" onClick={cancelEdit} className="cf-btn cf-btn-outline">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
