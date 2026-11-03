'use client';
import {useState,type FormEvent} from 'react';
import {SlidersHorizontal,Plus,Trash2} from 'lucide-react';
import type {WASettings,AutoReplyRule} from '../lib/model';
import './business-settings.css';

export default function AutomationSettings({settings,onSave,onTest}:{settings:WASettings;onSave:(s:WASettings)=>Promise<boolean>;onTest:(text:string)=>Promise<string>}) {
  const [form,setForm]=useState(()=>structuredClone(settings));
  const [examples,setExamples]=useState(()=>JSON.stringify(settings.examples,null,2));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState('');
  const [question,setQuestion]=useState('');
  const [answer,setAnswer]=useState('');
  const [testing,setTesting]=useState(false);
  const field=<K extends keyof WASettings>(key:K,value:WASettings[K])=>setForm(previous=>({...previous,[key]:value}));
  function recommended() {
    setForm(previous=>({...previous,approval:true,personalChats:true,groupChats:false,tone:'friendly',language:'auto',length:2,emoji:0,playfulness:0,humanDelay:false,typingIndicator:false,personalReplyDelaySeconds:0,groupReplyDelaySeconds:0,dailyLimit:100,maxRetries:3,autoTagEnabled:true,sentimentAnalysisEnabled:true}));
  }
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy)return;setError('');setSaved('');
    let parsed;try{parsed=JSON.parse(examples);if(!Array.isArray(parsed)||parsed.some(e=>!e||typeof e.incoming!=='string'||typeof e.reply!=='string'))throw Error();}catch{setError('Examples must be a JSON array of incoming and reply text pairs.');return;}
    setBusy(true);
    try{if(!await onSave({...form,examples:parsed}))setError('Settings were not saved. Please retry.');else setSaved(form.businessName+' settings saved.');}catch{setError('Settings were not saved. Please retry.');}finally{setBusy(false);}
  }
  function updateRule(id:string,patch:Partial<AutoReplyRule>) {field('autoReplyRules',form.autoReplyRules.map(r=>r.id===id?{...r,...patch}:r));}
  const toggles=[
    ['enabled','Enable automatic replies','Keep off while setting up. New incoming messages remain visible in your inbox.'],
    ['approval','Require approval before sending','Recommended: review generated drafts before they reach customers.'],
    ['personalChats','Reply to direct conversations','Allow automation for one-to-one customer conversations.'],
    ['groupChats','Reply in groups','Only enable if every participant expects automated business replies.'],
    ['typingIndicator','Show a typing indicator','Optional WhatsApp composing status before a reply.'],
    ['autoTagEnabled','Organize conversations automatically','Add tags based on the customer’s message.'],
    ['sentimentAnalysisEnabled','Detect customer sentiment','Helps identify conversations that need attention.'],
  ] as const;
  return <section className="wa-settings-page">
    <header><span className="wa-settings-icon"><SlidersHorizontal size={23}/></span><p className="wa-settings-eyebrow">{form.businessName.toUpperCase()}</p><h1>AI & automation</h1><p>Choose how your business assistant replies. AI providers and credentials are managed securely by the administrator; these controls apply only to {form.businessName}.</p><button type="button" className="wa-settings-action" onClick={recommended}>Apply recommended settings</button></header>
    <form onSubmit={submit}>
      <fieldset className="wa-settings-card" disabled={busy}><legend>Reply permissions</legend>{toggles.map(([key,label,description])=><label className="wa-settings-toggle" key={key}><span>{label}<small>{description}</small></span><input type="checkbox" checked={!!form[key]} onChange={e=>field(key,e.target.checked)}/></label>)}</fieldset>
      <fieldset className="wa-settings-card" disabled={busy}><legend>Voice & response</legend><div className="wa-settings-fields">
        <label><span>Language</span><select value={form.language} onChange={e=>field('language',e.target.value as WASettings['language'])}>{['auto','English','Hindi','Hinglish'].map(v=><option key={v} value={v}>{v==='auto'?'Match the customer':v}</option>)}</select></label>
        <label><span>Tone</span><select value={form.tone} onChange={e=>field('tone',e.target.value as WASettings['tone'])}>{['friendly','professional','consultative','casual','luxury'].map(v=><option key={v}>{v}</option>)}</select></label>
        <label><span>Response detail</span><select value={form.length} onChange={e=>field('length',Number(e.target.value))}><option value={1}>Concise</option><option value={2}>Balanced</option><option value={3}>Detailed</option><option value={4}>Adapt to the question</option></select></label>
        <label><span>Assistant style</span><select value={form.profile.gender} onChange={e=>field('profile',{...form.profile,gender:e.target.value as WASettings['profile']['gender']})}><option value="neutral">Neutral</option><option value="female">Feminine grammar</option><option value="male">Masculine grammar</option></select></label>
        <label><span>Emoji usage</span><input type="number" min={0} max={100} value={form.emoji} onChange={e=>field('emoji',Number(e.target.value))}/><small>0 keeps customer replies free of emojis.</small></label>
        <label><span>Playfulness</span><input type="number" min={0} max={100} value={form.playfulness} onChange={e=>field('playfulness',Number(e.target.value))}/><small>Keep low for factual business conversations.</small></label>
        <label className="wa-settings-wide"><span>Instructions for your assistant</span><textarea rows={5} maxLength={4000} value={form.instructions} onChange={e=>field('instructions',e.target.value)}/><small>Add style and escalation guidance. Product prices and policies come from your business profile and catalog.</small></label>
        <label className="wa-settings-wide"><span>Example replies (JSON)</span><textarea rows={5} value={examples} onChange={e=>setExamples(e.target.value)}/><small>Format: [&#123;"incoming":"Are you open?","reply":"We are open from 9 am to 6 pm."&#125;]. Use your actual business facts.</small></label>
      </div></fieldset>
      <fieldset className="wa-settings-card" disabled={busy}><legend>Automation limits</legend><div className="wa-settings-fields">
        <label><span>Daily automated reply limit (UTC day)</span><input type="number" min={1} max={10000} value={form.dailyLimit} onChange={e=>field('dailyLimit',Number(e.target.value))}/><small>Stops automatic sending when this business reaches its daily limit.</small></label>
        <label><span>Maximum queue attempts</span><input type="number" min={1} max={10} value={form.maxRetries??3} onChange={e=>field('maxRetries',Number(e.target.value))}/></label>
        <label><span>Direct reply delay (seconds)</span><input type="number" min={0} max={60} value={form.personalReplyDelaySeconds} onChange={e=>field('personalReplyDelaySeconds',Number(e.target.value))}/></label>
        <label><span>Group reply delay (seconds)</span><input type="number" min={0} max={60} value={form.groupReplyDelaySeconds} onChange={e=>field('groupReplyDelaySeconds',Number(e.target.value))}/></label>
        {(['welcomeMessage','awayMessage','closingMessage'] as const).map(key=><label key={key}><span>{key==='welcomeMessage'?'Welcome message':key==='awayMessage'?'Away message':'Closing message'}</span><textarea rows={3} maxLength={4000} value={form[key]} onChange={e=>field(key,e.target.value)}/><small>{key==='closingMessage'?'Available as assistant context; no automatic goodbye is sent.':'Used when a matching first-message or outside-hours rule is enabled.'}</small></label>)}
      </div></fieldset>
      <fieldset className="wa-settings-card" disabled={busy}><legend>Reply rules</legend><p>Rules use your saved response before AI generation and follow approval and chat permissions.</p>{form.autoReplyRules.map(rule=><div className="wa-settings-rule" key={rule.id}><header><strong>{rule.name||'New reply rule'}</strong><button type="button" aria-label={'Delete '+rule.name} onClick={()=>field('autoReplyRules',form.autoReplyRules.filter(r=>r.id!==rule.id))}><Trash2 size={16}/></button></header><div className="wa-settings-fields">
        <label><span>Rule name</span><input required value={rule.name} onChange={e=>updateRule(rule.id,{name:e.target.value})}/></label>
        <label><span>Trigger</span><select value={rule.triggerType} onChange={e=>updateRule(rule.id,{triggerType:e.target.value as AutoReplyRule['triggerType'],triggerValue:e.target.value==='time'?'outside_hours':e.target.value==='intent'?'general':''})}><option value="keyword">Contains a keyword</option><option value="first_message">First customer message</option><option value="time">Outside business hours</option><option value="intent">Customer intent</option></select></label>
        {rule.triggerType==='keyword'&&<label><span>Keywords, separated by commas</span><input required value={rule.triggerValue} onChange={e=>updateRule(rule.id,{triggerValue:e.target.value})}/></label>}
        {rule.triggerType==='intent'&&<label><span>Intent</span><select value={rule.triggerValue} onChange={e=>updateRule(rule.id,{triggerValue:e.target.value})}>{['general','catalog','order_inquiry','pricing','support','complaint','greeting','refund_return','discount_inquiry'].map(v=><option key={v}>{v}</option>)}</select></label>}
        <label><span>Conversations</span><select value={rule.channel} onChange={e=>updateRule(rule.id,{channel:e.target.value as AutoReplyRule['channel']})}><option value="all">All allowed chats</option><option value="personal">Direct only</option><option value="group">Groups only</option></select></label>
        <label><span>Priority</span><input type="number" min={0} max={1000} value={rule.priority} onChange={e=>updateRule(rule.id,{priority:Number(e.target.value)})}/><small>Higher priority rules are tried first.</small></label>
        <label><span>Cooldown (minutes)</span><input type="number" min={0} max={10080} value={rule.cooldownMinutes} onChange={e=>updateRule(rule.id,{cooldownMinutes:Number(e.target.value)})}/></label>
        <label><span>Maximum uses per UTC day</span><input type="number" min={1} max={10000} value={rule.maxUsesPerDay} onChange={e=>updateRule(rule.id,{maxUsesPerDay:Number(e.target.value)})}/></label>
        <label className="wa-settings-wide"><span>Response</span><textarea rows={3} maxLength={4000} value={rule.response} onChange={e=>updateRule(rule.id,{response:e.target.value})}/></label>
      </div><label className="wa-settings-toggle"><span>Rule enabled</span><input type="checkbox" checked={rule.enabled} onChange={e=>updateRule(rule.id,{enabled:e.target.checked})}/></label></div>)}<button type="button" className="wa-settings-action" onClick={()=>field('autoReplyRules',[...form.autoReplyRules,{id:crypto.randomUUID(),name:'New rule',enabled:false,triggerType:'keyword',triggerValue:'',response:'',priority:1,channel:'all',cooldownMinutes:30,maxUsesPerDay:100,usesToday:0}])}><Plus size={16}/>Add reply rule</button></fieldset>
      {saved&&<p role="status">{saved}</p>}
      {error&&<div className="wa-settings-error" role="alert">{error}</div>}
      <footer className="wa-settings-save"><p>Recommended settings are a starting point. Save to apply changes.</p><button disabled={busy} type="submit">{busy?'Saving '+form.businessName+'…':'Save '+form.businessName+' settings'}</button></footer>
    </form>
    <section className="wa-settings-card" style={{marginTop:24}}><h2>Test a saved reply</h2><p>Uses your saved settings and the administrator’s AI service. Nothing is sent to WhatsApp.</p><label className="wa-settings-fields"><span>Customer question</span><textarea value={question} onChange={e=>setQuestion(e.target.value)} maxLength={4000}/></label><button type="button" disabled={testing||!question.trim()} className="wa-settings-action" onClick={async()=>{setTesting(true);setAnswer('');try{setAnswer(await onTest(question));}catch(e){setAnswer(e instanceof Error?e.message:'The test failed.');}finally{setTesting(false);}}}>{testing?'Testing '+form.businessName+'…':'Test '+form.businessName+' reply'}</button>{answer&&<p role="status" style={{whiteSpace:'pre-wrap'}}>{answer}</p>}</section>
  </section>;
}
