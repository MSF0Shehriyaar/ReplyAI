import { db, AppError } from './server';

export async function consumeRateLimit(key: string, maximum: number, windowMs: number, now = Date.now()) {
  const row = await db().prepare(`INSERT INTO auth_rate_limits (key,count,reset_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
    reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count`)
    .bind(key,now+windowMs,now,now).first<{count:number}>();
  if (!row || row.count > maximum) throw new AppError('Too many attempts. Please try again later.',429);
}
