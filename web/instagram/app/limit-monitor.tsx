'use client';
import {useEffect,useState} from 'react';
import {Activity,AlertTriangle,CheckCircle2,Clock,RefreshCw,ShieldCheck,Sparkles,Zap} from 'lucide-react';
import type {limitsStatus} from '@/lib/server';
type Report=Awaited<ReturnType<typeof limitsStatus>>;
const links:Record<string,string>={groq:'https://console.groq.com/settings/limits',gemini:'https://aistudio.google.com/rate-limit',xai:'https://console.x.ai/',openrouter:'https://openrouter.ai/settings/keys',meta:'https://developers.facebook.com/apps/',aihorde:'https://aihorde.net/',cloudflare:'https://dash.cloudflare.com/'};
const when=(n?:number)=>n?new Date(n).toLocaleString():'Not reported';

export default function LimitMonitor(){
 const [report,setReport]=useState<Report>(),[error,setError]=useState(''),[loading,setLoading]=useState(false),[refreshing,setRefreshing]=useState(false);

 const load=async(showSpinner=true)=>{
  if(showSpinner)setLoading(true);
  try{
   const r=await fetch('/api/limits',{cache:'no-store'});
   if(!r.ok)throw new Error('Could not refresh limits.');
   const data=await r.json() as Report;
   setReport(data);setError('');
  }catch{
   setError('Limits could not be refreshed. Previous readings may be out of date.');
  }finally{
   if(showSpinner)setLoading(false);
  }
 };

 const pingAllKeys=async()=>{
  setRefreshing(true);
  try{
   const r=await fetch('/api/limits',{method:'POST',headers:{'x-nina-client':'1'},cache:'no-store'});
   if(!r.ok)throw new Error('Could not ping keys.');
   const data=await r.json() as Report;
   setReport(data);setError('');
  }catch{
   setError('Could not ping all provider keys. Check internet connection.');
  }finally{
   setRefreshing(false);
  }
 };

 useEffect(()=>{
  load();
  const timer=setInterval(()=>load(false),30000);
  const onVis=()=>{if(document.visibilityState==='visible')load(false);};
  document.addEventListener('visibilitychange',onVis);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVis);};
 },[]);

 const cap = report?.capacity;

 return <section className="settings-card">
  <div className="settings-card-heading" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'12px'}}>
   <div>
    <h2>API Key Tracing & Model Load Monitor</h2>
    <p>Live tracking of all provider keys, remaining request balances, and model load capacity.</p>
   </div>
   <button className="button primary" style={{display:'inline-flex',alignItems:'center',gap:'6px'}} disabled={loading||refreshing} onClick={pingAllKeys}>
    <RefreshCw size={14} className={refreshing?'spin':''}/>
    {refreshing?'Pinging all keys…':'Test & Refresh all quotas now'}
   </button>
  </div>

  {error&&<p role="alert" style={{color:'#c41d7f',background:'#fff1f0',padding:'8px 12px',borderRadius:'8px',border:'1px solid #ffccc7'}}>{error}</p>}
  {!report&&<p>{loading?'Loading quota traces…':'No readings yet.'}</p>}

  {report&&<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(210px, 1fr))',gap:'12px',margin:'16px 0'}}>
    <div style={{background:'linear-gradient(135deg, #f8f6fe 0%, #f1ecfc 100%)',border:'1px solid #dfd4f4',borderRadius:'12px',padding:'14px'}}>
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}}>
      <span style={{fontSize:'12px',fontWeight:600,color:'#5a4897',display:'flex',alignItems:'center',gap:'5px'}}><Zap size={14} style={{color:'#7354da'}}/> Tracked Remaining Quota</span>
     </div>
     <div style={{fontSize:'22px',fontWeight:700,color:'#2c204d'}}>
      {cap?.totalRemainingRequests!==null&&cap?.totalRemainingRequests!==undefined?cap.totalRemainingRequests.toLocaleString()+' reqs':'High / Unmetered'}
     </div>
     <small style={{color:'#777190',fontSize:'11px',display:'block',marginTop:'4px'}}>
      Across all verified provider connections
     </small>
    </div>

    <div style={{background:'linear-gradient(135deg, #fbfaff 0%, #f5f0fd 100%)',border:'1px solid #ebdff8',borderRadius:'12px',padding:'14px'}}>
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}}>
      <span style={{fontSize:'12px',fontWeight:600,color:'#5a4897',display:'flex',alignItems:'center',gap:'5px'}}><Activity size={14} style={{color:'#7354da'}}/> Safe Model Load</span>
     </div>
     <div style={{fontSize:'22px',fontWeight:700,color:'#2c204d'}}>
      {cap?.safeDelaySeconds??30}s spacing
     </div>
     <small style={{color:'#777190',fontSize:'11px',display:'block',marginTop:'4px'}}>
      Consecutive DMs batch automatically; comments reply immediately
     </small>
    </div>

    <div style={{background:'linear-gradient(135deg, #f7fbf8 0%, #edf7f0 100%)',border:'1px solid #d4ecd9',borderRadius:'12px',padding:'14px'}}>
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'6px'}}>
      <span style={{fontSize:'12px',fontWeight:600,color:'#1e6e38',display:'flex',alignItems:'center',gap:'5px'}}><ShieldCheck size={14} style={{color:'#28a745'}}/> Fallback Cascading</span>
     </div>
     <div style={{fontSize:'22px',fontWeight:700,color:'#134b25'}}>
      {report.providers.filter(p=>!p.cooldownUntil||p.cooldownUntil<=Date.now()).length} of {report.providers.length} Active
     </div>
     <small style={{color:'#4d7557',fontSize:'11px',display:'block',marginTop:'4px'}}>
      Automatic rollover if primary hits rate limits
     </small>
    </div>
   </div>

   <div style={{background:'#faf8fe',border:'1px solid #ebe4f7',borderRadius:'10px',padding:'12px 14px',marginBottom:'16px'}}>
    <b style={{fontSize:'12px',color:'#2c204d',display:'flex',alignItems:'center',gap:'6px'}}><Sparkles size={14} style={{color:'#7354da'}}/> Model Capacity Guidance:</b>
    <p style={{fontSize:'12px',color:'#554e70',margin:'4px 0 0'}}>
     {cap?.guidance||'All configured keys are monitored. If your active model hits a rate limit or runs out of credits, Nina automatically cascades to the next verified connection.'}
    </p>
   </div>

   <h3 style={{fontSize:'15px',fontWeight:700,color:'#2c204d',margin:'18px 0 10px'}}>Saved API Keys & Meta Accounts</h3>
   {[...report.providers,...report.meta].map(item=>{
    const snapshot=item.snapshot;
    const limited=!!item.cooldownUntil&&item.cooldownUntil>Date.now();
    const reqMetric=snapshot?.metrics?.find(m=>m.unit==='requests'&&m.remaining!==undefined);
    return <div className="managed-item" key={item.id} style={{marginBottom:'14px'}}>
     <div className="connection-status">
      <b>{item.label}{item.active?' · ⚡ Active API':''}</b>
      <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
       {reqMetric?.remaining!==undefined&&<span style={{fontSize:'11px',fontWeight:700,padding:'2px 8px',borderRadius:'12px',background:'#f1ebfc',color:'#6b46c1'}}>
        {reqMetric.remaining.toLocaleString()} left
       </span>}
       <span className={'connection-badge '+(!limited&&!item.stale&&snapshot&&snapshot.status>=200&&snapshot.status<300?'connected':'')}>
        {limited?'In Cooldown':item.stale?'Awaiting recent ping':snapshot?.limited?'Limit reported':snapshot?.status===0?'Connection failed':snapshot&&snapshot.status>=400?'Request error':'Healthy'}
       </span>
      </div>
     </div>
     <p className="micro-note">{item.provider}{item.model?' · '+item.model:''} · Last captured: {when(snapshot?.at)}{snapshot?' · HTTP '+(snapshot.status||'unavailable'):''}{snapshot?.code!==undefined?' · Error code '+snapshot.code:''}</p>
     <p className="body-note">Captured today: <b>{item.today.calls}</b> API requests · <b>{item.today.errors}</b> errors · <b>{item.today.limited}</b> limit responses{item.provider!=='meta'?' · '+item.today.tokens+' reported tokens':''}</p>
     {snapshot?.metrics.length?<div className="limit-table-wrap"><table className="limit-table"><thead><tr><th>Reported quota</th><th>Used</th><th>Remaining</th><th>Limit</th><th>Reset</th></tr></thead><tbody>{snapshot.metrics.map((m,i)=><tr key={i}><td>{m.label}</td><td>{m.used!==undefined?m.used+(m.unit==='percent'?'%':m.unit==='USD'?' USD':''):'—'}</td><td>{m.remaining!==undefined?m.remaining.toLocaleString():'—'}</td><td>{m.limit!==undefined?m.limit.toLocaleString():'—'}</td><td>{when(m.resetAt)}</td></tr>)}</tbody></table></div>:<p className="micro-note">Remaining quota not reported in headers for this endpoint. Check the provider console for account-wide billing.</p>}
     {(item.cooldownUntil||snapshot?.retryAt)&&<p className="body-note" style={{color:'#c41d7f'}}>Cooldown until: {when(item.cooldownUntil||snapshot?.retryAt)}</p>}
     <a className="text-button" href={links[item.provider]} target="_blank" rel="noopener noreferrer">Open {item.provider==='meta'?'Meta':'provider'} quota console ↗</a>
    </div>;
   })}
   <p className="micro-note">No message text or API secrets are stored in traces. Counters are retained for seven days; latest readings remain until replaced.</p>
  </>}
 </section>;
}

