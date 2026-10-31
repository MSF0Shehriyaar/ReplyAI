'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Lock, Flame, ShieldAlert, Sparkles, Clock, AlertTriangle, ExternalLink, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function SnapViewerPage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : Array.isArray(params?.token) ? params.token[0] : '';

  const [status, setStatus] = useState<'loading' | 'ready' | 'viewing' | 'burned' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [burnReason, setBurnReason] = useState<string>('viewed');
  const [snapData, setSnapData] = useState<{ imageUrl: string; username: string; durationSeconds: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(7);
  const [progressPercent, setProgressPercent] = useState(100);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);
  const timerRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);
  const burnedRef = useRef(false);
  const isHoldingRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  // 1. Fetch snap data on mount
  useEffect(() => {
    if (!token) return;
    let isMounted = true;

    async function loadSnap() {
      try {
        const res = await fetch(`/api/snap?token=${encodeURIComponent(token)}`);
        const data: any = await res.json();

        if (!isMounted) return;

        if (!res.ok) {
          setStatus(data.burned ? 'burned' : 'error');
          setErrorMessage(data.error || 'This snap is unavailable or has already expired.');
          return;
        }

        const duration = data.durationSeconds || 7;
        setSnapData({
          imageUrl: data.imageUrl,
          username: data.username || 'follower',
          durationSeconds: duration
        });
        setTimeLeft(duration);

        // Preload image in memory (never exposed in DOM directly)
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = data.imageUrl;
        img.onload = () => {
          imageObjRef.current = img;
          if (isMounted) setStatus('ready');
        };
        img.onerror = () => {
          if (isMounted) {
            setStatus('error');
            setErrorMessage('Could not load encrypted snap.');
          }
        };
      } catch (err: any) {
        if (!isMounted) return;
        setStatus('error');
        setErrorMessage(err?.message || 'Failed to connect to snap service.');
      }
    }

    loadSnap();
    return () => { isMounted = false; };
  }, [token]);

  // 2. Burn the snap permanently
  const burnSnap = useCallback((reason = 'viewed') => {
    if (burnedRef.current) return;
    burnedRef.current = true;
    isHoldingRef.current = false;
    setBurnReason(reason);
    setStatus('burned');

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Instantly wipe canvas in memory
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    imageObjRef.current = null;

    // Call server to ensure burn is logged
    if (token) {
      fetch(`/api/snap?token=${encodeURIComponent(token)}&action=burn`, { method: 'GET', keepalive: true }).catch(() => {});
    }
  }, [token]);

  // 3. Render Canvas with Subtle, Non-Intrusive Aesthetic Watermark
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageObjRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas pixel density
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Background fill
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, w, h);

    // Aspect ratio fit
    const hRatio = w / img.width;
    const vRatio = h / img.height;
    const ratio = Math.max(hRatio, vRatio);
    const centerShiftX = (w - img.width * ratio) / 2;
    const centerShiftY = (h - img.height * ratio) / 2;

    ctx.drawImage(img, 0, 0, img.width, img.height, centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);

    // Subtle, elegant diagonal watermark (low opacity 0.08, no heavy shadow so it does NOT ruin the photo)
    ctx.save();
    ctx.rotate(-22 * Math.PI / 180);
    ctx.font = '500 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';

    const usernameTag = snapData?.username || 'follower';
    const watermarkText = `@${usernameTag} • PRIVATE VIEW`;
    const stepX = 320;
    const stepY = 160;

    for (let x = -w * 1.5; x < w * 2.5; x += stepX) {
      for (let y = -h * 1.5; y < h * 2.5; y += stepY) {
        ctx.fillText(watermarkText, x, y);
      }
    }
    ctx.restore();
  }, [snapData?.username]);

  // 4. Tap and Hold Interaction
  const handlePointerDown = (e: React.PointerEvent | React.TouchEvent) => {
    if (status !== 'ready' || burnedRef.current) return;
    e.preventDefault();

    isHoldingRef.current = true;
    setStatus('viewing');
    startTimeRef.current = Date.now();
    const duration = snapData?.durationSeconds || 7;
    const totalMs = duration * 1000;

    setTimeout(() => {
      renderCanvas();
    }, 20);

    const updateProgress = () => {
      if (!isHoldingRef.current || burnedRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const remainingMs = Math.max(0, totalMs - elapsed);
      const remainingSec = Math.ceil(remainingMs / 1000);
      const pct = (remainingMs / totalMs) * 100;

      setTimeLeft(remainingSec);
      setProgressPercent(pct);

      if (remainingMs <= 0) {
        burnSnap('timer_expired');
      } else {
        animFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animFrameRef.current = requestAnimationFrame(updateProgress);
  };

  // AS SOON AS THEY LEAVE / RELEASE -> DESTRUCTS IMMEDIATELY!
  const handlePointerUp = (e: React.PointerEvent | React.TouchEvent) => {
    e.preventDefault();
    if (isHoldingRef.current && status === 'viewing') {
      isHoldingRef.current = false;
      burnSnap('released');
    }
  };

  // 5. Anti-Screenshot & Screen Tamper Detection
  useEffect(() => {
    const handleBlur = () => {
      if (status === 'viewing') {
        burnSnap('window_switched');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && status === 'viewing') {
        burnSnap('tab_hidden');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' ||
        (e.ctrlKey && (e.key === 'p' || e.key === 's')) ||
        (e.metaKey && (e.key === 'p' || e.key === 's')) ||
        (e.metaKey && e.shiftKey)
      ) {
        e.preventDefault();
        if (status === 'viewing' || status === 'ready') {
          burnSnap('screenshot_blocked');
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('resize', renderCanvas);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('resize', renderCanvas);
    };
  }, [status, burnSnap, renderCanvas]);

  return (
    <main
      className="snap-page-root"
      style={{
        minHeight: '100vh',
        backgroundColor: '#07060b',
        backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(115, 84, 218, 0.15) 0%, transparent 70%)',
        color: '#f5f3ff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none'
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Centered Premium Card Container */}
      <div
        className="snap-card"
        style={{
          width: '100%',
          maxWidth: '430px',
          background: 'rgba(18, 15, 28, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          padding: '20px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(115, 84, 218, 0.15)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Card Header: Profile + Username Badge */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            paddingBottom: '14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          {/* Creator Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: '#120f1c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '15px',
                  color: '#f3e8ff'
                }}
              >
                N
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                <span>Nina Kurain</span>
                <CheckCircle2 size={15} style={{ color: '#a855f7' }} />
              </div>
              <div style={{ fontSize: '11px', color: '#9d94b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={11} style={{ color: '#e879f9' }} /> Exclusive View-Once
              </div>
            </div>
          </div>

          {/* Accessing Username Pill */}
          <div
            title={`Cryptographically bound to @${snapData?.username || 'follower'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(115, 84, 218, 0.15)',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#d8b4fe',
              letterSpacing: '0.2px'
            }}
          >
            <Lock size={12} style={{ color: '#c084fc' }} />
            <span>@{snapData?.username || 'user'}</span>
          </div>
        </header>

        {/* Media Frame inside the Card */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '460px',
            borderRadius: '18px',
            backgroundColor: '#0a0812',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 0 25px rgba(0, 0, 0, 0.7)',
            touchAction: 'none'
          }}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onTouchEnd={handlePointerUp}
        >
          {/* HTML5 Canvas for image display */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: status === 'viewing' ? 'block' : 'none',
              pointerEvents: 'none'
            }}
          />

          {/* Top Progress Bar & Live Countdown while viewing */}
          {status === 'viewing' && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 20,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, transparent 100%)'
              }}
            >
              {/* Animated Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPercent}%`,
                    background: 'linear-gradient(90deg, #ec4899 0%, #a855f7 100%)',
                    borderRadius: '2px',
                    transition: 'width 0.08s linear'
                  }}
                />
              </div>

              {/* Countdown & Protected Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#f43f5e',
                    background: 'rgba(244, 63, 94, 0.18)',
                    border: '1px solid rgba(244, 63, 94, 0.35)',
                    padding: '3px 10px',
                    borderRadius: '12px'
                  }}
                >
                  <Clock size={12} /> Keep holding • {timeLeft}s left
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    color: 'rgba(255, 255, 255, 0.75)',
                    fontWeight: 600,
                    letterSpacing: '0.4px'
                  }}
                >
                  @{snapData?.username}
                </span>
              </div>
            </div>
          )}

          {/* Non-Obscuring Clean Security Badge at Bottom */}
          {status === 'viewing' && (
            <div
              style={{
                position: 'absolute',
                bottom: '14px',
                zIndex: 25,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'rgba(10, 8, 18, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                padding: '5px 12px',
                borderRadius: '16px',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                fontSize: '11px',
                color: '#e2d9f3',
                fontWeight: 600,
                pointerEvents: 'none'
              }}
            >
              <ShieldCheck size={13} style={{ color: '#a855f7' }} />
              <span>Protected View for @{snapData?.username}</span>
            </div>
          )}

          {/* STATE: Loading */}
          {status === 'loading' && (
            <div style={{ textAlign: 'center', padding: '24px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  border: '3px solid #a855f7',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  margin: '0 auto 16px',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#f3e8ff' }}>Decrypting Secure Snap…</p>
              <p style={{ fontSize: '12px', color: '#9d94b8', marginTop: '4px' }}>Verifying single-use token</p>
            </div>
          )}

          {/* STATE: Ready - TAP AND HOLD TO WATCH */}
          {status === 'ready' && (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
                background: 'radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.15) 0%, rgba(10, 8, 18, 0.96) 80%)',
                cursor: 'pointer',
                touchAction: 'none'
              }}
              onPointerDown={handlePointerDown}
              onTouchStart={handlePointerDown}
            >
              {/* Glowing Sensor Circle */}
              <div
                style={{
                  width: '96px',
                  height: '96px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '18px',
                  boxShadow: '0 0 35px rgba(168, 85, 247, 0.45), inset 0 0 15px rgba(255, 255, 255, 0.3)',
                  border: '2.5px solid rgba(255, 255, 255, 0.35)',
                  transition: 'transform 0.15s ease'
                }}
              >
                <Lock size={36} style={{ color: '#ffffff', marginBottom: '2px' }} />
                <span style={{ fontSize: '9px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.8px' }}>
                  HOLD
                </span>
              </div>

              <h2 style={{ fontSize: '19px', fontWeight: 800, color: '#ffffff', marginBottom: '6px' }}>
                Tap & Hold to Watch
              </h2>
              <p style={{ fontSize: '12px', color: '#a79ebc', maxWidth: '270px', lineHeight: '1.5', marginBottom: '18px' }}>
                Keep your thumb/mouse pressed down to view.
              </p>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '7px 14px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  color: '#fca5a5',
                  fontWeight: 600
                }}
              >
                <AlertTriangle size={13} style={{ color: '#ef4444' }} />
                <span>As soon as you release, it self-destructs!</span>
              </div>
            </div>
          )}

          {/* STATE: Burned / Self-Destructed */}
          {status === 'burned' && (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
                background: 'radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.15) 0%, rgba(10, 8, 18, 0.98) 85%)'
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1.5px solid rgba(239, 68, 68, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '14px'
                }}
              >
                <Flame size={32} style={{ color: '#ef4444' }} />
              </div>

              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginBottom: '6px' }}>
                Snap Self-Destructed
              </h2>
              <p style={{ fontSize: '12px', color: '#a79ebc', maxWidth: '280px', lineHeight: '1.5', marginBottom: '20px' }}>
                {burnReason === 'released'
                  ? 'Finger was released! In accordance with single-view security, this snap was permanently destroyed.'
                  : burnReason === 'screenshot_blocked'
                  ? 'Screenshot or screen capture attempt detected. The image was destroyed.'
                  : burnReason === 'window_switched' || burnReason === 'tab_hidden'
                  ? 'App switch or blur detected. This snap was permanently destroyed.'
                  : `This exclusive photoshoot snap was opened by @${snapData?.username || 'follower'} and purged from Nina’s server.`}
              </p>

              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '11px 22px',
                  borderRadius: '24px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  textDecoration: 'none'
                }}
              >
                <span>Back to Instagram</span>
                <ExternalLink size={13} />
              </a>
            </div>
          )}

          {/* STATE: Error / Expired */}
          {status === 'error' && (
            <div style={{ textAlign: 'center', padding: '24px' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1.5px solid rgba(239, 68, 68, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px'
                }}
              >
                <AlertTriangle size={28} style={{ color: '#ef4444' }} />
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px', color: '#ffffff' }}>Snap Unavailable</h2>
              <p style={{ fontSize: '12px', color: '#9d94b8', lineHeight: '1.5', marginBottom: '18px' }}>
                {errorMessage || 'This link has expired or has already been viewed.'}
              </p>
              <a href="https://instagram.com" style={{ color: '#c084fc', fontSize: '12px', textDecoration: 'underline' }}>
                Return to Instagram
              </a>
            </div>
          )}
        </div>

        {/* Card Footer: Anti-Screenshot Security Notice */}
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '10px 14px',
            borderRadius: '14px',
            fontSize: '11px',
            color: '#9e97b4',
            lineHeight: '1.4'
          }}
        >
          <ShieldAlert size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
          <span>
            <strong>Hold-to-view Protection:</strong> Releasing finger, switching apps, or screenshotting destroys the snap. Tagged to @{snapData?.username || 'follower'}.
          </span>
        </footer>
      </div>

      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
