export async function register() {
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.NEXT_PHASE!=='phase-production-build'&&process.env.TURSO_DATABASE_URL&&process.env.TURSO_AUTH_TOKEN) {
    const {startQueueWorker}=await import('./lib/queue-worker');
    startQueueWorker();
  }
}
