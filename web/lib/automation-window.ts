import type { Settings, InstagramAccount, Channel } from './model';

export function automationWindow(s: Pick<Settings, 'enabled' | 'cycleEnabled' | 'cycleStartedAt' | 'cycleActiveMinutes' | 'cycleBreakMinutes'>, now = Date.now()) {
 if (!s.enabled) return { active: false, phase: 'paused' as const, nextChangeAt: null, nextActiveAt: null };
 if (!s.cycleEnabled || !s.cycleStartedAt) return { active: true, phase: 'active' as const, nextChangeAt: null, nextActiveAt: null };
 if (now < s.cycleStartedAt) return { active: false, phase: 'break' as const, nextChangeAt: s.cycleStartedAt, nextActiveAt: s.cycleStartedAt };
 const activeM = Math.max(1, s.cycleActiveMinutes ?? 15), breakM = Math.max(1, s.cycleBreakMinutes ?? 60);
 const activeMs = activeM * 60_000, cycleMs = (activeM + breakM) * 60_000;
 const start = s.cycleStartedAt + Math.floor((now - s.cycleStartedAt) / cycleMs) * cycleMs;
 const active = now < start + activeMs;
 return { active, phase: active ? 'active' as const : 'break' as const, nextChangeAt: active ? start + activeMs : start + cycleMs, nextActiveAt: active ? start : start + cycleMs };
}

export function channelAutomationWindow(
 s: Settings,
 channel: Channel,
 account?: Partial<InstagramAccount>,
 now = Date.now()
) {
 const masterEnabled = account?.enabled !== false && s.enabled;
 if (!masterEnabled) {
  return { active: false, phase: 'paused' as const, nextChangeAt: null, nextActiveAt: null };
 }

 if (channel === 'dm') {
  if (account?.dmEnabled === false || s.dm === false) {
   return { active: false, phase: 'paused' as const, nextChangeAt: null, nextActiveAt: null };
  }
 } else if (channel === 'comment') {
  if (account?.commentsEnabled === false || s.comments === false) {
   return { active: false, phase: 'paused' as const, nextChangeAt: null, nextActiveAt: null };
  }
 }

 // Sleep / Break schedule:
 // By default, comments stay ACTIVE 24/7 (commentSleepEnabled: false), while DMs can follow the sleep cycle.
 const isSleepEnabled = channel === 'dm'
  ? (account?.dmSleepEnabled ?? s.dmSleepEnabled ?? (s.cycleEnabled ?? false))
  : (account?.commentSleepEnabled ?? s.commentSleepEnabled ?? false);

 if (!isSleepEnabled) {
  return { active: true, phase: 'active' as const, nextChangeAt: null, nextActiveAt: null };
 }

 const cycleStartedAt = s.cycleStartedAt || now;
 if (now < cycleStartedAt) {
  return { active: false, phase: 'break' as const, nextChangeAt: cycleStartedAt, nextActiveAt: cycleStartedAt };
 }

 const activeM = Math.max(1, (channel === 'dm'
  ? (account?.cycleActiveMinutes ?? s.dmCycleActiveMinutes ?? s.cycleActiveMinutes)
  : (account?.cycleActiveMinutes ?? s.commentCycleActiveMinutes ?? s.cycleActiveMinutes)) ?? 15);

 const breakM = Math.max(1, (channel === 'dm'
  ? (account?.cycleBreakMinutes ?? s.dmCycleBreakMinutes ?? s.cycleBreakMinutes)
  : (account?.cycleBreakMinutes ?? s.commentCycleBreakMinutes ?? s.cycleBreakMinutes)) ?? 60);

 const activeMs = activeM * 60_000, cycleMs = (activeM + breakM) * 60_000;
 const start = cycleStartedAt + Math.floor((now - cycleStartedAt) / cycleMs) * cycleMs;
 const active = now < start + activeMs;
 return {
  active,
  phase: active ? 'active' as const : 'break' as const,
  nextChangeAt: active ? start + activeMs : start + cycleMs,
  nextActiveAt: active ? start : start + cycleMs
 };
}
