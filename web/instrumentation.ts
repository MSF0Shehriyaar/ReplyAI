export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1. Process Instagram automation queue every 30 seconds
    setInterval(async () => {
      try {
        const { processNextJob } = await import('./lib/queue');
        await processNextJob();
      } catch {
        // Quietly catch background errors
      }
    }, 30000);

    // 2. Self-ping Render public URL every 10 minutes to reset the 15-minute idle timer
    const externalUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (externalUrl) {
      console.log('[Nina] Background keep-alive worker registered for:', externalUrl);
      setInterval(async () => {
        try {
          const res = await fetch(`${externalUrl}/api/automation-status`, {
            headers: { 'x-nina-client': '1' },
            signal: AbortSignal.timeout(10000)
          });
          if (res.ok) {
            console.log('[Nina] Keep-alive self-ping successful');
          }
        } catch (e) {
          console.warn('[Nina] Keep-alive ping attempt failed:', e instanceof Error ? e.message : 'Unknown');
        }
      }, 10 * 60 * 1000); // 10 minutes
    }
  }
}