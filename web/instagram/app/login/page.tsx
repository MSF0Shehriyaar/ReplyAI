'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {ShieldCheck,ArrowRight,Eye,EyeOff,Camera as Instagram,LockKeyhole} from 'lucide-react';
type AuthResult={authenticated?:boolean;error?:string;username?:string;user?:{displayName?:string}};
function destination(){return new URLSearchParams(window.location.search).get('return_to')==='/whatsapp'?'/whatsapp':'/?view=overview';}

export default function LoginPage() {
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [visible,setVisible]=useState(false);
  const [checking,setChecking]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [owner,setOwner]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/auth',{cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json() as AuthResult;if(!response.ok)throw new Error(data.error||'Sign-in is temporarily unavailable.');
      if(data.authenticated)setOwner(data.user?.displayName||data.username||'Owner');
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});
    return()=>controller.abort();
  },[]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try {
      const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',username:username.trim(),password})});
      const data=await response.json() as AuthResult;if(!response.ok)throw new Error(data.error||'Could not sign in.');
      const session=await fetch('/api/auth',{cache:'no-store'});
      if(!session.ok||!(await session.json() as AuthResult).authenticated)throw new Error('The session could not be confirmed. Please allow cookies and retry.');
      window.location.assign(destination());
    }catch(e){setError(e instanceof Error?e.message:'Could not sign in.');setBusy(false);}
  }
  return <main className="login-page owner-access">
    <section className="login-art"><a className="login-brand" href="/login"><span className="brand-mark"><Instagram size={24}/></span>Nina</a><div className="login-intro"><p className="section-kicker">PRIVATE INSTAGRAM WORKSPACE</p><h1>Your conversations.<br/>Your voice.<br/>In control.</h1><p>A private space for your Instagram connections, conversations and automation.</p></div><p className="owner-assurance"><ShieldCheck size={18}/>One owner. Protected access.</p></section>
    <section className="login-form"><div className="login-lock-badge"><LockKeyhole size={24}/></div><p className="section-kicker">OWNER ACCESS</p><h2>{owner?'Welcome back, '+owner: 'Sign in to Nina'}</h2><p>Use your owner account to open your private Instagram workspace.</p>
      {error&&<p className="login-error-alert" role="alert">{error}</p>}
      {checking?<p role="status">Checking your owner session…</p>:owner?<div className="already-logged-in-card"><ShieldCheck size={22}/><strong>{owner} is signed in</strong><button className="button primary full-button" onClick={()=>window.location.assign(destination())}>Open {owner}’s workspace<ArrowRight size={17}/></button></div>:<form onSubmit={submit} className="login-pin-form">
        <label className="field"><span>Owner username</span><input autoComplete="username" required maxLength={160} value={username} onChange={e=>setUsername(e.target.value)} disabled={busy}/></label>
        <label className="field"><span>Password or PIN</span><span className="owner-password"><input type={visible?'text':'password'} autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>
        <button type="submit" className="button primary full-button" disabled={busy}>{busy?'Opening '+(username||'your')+'’s workspace…':'Sign in to '+(username||'owner workspace')}<ArrowRight size={17}/></button>
      </form>}
      <p className="owner-assurance"><ShieldCheck size={16}/>Private owner access. No public registration.</p>
    </section>
  </main>;
}
