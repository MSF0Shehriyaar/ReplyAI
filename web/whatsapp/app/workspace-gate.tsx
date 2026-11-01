'use client';

import {useCallback,useEffect,useId,useState,type FormEvent,type ReactNode} from 'react';
import {ArrowRight,Building2,Eye,EyeOff,LockKeyhole,MessageSquare,ShieldCheck} from 'lucide-react';

type Status='checking'|'anonymous'|'authenticated'|'unavailable';
export default function WorkspaceGate({renderDashboard}:{renderDashboard:(expire:()=>void,identity:{businessName:string;userName:string})=>ReactNode}) {
  const [status,setStatus]=useState<Status>('checking');
  const [error,setError]=useState('');
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [busy,setBusy]=useState(false);
  const [visible,setVisible]=useState(false);
  const [identity,setIdentity]=useState({businessName:'Your business',userName:''});
  const id=useId();
  const expire=useCallback(()=>{setStatus('anonymous');setError('Your session has ended. Please sign in again.');},[]);
  const check=useCallback(async(signal?:AbortSignal)=>{
    try {
      const response=await fetch('/business/api/auth',{cache:'no-store',signal});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error || 'Sign-in is temporarily unavailable. Please try again.');
      setIdentity({businessName:data.tenant?.name||'Your business',userName:data.user?.name||''});
      setStatus(data.authenticated?'authenticated':'anonymous');setError('');
    } catch(e) {
      if(signal?.aborted)return;
      setStatus('unavailable');setError(e instanceof Error?e.message:'Could not check your session.');
    }
  },[]);
  useEffect(()=>{const controller=new AbortController();void check(controller.signal);return()=>controller.abort();},[check]);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    const form=new FormData(event.currentTarget);
    const body=mode==='register'?{action:'register',businessName:form.get('businessName'),ownerName:form.get('ownerName'),email:form.get('email'),password:form.get('password')}:{action:'login',email:form.get('email'),password:form.get('password')};
    try {
      const response=await fetch('/business/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'Unable to sign in. Please try again.');
      await check();
    } catch(e){setError(e instanceof Error?e.message:'Unable to sign in.');}
    finally{setBusy(false);}
  }
  if(status==='authenticated')return renderDashboard(expire,identity);
  return <main className="wa-access">
    <section className="wa-access-story" aria-label="WhatsApp business workspace">
      <a href="/business" className="wa-access-brand"><span><MessageSquare size={22} aria-hidden="true"/></span>WhatsApp<span className="wa-access-brand-label">BUSINESS</span></a>
      <div className="wa-access-intro"><span className="wa-access-eyebrow">YOUR BUSINESS, CONNECTED</span><h1>A calmer way to<br/>manage WhatsApp.</h1><p>Keep customer conversations, orders, and your team’s replies in one clear workspace.</p>
        <div className="wa-access-preview" aria-hidden="true"><div className="wa-preview-heading"><span className="wa-preview-dot"/>Your workspace<span>Connected</span></div><div className="wa-preview-row"><span className="wa-preview-avatar">AC</span><div><b>A new customer conversation</b><span>Ready for your team</span></div><span className="wa-preview-badge">Inbox</span></div><div className="wa-preview-message">Everything you need, right where you need it.</div><div className="wa-preview-compose">Write a reply…<ArrowRight size={16}/></div></div>
      </div>
      <div className="wa-access-assurance"><ShieldCheck size={18} aria-hidden="true"/><span>Separate business workspaces. Secure access.</span></div>
    </section>
    <section className="wa-access-panel" aria-label={mode==='login'?'Sign in':'Register a business'}>
      <div className="wa-access-form-wrap">
        <div className="wa-access-symbol">{mode==='login'?<LockKeyhole size={24} aria-hidden="true"/>:<Building2 size={24} aria-hidden="true"/>}</div>
        <span className="wa-access-eyebrow">WHATSAPP BUSINESS</span>
        <h2>{mode==='login'?'Welcome back.':'Make room for your business.'}</h2>
        <p className="wa-access-description">{mode==='login'?'Sign in to open your business workspace.':'Create your account and set up your own WhatsApp workspace.'}</p>
        <div className="wa-access-tabs" aria-label="Account access">
          <button type="button" aria-pressed={mode==='login'} onClick={()=>{setMode('login');setError('');}} disabled={busy}>Sign in</button>
          <button type="button" aria-pressed={mode==='register'} onClick={()=>{setMode('register');setError('');}} disabled={busy}>Register business</button>
        </div>
        {status==='checking'?<div role="status" className="wa-access-status">Checking your session…</div>:<>
          {error&&<div role="alert" className="wa-access-error">{error}</div>}
          <form className="wa-access-form" onSubmit={submit} key={mode}>
            {mode==='register'&&<><label htmlFor={id+'-business'}>Business name<input id={id+'-business'} name="businessName" autoComplete="organization" minLength={2} maxLength={160} required disabled={busy}/></label><label htmlFor={id+'-name'}>Your name<input id={id+'-name'} name="ownerName" autoComplete="name" minLength={2} maxLength={160} required disabled={busy}/></label></>}
            <label htmlFor={id+'-email'}>Email address<input id={id+'-email'} name="email" type="email" autoComplete="username" inputMode="email" placeholder="you@business.com" maxLength={254} required disabled={busy}/></label>
            <label htmlFor={id+'-password'}>Password<span className="wa-access-password"><input id={id+'-password'} name="password" type={visible?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='register'?12:1} maxLength={256} required disabled={busy}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>
            {mode==='register'&&<p className="wa-access-hint">Use at least 12 characters for your password.</p>}
            <button className="wa-access-submit" type="submit" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in to workspace':'Create business account'}<ArrowRight size={18} aria-hidden="true"/></button>
          </form>
          {status==='unavailable'&&<button className="wa-access-retry" type="button" onClick={()=>void check()}>Check connection again</button>}
        </>}
        <p className="wa-access-footer"><LockKeyhole size={14} aria-hidden="true"/>Your business data stays in your workspace.</p>
      </div>
    </section>
  </main>;
}
