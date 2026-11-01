'use client';

import React, { useState, useMemo } from 'react';
import { titanWatchesCatalog, CatalogItem } from '@/lib/model';

export default function DigitalBoutiqueCatalog() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Cart state: itemId -> quantity
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Business WhatsApp number
  const businessPhone = '919620642109';

  const categories = [
    { id: 'all', label: 'All Collections (7)' },
    { id: 'casual', label: 'Casual & Daily' },
    { id: 'women', label: 'Women’s Luxury' },
    { id: 'ceramic', label: 'Ultra-Slim Ceramic' },
    { id: 'auto', label: 'Automatic Mechanical' },
    { id: 'sports', label: 'Chronographs' },
    { id: 'smart', label: 'Smartwatches' },
    { id: 'gold', label: '18K Solid Gold' },
  ];

  const filtered = useMemo(() => {
    return titanWatchesCatalog.filter((item) => {
      if (selectedCategory === 'casual' && item.id !== 'titan-neo-casual') return false;
      if (selectedCategory === 'women' && item.id !== 'titan-raga-viva') return false;
      if (selectedCategory === 'ceramic' && item.id !== 'titan-edge-ceramic') return false;
      if (selectedCategory === 'auto' && item.id !== 'titan-grandmaster-auto') return false;
      if (selectedCategory === 'sports' && item.id !== 'titan-octane-chrono') return false;
      if (selectedCategory === 'smart' && item.id !== 'titan-smart-pro') return false;
      if (selectedCategory === 'gold' && item.id !== 'titan-nebula-gold') return false;

      if (search) {
        const q = search.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [selectedCategory, search]);

  // Cart operations
  const addToCart = (item: CatalogItem) => {
    setCart((prev) => ({
      ...prev,
      [item.id]: (prev[item.id] || 0) + 1,
    }));
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const current = next[itemId] || 0;
      const updated = current + delta;
      if (updated <= 0) {
        delete next[itemId];
      } else {
        next[itemId] = updated;
      }
      return next;
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const clearCart = () => setCart({});

  // Computed cart metrics
  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const item = titanWatchesCatalog.find((w) => w.id === id);
        if (!item || qty <= 0) return null;
        return {
          item,
          qty,
          lineTotal: item.price * qty,
        };
      })
      .filter(Boolean) as Array<{ item: CatalogItem; qty: number; lineTotal: number }>;
  }, [cart]);

  const totalItemsCount = useMemo(() => {
    return Object.values(cart).reduce((sum, q) => sum + q, 0);
  }, [cart]);

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, c) => sum + c.lineTotal, 0);
  }, [cartItems]);

  const discountAmount = useMemo(() => {
    // 10% VIP code TITAN10
    return Math.round(subtotal * 0.1);
  }, [subtotal]);

  const finalAmount = Math.max(0, subtotal - discountAmount);

  // Single watch quick order
  const handleSingleOrderOnWhatsApp = (item: CatalogItem) => {
    const text = `Hi Titan Watches!  I would like to order the ${item.name} (₹${item.price.toLocaleString('en-IN')}) with privilege discount code TITAN10. Please help me with delivery & confirmation!`;
    const url = `https://wa.me/${businessPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Bulk WhatsApp Order
  const handleBulkOrderOnWhatsApp = () => {
    if (cartItems.length === 0) return;

    let text = `Hi Titan Watches!  I would like to place an order for the following ${totalItemsCount} timepiece(s):\n\n`;
    cartItems.forEach((c, idx) => {
      text += `${idx + 1}. *${c.item.name}* (Qty: ${c.qty}) — ₹${c.lineTotal.toLocaleString('en-IN')}\n`;
    });

    text += `\n───────────────\n`;
    text += ` *Total Timepieces*: ${totalItemsCount}\n`;
    text += ` *Subtotal*: ₹${subtotal.toLocaleString('en-IN')}\n`;
    text += ` *VIP Privilege Code*: TITAN10 (-10%)\n`;
    text += ` *Final Payable*: ₹${finalAmount.toLocaleString('en-IN')}\n\n`;
    text += `Please confirm availability and dispatch to my delivery address!`;

    const url = `https://wa.me/${businessPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopyLink = (item: CatalogItem) => {
    const text = `I would like to order: ${item.name} (₹${item.price.toLocaleString('en-IN')})`;
    navigator.clipboard?.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const fallbackImg = 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&q=80';

  return (
    <div style={styles.page}>
      {/* Top Banner */}
      <div style={styles.topBanner}>
        <span> World of Titan Official Digital Concierge · 10% OFF Bulk & Single Orders with code <b>TITAN10</b></span>
      </div>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.brandRow}>
            <div style={styles.logoBadge}>TITAN</div>
            <div>
              <h1 style={styles.brandTitle}>Titan Watches</h1>
              <p style={styles.brandSubtitle}>Timeless Craftsmanship, Modern Innovation · Official Online Boutique</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {totalItemsCount > 0 && (
              <button onClick={() => setIsCartOpen(true)} style={styles.headerCartBtn}>
                <span> Cart ({totalItemsCount})</span>
                <span style={styles.cartBtnPrice}>₹{finalAmount.toLocaleString('en-IN')}</span>
              </button>
            )}

            <a
              href={`https://wa.me/${businessPhone}?text=${encodeURIComponent('Hi Titan Watches!  I would like to explore your timepiece collection.')}`}
              target="_blank"
              rel="noreferrer"
              style={styles.headerChatBtn}
            >
              <span> Chat with Titan Watches</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={styles.main}>
        {/* Intro Hero */}
        <section style={styles.heroSection}>
          <div style={styles.heroPill}>INTERACTIVE DIGITAL CATALOG & BULK ORDERING</div>
          <h2 style={styles.heroTitle}>Select Your Perfect Timepieces</h2>
          <p style={styles.heroDesc}>
            Browse our curated horology collection below. Tap <b>"Add to Cart"</b> to order multiple watches in bulk, or <b>"Quick Order"</b> to confirm directly with our luxury concierge desk on WhatsApp.
          </p>

          {/* Search bar */}
          <div style={styles.searchBox}>
            <input
              type="text"
              placeholder="Search by model, style (e.g. casual, automatic, ceramic, gold)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
            {search && (
              <button onClick={() => setSearch('')} style={styles.clearSearchBtn}>✕</button>
            )}
          </div>

          {/* Categories */}
          <div style={styles.categoryScroll}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  ...styles.catBtn,
                  ...(selectedCategory === cat.id ? styles.catBtnActive : {}),
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </section>

        {/* Product Grid */}
        <section style={styles.grid}>
          {filtered.map((item) => {
            const savings = item.mrp ? item.mrp - item.price : 0;
            const itemQty = cart[item.id] || 0;

            return (
              <div key={item.id} style={{ ...styles.card, borderColor: itemQty > 0 ? '#d97706' : 'rgba(51, 65, 85, 0.45)' }}>
                {/* Watch Image with Fallback */}
                <div style={styles.imgWrapper}>
                  <img
                    src={item.image || fallbackImg}
                    alt={item.name}
                    style={styles.img}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = fallbackImg;
                    }}
                  />

                  {/* Badges */}
                  <div style={styles.badgeRow}>
                    {item.bestseller && <span style={styles.bestsellerBadge}> BESTSELLER</span>}
                    <span style={styles.categoryBadge}>{item.category}</span>
                  </div>

                  {itemQty > 0 && (
                    <div style={styles.inCartBadge}>
                      ✓ {itemQty} in Cart
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div style={styles.cardBody}>
                  <div>
                    <h3 style={styles.watchName}>{item.name}</h3>
                    <p style={styles.watchDesc}>{item.description}</p>

                    {/* Specs / Features */}
                    <div style={styles.featureChips}>
                      {item.features?.slice(0, 3).map((f, i) => (
                        <span key={i} style={styles.chip}>✓ {f}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    {/* Pricing Box */}
                    <div style={styles.pricingRow}>
                      <div>
                        <div style={styles.priceCurrent}>₹{item.price.toLocaleString('en-IN')}</div>
                        {item.mrp && (
                          <div style={styles.mrpRow}>
                            <span style={styles.mrpCross}>MRP ₹{item.mrp.toLocaleString('en-IN')}</span>
                            {savings > 0 && <span style={styles.savingsTag}>Save ₹{savings.toLocaleString('en-IN')}</span>}
                          </div>
                        )}
                      </div>

                      <div style={styles.promoTag}>
                        <span>10% OFF</span>
                        <small style={{ fontSize: 9 }}>CODE: TITAN10</small>
                      </div>
                    </div>

                    {/* Actions: Add to Cart + Quantity + Quick Buy */}
                    <div style={styles.btnRow}>
                      {itemQty > 0 ? (
                        <div style={styles.qtyControlRow}>
                          <button onClick={() => updateQuantity(item.id, -1)} style={styles.qtyBtn}>−</button>
                          <span style={styles.qtyNumber}>{itemQty} in Cart</span>
                          <button onClick={() => updateQuantity(item.id, 1)} style={styles.qtyBtn}>+</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          style={styles.addToCartBtn}
                        >
                          <span> Add to Cart</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleSingleOrderOnWhatsApp(item)}
                        style={styles.quickOrderBtn}
                        title="Order this single item directly on WhatsApp"
                      >
                        <span> Quick Buy</span>
                      </button>

                      <button
                        onClick={() => handleCopyLink(item)}
                        style={styles.copyBtn}
                        title="Copy watch selection text"
                      >
                        {copiedId === item.id ? '✓' : ''}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Benefits Strip */}
        <section style={styles.benefitsStrip}>
          <div style={styles.benefitItem}>
            <span style={{ fontSize: 24 }}></span>
            <div>
              <h4 style={styles.benefitTitle}>Free Express Delivery</h4>
              <p style={styles.benefitText}>Pan-India delivery in 2-4 business days via BlueDart & DTDC.</p>
            </div>
          </div>
          <div style={styles.benefitItem}>
            <span style={{ fontSize: 24 }}></span>
            <div>
              <h4 style={styles.benefitTitle}>2-Year Warranty</h4>
              <p style={styles.benefitText}>Official international warranty card + luxury gift packaging.</p>
            </div>
          </div>
          <div style={styles.benefitItem}>
            <span style={{ fontSize: 24 }}></span>
            <div>
              <h4 style={styles.benefitTitle}>Bulk & Gifting Concierge</h4>
              <p style={styles.benefitText}>Custom corporate gifting, multiple units & privilege discount assistance.</p>
            </div>
          </div>
        </section>
      </main>

      {/* Floating Sticky Cart Bar (visible when items in cart) */}
      {totalItemsCount > 0 && (
        <div style={styles.floatingCartBar}>
          <div style={styles.floatingCartInner}>
            <div style={styles.floatingCartInfo}>
              <span style={styles.floatingCartTitle}>
                 Horology Bag: <b>{totalItemsCount} {totalItemsCount === 1 ? 'Watch' : 'Watches'}</b>
              </span>
              <span style={styles.floatingCartSub}>
                Payable: <b style={{ color: '#34d399' }}>₹{finalAmount.toLocaleString('en-IN')}</b> (10% VIP Discount Included)
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setIsCartOpen(true)} style={styles.viewCartBtn}>
                 View Bag ({totalItemsCount})
              </button>
              <button onClick={handleBulkOrderOnWhatsApp} style={styles.bulkOrderBtn}>
                 Order Bulk on WhatsApp 
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer / Modal */}
      {isCartOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsCartOpen(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}> Your Titan Horology Bag ({totalItemsCount})</h3>
              <button onClick={() => setIsCartOpen(false)} style={styles.modalCloseBtn}>✕</button>
            </div>

            <div style={styles.modalBody}>
              {cartItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                  <p style={{ fontSize: 32, margin: '0 0 10px 0' }}></p>
                  <p>Your horology bag is empty.</p>
                  <button onClick={() => setIsCartOpen(false)} style={styles.viewCartBtn}>
                    Explore Collection
                  </button>
                </div>
              ) : (
                <>
                  <div style={styles.cartItemList}>
                    {cartItems.map(({ item, qty, lineTotal }) => (
                      <div key={item.id} style={styles.cartItemRow}>
                        <img
                          src={item.image || fallbackImg}
                          alt={item.name}
                          style={styles.cartItemThumb}
                          onError={(e) => { e.currentTarget.src = fallbackImg; }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={styles.cartItemName}>{item.name}</div>
                          <div style={styles.cartItemCat}>{item.category}</div>
                          <div style={styles.cartItemUnitPrice}>₹{item.price.toLocaleString('en-IN')} each</div>
                        </div>

                        <div style={styles.cartItemControls}>
                          <div style={styles.qtyControlSmall}>
                            <button onClick={() => updateQuantity(item.id, -1)} style={styles.qtySmallBtn}>−</button>
                            <span style={styles.qtySmallNum}>{qty}</span>
                            <button onClick={() => updateQuantity(item.id, 1)} style={styles.qtySmallBtn}>+</button>
                          </div>
                          <div style={styles.cartItemTotal}>₹{lineTotal.toLocaleString('en-IN')}</div>
                          <button onClick={() => removeFromCart(item.id)} style={styles.removeBtn} title="Remove item"></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pricing Breakdown */}
                  <div style={styles.summaryBox}>
                    <div style={styles.summaryRow}>
                      <span style={{ color: '#94a3b8' }}>Subtotal ({totalItemsCount} items)</span>
                      <span style={{ color: '#f8fafc', fontWeight: 600 }}>₹{subtotal.toLocaleString('en-IN')}</span>
                    </div>
                    <div style={styles.summaryRow}>
                      <span style={{ color: '#34d399' }}>Privilege Discount (TITAN10)</span>
                      <span style={{ color: '#34d399', fontWeight: 700 }}>−₹{discountAmount.toLocaleString('en-IN')} (10%)</span>
                    </div>
                    <div style={styles.summaryRow}>
                      <span style={{ color: '#94a3b8' }}>Express Delivery (BlueDart)</span>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>FREE</span>
                    </div>
                    <div style={{ ...styles.summaryRow, borderTop: '1px solid #334155', paddingTop: 10, marginTop: 6 }}>
                      <span style={{ color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>Total Payable</span>
                      <span style={{ color: '#34d399', fontSize: 20, fontWeight: 800 }}>₹{finalAmount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                    <button onClick={handleBulkOrderOnWhatsApp} style={styles.modalBulkBtn}>
                      <span> Complete Bulk Order on WhatsApp (₹{finalAmount.toLocaleString('en-IN')})</span>
                    </button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button onClick={clearCart} style={styles.clearCartBtn}>Empty Bag</button>
                      <button onClick={() => setIsCartOpen(false)} style={styles.continueBtn}>+ Add More Watches</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
             {new Date().getFullYear()} Titan Watches — A TATA Enterprise. Official Digital Concierge Service.
          </p>
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0a0e17',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 80,
  },
  topBanner: {
    background: 'linear-gradient(90deg, #d97706, #b45309)',
    color: '#000',
    padding: '7px 16px',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
  },
  header: {
    background: '#0d1322',
    borderBottom: '1px solid #1e293b',
    position: 'sticky',
    top: 0,
    zIndex: 40,
    backdropFilter: 'blur(8px)',
  },
  headerContent: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    background: '#d97706',
    color: '#000',
    fontWeight: 900,
    fontSize: 15,
    letterSpacing: 2,
    padding: '6px 12px',
    borderRadius: 6,
  },
  brandTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    margin: 0,
    fontSize: 11,
    color: '#94a3b8',
  },
  headerCartBtn: {
    background: '#1e293b',
    border: '1px solid #d97706',
    color: '#f8fafc',
    padding: '8px 14px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  cartBtnPrice: {
    background: '#d97706',
    color: '#000',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 800,
  },
  headerChatBtn: {
    background: '#059669',
    color: '#fff',
    textDecoration: 'none',
    padding: '8px 16px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
  },
  main: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '32px 20px',
    flex: 1,
    width: '100%',
    boxSizing: 'border-box',
  },
  heroSection: {
    textAlign: 'center',
    maxWidth: 760,
    margin: '0 auto 36px auto',
  },
  heroPill: {
    display: 'inline-block',
    background: 'rgba(217, 119, 6, 0.15)',
    border: '1px solid rgba(217, 119, 6, 0.3)',
    color: '#fbbf24',
    padding: '4px 12px',
    borderRadius: 14,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: 800,
    color: '#f8fafc',
    margin: '0 0 10px 0',
  },
  heroDesc: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 1.6,
    margin: '0 0 24px 0',
  },
  searchBox: {
    position: 'relative',
    maxWidth: 540,
    margin: '0 auto 20px auto',
  },
  searchInput: {
    width: '100%',
    background: '#111827',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '12px 18px',
    fontSize: 13,
    color: '#f8fafc',
    outline: 'none',
    boxSizing: 'border-box',
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 14,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 14,
  },
  categoryScroll: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  catBtn: {
    background: '#131b2e',
    color: '#94a3b8',
    border: '1px solid #1e293b',
    padding: '7px 16px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  catBtnActive: {
    background: '#d97706',
    color: '#000',
    borderColor: '#d97706',
    fontWeight: 800,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 24,
    marginBottom: 48,
  },
  card: {
    background: '#111827',
    border: '1px solid rgba(51, 65, 85, 0.45)',
    borderRadius: 14,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'transform 0.2s ease, border-color 0.2s ease',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
  },
  imgWrapper: {
    height: 220,
    background: '#0a0f1d',
    position: 'relative',
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 0.3s ease',
  },
  badgeRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  inCartBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    background: 'rgba(5, 150, 105, 0.95)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 4,
  },
  bestsellerBadge: {
    background: 'rgba(217, 119, 6, 0.95)',
    color: '#000',
    fontSize: 10,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: 4,
    letterSpacing: 0.5,
  },
  categoryBadge: {
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#94a3b8',
    border: '1px solid rgba(51, 65, 85, 0.6)',
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 4,
    backdropFilter: 'blur(4px)',
  },
  cardBody: {
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    justifyContent: 'space-between',
  },
  watchName: {
    margin: '0 0 6px 0',
    fontSize: 17,
    fontWeight: 700,
    color: '#f8fafc',
    lineHeight: 1.3,
  },
  watchDesc: {
    margin: '0 0 14px 0',
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.5,
  },
  featureChips: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  chip: {
    fontSize: 10,
    background: 'rgba(30, 41, 59, 0.7)',
    color: '#cbd5e1',
    padding: '3px 8px',
    borderRadius: 4,
    border: '1px solid rgba(51, 65, 85, 0.5)',
  },
  pricingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTop: '1px solid rgba(51, 65, 85, 0.3)',
    paddingTop: 14,
    marginBottom: 16,
  },
  priceCurrent: {
    fontSize: 22,
    fontWeight: 800,
    color: '#34d399',
  },
  mrpRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  mrpCross: {
    fontSize: 11,
    color: '#64748b',
    textDecoration: 'line-through',
  },
  savingsTag: {
    fontSize: 10,
    fontWeight: 700,
    color: '#fbbf24',
  },
  promoTag: {
    background: 'rgba(217, 119, 6, 0.15)',
    border: '1px solid rgba(217, 119, 6, 0.3)',
    color: '#fbbf24',
    padding: '4px 8px',
    borderRadius: 6,
    textAlign: 'center',
    fontWeight: 800,
    fontSize: 11,
  },
  btnRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  addToCartBtn: {
    flex: 1.4,
    background: 'linear-gradient(135deg, #d97706, #b45309)',
    color: '#000',
    border: 'none',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)',
  },
  qtyControlRow: {
    flex: 1.4,
    background: '#1e293b',
    border: '1px solid #d97706',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
  },
  qtyBtn: {
    background: '#d97706',
    color: '#000',
    border: 'none',
    width: 26,
    height: 26,
    borderRadius: 6,
    fontWeight: 800,
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyNumber: {
    color: '#fbbf24',
    fontWeight: 700,
    fontSize: 12,
  },
  quickOrderBtn: {
    flex: 1,
    background: 'linear-gradient(135deg, #059669, #047857)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  copyBtn: {
    background: '#1f2937',
    border: '1px solid #374151',
    color: '#cbd5e1',
    padding: '10px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
  },
  benefitsStrip: {
    background: '#111827',
    border: '1px solid rgba(51, 65, 85, 0.4)',
    borderRadius: 12,
    padding: '24px 28px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 20,
  },
  benefitItem: {
    display: 'flex',
    gap: 14,
    alignItems: 'flex-start',
  },
  benefitTitle: {
    margin: '0 0 4px 0',
    fontSize: 14,
    fontWeight: 700,
    color: '#f8fafc',
  },
  benefitText: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 1.4,
  },
  floatingCartBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(13, 19, 34, 0.95)',
    borderTop: '1px solid #d97706',
    backdropFilter: 'blur(12px)',
    padding: '14px 20px',
    zIndex: 50,
    boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.6)',
  },
  floatingCartInner: {
    maxWidth: 1280,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  floatingCartInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  floatingCartTitle: {
    fontSize: 15,
    color: '#f8fafc',
  },
  floatingCartSub: {
    fontSize: 12,
    color: '#94a3b8',
  },
  viewCartBtn: {
    background: '#1e293b',
    border: '1px solid #475569',
    color: '#f8fafc',
    padding: '10px 16px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  bulkOrderBtn: {
    background: 'linear-gradient(135deg, #059669, #047857)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(4px)',
    zIndex: 100,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 16,
    width: '100%',
    maxWidth: 580,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #1e293b',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 800,
    color: '#f8fafc',
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: 18,
    cursor: 'pointer',
  },
  modalBody: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1,
  },
  cartItemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 20,
  },
  cartItemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px',
    background: '#1e293b',
    borderRadius: 10,
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  cartItemThumb: {
    width: 54,
    height: 54,
    borderRadius: 6,
    objectFit: 'cover',
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: 700,
    color: '#f8fafc',
  },
  cartItemCat: {
    fontSize: 11,
    color: '#94a3b8',
  },
  cartItemUnitPrice: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  cartItemControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  qtyControlSmall: {
    display: 'flex',
    alignItems: 'center',
    background: '#0f172a',
    borderRadius: 6,
    border: '1px solid #334155',
  },
  qtySmallBtn: {
    background: 'transparent',
    color: '#cbd5e1',
    border: 'none',
    width: 24,
    height: 24,
    cursor: 'pointer',
    fontWeight: 700,
  },
  qtySmallNum: {
    fontSize: 12,
    fontWeight: 700,
    padding: '0 6px',
    color: '#f8fafc',
  },
  cartItemTotal: {
    fontSize: 13,
    fontWeight: 800,
    color: '#34d399',
    minWidth: 65,
    textAlign: 'right',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    opacity: 0.7,
  },
  summaryBox: {
    background: '#131b2e',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '14px 16px',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    marginBottom: 6,
  },
  modalBulkBtn: {
    background: 'linear-gradient(135deg, #059669, #047857)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '14px 20px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(5, 150, 105, 0.4)',
    textAlign: 'center',
  },
  clearCartBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ef4444',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  continueBtn: {
    background: 'transparent',
    border: 'none',
    color: '#38bdf8',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
  },
  footer: {
    borderTop: '1px solid rgba(51, 65, 85, 0.4)',
    padding: '24px 20px',
    textAlign: 'center',
    background: '#060a12',
  },
  footerInner: {
    maxWidth: 1200,
    margin: '0 auto',
  },
};
