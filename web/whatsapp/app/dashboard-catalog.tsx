'use client';

import { useState, useId, type FormEvent } from 'react';
import { Package, Plus, Pencil, Trash2, Tag, Check, X, Sparkles, AlertCircle } from 'lucide-react';
import type { CatalogItem } from '../lib/model';

const emptyProduct = (): CatalogItem => ({
  id: '',
  name: '',
  category: 'General',
  price: 0,
  currency: 'INR',
  description: '',
  features: [],
  inStock: true,
});

const money = (p: CatalogItem) => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: p.currency, maximumFractionDigits: 0 }).format(p.price);
  } catch {
    return `${p.currency} ${p.price}`;
  }
};

export default function DashboardCatalog({
  catalog,
  onSave,
  categories = [],
}: {
  catalog: CatalogItem[];
  categories?: string[];
  onSave: (items: CatalogItem[], categories?: string[]) => Promise<boolean>;
}) {
  const [newCategory, setNewCategory] = useState('');
  const categoryId = useId();
  const allCategories = Array.from(new Set([...categories, ...catalog.map(item => item.category)].filter(Boolean)));
  const [draft, setDraft] = useState<CatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  async function persist(items: CatalogItem[], cats?: string[]) {
    setBusy(true);
    setError('');
    try {
      const ok = await onSave(items, cats || allCategories);
      if (!ok) setError('Changes were not saved. Please retry.');
      return ok;
    } catch {
      setError('Changes were not saved. Please retry.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    const cat = newCategory.trim();
    if (!cat) return;
    if (allCategories.includes(cat)) {
      setNewCategory('');
      return;
    }
    const updated = [...allCategories, cat];
    setBusy(true);
    try {
      const ok = await persist(catalog, updated);
      if (ok) setNewCategory('');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveCategory(categoryToRemove: string) {
    if (!window.confirm(`Remove category "${categoryToRemove}"? (Products will remain in catalog)`)) return;
    const updated = allCategories.filter(c => c !== categoryToRemove);
    await persist(catalog, updated);
  }

  async function submitProduct(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim() || !Number.isFinite(draft.price) || draft.price < 0) {
      setError('Enter a valid product name and non-negative price.');
      return;
    }
    const item = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      name: draft.name.trim(),
      category: draft.category.trim() || 'General',
      currency: draft.currency.toUpperCase(),
    };
    const next = draft.id ? catalog.map(p => (p.id === draft.id ? item : p)) : [item, ...catalog];
    if (await persist(next)) setDraft(null);
  }

  const filteredCatalog = activeCategoryFilter === 'all'
    ? catalog
    : catalog.filter(p => p.category.toLowerCase() === activeCategoryFilter.toLowerCase());

  return (
    <div style={catalogStyles.container}>
      {/* Top Header */}
      <div style={catalogStyles.topHeader}>
        <div>
          <span style={catalogStyles.eyebrow}>INVENTORY & COLLECTIONS</span>
          <h2 style={catalogStyles.pageTitle}>Products & Catalog</h2>
          <p style={catalogStyles.pageSubtitle}>
            Saved products power your public catalog boutique and AI conversational concierge.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => {
            setDraft(emptyProduct());
            setError('');
          }}
          style={catalogStyles.addProductBtn}
        >
          <Plus size={17} /> Add Product
        </button>
      </div>

      {/* Categories & Collections Management Card */}
      <section style={catalogStyles.categorySection}>
        <div style={catalogStyles.categoryHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag size={17} color="#7354da" />
            <h3 style={catalogStyles.categoryTitle}>Collections & Categories</h3>
          </div>
          <span style={catalogStyles.categoryCountBadge}>
            {allCategories.length} collections
          </span>
        </div>
        <p style={catalogStyles.categoryDesc}>
          Organize your timepieces into collections. Add as many custom categories as needed for seamless navigation.
        </p>

        {/* Add Category Form */}
        <form onSubmit={handleAddCategory} style={catalogStyles.addCatForm}>
          <input
            type="text"
            aria-label="New category name"
            value={newCategory}
            maxLength={80}
            onChange={e => setNewCategory(e.target.value)}
            placeholder="Type new category (e.g. Tourbillon, Limited Edition)…"
            style={catalogStyles.catInput}
          />
          <button
            type="submit"
            disabled={busy || !newCategory.trim()}
            style={{
              ...catalogStyles.addCatBtn,
              opacity: busy || !newCategory.trim() ? 0.6 : 1,
            }}
          >
            <Plus size={15} /> Add Category
          </button>
        </form>

        {/* Category Pills List */}
        <div style={catalogStyles.chipWrap}>
          <button
            type="button"
            onClick={() => setActiveCategoryFilter('all')}
            style={{
              ...catalogStyles.categoryPill,
              background: activeCategoryFilter === 'all' ? '#7354da' : '#f1effa',
              color: activeCategoryFilter === 'all' ? '#ffffff' : '#58409a',
              borderColor: activeCategoryFilter === 'all' ? '#7354da' : '#ded7f2',
            }}
          >
            <span>All Products ({catalog.length})</span>
          </button>
          {allCategories.map(cat => {
            const count = catalog.filter(p => p.category.toLowerCase() === cat.toLowerCase()).length;
            const isSelected = activeCategoryFilter.toLowerCase() === cat.toLowerCase();
            return (
              <div
                key={cat}
                style={{
                  ...catalogStyles.categoryPill,
                  background: isSelected ? '#7354da' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#334155',
                  borderColor: isSelected ? '#7354da' : '#e2e8f0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <span
                  onClick={() => setActiveCategoryFilter(isSelected ? 'all' : cat)}
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <strong>{cat}</strong>
                  <small style={{ opacity: 0.75, fontSize: 11 }}>({count})</small>
                </span>
                <button
                  type="button"
                  title={`Remove ${cat}`}
                  onClick={() => handleRemoveCategory(cat)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isSelected ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                    padding: '0 2px',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Error Banner */}
      {error && (
        <div style={catalogStyles.errorBanner} role="alert">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Product Editor Modal / Form */}
      {draft && (
        <form onSubmit={submitProduct} style={catalogStyles.editorForm}>
          <div style={catalogStyles.editorHeader}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1e1b4b' }}>
              {draft.id ? 'Edit Timepiece' : 'Add New Timepiece'}
            </h3>
            <button
              type="button"
              onClick={() => setDraft(null)}
              style={catalogStyles.closeBtn}
            >
              <X size={18} />
            </button>
          </div>

          <div style={catalogStyles.formGrid}>
            <label style={catalogStyles.field}>
              <span>Product Name *</span>
              <input
                required
                maxLength={200}
                value={draft.name}
                placeholder="e.g. Titan Grand Prix Chronograph"
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                style={catalogStyles.input}
              />
            </label>

            <label style={catalogStyles.field}>
              <span>Category *</span>
              <input
                required
                maxLength={80}
                list={categoryId}
                value={draft.category}
                placeholder="Choose or type category"
                onChange={e => setDraft({ ...draft, category: e.target.value })}
                style={catalogStyles.input}
              />
              <datalist id={categoryId}>
                {allCategories.map(category => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>

            <label style={catalogStyles.field}>
              <span>Price (INR ₹) *</span>
              <input
                required
                type="number"
                min="0"
                step="1"
                value={draft.price}
                onChange={e => setDraft({ ...draft, price: Number(e.target.value) })}
                style={catalogStyles.input}
              />
            </label>

            <label style={catalogStyles.field}>
              <span>MRP / Original Price (optional)</span>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 18995"
                value={draft.mrp ?? ''}
                onChange={e => setDraft({ ...draft, mrp: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={catalogStyles.input}
              />
            </label>

            <label style={{ ...catalogStyles.field, gridColumn: '1 / -1' }}>
              <span>Image URL (optional)</span>
              <input
                type="url"
                placeholder="https://images.unsplash.com/..."
                value={draft.image || ''}
                onChange={e => setDraft({ ...draft, image: e.target.value })}
                style={catalogStyles.input}
              />
            </label>

            <label style={{ ...catalogStyles.field, gridColumn: '1 / -1' }}>
              <span>Description</span>
              <textarea
                rows={3}
                placeholder="Craftsmanship highlights, case dimension, movement details..."
                value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
                style={catalogStyles.textarea}
              />
            </label>

            <label style={{ ...catalogStyles.field, gridColumn: '1 / -1' }}>
              <span>Features (one per line)</span>
              <textarea
                rows={3}
                placeholder="Sapphire crystal&#10;50m water resistance&#10;2 Years International Warranty"
                value={draft.features.join('\n')}
                onChange={e => setDraft({ ...draft, features: e.target.value.split('\n') })}
                style={catalogStyles.textarea}
              />
            </label>
          </div>

          <label style={catalogStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={draft.inStock}
              onChange={e => setDraft({ ...draft, inStock: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: '#7354da' }}
            />
            <span style={{ fontSize: 13.5, fontWeight: 500, color: '#1e293b' }}>
              Available in Stock (Eligible for instant orders)
            </span>
          </label>

          <div style={catalogStyles.editorActions}>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
              style={catalogStyles.cancelBtn}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              style={catalogStyles.saveProductBtn}
            >
              {busy ? 'Saving Timepiece…' : 'Save Timepiece'}
            </button>
          </div>
        </form>
      )}

      {/* Product List Grid */}
      {!catalog.length ? (
        <div style={catalogStyles.emptyState}>
          <Package size={44} color="#94a3b8" />
          <h3 style={{ margin: '12px 0 6px', fontSize: 18, color: '#334155' }}>
            No products in catalog yet
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Add your luxury timepieces, set pricing and stock to begin receiving orders.
          </p>
        </div>
      ) : (
        <div style={catalogStyles.productGrid}>
          {filteredCatalog.map(product => (
            <article key={product.id} style={catalogStyles.productCard}>
              <div style={catalogStyles.cardTop}>
                <span style={catalogStyles.cardCategory}>{product.category}</span>
                <span
                  style={{
                    ...catalogStyles.stockBadge,
                    background: product.inStock ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: product.inStock ? '#059669' : '#dc2626',
                    borderColor: product.inStock ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: product.inStock ? '#10b981' : '#ef4444',
                    }}
                  />
                  {product.inStock ? 'In Stock' : 'Out of Stock'}
                </span>
              </div>

              <h4 style={catalogStyles.productName}>{product.name}</h4>
              <p style={catalogStyles.productDesc}>{product.description || 'Handcrafted luxury timepiece.'}</p>

              <div style={catalogStyles.priceRow}>
                <strong style={catalogStyles.productPrice}>{money(product)}</strong>
                {product.mrp && product.mrp > product.price && (
                  <span style={catalogStyles.mrpPrice}>
                    MRP ₹{product.mrp.toLocaleString('en-IN')}
                  </span>
                )}
              </div>

              <div style={catalogStyles.cardFooter}>
                <button
                  disabled={busy}
                  onClick={() => {
                    setDraft({ ...product, features: [...product.features] });
                    setError('');
                  }}
                  style={catalogStyles.cardActionBtn}
                  title="Edit product"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void persist(
                      catalog.map(p => (p.id === product.id ? { ...p, inStock: !p.inStock } : p))
                    )
                  }
                  style={catalogStyles.cardActionBtn}
                >
                  {product.inStock ? 'Mark Sold' : 'Restock'}
                </button>
                <button
                  aria-label={'Delete ' + product.name}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete ${product.name} from catalog?`)) {
                      void persist(catalog.filter(p => p.id !== product.id));
                    }
                  }}
                  style={{ ...catalogStyles.cardActionBtn, color: '#ef4444' }}
                  title="Delete product"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const catalogStyles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1380,
    margin: '0 auto',
    padding: '16px 8px 48px',
  },
  topHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '1.2px',
    color: '#7354da',
    display: 'block',
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1e1b4b',
    margin: '0 0 6px',
    letterSpacing: '-0.4px',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    margin: 0,
    lineHeight: 1.5,
  },
  addProductBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: '#7354da',
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 18px',
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 3px 10px rgba(115, 84, 218, 0.25)',
  },
  categorySection: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: '20px',
    marginBottom: 24,
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  },
  categoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
  },
  categoryCountBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 9px',
    borderRadius: 999,
    background: '#f1f5f9',
    color: '#64748b',
  },
  categoryDesc: {
    fontSize: 12.5,
    color: '#64748b',
    margin: '0 0 14px',
    lineHeight: 1.5,
  },
  addCatForm: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  catInput: {
    flex: '1 1 240px',
    padding: '10px 14px',
    borderRadius: 9,
    border: '1.5px solid #cbd5e1',
    background: '#f8fafc',
    fontSize: 13.5,
    color: '#0f172a',
    outline: 'none',
  },
  addCatBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    borderRadius: 9,
    background: '#f5f0fc',
    color: '#7354da',
    border: '1px solid #e0d5f8',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  chipWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
    borderTop: '1px solid #f1f5f9',
  },
  categoryPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid transparent',
    transition: 'all 0.15s ease',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderRadius: 10,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    fontSize: 13,
    marginBottom: 18,
  },
  editorForm: {
    background: '#ffffff',
    border: '1.5px solid #7354da40',
    borderRadius: 16,
    padding: '24px',
    marginBottom: 28,
    boxShadow: '0 10px 30px rgba(115, 84, 218, 0.08)',
  },
  editorHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    borderBottom: '1px solid #f1f5f9',
    paddingBottom: 12,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
    marginBottom: 18,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: '#334155',
  },
  input: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    fontSize: 13.5,
    color: '#0f172a',
    outline: 'none',
  },
  textarea: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    fontSize: 13.5,
    color: '#0f172a',
    outline: 'none',
    resize: 'vertical',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '12px 0 20px',
    cursor: 'pointer',
  },
  editorActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    borderTop: '1px solid #f1f5f9',
    paddingTop: 16,
  },
  cancelBtn: {
    padding: '9px 16px',
    borderRadius: 8,
    background: '#f1f5f9',
    border: '1px solid #cbd5e1',
    color: '#475569',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  saveProductBtn: {
    padding: '9px 20px',
    borderRadius: 8,
    background: '#7354da',
    border: 'none',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  emptyState: {
    textAlign: 'center',
    padding: '50px 20px',
    background: '#ffffff',
    borderRadius: 16,
    border: '1px dashed #cbd5e1',
  },
  productGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))',
    gap: 18,
  },
  productCard: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardCategory: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.8px',
    color: '#7354da',
    textTransform: 'uppercase',
  },
  stockBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 600,
    border: '1px solid transparent',
  },
  productName: {
    fontSize: 16,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 6px',
    lineHeight: 1.3,
  },
  productDesc: {
    fontSize: 12.5,
    color: '#64748b',
    margin: '0 0 14px',
    lineHeight: 1.5,
    flex: 1,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 14,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0f172a',
  },
  mrpPrice: {
    fontSize: 12,
    color: '#94a3b8',
    textDecoration: 'line-through',
  },
  cardFooter: {
    display: 'flex',
    gap: 6,
    borderTop: '1px solid #f1f5f9',
    paddingTop: 12,
    marginTop: 'auto',
  },
  cardActionBtn: {
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '7px 10px',
    borderRadius: 8,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    color: '#334155',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
