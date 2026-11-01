'use client';

import {useState} from 'react';
import {Check,ChevronRight,Link2,Loader2,MessageSquare,Monitor,RefreshCw,ShieldCheck,Smartphone,Unplug} from 'lucide-react';

type DeviceStatus={state?:string;connectedPhone?:string;qrDataUrl?:string};
type Props={tenantId?:string;waStatus:DeviceStatus|null;onRefresh:()=>void;onAction:(action:string,body?:unknown)=>Promise<void>};
const features=[
  {icon:Link2,title:'Simple setup',description:'Link your number by scanning a QR code.'},
  {icon:ShieldCheck,title:'Business access',description:'Manage your device from your workspace.'},
  {icon:MessageSquare,title:'Reply controls',description:'Review replies or configure automation.'},
  {icon:Monitor,title:'One clear view',description:'Keep conversations and orders together.'},
];

export default function DeviceConnection({tenantId,waStatus,onRefresh}:Props) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const connected=waStatus?.state==='connected';
  const hasQR=waStatus?.state==='qr'&&!!waStatus.qrDataUrl;
  const connecting=busy||waStatus?.state==='connecting';
  const state=connected?'connected':hasQR?'scan':connecting?'connecting':waStatus?'offline':'checking';
  const label={connected:'Connected',scan:'Scan to connect',connecting:'Connecting',offline:'Not connected',checking:'Checking status'}[state];
  const description=connected?`Linked to ${waStatus?.connectedPhone? '+'+waStatus.connectedPhone:'your WhatsApp account'}. Manage the device below.`:hasQR?'Your QR code is ready. Scan it from Linked devices on your phone.':connecting?'Preparing your device connection. This may take a moment.':'Connect a WhatsApp number to bring customer conversations into your workspace.';

  async function deviceAction(action:'connect'|'disconnect') {
    if(busy)return;
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/whatsapp/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,tenantId})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not update the connection. Please try again.');
      onRefresh();
    }catch(e){setError(e instanceof Error?e.message:'Could not update the connection.');}
    finally{setBusy(false);}
  }
  return <section className="wa-device" aria-labelledby="device-page-title">
    <header className="wa-device-status" data-status={state}>
      <span className="wa-device-status-icon"><Smartphone size={22} strokeWidth={1.7} aria-hidden="true"/></span>
      <div className="wa-device-status-copy">
        <div className="wa-device-status-heading"><h1 id="device-page-title">WhatsApp connection</h1><span className="wa-device-badge" role="status"><span/>{label}</span></div>
        <p>{description}</p>
      </div>
      <button type="button" className="wa-device-refresh" onClick={onRefresh} aria-label="Refresh connection status" title="Refresh connection status"><RefreshCw size={18} aria-hidden="true"/></button>
    </header>
    {error&&<div className="wa-device-error" role="alert">{error}</div>}
    <div className="wa-device-card">
      {connected?<>
        <div className="wa-device-hero-icon"><Check size={32} strokeWidth={1.7} aria-hidden="true"/></div>
        <h2>Your WhatsApp is connected.</h2>
        <p className="wa-device-description">Your linked device is ready. Open the inbox to review customer conversations and manage replies.</p>
        <div className="wa-device-connected-note"><ShieldCheck size={18} aria-hidden="true"/><span>You control automation and approvals in your workspace settings.</span></div>
        <button className="wa-device-disconnect" type="button" disabled={busy} onClick={()=>void deviceAction('disconnect')}><Unplug size={17} aria-hidden="true"/>Disconnect device</button>
      </>:hasQR?<>
        <span className="wa-device-eyebrow">LINK YOUR DEVICE</span><h2>Scan with your phone.</h2>
        <p className="wa-device-description">Keep WhatsApp open on your phone while you finish pairing.</p>
        <div className="wa-device-qr"><img src={waStatus?.qrDataUrl} width={240} height={240} alt="WhatsApp device pairing QR code"/></div>
        <ol className="wa-device-steps"><li>Open WhatsApp on your phone.</li><li>Go to Settings or Menu, then Linked devices.</li><li>Choose Link a device and scan this code.</li></ol>
        <p className="wa-device-footnote">Treat this QR code like a sign-in credential. Keep it private.</p>
      </>:<>
        <div className="wa-device-hero-icon"><Smartphone size={32} strokeWidth={1.6} aria-hidden="true"/></div>
        <span className="wa-device-eyebrow">SET UP YOUR WORKSPACE</span><h2>Link your WhatsApp Business.</h2>
        <p className="wa-device-description">Connect the number your customers already use. Scan a QR code from WhatsApp’s Linked devices to get started.</p>
        <div className="wa-device-features">{features.map(({icon:Icon,title,description})=><div className="wa-device-feature" key={title}><Icon size={20} strokeWidth={1.7} aria-hidden="true"/><h3>{title}</h3><p>{description}</p></div>)}</div>
        <button className="wa-device-primary" type="button" disabled={connecting} onClick={()=>void deviceAction('connect')}>{connecting?<Loader2 className="wa-device-spinner" size={18} aria-hidden="true"/>:<Link2 size={18} aria-hidden="true"/>}{connecting?'Preparing connection…':'Link WhatsApp device'}{!connecting&&<ChevronRight size={17} aria-hidden="true"/>}</button>
        <p className="wa-device-footnote">You’ll need access to WhatsApp on the phone you want to link.</p>
      </>}
    </div>
  </section>;
}
