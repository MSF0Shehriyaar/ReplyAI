'use client';
import {useState,type FormEvent} from 'react';
import {Building2,ShieldCheck} from 'lucide-react';
import type {WASettings} from '../lib/model';
import {profileFields,missingBusinessProfile} from '../lib/business-profile';
import './business-settings.css';

export default function BusinessProfile({settings,onSave,initial=false,userName}:{settings:WASettings;onSave:(s:WASettings)=>Promise<boolean>;initial?:boolean;userName?:string}) {
  const [form,setForm]=useState(()=>structuredClone(settings));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy)return;
    const missing=missingBusinessProfile(form);
    if(missing.length){setError('Please complete: '+missing.join(', '));return;}
    setBusy(true);setError('');
    try {if(!await onSave({...form,enabled:initial?false:form.enabled}))setError('Your profile was not saved. Please retry.');}
    catch {setError('Your profile was not saved. Please retry.');}
    finally {setBusy(false);}
  }
  return <section className="wa-settings-page wa-profile-setup">
    <header><span className="wa-settings-icon"><Building2 size={23}/></span><p className="wa-settings-eyebrow">{initial?'WELCOME'+(userName?', '+userName.toUpperCase():''):'BUSINESS PROFILE'}</p><h1>{initial?'Set up '+form.businessName:form.businessName+' profile'}</h1><p>Give your assistant the facts it needs to answer accurately. Required fields explain how they are used. You can update them any time.</p></header>
    <div className="wa-settings-notice"><ShieldCheck size={20}/><p>Business name, catalog and enquiry number appear on your public catalog. Other profile details inform your assistant’s replies. Never enter passwords, API keys or private customer information here.</p></div>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="wa-settings-card"><legend>Business information</legend><div className="wa-settings-fields">{profileFields.map(field=><label key={field.key}><span>{field.label} <b aria-hidden="true">*</b></span><small>{field.reason}</small>{['businessDescription','shippingPolicy','returnPolicy','warrantyPolicy','knowledge'].includes(field.key)?<textarea required rows={3} maxLength={4000} value={form[field.key]} onChange={e=>setForm({...form,[field.key]:e.target.value})}/>:<input required maxLength={4000} type={field.key==='supportEmail'?'email':field.key==='supportPhone'?'tel':'text'} value={form[field.key]} onChange={e=>setForm({...form,[field.key]:e.target.value})}/>}</label>)}</div></fieldset>
      <fieldset disabled={busy} className="wa-settings-card"><legend>Assistant identity</legend><p>Customers need a consistent name and role for your business assistant.</p><div className="wa-settings-fields">
        <label><span>Assistant name *</span><input required value={form.profile.name} onChange={e=>setForm({...form,profile:{...form.profile,name:e.target.value}})}/></label>
        <label><span>Assistant role *</span><input required value={form.profile.role} onChange={e=>setForm({...form,profile:{...form.profile,role:e.target.value}})}/></label>
        <label><span>Website (optional)</span><input type="url" value={form.website} onChange={e=>setForm({...form,website:e.target.value})}/></label>
        <label><span>Tagline (optional)</span><input value={form.tagline} onChange={e=>setForm({...form,tagline:e.target.value})}/></label>
      </div></fieldset>
      {error&&<div className="wa-settings-error" role="alert">{error}</div>}
      <footer className="wa-settings-save"><p>{initial?'Automatic replies stay paused until you enable them after setup.':'Changes apply to future assistant replies.'}</p><button type="submit" disabled={busy}>{busy?'Saving '+form.businessName+'…':initial?'Save '+form.businessName+' and continue':'Save '+form.businessName+' profile'}</button></footer>
    </form>
  </section>;
}
