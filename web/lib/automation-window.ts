import type {Settings} from './model';
export function automationWindow(s:Pick<Settings,'enabled'|'cycleEnabled'|'cycleStartedAt'|'cycleActiveMinutes'|'cycleBreakMinutes'>,now=Date.now()){
 if(!s.enabled)return {active:false,phase:'paused' as const,nextChangeAt:null,nextActiveAt:null};
 if(!s.cycleEnabled||!s.cycleStartedAt)return {active:true,phase:'active' as const,nextChangeAt:null,nextActiveAt:null};
 if(now<s.cycleStartedAt)return {active:false,phase:'break' as const,nextChangeAt:s.cycleStartedAt,nextActiveAt:s.cycleStartedAt};
 const activeM=Math.max(1,s.cycleActiveMinutes??15),breakM=Math.max(1,s.cycleBreakMinutes??60);
 const activeMs=activeM*60_000,cycleMs=(activeM+breakM)*60_000;
 const start=s.cycleStartedAt+Math.floor((now-s.cycleStartedAt)/cycleMs)*cycleMs;
 const active=now<start+activeMs;
 return {active,phase:active?'active' as const:'break' as const,nextChangeAt:active?start+activeMs:start+cycleMs,nextActiveAt:active?start:start+cycleMs};
}
