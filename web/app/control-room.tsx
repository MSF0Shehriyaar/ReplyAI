'use client';
import {automationWindow} from '@/lib/automation-window';
import ManagedConnections from './managed-connections';
import LimitMonitor from './limit-monitor';
import TestLab from './test-lab';
import SecurityPanel from './security-panel';
import WorkspacePulse from './workspace-pulse';
import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Camera as Instagram, Inbox, Sparkles, Upload, Image as ImageIcon, SlidersHorizontal, Link2, Eye, Activity, LayoutDashboard, Search, ChevronRight, ChevronLeft, MessageCircle, Heart, Send, ShieldCheck, Pause, CircleHelp, CheckCheck, FlaskConical, RefreshCw, Check, X, Download, Plus, Trash2, LockKeyhole, Clock, Save, MoreHorizontal, Play, FileText, AlertTriangle, Wifi, Loader2, LogOut } from 'lucide-react';
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { initialWorkspace, type Workspace, type Settings, type Thread, type Channel } from '@/lib/model';
import { analyzeIncomingText } from '@/lib/text-analyzer';
const nav = [{id:'overview',name:'Overview',icon:LayoutDashboard},{id:'dms',name:'Direct Messages',icon:MessageCircle},{id:'comments',name:'Comments & Reels',icon:Heart},{id:'review',name:'Review queue',icon:ShieldCheck},{id:'personality',name:'Personality & Voice',icon:Sparkles},{id:'automation',name:'Automation',icon:SlidersHorizontal},{id:'testing',name:'Test Lab',icon:FlaskConical},{id:'connections',name:'Connections',icon:Link2},{id:'usage',name:'Usage & limits',icon:Activity},{id:'security',name:'Security & phones',icon:LockKeyhole},{id:'activity',name:'Activity log',icon:Activity}];
const introductions:Record<string,{eyebrow:string;title:string;description:string}>={testing:{eyebrow:'TRY IT PRIVATELY',title:'Test with confidence.',description:'Check each account, key and delivery path separately.'},security:{eyebrow:'PRIVATE BY DESIGN',title:'Only you, in control.',description:'Manage owner access and approved Android phones.'},usage:{eyebrow:'MEASURED, NOT GUESSED',title:'Know your limits.',description:'Provider responses, request usage and available quota headers.'},overview:{eyebrow:'YOUR WORKSPACE',title:'Everything, in one place.',description:'A clear view of your conversations, connections, and reply usage.'},dms:{eyebrow:'DIRECT MESSAGES',title:'Private conversations.',description:'Clean DM threads with smart uncensored auto-reply and manual takeover.'},comments:{eyebrow:'REELS & POST COMMENTS',title:'Engage with your fans.',description:'Comments mapped under each reel and post with @username mentions.'},inbox:{eyebrow:'CONVERSATIONS',title:'A little more you.',description:'Messages, comments, and replies in your own voice.'},review:{eyebrow:'BEFORE IT GOES OUT',title:'You have the final say.',description:'Read, edit, or approve the next reply.'},personality:{eyebrow:'THE WAY YOU TALK',title:'Make it sound like you.',description:'Shape the tone, add your examples, and test a live reply.'},automation:{eyebrow:'YOUR RULES',title:'Set the pace.',description:'Choose where Nina replies and when you step in.'},connections:{eyebrow:'ACCOUNT SETUP',title:'Bring Nina online.',description:'Connect Instagram accounts and select a tested reply provider.'},activity:{eyebrow:'WHAT HAPPENED',title:'Nothing behind the scenes.',description:'Follow saved changes, generation calls, and reply outcomes.'}};
const colors=['blue','pink','purple','orange'];
function initials(name:string){return name.split(/[ ._]/).filter(Boolean).slice(0,2).map(w=>w[0]?.toUpperCase()).join('')||'IG';}
function formatDate(n:number){return new Date(n).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}

function getThreadPostId(t: Thread, catalog: Array<{id: string; dateAdded?: number}>): string {
  if (t.mediaId) return t.mediaId;
  if (!catalog || !catalog.length) return '';
  const sorted = [...catalog].sort((a,b)=>(b.dateAdded||0)-(a.dateAdded||0));
  const tTime = t.updated || t.lastInbound || (t.messages?.[0]?.at) || Date.now();
  const matched = sorted.find(p => (p.dateAdded||0) <= tTime) || sorted[0];
  return matched?.id || '';
}

function calcAge(dobStr?:string){if(!dobStr)return 25;const birth=new Date(dobStr);if(isNaN(birth.getTime()))return 25;const now=new Date();let age=now.getFullYear()-birth.getFullYear();const m=now.getMonth()-birth.getMonth();if(m<0||(m===0&&now.getDate()<birth.getDate()))age--;return Math.max(0,age);}
async function api(path:string,method='GET',payload?:unknown){
  const r=await fetch(path,{
    method,
    headers:{'Content-Type':'application/json','x-nina-client':'1'},
    body:payload===undefined?undefined:JSON.stringify(payload)
  });
  if(r.status===401){
    if(typeof window!=='undefined'){
      window.location.href='/login';
    }
    throw new Error('Owner authentication required. Redirecting to login…');
  }
  const data:any=await r.json();
  if(!r.ok)throw new Error(data.error||'This action could not be completed.');
  return data;
}
function Choice({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void}){return <label className="field"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger className="form-select" aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></label>;}
function Toggle({label,description,value,onChange,disabled=false}:{label:string;description?:string;value:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){return <div className="setting-toggle"><div><b>{label}</b>{description&&<p>{description}</p>}</div><Switch checked={value} onCheckedChange={onChange} disabled={disabled} aria-label={label}/></div>;}
function Card({title,description,children,icon:Icon}:{title:string;description?:string;children:ReactNode;icon?:typeof Sparkles}){return <section className="settings-card"><div className="settings-card-heading">{Icon&&<span className="card-icon"><Icon size={19}/></span>}<div><h2>{title}</h2>{description&&<p>{description}</p>}</div></div>{children}</section>;}

function normalizeSnapUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/) || trimmed.match(/\/open\?id=([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]driveId=([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) {
    return '/api/media?driveId=' + fileMatch[1];
  }
  return trimmed;
}

async function handlePhotoUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1600;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unsupported'));
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        try {
          const res: any = await api('/api/upload', 'POST', {
            dataUrl: compressedDataUrl,
            name: file.name
          });
          if (res?.url) {
            toast.success('Photo uploaded & stored successfully!');
            resolve(res.url);
          } else {
            reject(new Error(res?.error || 'Upload failed'));
          }
        } catch (err: any) {
          toast.error(err.message || 'Upload failed');
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function ControlRoom(){

  async function handleSignOut() {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
    } catch {}
    window.location.href = '/login';
  }

 const [clock,setClock]=useState(Date.now());useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),1000);return ()=>clearInterval(id);},[]);
 const [view,setView]=useState('overview');const [data,setData]=useState<Workspace>(initialWorkspace);const [s,setS]=useState<Settings>(initialWorkspace.settings);const [dirty,setDirty]=useState(false);const [loadError,setLoadError]=useState('');const [busy,setBusy]=useState('');const [loading,setLoading]=useState(true);const [selectedId,setSelectedId]=useState('');const [mobileChatView,setMobileChatView]=useState(false);const [accountFilter,setAccountFilter]=useState('all');const [channel,setChannel]=useState('all');const [search,setSearch]=useState('');const [reply,setReply]=useState('');const [credentials,setCredentials]=useState({instagramToken:'',groqKey:'',metaSecret:'',instagramAppSecret:'',verifyToken:''});const [example,setExample]=useState({incoming:'',reply:''});const [testInput,setTestInput]=useState('how do you make every photo look so good?');const [testChannel,setTestChannel]=useState<Channel>('dm');const [testReply,setTestReply]=useState('');const [deleteId,setDeleteId]=useState('');const [helpOpen,setHelpOpen]=useState(false);const [analyzerInput,setAnalyzerInput]=useState('tum bohot sexy lag rahi ho, aaj raat milo');const liveAnalysis=analyzeIncomingText(analyzerInput,s.customSpicyWords);const [accountGateOpen,setAccountGateOpen]=useState(false);const [selectedPostId,setSelectedPostId]=useState("all");const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [googleDriveStatus,setGoogleDriveStatus]=useState<{connected:boolean;email?:string;redirectUri?:string}>({connected:false});
  const [drivePickerOpen,setDrivePickerOpen]=useState(false);
  const [driveFolderName,setDriveFolderName]=useState('Nina_Automation_Snaps');
  const [driveFiles,setDriveFiles]=useState<Array<{id:string;name:string;thumbnailLink?:string;size?:number}>>([]);
  const [driveLoading,setDriveLoading]=useState(false);
  const [driveTargetCallback,setDriveTargetCallback]=useState<((url:string,name:string)=>void)|null>(null);

  const fetchDriveStatus=useCallback(async()=>{
    try{
      const res:any=await api('/api/google-drive');
      if(res)setGoogleDriveStatus(res);
    }catch{}
  },[]);

  useEffect(()=>{
    fetchDriveStatus();
    if(typeof window!=='undefined'){
      const params=new URLSearchParams(window.location.search);
      if(params.get('google_drive_connected')){
        toast.success('Google Drive connected successfully!');
        window.history.replaceState(null,'','?view=connections');
      }else if(params.get('google_drive_error')){
        toast.error('Google Drive error: '+params.get('google_drive_error'));
        window.history.replaceState(null,'','?view=connections');
      }
    }
  },[fetchDriveStatus]);

  const openDrivePicker=(onSelect:(url:string,name:string)=>void)=>{
    if(!googleDriveStatus.connected){
      toast.error('Connect your Google Drive in Connections first.');
      navigate('connections');
      return;
    }
    setDriveTargetCallback(()=>onSelect);
    setDrivePickerOpen(true);
    setDriveLoading(true);
    api('/api/google-drive?action=files')
      .then((res:any)=>{
        setDriveFiles(res?.files||[]);
        if(res?.folderName) setDriveFolderName(res.folderName);
      })
      .catch((err:any)=>{
        toast.error(err?.message||'Failed to load Drive photos');
      })
      .finally(()=>setDriveLoading(false));
  };

  const handleSelectDriveFile=async(fileId:string,fileName:string)=>{
    try{
      toast.info('Importing photo from Google Drive…');
      const res:any=await api('/api/google-drive','POST',{action:'import-file',fileId,name:fileName});
      if(res?.url&&driveTargetCallback){
        driveTargetCallback(res.url,fileName);
        toast.success('Photo imported and linked!');
        setDrivePickerOpen(false);
      }
    }catch(err:any){
      toast.error(err?.message||'Failed to import photo');
    }
  };
const [newPostEntry,setNewPostEntry]=useState<{id:string;title:string;description:string;caption:string;contentType:'reel'|'post'|'story';commentsEnabled?:boolean;snapUrl?:string;snapLabel?:string}>({id:'',title:'',description:'',caption:'',contentType:'reel',commentsEnabled:true,snapUrl:'',snapLabel:''});
 const replyWindow=automationWindow(data.settings,clock);
 const navigate=useCallback((id:string)=>{setView(id);if(typeof window!=='undefined')window.history.replaceState(null,'','?view='+id);},[]);
 const reload=useCallback(async(preserveSettings=false)=>{try{const w=await api('/api/workspace');setData(w);if(!preserveSettings){setS(w.settings);setDirty(false);}setLoadError('');return w as Workspace;}catch(e){setLoadError((e as Error).message);throw e;}finally{setLoading(false);}},[]);
 useEffect(()=>{
  // Verify owner authentication status
  fetch('/api/auth')
    .then(r=>r.json())
    .then((data: any)=>{
      if(!data.authenticated){
        window.location.href='/login';
      }
    })
    .catch(()=>{});
  const v=new URLSearchParams(window.location.search).get('view');
  if(nav.some(n=>n.id===v))setView(v!);
  reload().catch(()=>{});
},[reload]);
 useEffect(()=>{const id=setInterval(()=>{if(document.visibilityState==='visible'&&!busy)reload(dirty).catch(()=>{});},45000);return()=>clearInterval(id);},[reload,busy,dirty]);
 useEffect(()=>{const savedAcc=typeof window!=='undefined'?localStorage.getItem('nina_account_filter'):null;if(savedAcc){setAccountFilter(savedAcc);}else if((data.connections.accounts||[]).length>1){setAccountGateOpen(true);}},[data.connections.accounts]);
 const selectAccount=useCallback((id:string)=>{setAccountFilter(id);setSelectedId('');if(typeof window!=='undefined'){try{localStorage.setItem('nina_account_filter',id);}catch{}}setAccountGateOpen(false);},[]);
 const allLiveThreads=data.threads.filter(t=>!t.demo);const threads=allLiveThreads.filter(t=>accountFilter==='all'||(t.accountId||'legacy-instagram')===accountFilter);const activeChannel=view==='dms'?'dm':view==='comments'?'comment':channel;
 const catalogList = s.postCatalog || [];
 const filtered=threads.filter(t=>{
   if(activeChannel!=='all'&&t.channel!==activeChannel) return false;
   if(view==='comments'&&selectedPostId!=='all'){
     const assigned = getThreadPostId(t, catalogList);
     if(assigned !== selectedPostId) return false;
   }
   if(search && ![t.name,t.username,...t.messages.map(m=>m.text)].join(' ').toLowerCase().includes(search.toLowerCase())) return false;
   return true;
 });const active=threads.find(t=>t.id===selectedId);const reviews=threads.filter(t=>t.status==='review');const c=data.connections;const saved=data.storageReady&&!loadError;const intro=introductions[view];
 useEffect(()=>{setReply(active?.draft??'');},[active?.id,active?.draft]);
 useEffect(()=>{if(!threads.some(t=>t.id===selectedId))setSelectedId(threads[0]?.id??'');},[data.threads,selectedId,accountFilter]);
 const run=useCallback(async(id:string,work:()=>Promise<unknown>,success?:string)=>{if(busy)return;setBusy(id);try{const result=await work();if(success)toast.success(success);return result;}catch(e){toast.error((e as Error).message);return undefined;}finally{setBusy('');}},[busy]);
 function change<K extends keyof Settings>(key:K,value:Settings[K]){setS(prev=>({...prev,[key]:value}));setDirty(true);}
 async function saveSettings(next=s){
  const result=await api('/api/workspace','PUT',next);
  if(accountFilter!=='all'&&accountFilter){
    try{
      await api('/api/managed-connections','POST',{
        kind:'instagram',
        action:'update',
        id:accountFilter,
        tone:next.tone,
        customInstructions:next.instructions
      });
    }catch{}
  }
  setDirty(false);
  await reload();
  return result;
}
 function selectThread(t:Thread){setSelectedId(t.id);setReply(t.draft);setMobileChatView(true);navigate(t.channel==='comment'?'comments':'dms');}
 async function threadAction(action:string,text?:string,value?:boolean,id=active?.id){if(!id)throw new Error('Select a conversation first.');const result=await api('/api/threads','POST',{id,action,text,value});await reload(true);return result;}
 async function connectionAction(action:string){const result=await api('/api/connections','POST',action==='save'?{action,...credentials}:{action});if(action==='save')setCredentials({instagramToken:'',groqKey:'',metaSecret:'',instagramAppSecret:'',verifyToken:''});await reload(true);return result;}
 async function exportData(){const response=await fetch('/api/export');if(!response.ok){const e:any=await response.json();throw new Error(e.error);}const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='nina-workspace.json';a.click();URL.revokeObjectURL(url);}
 useEffect(()=>{const context=(document as Document&{modelContext?:{registerTool:(tool:unknown,options:unknown)=>unknown}}).modelContext;if(!context?.registerTool)return;const controller=new AbortController();const tools=[{name:'read_nina_workspace',title:'Read Nina workspace',description:'Read the current conversations, connection status, and automation state. Contains user messages.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(input:unknown)=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('No input fields are accepted.');const w=await api('/api/workspace');setData(w);return {connections:w.connections,enabled:w.settings.enabled,threads:w.threads.map((t:Thread)=>({id:t.id,username:t.username,status:t.status,demo:t.demo})),usage:w.usage};}},{name:'open_nina_view',title:'Open workspace view',description:'Navigate to an existing Nina view; does not save changes or send messages.',inputSchema:{type:'object',properties:{view:{type:'string',enum:nav.map(n=>n.id)}},required:['view'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:async(input:unknown)=>{const x=input as {view?:string};if(!x||Object.keys(x).length!==1||!nav.some(n=>n.id===x.view))throw new Error('Choose a valid workspace view.');navigate(x.view!);return {view:x.view};}}];for(const t of tools){try{Promise.resolve(context.registerTool(t,{signal:controller.signal})).catch(()=>{});}catch{}}return ()=>controller.abort();},[navigate]);
 const savingButton=<button className="button primary" disabled={!saved||!!busy||!dirty} onClick={()=>run('settings',()=>saveSettings(),'Changes saved')}><Save size={15}/>{busy==='settings'?'Saving…':'Save changes'}</button>;
 const stateIcon=(ok:boolean)=>ok?<Check size={16}/>:<Clock size={16}/>;
 return <SidebarProvider style={{'--sidebar-width':'218px'} as CSSProperties}><Toaster position="bottom-right"/><Sidebar className="nina-sidebar"><SidebarHeader><div className="brand"><span className="brand-mark">n<span>✦</span></span><span>nina<span className="brand-caption">CONTROL ROOM</span></span></div></SidebarHeader><SidebarContent><div className="workspace-label">YOUR WORKSPACE</div><SidebarMenu>{nav.map(n=><SidebarMenuItem key={n.id}><SidebarMenuButton isActive={view===n.id} onClick={()=>navigate(n.id)}><n.icon size={18}/><span>{n.name}</span>{(n.id==='inbox'||n.id==='dms'||n.id==='comments')&&<span className="nav-count">{threads.filter(t=>(n.id==='dms'?t.channel==='dm':n.id==='comments'?t.channel==='comment':true)&&t.status!=='resolved').length}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="sidebar-guide"><Sparkles size={21}/><b>Your voice. Your rules.</b><p>Fine-tune how Nina replies, one conversation at a time.</p><button onClick={()=>navigate('personality')}>Edit personality</button></div></SidebarContent><SidebarFooter><div className="account"><span className="avatar purple">NK</span><div><b>Nina Kurain</b><small>@{c.username||'kurain.pvt'}</small></div><Instagram size={18}/></div></SidebarFooter></Sidebar><main className="app-main"><header className="topbar"><div className="breadcrumb"><SidebarTrigger className="header-sidebar-trigger"/><span className="breadcrumb-root">Workspace</span><ChevronRight size={14} className="breadcrumb-sep"/><b>{nav.find(n=>n.id===view)?.name}</b></div><div className="top-actions"><button type="button" className="pill button-account-select" onClick={()=>setAccountGateOpen(true)} title="Switch managed account"><Instagram size={13} style={{color:'#7354da'}}/><span>{accountFilter==='all'?'All Accounts':('@'+((c.accounts||[]).find(a=>a.id===accountFilter)?.username||'Account'))}</span><ChevronRight size={12} style={{transform:'rotate(90deg)',opacity:0.7}}/></button><span className={'pill status-pill '+(data.settings.enabled?'active-pill':'paused-pill')} title={data.settings.enabled?(replyWindow.phase==='break'?'On a scheduled break':data.settings.approval?'Draft mode active':'Auto replies active'):'Automation paused'}><span className={'status-pulse-dot '+(data.settings.enabled?(replyWindow.phase==='break'?'dot-break':'dot-active'):'dot-paused')}/><span className="status-pill-text">{data.settings.enabled?(replyWindow.phase==='break'?'Break':data.settings.approval?'Drafts':'Active'):'Paused'}</span></span><button className="icon-button header-help-btn" aria-label="Workspace help" onClick={()=>setHelpOpen(true)}><CircleHelp size={18}/></button><button type="button" className="icon-button header-signout-btn" style={{color:"#8a839e",padding:"6px 8px",gap:"5px",display:"inline-flex",alignItems:"center",fontSize:"12px",borderRadius:"8px"}} onClick={handleSignOut} title="Sign Out"><LogOut size={16}/><span>Sign out</span></button><span className="avatar small purple header-avatar" onClick={()=>navigate('security')}>NK</span></div></header><section className="page">{accountFilter!=='all'&&view==='overview'&&<div className="active-account-banner"><div className="banner-account-info"><span className="avatar small purple">{initials(((c.accounts||[]).find(a=>a.id===accountFilter)?.username||'IG'))}</span><div><div style={{display:'flex',alignItems:'center',gap:'6px'}}><span className="banner-account-badge">Active:</span><strong className="banner-account-handle">@{((c.accounts||[]).find(a=>a.id===accountFilter)?.username||'Account')}</strong></div><p className="banner-account-detail">Statistics, chats, drafts & rules filtered for this account.</p></div></div><div className="banner-account-actions"><button type="button" className="button subtle" onClick={()=>setAccountGateOpen(true)}>Switch</button><button type="button" className="button subtle" onClick={()=>selectAccount('all')}>View all</button></div></div>}{view!=='inbox'&&view!=='dms'&&view!=='comments'&&<div className="page-title"><div><div className="eyebrow">{intro.eyebrow}</div><h1>{intro.title}</h1><p>{intro.description}</p></div><div className="title-actions">{(view==='personality'||view==='automation')?savingButton:view==='activity'?<button className="button" disabled={!saved||!!busy} onClick={()=>run('export',exportData,'Workspace exported')}><Download size={16}/>Export workspace</button>:view==='connections'?<span className="pill"><LockKeyhole size={13}/>Credentials stay private</span>:<button className="button primary" onClick={()=>navigate('connections')}><Link2 size={16}/>{c.instagramVerified?'Manage connection':'Connect Instagram'}</button>}</div></div>}{view==='overview'&&(c.accounts||[]).length>1&&<Choice label="Instagram account" value={accountFilter} options={[{value:'all',label:'All accounts'},...(c.accounts||[]).map(a=>({value:a.id,label:a.username?'@'+a.username:'New account'}))]} onChange={v=>{setAccountFilter(v);setSelectedId('');}}/>}{loadError&&<div className="error-banner" role="alert"><AlertTriangle size={18}/><span>{loadError}</span><button onClick={()=>run('reload',()=>reload())}>Try again</button></div>}{loading&&<div className="loading-note" role="status"><Loader2 className="spin" size={14}/>Loading your saved workspace…</div>}{view==='overview'&&<><div className="live-banner"><MessageCircle size={17}/><span><b>Live inbox</b> · {c.receiverSeen?'Real interactions from your connected account.':'Waiting for Instagram delivery.'}</span></div><div className="stat-row">{[{label:'Inbox',value:String(threads.filter(t=>t.status!=='resolved').length),detail:'Open conversations',icon:MessageCircle},{label:'Waiting for review',value:String(reviews.length),detail:'You have the final say',icon:ShieldCheck},{label:'Replies sent',value:String(data.usage.sent),detail:'Confirmed live replies',icon:Send},{label:'Voice profile',value:data.settings.tone.charAt(0).toUpperCase()+data.settings.tone.slice(1),detail:data.settings.language==='auto'?'Matches the incoming language':data.settings.language,icon:Sparkles}].map(item=><div className="stat" key={item.label}><div><span>{item.label}</span><item.icon size={17}/></div><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div></>}
 {(view==='inbox'||view==='dms'||view==='comments')&&<div className={'inbox-layout '+(mobileChatView?'mobile-show-chat':'mobile-show-list')}><div className="conversation-list"><div className="list-heading"><b>{view==='dms'?'Direct Messages (DMs)':view==='comments'?'Reel & Post Comments':'All conversations'}</b><span>{String(filtered.length).padStart(2,'0')}</span></div><div className="search-box"><Search size={16}/><input aria-label="Search conversations" placeholder="Search name or message" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button className="icon-button" aria-label="Clear search" onClick={()=>setSearch('')}><X size={13}/></button>}</div>
{view==='comments'&&(
  <div className="comments-post-selector">
    <div className="comments-post-selector-header">
      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
        <Instagram size={15} style={{color:'#7354da'}}/>
        <b style={{fontSize:'12px',color:'#271c42'}}>Instagram Reels & Posts</b>
      </div>
      <button 
        type="button" 
        className="button subtle sync-reels-btn" 
        style={{padding:'3px 8px',fontSize:'11px',gap:'4px'}} 
        disabled={!saved||!!busy} 
        onClick={()=>run('sync-reels',async()=>{
          const r=await api('/api/workspace','POST',{action:'sync-reels',accountId:accountFilter==='all'?undefined:accountFilter});
          await reload(true);
          toast.success(r.message||'Reels synced from Instagram');
        })}
      >
        <RefreshCw size={11} className={busy==='sync-reels'?'spin':''}/>
        <span>Sync Reels</span>
      </button>
    </div>
    
    <div className="comments-post-chips">
      <button 
        type="button" 
        className={'post-chip '+(selectedPostId==='all'?'active':'')} 
        onClick={()=>{setSelectedPostId('all');setSelectedId('');setMobileChatView(false);}}
      >
        <span className="post-chip-title">All Posts & Reels</span>
        <span className="post-chip-count">{threads.filter(t=>t.channel==='comment').length}</span>
      </button>
      {catalogList.map(post=>{
        const count = threads.filter(t=>t.channel==='comment' && getThreadPostId(t, catalogList)===post.id).length;
        const isSel = selectedPostId === post.id;
        return (
          <button 
            key={post.id} 
            type="button" 
            className={'post-chip '+(isSel?'active':'')} 
            onClick={()=>{setSelectedPostId(post.id);setSelectedId('');setMobileChatView(false);}}
          >
            <span className="post-chip-badge">{post.contentType==='reel'?'🎬':'📸'}</span>
            <span className="post-chip-title" title={post.title||post.caption||post.id}>
              {post.title || (post.caption ? post.caption.slice(0, 30) : ('Post ' + post.id.slice(-6)))}
            </span>
            <span className="post-chip-count">{count}</span>
          </button>
        );
      })}
    </div>
    {selectedPostId!=='all' && (
      <div className="active-post-detail-bar">
        {(() => {
          const p = catalogList.find(x => x.id === selectedPostId);
          if(!p) return null;
          return (
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'11px',fontWeight:700,color:'#7354da'}}>
                <span>{p.contentType==='reel'?'🎬 REEL SELECTED':'📸 POST SELECTED'}</span>
                {p.dateAdded&&<span style={{fontSize:'10px',fontWeight:400,color:'#857e96'}}>· {new Date(p.dateAdded).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>}
              </div>
              <p style={{margin:'2px 0 0 0',fontSize:'11px',color:'#453d5a',lineHeight:1.3}} className="post-detail-caption">
                {p.caption || p.description}
              </p>
            </div>
          );
        })()}
      </div>
    )}
  </div>
)}
{view==='inbox'&&<Tabs value={channel} onValueChange={setChannel}><TabsList className="channel-tabs"><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="dm">DMs</TabsTrigger><TabsTrigger value="comment">Comments</TabsTrigger></TabsList></Tabs>}<div className="thread-list">{filtered.map((t,i)=>{
  const lastMsg = t.messages?.at(-1);
  const snippet = lastMsg?.text || t.draft || (t.postContext ? `Reel: ${t.postContext.replace(/[\r\n]+/g, ' ')}` : (t.channel === 'comment' ? 'Instagram public comment' : 'Instagram direct message'));
  const isOut = lastMsg?.role === 'outgoing';
  const acc = (c.accounts||[]).find(a=>a.id===(t.accountId||'legacy-instagram'));
  const timeFormatted = t.demo ? 'Sample' : new Date(t.updated||Date.now()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  return (
    <button key={t.id} className={'thread '+(selectedId===t.id?'selected':'')} onClick={()=>{setSelectedId(t.id);setReply(t.draft);setMobileChatView(true);}}>
      <div className="thread-avatar-wrapper">
        <span className={'avatar '+colors[i%4]}>{initials(t.name)}</span>
      </div>
      <div className="thread-body">
        <div className="thread-top">
          <div className="thread-sender-group">
            <b className="thread-sender-name">{t.name}</b>
            <span className={'thread-pill '+(t.channel==='dm'?'pill-dm':'pill-comment')}>
              {t.channel==='dm'?'💬 DM':'❤️ Comment'}
            </span>
          </div>
          <small className="thread-timestamp">{timeFormatted}</small>
        </div>
        <p className="thread-snippet">
          {isOut && <span className="thread-snippet-prefix">You: </span>}
          {snippet}
        </p>
        <div className="thread-tags-row">
          {(c.accounts||[]).length>1 && acc?.username && (
            <span className="thread-pill pill-account">@{acc.username}</span>
          )}
          {t.takeover ? (
            <span className="thread-pill pill-takeover">👤 Takeover</span>
          ) : t.status==='review' ? (
            <span className="thread-pill pill-review">⏳ Review</span>
          ) : t.status==='resolved' ? (
            <span className="thread-pill pill-done">✔ Done</span>
          ) : (
            <span className="thread-pill pill-open">🟢 Open</span>
          )}
          {(t.postContext||t.mediaId) && (
            <span className="thread-pill pill-reel" title={t.postContext||''}>
              🎬 Reel/Post
            </span>
          )}
        </div>
      </div>
    </button>
  );
})}{!filtered.length&&<div className="list-empty"><Inbox size={26}/><b>{search?'No matches':'No conversations yet'}</b><p>{search?'Try another name or message.':'Connect the receiver to start receiving messages.'}</p></div>}</div></div>
  {active?<><section className="conversation-panel"><header className="chat-header"><button className="mobile-back-button" onClick={()=>setMobileChatView(false)} aria-label="Back to conversations"><ChevronLeft size={16}/><span>All chats</span></button><span className={'avatar '+colors[Math.max(threads.indexOf(active),0)%4]}>{initials(active.name)}</span><div><b>{active.name}</b><small>@{active.username} · {active.demo?'Sample conversation':active.channel==='dm'?'Direct message':'Public comment'}</small></div><button className={'button subtle '+(active.takeover?'takeover-active':'')} disabled={!saved||!!busy} onClick={()=>run('takeover',()=>threadAction('takeover',undefined,!active.takeover),active.takeover?'Reply assistance resumed':'You’re in control of this conversation')}><Pause size={14}/>{active.takeover?'Hand back':'Take over'}</button><DropdownMenu><DropdownMenuTrigger asChild><button className="icon-button conversation-options" aria-label="Conversation actions"><MoreHorizontal size={19}/></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!saved||!!busy||!c.aiSaved} onClick={()=>run('generate',()=>threadAction('generate'),'Fresh reply ready')}><Sparkles size={15}/>Generate fresh reply</DropdownMenuItem><DropdownMenuItem disabled={!saved||!!busy||!reply.trim()} onClick={()=>run('draft',()=>threadAction('draft',reply),'Draft saved')}><Save size={15}/>Save draft</DropdownMenuItem><DropdownMenuItem disabled={!saved||!!busy||active.status==='resolved'} onClick={()=>run('resolve',()=>threadAction('resolve'),'Conversation marked done')}><Check size={15}/>Mark done</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem disabled={!saved||!!busy} onClick={()=>run('ai',()=>threadAction('ai',undefined,!active.ai),'Conversation updated')}>{active.ai?'Pause reply assistance':'Resume reply assistance'}</DropdownMenuItem>{!active.demo&&<DropdownMenuItem onClick={()=>setDeleteId(active.id)}><Trash2 size={15}/>Delete conversation</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></header><div className="chat-messages">{active.postContext&&<div style={{background:'#f6f2fc',border:'1px solid #e2d5f7',borderRadius:'8px',padding:'10px 14px',margin:'8px 16px',fontSize:'12px',color:'#3b2269'}}><div style={{display:'flex',alignItems:'center',gap:'6px',fontWeight:700,marginBottom:'4px',color:'#643ab2'}}><Instagram size={14}/><span>Reel / Post Content ({active.mediaType||'reel/post'})</span></div><p style={{margin:0,lineHeight:1.4}}>{active.postContext}</p></div>}<span className="date-divider">{active.demo?'PREVIEW CONVERSATION':active.channel==='dm'?'DIRECT MESSAGE':'POST COMMENT'}</span>{active.messages.map((m,i)=><div className={'bubble '+m.role} key={i}>{m.text}<small>{active.demo?'Sample '+(m.role==='incoming'?'message':'reply'):new Date(m.at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}{m.role==='outgoing'&&<CheckCheck size={12}/>}</small></div>)}{active.flagged&&<div className="sensitive-note"><ShieldCheck size={17}/>{active.flagged}</div>}{active.draft&&<div className="draft-card"><div><Sparkles size={16}/><b>Suggested reply</b><span>{active.demo?'Sample draft':'Suggested draft'}</span></div><p>{active.draft}</p><small>{active.demo?'Illustrative reply. Connect Groq to generate a fresh one.':'Generated with your saved personality. Review before sending.'}</small></div>}{active.takeover&&<div className="takeover-note"><Pause size={14}/>Reply assistance is paused for this conversation.</div>}</div><footer className="composer"><textarea aria-label="Reply" maxLength={1000} placeholder={active?.channel==='comment'?`Reply to @${active?.username}…`:"Edit the reply or write your own…"} value={reply} onChange={e=>setReply(e.target.value)}/><div className="composer-bottom"><span className="composer-status"><ShieldCheck size={14}/>{active.demo?'Sample · nothing published':active.channel==='dm'&&Date.now()-active.lastInbound>=86400000?'DM reply window closed':'Review before sending'}</span><div className="composer-buttons"><button className="icon-button composer-save-btn" disabled={!saved||!!busy||!reply.trim()} aria-label="Save draft" title="Save draft" onClick={()=>run('draft',()=>threadAction('draft',reply),'Draft saved')}><Save size={16}/></button><button className="button primary composer-send-btn" disabled={!saved||!!busy||!reply.trim()||!active.demo&&active.channel==='dm'&&Date.now()-active.lastInbound>=86400000} onClick={()=>run('send',()=>threadAction('send',reply),active.demo?'Sample reply saved · nothing published':'Reply sent')}><Send size={15}/>{busy==='send'?'Sending…':active.demo?'Simulate reply':'Send reply'}</button></div></div></footer></section><aside className="context-panel"><div className="panel-label">REPLY ASSISTANT</div><div className="voice-orbit"><Sparkles size={24}/></div><h3>A natural conversation</h3><p>Your voice profile shapes every reply. Keep it short, warm, and personal.</p><div className="context-segment"><label>Active personality</label><div><span className="mini-icon"><Sparkles size={16}/></span><b>{data.settings.tone==='selective'?'💎 Selective & Chic (Influencer)':data.settings.tone==='erotic'?'Adult & Seductive (Sex chat)':data.settings.tone==='spicy'?'Spicy & Flirty':data.settings.tone==='playful'?'Playful & warm':data.settings.tone==='friendly'?'Friendly & relaxed':'Calm & thoughtful'}</b></div><button onClick={()=>navigate('personality')}>Customize voice</button></div><div className="context-segment"><label>CONVERSATION CONTROLS</label><div className="toggle-row"><span>Reply assistance</span><Switch checked={active.ai} disabled={!saved||!!busy} onCheckedChange={v=>run('ai',()=>threadAction('ai',undefined,v),'Conversation updated')} aria-label="Reply assistance"/></div><div className="toggle-row"><span>Human takeover</span><Switch checked={active.takeover} disabled={!saved||!!busy} onCheckedChange={v=>run('takeover',()=>threadAction('takeover',undefined,v),'Conversation updated')} aria-label="Human takeover"/></div><button className="generate-button" disabled={!saved||!!busy||!c.aiSaved} onClick={()=>run('generate',()=>threadAction('generate'),'Fresh reply ready')}><Sparkles size={14}/>{busy==='generate'?'Generating…':'Generate fresh reply'}</button>{!c.aiSaved&&<p className="micro-note">Add a free Groq key to generate replies.</p>}<button className="resolve-button" disabled={!saved||!!busy||active.status==='resolved'} onClick={()=>run('resolve',()=>threadAction('resolve'),'Conversation marked done')}><Check size={14}/>Mark done</button>{!active.demo&&<button className="delete-button" onClick={()=>setDeleteId(active.id)}><Trash2 size={13}/>Delete conversation</button>}</div><div className="small-note"><ShieldCheck size={17}/><p>{active.demo?'Preview actions won’t publish to Instagram.':'You can edit every draft and take over at any time.'}</p></div></aside></>:<div className="empty-conversation"><Inbox size={36}/><h2>Your inbox is ready.</h2><p>{'Select a conversation, or wait for a new Instagram message.'}</p><button className="button primary" onClick={()=>navigate('connections')}>Open connections</button></div>}
 </div>}
 {view==='review'&&<div className="review-grid">{reviews.map((t,i)=><section className="review-card" key={t.id}><header><span className={'avatar '+colors[i%4]}>{initials(t.name)}</span><div><b>{t.name}</b><small>{t.channel==='dm'?'Direct message':'Post comment'} · {t.demo?'Sample':'Live'}</small></div><span className="review-tag">Needs review</span></header><div className="review-incoming">{t.messages.filter(m=>m.role==='incoming').at(-1)?.text}</div><div className="review-draft"><Sparkles size={15}/><p>{t.draft||'No draft yet. Open the conversation to write a reply.'}</p></div>{t.flagged&&<p className="sensitive-note">{t.flagged}</p>}<footer><button className="button" onClick={()=>selectThread(t)}>Edit reply</button><button className="button primary" disabled={!saved||!!busy||!t.draft} onClick={()=>run(t.id,()=>threadAction('send',t.draft,undefined,t.id),t.demo?'Sample reply saved':'Reply sent')}><Check size={14}/>{t.demo?'Simulate approval':'Approve & send'}</button></footer></section>)}{!reviews.length&&<div className="large-empty"><ShieldCheck size={40}/><h2>All caught up.</h2><p>Replies needing your approval will appear here.</p><button className="button" onClick={()=>navigate('inbox')}>Open inbox</button></div>}</div>}
 {view==='overview'&&<WorkspacePulse workspace={data} window={replyWindow} navigate={navigate}/>}
 {view==='testing'&&<TestLab workspace={data} onReload={()=>reload(true)}/>}
 {view==='security'&&<SecurityPanel/>}
 {view==='usage'&&<LimitMonitor/>}
 {view==='overview'&&<div className="settings-grid"><Card title="Your launch checklist" description="Each connection is tested separately." icon={CheckCheck}><div className="checklist">{[{name:'Private dashboard',detail:'Your inbox and controls are ready.',ok:saved,view:'inbox'},{name:'Instagram account',detail:c.instagramVerified?'@'+c.username+' verified':'Save the access token you generated.',ok:c.instagramVerified,view:'connections'},{name:'Reply provider',detail:c.aiVerified?'Your selected provider is ready.':'Save and test a provider key.',ok:c.aiVerified,view:'connections'},{name:'Public webhook receiver',detail:c.receiverSeen?'A signed event has arrived.':'Connect a public receiver for 24/7 messages.',ok:c.receiverSeen,view:'connections'}].map(step=><button className="checklist-step" key={step.name} onClick={()=>navigate(step.view)}><span className={step.ok?'step-icon complete':'step-icon'}>{stateIcon(step.ok)}</span><div><b>{step.name}</b><small>{step.detail}</small></div><ChevronRight size={15}/></button>)}</div></Card><Card title="Your reply usage" description="Shared model routing across your accounts" icon={Sparkles}><div className="usage-display"><div><strong>{data.usage.calls.toLocaleString()}</strong><span>Generation calls</span></div><div><strong>{data.usage.tokens.toLocaleString()}</strong><span>Tokens used</span></div></div><p className="body-note">{data.settings.dailyLimit===0?'No daily cap is set in Nina.':'Your daily cap is '+data.settings.dailyLimit+' generation calls.'} Provider quotas and billing depend on each key. Approved fallback keys are used when the active connection reaches a limit.</p><div className="overview-links"><button className="button" onClick={()=>navigate('automation')}>Adjust daily cap</button><button className="button primary" onClick={()=>navigate('testing')}><FlaskConical size={15}/>Open Test Lab</button></div></Card><Card title="Waiting for your touch" description="The next replies to review." icon={ShieldCheck}>{reviews.slice(0,3).map(t=><button className="compact-thread" key={t.id} onClick={()=>selectThread(t)}><span className="avatar purple">{initials(t.name)}</span><div><b>{t.name}</b><p>{t.messages.at(-1)?.text}</p></div><ChevronRight size={15}/></button>)}{!reviews.length&&<p className="body-note">No replies need review.</p>}</Card><Card title="Recent activity" description="Your latest saved changes." icon={Activity}>{data.logs.slice(0,4).map(log=><div className="compact-log" key={log.id}><span className="mini-icon"><Activity size={13}/></span><div><b>{log.kind}</b><p>{log.message}</p></div></div>)}{!data.logs.length&&<p className="body-note">Your activity log starts with your first saved change.</p>}<button className="text-button" onClick={()=>navigate('activity')}>See all activity</button></Card></div>}
     {view==='personality'&&<div style={{marginBottom:'16px',padding:'12px 16px',background:'#faf8fe',border:'1px solid #ebdff8',borderRadius:'12px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'10px'}}>
    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
     <Sparkles size={16} style={{color:'#7354da'}}/>
     <div>
      <b style={{fontSize:'13px',color:'#2c1d4d'}}>Voice Editing Profile for: <span style={{color:'#7354da'}}>{accountFilter==='all'?'All Accounts (Global Default)':('@'+((c.accounts||[]).find(a=>a.id===accountFilter)?.username||'Account'))}</span></b>
      <p style={{margin:0,fontSize:'11px',color:'#766e8a'}}>Changes save to your global voice settings and active account profile.</p>
     </div>
    </div>
    <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}}>
     <span style={{fontSize:'11px',fontWeight:600,color:'#857e96'}}>Switch Profile:</span>
     <button type="button" style={{fontSize:'11px',padding:'4px 10px',borderRadius:'8px',border:accountFilter==='all'?'1.5px solid #7354da':'1px solid #e2dcec',background:accountFilter==='all'?'#7354da':'#fff',color:accountFilter==='all'?'#fff':'#55409b',fontWeight:600,cursor:'pointer'}} onClick={()=>selectAccount('all')}>All (Global)</button>
     {(c.accounts||[]).map(acc=><button key={acc.id} type="button" style={{fontSize:'11px',padding:'4px 10px',borderRadius:'8px',border:accountFilter===acc.id?'1.5px solid #7354da':'1px solid #e2dcec',background:accountFilter===acc.id?'#7354da':'#fff',color:accountFilter===acc.id?'#fff':'#55409b',fontWeight:600,cursor:'pointer'}} onClick={()=>selectAccount(acc.id)}>@{acc.username||'Account'}</button>)}
    </div>
   </div>}
   {view==='personality'&&<div className="personality-grid"><div className="settings-stack"><Card title="Nina’s Character Details" description="Identity, age, city, photoshoot style, and facts used by all models." icon={FileText}><div className="form-grid"><label className="field"><span>Full Name</span><input value={s.profile?.name||''} placeholder="Nina Kurain" onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),name:e.target.value})}/></label><label className="field"><span>Profession / Role</span><input value={s.profile?.profession||''} placeholder="Content Creator & Influencer" onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),profession:e.target.value})}/></label></div><div className="form-grid"><label className="field"><span style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><span>Date of birth</span><span className="pill active-pill" style={{padding:'2px 8px',fontSize:'11px',fontWeight:600}}>🎂 {calcAge(s.profile?.dob)} years old</span></span><input type="date" value={s.profile?.dob||'2001-07-08'} onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),dob:e.target.value})}/><small>Age ({calcAge(s.profile?.dob)} yrs) auto-calculates from this date (July 8, 2001).</small></label><label className="field"><span>City</span><input value={s.profile?.city||''} placeholder="Mumbai" onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),city:e.target.value})}/></label></div><div className="form-grid"><label className="field"><span>Country</span><input value={s.profile?.country||''} placeholder="India" onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),country:e.target.value})}/></label><label className="field"><span>Content & Photoshoot Style</span><input value={s.profile?.contentStyle||''} placeholder="Selective original content & photoshoots · 100% real, no AI" onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),contentStyle:e.target.value})}/></label></div><div className="form-grid"><label className="field"><span>Photoshoot Locations</span><input value={s.profile?.photoshootLocations||''} placeholder="Nearby parks, at home, and at friends’ houses" onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),photoshootLocations:e.target.value})}/><small>Parks, home, friends’ houses.</small></label><label className="field"><span>Who Shoots Her Photos</span><input value={s.profile?.photographer||''} placeholder="Her close friend shoots all her photos" onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),photographer:e.target.value})}/><small>Her close friend is her photographer.</small></label></div><div className="form-grid"><label className="field"><span>Call & Audio Preference</span><input value={s.profile?.callPreference||''} placeholder="Strictly texting only · does not do normal calls, video calls, or voice notes" onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),callPreference:e.target.value})}/><small>Casually declines voice/video calls & voice notes.</small></label><label className="field"><span>Vibe & Attitude</span><input value={s.profile?.vibe||''} placeholder="Chill, confident, a little attitude/sass, sweet and never hurts feelings · short replies" onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),vibe:e.target.value})}/><small>Chill, confident attitude without hurting feelings.</small></label></div><Toggle label="Strictly Deny Being AI / Assert Real Human Identity" description="If anyone asks 'are you AI / bot / fake / real?', Nina firmly and naturally denies it: she is Nina Kurain, 25 years old from Mumbai. All photos and content are 100% original photoshoots with zero AI." value={s.profile?.denyAi!==false} onChange={v=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),denyAi:v})}/><label className="field" style={{marginTop:'12px'}}><span>Character Persona, Bio & Backstory</span><textarea rows={4} placeholder="Describe Nina's personality, aesthetic vibe, habits, lifestyle..." value={s.profile?.bio||''} onChange={e=>change('profile',{...(s.profile||{name:'Nina Kurain',dob:'2001-07-08',city:'Mumbai',country:'India'}),bio:e.target.value})}/><small>Detailed character backstory fed into the system prompt. Nina stays strictly within this persona.</small></label></Card><Card title="The voice profile" description="Use your normal texting style as the starting point." icon={Sparkles}><Toggle label="Female voice & Hindi grammar" description="Bot strictly speaks in a natural female tone and first-person feminine Hindi/Hinglish verb endings ('main karti hu', 'dekhungi', 'bol rahi hu', 'thak gayi')." value={s.femaleTone!==false} onChange={v=>change('femaleTone',v)}/><div className="form-grid"><Choice label="Tone" value={s.tone} options={[{value:'selective',label:'💎 Selective & Chic (Influencer tone · confident & selective)'},{value:'erotic',label:'🔞 Adult & Seductive (Sex chat / Intimate)'},{value:'spicy',label:'🔥 Spicy & Flirty'},{value:'playful',label:'✨ Playful & warm'},{value:'friendly',label:'😊 Friendly & relaxed'},{value:'calm',label:'🌿 Calm & thoughtful'}]} onChange={v=>change('tone',v as Settings['tone'])}/><Choice label="Language" value={s.language} options={[{value:'auto',label:'Match the sender'},{value:'English',label:'English'},{value:'Hinglish',label:'Hinglish'}]} onChange={v=>change('language',v as Settings['language'])}/><Choice label="Reply length" value={String(s.length)} options={[{value:'1',label:'A few words · 2–8'},{value:'2',label:'One or two sentences'},{value:'3',label:'A little more detail'},{value:'4',label:'Adaptive · mostly short'}]} onChange={v=>change('length',Number(v))}/>{c.primaryProviderId==='legacy-groq'?<Choice label="Model on Groq" value={s.model} options={[{value:'openai/gpt-oss-120b',label:'GPT-OSS 120B · quality'},{value:'openai/gpt-oss-20b',label:'GPT-OSS 20B · lighter'}]} onChange={v=>change('model',v)}/>:<p className="body-note">Selected model: {(c.providers||[]).find(p=>p.id===c.primaryProviderId)?.model}. Change keys and models in Connections.</p>}</div><div className="range-field" style={{background:'#fcfaff',border:'1px solid #ebdff8',borderRadius:'10px',padding:'12px 14px',margin:'12px 0'}}><div><label style={{fontWeight:600,color:'#2c204d',display:'flex',alignItems:'center',gap:'6px'}}><SlidersHorizontal size={14}/>Max word limit per reply</label><span style={{fontSize:'13px',fontWeight:700,color:'#7354da',background:'#f1ebfc',padding:'2px 9px',borderRadius:'12px'}}>{s.maxWords ?? (s.length === 1 ? 8 : s.length === 2 ? 15 : s.length === 3 ? 28 : 8)} words max</span></div><Slider value={[s.maxWords ?? (s.length === 1 ? 8 : s.length === 2 ? 15 : s.length === 3 ? 28 : 8)]} min={2} max={50} step={1} onValueChange={v=>change('maxWords',v[0])} aria-label="Max word limit per reply"/><div className="range-labels" style={{marginTop:'4px'}}><span>2 words (ultra concise)</span><span>50 words (longer)</span></div><div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'10px',alignItems:'center'}}><span style={{fontSize:'11px',color:'#88849b',fontWeight:600,marginRight:'2px'}}>Quick presets:</span>{[{label:'5 words (Short & Punchy)',val:5},{label:'8 words (Natural & Sweet)',val:8},{label:'14 words (1–2 Sentences)',val:14},{label:'22 words (Expressive)',val:22},{label:'35 words (Detailed)',val:35}].map(p=>{const cur=s.maxWords??(s.length===1?8:s.length===2?15:s.length===3?28:8);const isSel=cur===p.val;return <button key={p.val} type="button" style={{fontSize:'11px',padding:'4px 8px',borderRadius:'6px',border:isSel?'1px solid #7354da':'1px solid #e2dcec',background:isSel?'#7354da':'#fff',color:isSel?'#fff':'#55409b',fontWeight:isSel?600:500,cursor:'pointer',transition:'all 0.15s ease'}} onClick={()=>change('maxWords',p.val)}>{p.label}</button>})}</div><small style={{display:'block',marginTop:'8px',color:'#7d7990',fontSize:'11px'}}>Strict length limit enforced across all models. Nina avoids lengthy walls of text and stays natural.</small></div><div className="range-field"><div><label>Playfulness</label><span>{s.playfulness}%</span></div><Slider value={[s.playfulness]} min={0} max={100} step={5} onValueChange={v=>change('playfulness',v[0])} aria-label="Playfulness"/><div className="range-labels"><span>Understated</span><span>Cheeky</span></div></div><div className="range-field"><div><label>Emoji frequency</label><span>{s.emoji}%</span></div><Slider value={[s.emoji]} min={0} max={100} step={5} onValueChange={v=>change('emoji',v[0])} aria-label="Emoji frequency"/><div className="range-labels"><span>None</span><span>More expressive</span></div></div><label className="field"><span>Your writing preferences</span><textarea value={s.instructions} maxLength={4000} onChange={e=>change('instructions',e.target.value)} rows={4}/></label><label className="field"><span>Account facts & answers</span><textarea placeholder="Add facts Nina may use: product details, prices, links, locations, or FAQs. Leave uncertain details out." value={s.knowledge} maxLength={8000} onChange={e=>change('knowledge',e.target.value)} rows={4}/><small>Facts come from this field. Style examples are used for wording only.</small></label></Card><Card title="Teach it your replies" description="Replace these starter examples with the way you actually text." icon={MessageCircle}>{s.examples.map((x,i)=><div className="style-example" key={i}><div><label>Incoming</label><input aria-label={'Incoming example '+(i+1)} value={x.incoming} maxLength={500} onChange={e=>change('examples',s.examples.map((v,j)=>i===j?{...v,incoming:e.target.value}:v))}/><label>Your reply</label><input aria-label={'Reply example '+(i+1)} value={x.reply} maxLength={500} onChange={e=>change('examples',s.examples.map((v,j)=>i===j?{...v,reply:e.target.value}:v))}/></div><button className="icon-button" aria-label={'Remove example '+(i+1)} onClick={()=>change('examples',s.examples.filter((_,j)=>j!==i))}><Trash2 size={16}/></button></div>)}<div className="add-example"><label className="field"><span>Incoming message</span><input value={example.incoming} maxLength={500} onChange={e=>setExample({...example,incoming:e.target.value})} placeholder="What did they say?"/></label><label className="field"><span>Your reply</span><input value={example.reply} maxLength={500} onChange={e=>setExample({...example,reply:e.target.value})} placeholder="How would you answer?"/></label><button className="button" disabled={!example.incoming.trim()||!example.reply.trim()||s.examples.length>=50} onClick={()=>{change('examples',[...s.examples,{incoming:example.incoming.trim(),reply:example.reply.trim()}]);setExample({incoming:'',reply:''});}}><Plus size={15}/>Add example</button></div><p className="micro-note">{s.examples.length}/50 examples · save changes to use them in generated replies.</p></Card></div><div className="settings-stack"><Card title="Try a real conversation" description="A live generated response. Nothing gets sent to Instagram." icon={FlaskConical}><span className={'connection-badge '+(c.aiVerified?'connected':'')}>{c.aiVerified?<Check size={13}/>:<Link2 size={13}/>} {c.aiVerified?'Reply provider verified':c.aiSaved?'Key saved · test required':'Tested API key needed'}</span><Choice label="Reply context" value={testChannel} options={[{value:'dm',label:'Private DM'},{value:'comment',label:'Public comment'}]} onChange={v=>setTestChannel(v as Channel)}/><label className="field"><span>Incoming message</span><textarea rows={4} value={testInput} maxLength={1000} onChange={e=>setTestInput(e.target.value)}/></label>{dirty&&<p className="unsaved-note">Save your voice changes first. The tester uses the saved profile.</p>}<button className="button primary full-button" disabled={!saved||!!busy||!c.aiSaved||!testInput.trim()||dirty} onClick={()=>run('test',async()=>{const result=await api('/api/preview','POST',{message:testInput,channel:testChannel});setTestReply(result.reply);await reload(true);})}><Sparkles size={16}/>{busy==='test'?'Thinking…':'Generate live reply'}</button>{!c.aiSaved&&<button className="text-button" onClick={()=>navigate('connections')}>Add the free API key</button>}{testReply&&<div className="test-result" aria-live="polite"><span><Sparkles size={14}/>LIVE RESPONSE</span><p>{testReply}</p><button className="text-button" onClick={()=>{change('examples',[...s.examples,{incoming:testInput,reply:testReply}].slice(-50));toast.success('Added as a voice example. Save your profile to keep it.');}}>Keep as a voice example</button></div>}<p className="body-note small-body">Your test message and saved voice profile are sent to your selected provider.</p></Card><div className="boundary-card"><ShieldCheck size={22}/><h3>Uncensored & Intimate</h3><p>Private DMs support adult sex chat, dirty talk, and seductive roleplay. Public comments stay light. Age concerns and sensitive safety situations remain protected.</p></div></div></div>}
  {view==='automation'&&<div className="settings-grid"><Card title="Smart Model Routing & Sexy Text Triggers" description="Automatically route erotic, spicy, or flirty messages to uncensored models while standard chats use everyday models." icon={Sparkles}><Toggle label="Enable smart text routing" description="Scan incoming DMs and comments for erotic, adult, flirty, or custom trigger words. If detected, automatically switches to your designated uncensored model." value={!!s.smartRoutingEnabled} onChange={v=>change('smartRoutingEnabled',v)}/><div className="automation-note"><ShieldCheck size={18}/><p>When enabled, messages with romantic, flirty, or adult keywords route directly to your uncensored connection without content filtering.</p></div>{s.smartRoutingEnabled&&<>
<div style={{marginTop:'12px',marginBottom:'12px',display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:'12px'}}>
<Choice label="Adult / Sexy & Flirty Model Route" value={s.spicyProviderId||''} options={[{value:'',label:'Auto-detect AI Horde (Uncensored)'},...(c.providers||[]).map(p=>({value:p.id,label:`${p.label} (${p.provider} · ${p.model||'default'})`}))]} onChange={v=>change('spicyProviderId',v)}/>
<Choice label="Normal / Everyday Chat Model Route" value={s.normalProviderId||''} options={[{value:'',label:'Default Active Provider (Primary)'},...(c.providers||[]).map(p=>({value:p.id,label:`${p.label} (${p.provider} · ${p.model||'default'})`}))]} onChange={v=>change('normalProviderId',v)}/>
</div>
<label className="field" style={{marginTop:'10px'}}>
<span style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'6px'}}>
<span style={{fontWeight:600}}>Custom Sexy & Adult Trigger Words</span>
<small style={{fontWeight:400,color:'#88849b'}}>Comma-separated keywords</small>
</span><textarea rows={3} placeholder="e.g. sexy, hot, jaan, darling, bed, baby, cuddle, kiss, romance, intimate, nanga..." value={s.customSpicyWords||''} maxLength={2000} onChange={e=>change('customSpicyWords',e.target.value)}/><small>Nina includes a built-in English and Hinglish dictionary for erotic, sexy, flirty, and dirty-talk terms. Add any custom words or phrases here.</small></label><div style={{marginTop:'14px',padding:'12px 14px',background:'#faf8fe',border:'1px solid #ebdff8',borderRadius:'10px'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'8px'}}><b style={{fontSize:'12px',color:'#2c204d',display:'flex',alignItems:'center',gap:'6px'}}><Sparkles size={14} style={{color:'#7354da'}}/> Live Intent Analyzer Sandbox</b><span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'12px',fontWeight:600,background:liveAnalysis.intent==='sexy'?'#ffe5ec':liveAnalysis.intent==='flirty'?'#fff0d9':'#eaf8f0',color:liveAnalysis.intent==='sexy'?'#c41d7f':liveAnalysis.intent==='flirty'?'#d46b08':'#237804'}}>{liveAnalysis.categoryLabel}</span></div><input style={{width:'100%',padding:'7px 10px',borderRadius:'6px',border:'1px solid #dcd3eb',fontSize:'13px',marginBottom:'8px'}} placeholder="Test any incoming message here..." value={analyzerInput} onChange={e=>setAnalyzerInput(e.target.value)}/><div style={{display:'flex',flexDirection:'column',gap:'4px',fontSize:'11px',color:'#574f7d'}}><div><strong>Detected Triggers: </strong>{liveAnalysis.matchedWords.length>0?<span style={{color:'#9013fe',fontWeight:600}}>{liveAnalysis.matchedWords.map((w:string)=>`"${w}"`).join(', ')}</span>:<span style={{color:'#8c8c8c'}}>None (standard chat)</span>}</div><div><strong>Routed Model: </strong><span style={{fontWeight:600,color:liveAnalysis.intent!=='normal'?'#c41d7f':'#1d39c4'}}>{liveAnalysis.intent!=='normal'?((c.providers||[]).find(p=>p.id===s.spicyProviderId)?.label||'Auto: AI Horde Uncensored'):((c.providers||[]).find(p=>p.id===s.normalProviderId)?.label||(c.providers||[]).find(p=>p.id===c.primaryProviderId)?.label||'Primary Active Provider')}</span><span style={{marginLeft:'6px',color:'#888'}}>({liveAnalysis.intent!=='normal'?'Intimate uncensored mode':'Standard conversation'})</span></div></div></div></>}</Card><Card title="Reels & Posts Catalog (Dynamic Instagram Mapping)" description="Comments are automatically mapped to your Instagram reels and captions in real-time." icon={Instagram}><div className="catalog-sync-header"><div style={{flex:1,minWidth:0}}><p className="body-note" style={{margin:'0 0 6px 0'}}><strong>Dynamic Instagram Feature Active:</strong> When someone comments on any published reel or post, Nina automatically fetches the real Instagram caption, reel type, and details via the Instagram Graph API. You can also sync all published reels directly below.</p></div><button type="button" className="button sync-catalog-btn" disabled={!saved||!!busy} onClick={()=>run('sync-reels',async()=>{const r=await api('/api/workspace','POST',{action:'sync-reels',accountId:accountFilter==='all'?undefined:accountFilter});await reload(true);toast.success(r.message||'Reels synced from Instagram');})}><RefreshCw size={13}/>Sync Reels from Instagram</button></div>{(s.postCatalog||[]).length===0?(<div style={{padding:'16px',background:'#faf8fe',border:'1px dashed #dcd3eb',borderRadius:'8px',textAlign:'center',color:'#7d7690',fontSize:'13px'}}>No reels or posts registered yet. Add one below so Nina can talk accurately about your reels!</div>):(<div className="catalog-cards-list">{(s.postCatalog||[]).map((entry,idx)=>{
  const ageDays = entry.dateAdded ? Math.round((Date.now() - entry.dateAdded) / 86400000) : 0;
  const isExpired = (s.commentMaxAgeDays ?? 7) > 0 && ageDays > (s.commentMaxAgeDays ?? 7);
  return (
    <div key={entry.id||idx} className="catalog-post-card">
      <div className="catalog-post-body">
        <div className="catalog-post-meta">
          <span className="pill active-pill" style={{fontSize:'10px',padding:'2px 7px',textTransform:'uppercase',fontWeight:700}}>
            {entry.contentType==='reel'?'🎬 Reel':entry.contentType==='story'?'⏳ Story':'📸 Post'}
          </span>
          <b style={{fontSize:'13px',color:'#2c1d4d'}}>{entry.title||entry.id}</b>
          <code style={{fontSize:'11px',background:'#eee9f8',padding:'1px 5px',borderRadius:'4px',color:'#6b52a3'}}>ID: {entry.id}</code>
          {entry.dateAdded && (
            <span style={{fontSize:'10px',padding:'2px 7px',borderRadius:'6px',background:isExpired?'#fff1f0':'#f0f5ff',color:isExpired?'#cf1322':'#1d39c4',fontWeight:600}}>
              {isExpired ? `⏳ ${ageDays}d old (7d Cutoff - Replies Paused)` : `✨ ${ageDays}d old (Active)`}
            </span>
          )}
        </div>
        <p className="catalog-post-desc"><strong>Content Analysis: </strong>{entry.description}</p>
        {entry.caption && <p className="catalog-post-caption">Caption: "{entry.caption}"</p>}
        <div className="catalog-snap-box">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}>
            <label style={{fontSize:'12px',fontWeight:600,color:'#2c1d4d',display:'flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
              <input type="checkbox" checked={entry.commentsEnabled!==false} onChange={e=>{
                const updated=[...(s.postCatalog||[])];
                updated[idx]={...updated[idx],commentsEnabled:e.target.checked};
                change('postCatalog',updated);
              }} style={{cursor:'pointer',accentColor:'#7354da'}}/>
              <span>Auto-reply to comments on this specific reel</span>
            </label>
            <span style={{fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'8px',background:entry.commentsEnabled!==false?'#e6f7ed':'#fff1f0',color:entry.commentsEnabled!==false?'#137333':'#cf1322'}}>
              {entry.commentsEnabled!==false?'Comments ON':'Comments OFF'}
            </span>
          </div>
          <div className="catalog-snap-grid">
            <label style={{fontSize:'11.5px',display:'flex',flexDirection:'column',gap:'4px',color:'#574f7d'}}>
              <span style={{fontWeight:600,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>Dedicated View-Once Snap (from Google Drive):</span>
                {entry.snapUrl&&<a href={entry.snapUrl} target="_blank" rel="noreferrer" style={{color:'#7354da',fontSize:'10.5px',textDecoration:'underline'}}>Preview</a>}
              </span>
              <div className="inline-snap-row">
                <input value={entry.snapUrl||''} placeholder="/api/media?driveId=... or Drive link" onChange={e=>{
                  const updated=[...(s.postCatalog||[])];
                  updated[idx]={...updated[idx],snapUrl:normalizeSnapUrl(e.target.value)};
                  change('postCatalog',updated);
                }}/>
                <button type="button" className="button subtle btn-compact" onClick={()=>openDrivePicker((url,name)=>{
                  const updated=[...(s.postCatalog||[])];
                  updated[idx]={...updated[idx],snapUrl:url,snapLabel:updated[idx].snapLabel||name.replace(/\.[^/.]+$/, "")};
                  change('postCatalog',updated);
                })}><Sparkles size={13} style={{color:'#7354da'}}/>Drive</button>
                <label className="button subtle btn-compact">
                  <Upload size={13}/>Upload
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={async(e)=>{
                    const file = e.target.files?.[0];
                    if(!file) return;
                    try {
                      const url = await handlePhotoUpload(file);
                      const updated=[...(s.postCatalog||[])];
                      updated[idx]={...updated[idx],snapUrl:url,snapLabel:updated[idx].snapLabel||file.name.replace(/\.[^/.]+$/, "")};
                      change('postCatalog',updated);
                    } catch {}
                  }}/>
                </label>
                {entry.snapUrl && (
                  <button type="button" className="button subtle btn-compact" style={{color:'#7c3aed',borderColor:'#d8b4fe',background:'#f5f3ff'}} title="Open live view for this reel's snap" onClick={async()=>{
                    try{
                      const res=await api('/api/snap','POST',{imageUrl:entry.snapUrl,username:'reel_viewer',durationSeconds:s.followGateDurationSeconds||7});
                      if(res?.snapUrl){
                        window.open(res.snapUrl,'_blank');
                        toast.success(`Opening snap for ${entry.title||entry.id}`);
                      }
                    }catch(e:any){toast.error(e.message);}
                  }}>
                    <Eye size={12}/>View
                  </button>
                )}
              </div>
            </label>
            <label style={{fontSize:'11.5px',display:'flex',flexDirection:'column',gap:'4px',color:'#574f7d'}}>
              <span style={{fontWeight:600}}>Snap Outfit / Label:</span>
              <input style={{height:'34px',minHeight:'34px',padding:'0 10px',borderRadius:'8px',border:'1px solid #dcd3eb',fontSize:'12px',background:'#fff',boxSizing:'border-box'}} value={entry.snapLabel||''} placeholder="e.g. Backstage Red Dress Shoot" onChange={e=>{
                const updated=[...(s.postCatalog||[])];
                updated[idx]={...updated[idx],snapLabel:e.target.value};
                change('postCatalog',updated);
              }}/>
            </label>
          </div>
        </div>
      </div>
      <button type="button" className="icon-button" style={{marginTop:'4px',flexShrink:0}} aria-label="Remove post catalog entry" title="Delete entry" onClick={()=>{const updated=(s.postCatalog||[]).filter((_,i)=>i!==idx);change('postCatalog',updated);}}><Trash2 size={16}/></button>
    </div>
  );
})}</div>)}
<div style={{background:'#faf8fe',border:'1px solid #ebdff8',borderRadius:'12px',padding:'16px',marginTop:'18px'}}>
  <b style={{fontSize:'14px',color:'#2c1d4d',display:'block',marginBottom:'12px'}}>Add New Reel or Post to Catalog</b>
  <div className="form-grid">
    <label className="field">
      <span>Media ID or Identifier</span>
      <input placeholder="e.g. 179847291837 or reel_red_dress" value={newPostEntry.id} onChange={e=>setNewPostEntry({...newPostEntry,id:e.target.value})}/>
      <small>Instagram Media ID from webhook or your custom post slug/tag.</small>
    </label>
    <Choice label="Content Type" value={newPostEntry.contentType} options={[{value:'reel',label:'🎬 Reel'},{value:'post',label:'📸 Feed Post / Photoshoot'},{value:'story',label:'⏳ Story'}]} onChange={v=>setNewPostEntry({...newPostEntry,contentType:v as any})}/>
  </div>
  <label className="field" style={{marginTop:'10px'}}>
    <span>Title / Short Name</span>
    <input placeholder="e.g. Red Dress at Marine Drive Sunset" value={newPostEntry.title} onChange={e=>setNewPostEntry({...newPostEntry,title:e.target.value})}/>
  </label>
  <label className="field" style={{marginTop:'10px'}}>
    <span>Detailed Content Analysis & Visual Description</span>
    <textarea rows={3} placeholder="Describe the scene in detail: What Nina is wearing, location, actions, mood (e.g. 'Nina walking on Marine Drive sunset wearing crimson backless gown, laughing with wind in hair. Friends photoshoot')." value={newPostEntry.description} onChange={e=>setNewPostEntry({...newPostEntry,description:e.target.value})}/>
    <small>Nina uses this exact context when replying to comments on this post!</small>
  </label>
  <label className="field" style={{marginTop:'10px'}}>
    <span>Caption / Keywords (optional)</span>
    <input placeholder="e.g. Sunset magic in Mumbai 🌅 #reels #photoshoot" value={newPostEntry.caption} onChange={e=>setNewPostEntry({...newPostEntry,caption:e.target.value})}/>
  </label>
  <div className="form-grid" style={{marginTop:'10px'}}>
    <label className="field">
      <span>Dedicated View-Once Snap Photo (from Google Drive)</span>
      <div className="inline-snap-row">
        <input placeholder="/api/media?driveId=... or Drive link" value={newPostEntry.snapUrl||''} onChange={e=>setNewPostEntry({...newPostEntry,snapUrl:normalizeSnapUrl(e.target.value)})}/>
        <button type="button" className="button subtle btn-compact" onClick={()=>openDrivePicker((url,name)=>{setNewPostEntry({...newPostEntry,snapUrl:url,snapLabel:newPostEntry.snapLabel||name.replace(/\.[^/.]+$/, "")});})}><Sparkles size={13} style={{color:'#7354da'}}/>Drive</button>
        <label className="button subtle btn-compact">
          <Upload size={13}/>Upload
          <input type="file" accept="image/*" style={{display:'none'}} onChange={async(e)=>{const file=e.target.files?.[0];if(!file)return;try{const url=await handlePhotoUpload(file);setNewPostEntry({...newPostEntry,snapUrl:url,snapLabel:newPostEntry.snapLabel||file.name.replace(/\.[^/.]+$/, "")});}catch{}}}/>
        </label>
      </div>
      <small>Uploads directly to your Google Drive or links to an existing Drive photo.</small>
    </label>
    <label className="field">
      <span>Snap Outfit / Label</span>
      <input placeholder="e.g. Velvet Gown Shoot" value={newPostEntry.snapLabel||''} onChange={e=>setNewPostEntry({...newPostEntry,snapLabel:e.target.value})}/>
    </label>
  </div>
  <button type="button" className="button primary" style={{marginTop:'12px'}} disabled={!newPostEntry.id.trim()||!newPostEntry.description.trim()} onClick={()=>{const updated=[...(s.postCatalog||[]),{...newPostEntry,commentsEnabled:true,dateAdded:Date.now()}];change('postCatalog',updated);setNewPostEntry({id:'',title:'',description:'',caption:'',contentType:'reel',commentsEnabled:true,snapUrl:'',snapLabel:''});toast.success('Reel added to catalog. Click "Save changes" to apply.');}}>
    <Plus size={14}/>Add Reel/Post to Catalog
  </button>
</div>
</Card>
<Card title="Reply controls" description="You can pause everything in one click." icon={SlidersHorizontal}><Toggle label="Enable reply workflow" description="Start drafting or replying after all connections pass." value={s.enabled} onChange={v=>change('enabled',v)} disabled={!saved}/><Toggle label="Direct messages" description="Reply within the permitted 24-hour window." value={s.dm} onChange={v=>change('dm',v)}/><Toggle label="Public comments" description="Short, light replies on your posts." value={s.comments} onChange={v=>change('comments',v)}/><Toggle label="Approve before sending" description="On: Generated drafts wait in your queue. Off: eligible replies publish automatically." value={s.approval} onChange={v=>change('approval',v)}/><div className="automation-note"><ShieldCheck size={18}/><p>With approval off, eligible replies are sent automatically. Taking over pauses replies for that conversation.</p></div>{!c.receiverSeen&&<div className="setup-needed"><Clock size={17}/><span>Live automation requires the public webhook receiver.</span><button onClick={()=>navigate('connections')}>Set up</button></div>}</Card><Card title="Account-Specific Channel & AI Controls" description="Configure separate DMs, Comments, and AI settings for each connected Instagram account." icon={Instagram}>{(c.accounts||[]).length===0?<p className="body-note">No Instagram accounts connected yet. Add one in Connections.</p>:(c.accounts||[]).map(a=>{const p=(c.providers||[]).find(pr=>pr.id===(a.providerId||c.primaryProviderId));return <div key={a.id} style={{padding:'14px',marginBottom:'12px',borderRadius:'10px',border:'1px solid #e9e4f0',background:'#faf9fd'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'6px',marginBottom:'8px'}}><div><b style={{fontSize:'14px'}}>{a.username?'@'+a.username:'Account ID: '+a.id}</b><span style={{marginLeft:'8px',fontSize:'11px',padding:'2px 7px',borderRadius:'10px',background:a.verified?'#e6f7ed':'#fff7e6',color:a.verified?'#137333':'#b06000',fontWeight:600}}>{a.verified?'Verified':'Token Saved'}</span></div><div style={{display:'flex',gap:'6px',fontSize:'11px'}}><span style={{background:'#eeeaf7',padding:'2px 7px',borderRadius:'6px',fontWeight:500}}>Model: {p?.label||'Primary'}</span><span style={{background:'#eeeaf7',padding:'2px 7px',borderRadius:'6px',fontWeight:500}}>Tone: {a.tone||s.tone}</span></div></div><div className="setting-toggle" style={{margin:'6px 0'}}><div><b>Direct Messages (DMs)</b><p>Enable/disable automatic DM replies for @{a.username||a.id}.</p></div><Switch checked={a.dmEnabled!==false} disabled={!saved||!!busy||!a.enabled} onCheckedChange={dmEnabled=>run('account-dm',async()=>{await api('/api/managed-connections','POST',{kind:'instagram',action:'update',id:a.id,dmEnabled});await reload(true);},'DMs updated for @'+(a.username||a.id))} aria-label={'DMs for '+(a.username||a.id)}/></div><div className="setting-toggle" style={{margin:'6px 0'}}><div><b>Public Comments</b><p>Enable/disable automatic public comment replies for @{a.username||a.id}.</p></div><Switch checked={a.commentsEnabled!==false} disabled={!saved||!!busy||!a.enabled} onCheckedChange={commentsEnabled=>run('account-comments',async()=>{await api('/api/managed-connections','POST',{kind:'instagram',action:'update',id:a.id,commentsEnabled});await reload(true);},'Comments updated for @'+(a.username||a.id))} aria-label={'Comments for '+(a.username||a.id)}/></div><div className="setting-toggle" style={{margin:'6px 0'}}><div><b>AI Reply Generation</b><p>Allow AI model to generate answers for this account.</p></div><Switch checked={a.aiEnabled!==false} disabled={!saved||!!busy||!a.enabled} onCheckedChange={aiEnabled=>run('account-ai',async()=>{await api('/api/managed-connections','POST',{kind:'instagram',action:'update',id:a.id,aiEnabled});await reload(true);},'AI generation updated for @'+(a.username||a.id))} aria-label={'AI generation for '+(a.username||a.id)}/></div><div style={{display:'flex',justifyContent:'flex-end',marginTop:'8px'}}><button className="button" onClick={()=>navigate('connections')} style={{fontSize:'12px',padding:'4px 10px'}}><SlidersHorizontal size={13}/>Edit AI & Personality in Connections</button></div></div>;})}</Card><Card title="Reel Follower-Gate & Anti-Screenshot View-Once Snaps" description="Reward users who follow, comment, and share your Reels with exclusive self-destructing snaps." icon={Sparkles}><Toggle label="Enable Reel Follow-Gate Automation" description="Automatically checks if the commenter/DM sender is following you. Non-followers get follow reminders; followers unlock an exclusive self-destructing View-Once snap." value={!!s.followGateEnabled} onChange={v=>change('followGateEnabled',v)} disabled={!saved}/>{s.followGateEnabled&&<div style={{marginTop:'14px',display:'flex',flexDirection:'column',gap:'12px'}}><div style={{background:'#faf8fe',border:'1px solid #ebdff8',borderRadius:'10px',padding:'12px 14px'}}><div style={{display:'flex',alignItems:'center',gap:'6px',color:'#7354da',fontWeight:700,fontSize:'13px',marginBottom:'6px'}}><ShieldCheck size={16}/><span>Anti-Screenshot & One-Time Burn Protection</span></div><p style={{margin:0,fontSize:'12px',color:'#554f72',lineHeight:'1.5'}}>Followers receive a unique single-use link (<code>/snap/[token]</code>). They must <strong>press and hold</strong> their screen to view. If they release their finger, switch apps, or screenshot, the photo blacks out immediately and self-destructs. Their Instagram @username is dynamically watermarked across the canvas.</p></div><div className="form-grid"><label className="field"><span>Trigger Keyword (optional)</span><input placeholder="e.g. MINE, SEND, PIC (leave blank for any reel interaction)" value={s.followGateKeyword||''} onChange={e=>change('followGateKeyword',e.target.value)}/><small>If specified, only comments/DMs with this keyword trigger the snap delivery.</small></label><Choice label="Burn Countdown Timer" value={String(s.followGateDurationSeconds||7)} options={[{value:'5',label:'5 seconds (Quick snap)'},{value:'7',label:'7 seconds (Recommended)'},{value:'10',label:'10 seconds (Standard)'},{value:'15',label:'15 seconds (Longer)'}]} onChange={v=>change('followGateDurationSeconds',Number(v))}/></div><label className="field"><span>Non-Follower Reminder DM Template</span><textarea rows={2} value={s.followGateUnfollowedMsg||''} onChange={e=>change('followGateUnfollowedMsg',e.target.value)} placeholder="Hey! You need to follow @{username} first to unlock this exclusive photoshoot snap 🥺 Follow now and reply 'DONE' to claim it 🤍"/><small>Use <code>{'{username}'}</code> for your account handle. Sent repeatedly until they follow.</small></label><label className="field"><span>Follower Unlocked Snap DM Template</span><textarea rows={2} value={s.followGateSuccessMsg||''} onChange={e=>change('followGateSuccessMsg',e.target.value)} placeholder="Yay! Here is your exclusive photoshoot snap (opens only once 😉):"/><small>The unique single-use snap link and anti-screenshot instructions are attached right below this message.</small></label><div style={{background:'#fff',border:'1px solid #e9e4f0',borderRadius:'10px',padding:'14px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}><b style={{fontSize:'13px',color:'#2c1d4d'}}>Exclusive Photoshoot Snaps Library ({(s.followGatePhotos||[]).length})</b><span style={{fontSize:'11px',color:'#766e8a'}}>One randomly selected per unlocked user</span></div>{(s.followGatePhotos||[]).map((photo,pIdx)=><div key={photo.id||pIdx} className="snap-library-item"><span className="snap-index-badge">#{pIdx+1}</span><input className="snap-input" value={photo.url} placeholder="/api/media?driveId=... or Drive link" onChange={e=>{const updated=[...(s.followGatePhotos||[])];updated[pIdx]={...updated[pIdx],url:normalizeSnapUrl(e.target.value)};change('followGatePhotos',updated);}}/><button type="button" className="button subtle btn-compact" onClick={()=>openDrivePicker((url,name)=>{const updated=[...(s.followGatePhotos||[])];updated[pIdx]={...updated[pIdx],url,label:updated[pIdx].label||name.replace(/\.[^/.]+$/, "")};change('followGatePhotos',updated);})}><Sparkles size={12} style={{color:'#7354da'}}/>Drive</button><label className="button subtle btn-compact"><Upload size={12}/>Upload<input type="file" accept="image/*" style={{display:'none'}} onChange={async(e)=>{const file = e.target.files?.[0];if(!file) return;try{const url=await handlePhotoUpload(file);const updated=[...(s.followGatePhotos||[])];updated[pIdx]={...updated[pIdx],url,label:updated[pIdx].label||file.name.replace(/\.[^/.]+$/, "")};change('followGatePhotos',updated);}catch{}}}/></label><button type="button" className="button subtle btn-compact" style={{color:'#7c3aed',borderColor:'#d8b4fe',background:'#f5f3ff'}} title="Open live view for this snap" onClick={async()=>{try{if(!photo.url){toast.error('Add a photo first');return;}const res=await api('/api/snap','POST',{imageUrl:photo.url,username:'viewer_'+(pIdx+1),durationSeconds:s.followGateDurationSeconds||7});if(res?.snapUrl){window.open(res.snapUrl,'_blank');toast.success(`Opening Snap #${pIdx+1}`);}}catch(e:any){toast.error(e.message);}}}><Eye size={12}/>View</button><button type="button" className="button subtle btn-compact" title="Copy single-use snap link" onClick={async()=>{try{if(!photo.url){toast.error('Add a photo first');return;}const res=await api('/api/snap','POST',{imageUrl:photo.url,username:'viewer_'+(pIdx+1),durationSeconds:s.followGateDurationSeconds||7});if(res?.snapUrl){await navigator.clipboard.writeText(res.snapUrl);toast.success(`Link for Snap #${pIdx+1} copied!`);}}catch(e:any){toast.error(e.message);}}}><Link2 size={12}/>Copy</button><input className="snap-input" value={photo.label} placeholder="Label / Outfit" onChange={e=>{const updated=[...(s.followGatePhotos||[])];updated[pIdx]={...updated[pIdx],label:e.target.value};change('followGatePhotos',updated);}}/><button type="button" className="icon-button btn-compact-icon" onClick={()=>{const updated=(s.followGatePhotos||[]).filter((_,i)=>i!==pIdx);change('followGatePhotos',updated);}} title="Remove snap"><Trash2 size={14}/></button></div>)}<div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'8px'}}><button type="button" className="button" style={{fontSize:'12px',padding:'5px 10px'}} onClick={()=>{const updated=[...(s.followGatePhotos||[]),{id:String(Date.now()),url:'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=80',label:'New Photoshoot Snap'}];change('followGatePhotos',updated);}}><Plus size={13}/>Add Exclusive Photo</button><button type="button" className="button primary" style={{fontSize:'12px',padding:'5px 12px'}} onClick={async()=>{try{const firstPhoto=(s.followGatePhotos||[])[0]?.url||'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1000&q=80';const res=await api('/api/snap','POST',{imageUrl:firstPhoto,username:'preview_tester',durationSeconds:s.followGateDurationSeconds||7});if(res?.snapUrl){window.open(res.snapUrl,'_blank');toast.success('Live test snap generated and opened in new tab!');}}catch(e:any){toast.error(e.message);}}}><Sparkles size={13}/>Test Live View-Once Snap</button></div></div></div>}</Card><Card title="Reply timing" description="Collect messages, then take regular breaks." icon={Clock}><Toggle label="Take regular breaks" description={s.cycleEnabled?`${s.cycleActiveMinutes??15}m active, ${s.cycleBreakMinutes??60}m resting (repeats every ${(s.cycleActiveMinutes??15)+(s.cycleBreakMinutes??60)}m). Incoming messages wait safely during breaks.`:'Pause automated replies periodically to simulate natural human texting habits.'} value={!!s.cycleEnabled} onChange={v=>change('cycleEnabled',v)}/>{s.cycleEnabled&&<div style={{marginTop:'16px',marginBottom:'16px',padding:'16px',background:'#faf9fc',border:'1px solid #e9e4f0',borderRadius:'10px'}}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))',gap:'14px',marginBottom:'12px'}}><label className="field" style={{margin:0}}><span style={{fontSize:'13px',fontWeight:600}}>Active window (minutes)</span><input type="number" min={1} max={1440} value={s.cycleActiveMinutes??15} onChange={e=>change('cycleActiveMinutes',Math.max(1,Math.min(1440,parseInt(e.target.value,10)||1)))}/><small>Replies sent automatically</small></label><label className="field" style={{margin:0}}><span style={{fontSize:'13px',fontWeight:600}}>Break duration (minutes)</span><input type="number" min={1} max={1440} value={s.cycleBreakMinutes??60} onChange={e=>change('cycleBreakMinutes',Math.max(1,Math.min(1440,parseInt(e.target.value,10)||1)))}/><small>Replies queued / waiting</small></label></div><div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}><span style={{fontSize:'11px',color:'#88849b',fontWeight:600,marginRight:'4px'}}>Quick presets:</span>{[{label:'15m on / 60m off',active:15,break:60},{label:'30m on / 30m off',active:30,break:30},{label:'20m on / 40m off',active:20,break:40},{label:'45m on / 15m off',active:45,break:15}].map(p=>{const isSelected=(s.cycleActiveMinutes??15)===p.active&&(s.cycleBreakMinutes??60)===p.break;return <button key={p.label} type="button" style={{fontSize:'11px',padding:'5px 9px',borderRadius:'6px',border:isSelected?'1px solid #7354da':'1px solid #e2dcec',background:isSelected?'#f1eefb':'#fff',color:isSelected?'#55409b':'#6f6c82',fontWeight:isSelected?600:400,cursor:'pointer'}} onClick={()=>{change('cycleActiveMinutes',p.active);change('cycleBreakMinutes',p.break);}}>{p.label}</button>;})}</div><div style={{marginTop:'14px',paddingTop:'12px',borderTop:'1px dashed #dcd3eb',display:'flex',flexDirection:'column',gap:'8px'}}><b style={{fontSize:'12px',color:'#2c204d'}}>Channel Sleep Adjustments (Comments vs DMs)</b><Toggle label="Keep Comments Active 24/7 (Never Sleep)" description={!s.commentSleepEnabled?'Comments will continue replying immediately 24/7 even during break periods (Active Comments).':'Comments will pause and sleep during scheduled breaks alongside DMs.'} value={!s.commentSleepEnabled} onChange={v=>change('commentSleepEnabled',!v)}/><Toggle label="Let DMs take scheduled breaks" description={s.dmSleepEnabled!==false?'DMs pause and rest during break periods to mimic human behavior.':'DMs will ignore breaks and reply continuously 24/7.'} value={s.dmSleepEnabled!==false} onChange={v=>change('dmSleepEnabled',v)}/></div></div>}<div className="range-field" style={{background:'#faf8fe',border:'1px solid #ebdff8',borderRadius:'10px',padding:'14px',margin:'14px 0'}}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px'}}>
<label style={{fontWeight:600,color:'#2c204d',display:'flex',alignItems:'center',gap:'6px'}}><Clock size={15}/>Max Reel Upload Age for Comment Replies</label>
<span style={{fontSize:'13px',fontWeight:700,color:'#7354da',background:'#f1ebfc',padding:'2px 9px',borderRadius:'12px'}}>{(s.commentMaxAgeDays??7)===0?'All Reels (No Cutoff)':`${s.commentMaxAgeDays??7} days max`}</span>
</div>
<Slider value={[s.commentMaxAgeDays??7]} min={0} max={60} step={1} onValueChange={v=>change('commentMaxAgeDays',v[0])} aria-label="Reel age cutoff in days"/>
<div className="range-labels" style={{marginTop:'4px'}}><span>0 days (Reply to all reels)</span><span>60 days</span></div>
<div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'10px',alignItems:'center'}}>
<span style={{fontSize:'11px',color:'#88849b',fontWeight:600,marginRight:'2px'}}>Presets:</span>
{[{label:'3 days (Fresh only)',val:3},{label:'7 days (Recommended)',val:7},{label:'14 days (2 weeks)',val:14},{label:'30 days (1 month)',val:30},{label:'All Reels (No limit)',val:0}].map(p=><button key={p.val} type="button" style={{fontSize:'11px',padding:'4px 8px',borderRadius:'6px',border:(s.commentMaxAgeDays??7)===p.val?'1px solid #7354da':'1px solid #e2dcec',background:(s.commentMaxAgeDays??7)===p.val?'#7354da':'#fff',color:(s.commentMaxAgeDays??7)===p.val?'#fff':'#55409b',fontWeight:(s.commentMaxAgeDays??7)===p.val?600:500,cursor:'pointer'}} onClick={()=>change('commentMaxAgeDays',p.val)}>{p.label}</button>)}
</div>
<small style={{display:'block',marginTop:'8px',color:'#7d7990',fontSize:'11px'}}>Once a Reel is older than this limit since being uploaded on Instagram, Nina will automatically stop replying to new comments on it.</small>
</div><div className="range-field" style={{background:'#faf8fe',border:'1px solid #ebdff8',borderRadius:'10px',padding:'14px',margin:'14px 0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px'}}><label style={{fontWeight:600,color:'#2c204d',display:'flex',alignItems:'center',gap:'6px'}}><Clock size={15}/>Public Comment Reply Delay</label><span style={{fontSize:'13px',fontWeight:700,color:'#7354da',background:'#f1ebfc',padding:'2px 9px',borderRadius:'12px'}}>{(s.commentReplyDelaySeconds??5)===0?'Instant (0s)':`${s.commentReplyDelaySeconds??5}s wait`}</span></div><Slider value={[s.commentReplyDelaySeconds??5]} min={0} max={120} step={5} onValueChange={v=>change('commentReplyDelaySeconds',v[0])} aria-label="Comment wait timing"/><div className="range-labels" style={{marginTop:'4px'}}><span>0s (Instant)</span><span>120s (2 min)</span></div><div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'10px',alignItems:'center'}}><span style={{fontSize:'11px',color:'#88849b',fontWeight:600,marginRight:'2px'}}>Presets:</span>{[{label:'Instant (0s)',val:0},{label:'5s (Recommended)',val:5},{label:'15s (Spaced)',val:15},{label:'30s (Slow)',val:30},{label:'60s (1 min)',val:60}].map(p=><button key={p.val} type="button" style={{fontSize:'11px',padding:'4px 8px',borderRadius:'6px',border:(s.commentReplyDelaySeconds??5)===p.val?'1px solid #7354da':'1px solid #e2dcec',background:(s.commentReplyDelaySeconds??5)===p.val?'#7354da':'#fff',color:(s.commentReplyDelaySeconds??5)===p.val?'#fff':'#55409b',fontWeight:(s.commentReplyDelaySeconds??5)===p.val?600:500,cursor:'pointer'}} onClick={()=>change('commentReplyDelaySeconds',p.val)}>{p.label}</button>)}</div><small style={{display:'block',marginTop:'8px',color:'#7d7990',fontSize:'11px'}}>Wait delay before replying to public comments on Reels and Posts.</small></div><div className="range-field" style={{background:'#faf8fe',border:'1px solid #ebdff8',borderRadius:'10px',padding:'14px',margin:'14px 0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px'}}><label style={{fontWeight:600,color:'#2c204d',display:'flex',alignItems:'center',gap:'6px'}}><Clock size={15}/>DM Consecutive Message Wait Window</label><span style={{fontSize:'13px',fontWeight:700,color:'#7354da',background:'#f1ebfc',padding:'2px 9px',borderRadius:'12px'}}>{((s.dmReplyDelaySeconds??s.replyDelaySeconds??30)===0)?'Instant (0s)':`${s.dmReplyDelaySeconds??s.replyDelaySeconds??30}s wait`}</span></div><Slider value={[s.dmReplyDelaySeconds??s.replyDelaySeconds??30]} min={0} max={300} step={5} onValueChange={v=>{change('dmReplyDelaySeconds',v[0]);change('replyDelaySeconds',v[0]);}} aria-label="DM batch wait window"/><div className="range-labels" style={{marginTop:'4px'}}><span>0s (Instant reply)</span><span>300s (5 minutes)</span></div><div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'10px',alignItems:'center'}}><span style={{fontSize:'11px',color:'#88849b',fontWeight:600,marginRight:'2px'}}>Presets:</span>{[{label:'Instant (0s)',val:0},{label:'15s (Quick)',val:15},{label:'30s (Recommended)',val:30},{label:'60s (1 min)',val:60},{label:'120s (2 min)',val:120}].map(p=><button key={p.val} type="button" style={{fontSize:'11px',padding:'4px 8px',borderRadius:'6px',border:(s.dmReplyDelaySeconds??s.replyDelaySeconds??30)===p.val?'1px solid #7354da':'1px solid #e2dcec',background:(s.dmReplyDelaySeconds??s.replyDelaySeconds??30)===p.val?'#7354da':'#fff',color:(s.dmReplyDelaySeconds??s.replyDelaySeconds??30)===p.val?'#fff':'#55409b',fontWeight:(s.dmReplyDelaySeconds??s.replyDelaySeconds??30)===p.val?600:500,cursor:'pointer'}} onClick={()=>{change('dmReplyDelaySeconds',p.val);change('replyDelaySeconds',p.val);}}>{p.label}</button>)}</div><small style={{display:'block',marginTop:'8px',color:'#7d7990',fontSize:'11px'}}>When a user sends multiple DMs in a row, the bot waits until they finish typing before generating a single batch reply.</small></div><p className="body-note">{replyWindow.phase==='paused'?'Replies are paused.':replyWindow.phase==='break'?'Resting · replies resume after the break.':'Active · replies are enabled.'}{replyWindow.nextChangeAt?' Next change: '+formatDate(replyWindow.nextChangeAt):''}</p></Card><Card title="Auto-reply by user" description="Choose who receives automatic responses. New users are enabled by default." icon={MessageCircle}>{Array.from(new Map(threads.filter(t=>t.recipientId).map(t=>[(t.accountId||'legacy-instagram')+':'+t.recipientId!,t])).values()).map(t=><Toggle key={(t.accountId||'legacy-instagram')+':'+t.recipientId} label={'@'+t.username+((c.accounts||[]).length>1?' · '+((c.accounts||[]).find(a=>a.id===(t.accountId||'legacy-instagram'))?.username||'account'):'')} description="Off keeps incoming messages in your inbox without sending automatic replies." value={!(s.excludedUsers??[]).includes(t.recipientId!)&&!(s.excludedUsers??[]).includes((t.accountId||'legacy-instagram')+':'+t.recipientId)} onChange={enabled=>change('excludedUsers',enabled?(s.excludedUsers??[]).filter(id=>id!==t.recipientId&&id!==(t.accountId||'legacy-instagram')+':'+t.recipientId):[...new Set([...(s.excludedUsers??[]),(t.accountId||'legacy-instagram')+':'+t.recipientId])])}/>)}{!data.threads.some(t=>!t.demo&&t.recipientId)&&<p className="body-note">People appear here after their first message or comment.</p>}<p className="micro-note">Use Save changes to apply your choices. Manual replies remain available.</p></Card><Card title="Usage & conversation memory" description="Keep the free plan under your control." icon={Clock}><Toggle label="No app daily cap" description="Nina will not impose a daily generation limit. Your provider’s account limits still apply." value={s.dailyLimit===0} onChange={v=>change('dailyLimit',v?0:100)}/>{s.dailyLimit>0&&<label className="field"><span>Daily generation call cap</span><input type="number" min={1} max={1000} value={s.dailyLimit} onChange={e=>change('dailyLimit',Number(e.target.value))}/><small>Includes voice tests and drafts. Your provider may apply lower token or rate limits.</small></label>}<Toggle label="Use conversation history" description="Use the current conversation for context and avoid copying earlier replies." value={s.memory} onChange={v=>change('memory',v)}/><Toggle label="Auto-delete old conversations" description="Automatically remove conversation history older than the retention period. Turn OFF to keep all messages indefinitely." value={s.autoDeleteEnabled!==false} onChange={v=>change('autoDeleteEnabled',v)}/>{s.autoDeleteEnabled!==false&&<Choice label="Keep live conversations for" value={String(s.retention)} options={[{value:'1',label:'24 hours'},{value:'7',label:'7 days'},{value:'30',label:'30 days'},{value:'90',label:'90 days'}]} onChange={v=>change('retention',Number(v))}/>}<p className="body-note small-body">{s.autoDeleteEnabled!==false?'Messages older than the chosen period are removed automatically during periodic maintenance.':'Auto-deletion is DISABLED. All user conversation history and messages are preserved permanently until manually cleaned.'}</p><div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'8px'}}><button className="button" disabled={!saved||!!busy} onClick={()=>run('cleanup',async()=>{const r=await api('/api/workspace','POST',{action:'cleanup'});await reload(true);toast.success(r.message||'History cleaned up');})}><Trash2 size={14}/>Clean up expired messages now</button><button className="button" disabled={!saved||!!busy} onClick={()=>run('process',async()=>{const r=await api('/api/process','POST',{});await reload(true);toast.success(r.processed+' queued interactions processed');})}><RefreshCw size={14}/>Process pending interactions</button></div></Card><Card title="Delivery status" description="Real queue and delivery outcomes." icon={Activity}><p className="body-note">Waiting: {data.queue?.pending??0} · Processing: {data.queue?.processing??0} · Failed: {data.queue?.failed??0}</p><p className="body-note small-body">{(data.queue?.uncertain??0)>0?`${data.queue?.uncertain} deliveries pending verification. Approving or sending a reply delivers immediately without extra confirmation.`:'All deliveries confirmed.'}</p><p className="body-note small-body">Meta app mode and permission approval are checked in Meta, separately from your reply settings. Only eligible text DMs and comments are handled.</p><button className="button" disabled={!saved||!!busy} onClick={()=>run('queue-refresh',()=>reload(true))}><RefreshCw size={14}/>Refresh status</button></Card><Card title="Pause now" description="Stop reply generation while you make changes." icon={Pause}><p className="body-note">Your inbox remains available. Incoming interactions can still be saved while automation is paused.</p><button className="button" disabled={!saved||!!busy||!data.settings.enabled} onClick={()=>run('pause',()=>saveSettings({...data.settings,enabled:false}),'Automation paused')}><Pause size={15}/>Pause automation</button></Card></div>}
 {view==='connections'&&<div className="connections-layout"><div className="settings-stack"><Card title="Google Drive Photos API Connection" description="Connect your Google Drive via OAuth API to import photoshoot photos into View-Once snaps." icon={Link2}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px',marginBottom:'12px'}}>
    <span className={'connection-badge '+(googleDriveStatus.connected?'connected':'')} style={{margin:0}}>
      {googleDriveStatus.connected?'✓ Google Drive Connected':'Waiting for Google Drive Connection'}
    </span>
    {googleDriveStatus.connected&&<span style={{fontSize:'12px',color:'#554f72',fontWeight:600}}>{googleDriveStatus.email}</span>}
  </div>
  <p className="body-note" style={{marginTop:0}}>
    Connect your Google account to directly browse and pick photos from your Google Drive into anti-screenshot self-destructing snaps for each Reel.
  </p>
  <div style={{background:'#faf8fe',border:'1px solid #ebdff8',borderRadius:'10px',padding:'12px 14px',marginBottom:'12px',overflowX:'hidden'}}>
    <b style={{fontSize:'12px',color:'#2c204d',display:'block',marginBottom:'6px'}}>Google OAuth Credentials & Setup</b>
    <div style={{display:'flex',flexDirection:'column',gap:'6px',fontSize:'12px',color:'#554f72'}}>
      <div><strong>Status: </strong><span style={{color:'#137333',fontWeight:600}}>Configured securely via Environment Variables (.env)</span></div>
      <div><strong>Required Redirect URI in Google Cloud Console:</strong></div>
      <div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginTop:'2px'}}>
        <code className="code-break" style={{background:'#eeeaf7',padding:'4px 8px',borderRadius:'6px',fontSize:'11.5px',color:'#4b3f66',maxWidth:'100%'}}>
          https://automation.ninakurainservices.in/api/integrations/google-drive/callback
        </code>
        <button type="button" className="button subtle btn-compact" style={{fontSize:'11px',height:'28px',minHeight:'28px',padding:'0 8px'}} onClick={()=>{navigator.clipboard.writeText('https://automation.ninakurainservices.in/api/integrations/google-drive/callback');toast.success('Redirect URI copied to clipboard!');}}>Copy</button>
      </div>
      <small style={{fontSize:'11px',color:'#88819e',marginTop:'2px'}}>
        Important: If Google displays <code>redirect_uri_mismatch</code>, add this exact URI under <strong>Authorized redirect URIs</strong> in your Google Cloud Console OAuth 2.0 Client.
      </small>
    </div>
  </div>
  <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
    {!googleDriveStatus.connected?(
      <button type="button" className="button primary" disabled={!!busy} onClick={async()=>{
        try{
          const res:any=await api('/api/google-drive/auth');
          if(res?.authUrl){
            window.location.href=res.authUrl;
          }else{
            toast.error(res?.error||'Failed to get authorization URL');
          }
        }catch(e:any){
          toast.error(e.message);
        }
      }}><Sparkles size={14}/>Connect Google Drive via OAuth</button>
    ):(
      <>
        <button type="button" className="button primary" onClick={()=>openDrivePicker(()=>{})}><Sparkles size={14}/>Browse Google Drive Photos</button>
        <button type="button" className="button" onClick={async()=>{
          if(!confirm('Disconnect Google Drive?'))return;
          await api('/api/google-drive','POST',{action:'disconnect'});
          await fetchDriveStatus();
          toast.success('Google Drive disconnected.');
        }}>Disconnect Google Drive</button>
      </>
    )}
  </div>
</Card>
<ManagedConnections connections={c} disabled={!saved||!!busy||dirty} onReload={()=>reload()}/><label className="field"><span>Instagram API version</span><input value={s.graphVersion} maxLength={6} onChange={e=>change('graphVersion',e.target.value)}/>{dirty&&savingButton}</label><Card title="Public webhook receiver" description="The bridge between Instagram and this private dashboard." icon={Link2}><span className={'connection-badge '+(c.receiverSeen?'connected':'')}>{stateIcon(c.receiverSeen)}{c.receiverSeen?'Signed event received':c.webhookVerifiedAt?'Callback verified · waiting for messages':'Waiting for webhook verification'}</span><p className="body-note">Meta needs a public HTTPS callback. This dashboard stays private, so it needs a separate public receiver. A dedicated receiver is prepared on ChatGPT hosting. Complete its public access setup, then verify the callback in Meta.</p><label className="field"><span>Meta callback URL</span><input readOnly value={typeof window !== 'undefined' ? window.location.origin + '/api/webhook' : 'https://automation.ninakurainservices.in/api/webhook'} onFocus={e=>e.target.select()}/><small>Paste this address into your Meta app as your Instagram Webhook Callback URL.</small></label>{c.webhookVerifiedAt&&<p className="micro-note">Callback verified: {formatDate(c.webhookVerifiedAt)}</p>}<label className="field"><span>Instagram app secret</span><input type="password" autoComplete="off" placeholder={c.instagramAppSecretSaved?'Saved securely · replacement only':'From Instagram → API setup with Instagram login'} value={credentials.instagramAppSecret} onChange={e=>setCredentials({...credentials,instagramAppSecret:e.target.value})}/><small>Copy the Instagram App Secret next to the Instagram App ID in Meta’s Instagram setup. This is a separate credential from App settings → Basic.</small></label><label className="field"><span>Parent Meta app secret (optional)</span><input type="password" autoComplete="off" placeholder={c.appSecretSaved?'Saved securely · replacement only':'From Meta app settings'} value={credentials.metaSecret} onChange={e=>setCredentials({...credentials,metaSecret:e.target.value})}/></label><label className="field"><span>Webhook verify token</span><input type="password" autoComplete="off" placeholder={c.verifyTokenSaved?'Saved securely · replacement only':'Choose a long, random verification string'} value={credentials.verifyToken} onChange={e=>setCredentials({...credentials,verifyToken:e.target.value})}/><small>Choose this yourself and enter the identical value in Meta. The receiver checks it against the token saved here.</small></label><button className="button" disabled={!saved||!!busy||!(credentials.instagramAppSecret.trim()||credentials.metaSecret.trim()||credentials.verifyToken.trim())} onClick={()=>run('save-webhook',()=>connectionAction('save'),'Webhook credentials saved')}><Save size={15}/>Save webhook details</button><button className="button" disabled={!saved||!!busy||!c.instagramVerified||!(c.instagramAppSecretSaved||c.appSecretSaved)} onClick={()=>run('test-webhook',()=>connectionAction('test-webhook'),'Relay verified. Send a fresh Instagram DM to confirm real delivery.')}><Wifi size={15}/>{busy==='test-webhook'?'Testing relay…':'Test webhook relay'}</button><p className="micro-note">The relay test sends an empty signed event. It sends no DM and does not mark Instagram delivery as confirmed.</p>{c.lastEvent&&<p className="micro-note">Last signed event: {formatDate(c.lastEvent)}</p>}<div className="receiver-steps"><b>Connect Instagram delivery</b><ol><li>Save the Instagram App Secret from Instagram → API setup with Instagram login and your webhook verification token here.</li><li>Make the dedicated webhook receiver publicly reachable. Your control room remains private.</li><li>In Meta → Instagram API setup → Webhooks, paste the callback URL and matching verify token, then choose Verify and save.</li><li>Subscribe your app and Instagram account to messages and comments. Send a test DM and leave a test comment from an eligible account.</li></ol><p>Open Live inbox to confirm both arrived. Enable the reply workflow; turn approval off for automatic responses. For larger test batches, use Process pending interactions.</p></div></Card></div><aside className="connections-aside"><div className="setup-panel"><div className="panel-label">CONNECTION CHECKLIST</div>{[{name:'Dashboard',ok:saved},{name:'Instagram',ok:c.instagramVerified},{name:'Reply provider',ok:c.aiVerified},{name:'Webhook receiver',ok:c.receiverSeen}].map((item,i)=><div className="connection-step" key={item.name}><span className={item.ok?'step-icon complete':'step-icon'}>{item.ok?<Check size={14}/>:i+1}</span><div><b>{item.name}</b><small>{item.ok?'Ready':'Waiting for setup'}</small></div></div>)}<p className="body-note small-body">No replies are published during setup. Every test reports what was actually verified.</p></div><div className="boundary-card"><LockKeyhole size={24}/><h3>Keep your keys here.</h3><p>Paste credentials into these private fields. Don’t send them in chat or screenshots.</p></div></aside></div>}
 {view==='activity'&&<div className="activity-panel"><div className="activity-toolbar"><button className="button" disabled={!!busy} onClick={()=>run('refresh',()=>reload(true),'Activity refreshed')}><RefreshCw size={14}/>Refresh</button></div><Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Details</TableHead><TableHead>Source</TableHead><TableHead>Time</TableHead></TableRow></TableHeader><TableBody>{data.logs.filter(l=>!l.demo).map(log=><TableRow key={log.id}><TableCell><span className="log-event"><Activity size={15}/>{log.kind}</span></TableCell><TableCell>{log.message}</TableCell><TableCell><span className="source-label">{log.demo?'Sample':'Workspace'}</span></TableCell><TableCell className="timestamp">{formatDate(log.created)}</TableCell></TableRow>)}</TableBody></Table>{!data.logs.filter(l=>!l.demo).length&&<div className="large-empty"><Activity size={32}/><h2>Your log starts here.</h2><p>Saved settings, tests, and reply outcomes will appear as you work.</p></div>}<p className="export-note"><LockKeyhole size={14}/>Exports include settings and conversations. API credentials are excluded.</p></div>}
 <div className="page-foot"><span><ShieldCheck size={13}/>Private workspace{dirty&&<b className="unsaved-badge">Unsaved changes</b>}</span><span>Nina Kurain · Instagram reply workspace</span></div></section></main>
 <Dialog open={accountGateOpen} onOpenChange={setAccountGateOpen}><DialogContent className="account-gate-dialog" style={{maxWidth:'540px'}}><DialogHeader><div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><span className="avatar small purple"><Instagram size={14}/></span><DialogTitle style={{fontSize:'18px',fontWeight:700}}>Select Account to Manage</DialogTitle></div><DialogDescription>Choose which Instagram account you want to inspect, reply from, and configure.</DialogDescription></DialogHeader><div style={{display:'flex',flexDirection:'column',gap:'10px',margin:'14px 0'}}><button type="button" onClick={()=>selectAccount('all')} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderRadius:'10px',border:accountFilter==='all'?'2px solid #7354da':'1px solid #e5daf5',background:accountFilter==='all'?'#f6f0ff':'#fff',textAlign:'left',cursor:'pointer',transition:'all 0.15s ease'}}><div style={{display:'flex',alignItems:'center',gap:'10px'}}><span className="avatar purple" style={{width:'36px',height:'36px',fontSize:'12px'}}>ALL</span><div><b style={{fontSize:'14px',display:'block',color:'#221a36'}}>All Connected Accounts</b><small style={{color:'#6f6785'}}>Combined overview of all messages, comments & automation</small></div></div><span style={{fontSize:'12px',fontWeight:600,color:'#7354da'}}>{data.threads.filter(t=>!t.demo).length} chats</span></button>{(c.accounts||[]).map(acc=>{const isSelected=accountFilter===acc.id;const accThreads=data.threads.filter(t=>!t.demo&&(t.accountId||'legacy-instagram')===acc.id);const accReviews=accThreads.filter(t=>t.status==='review');const p=(c.providers||[]).find(pr=>pr.id===(acc.providerId||c.primaryProviderId));return <button key={acc.id} type="button" onClick={()=>selectAccount(acc.id)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderRadius:'10px',border:isSelected?'2px solid #7354da':'1px solid #e5daf5',background:isSelected?'#f6f0ff':'#fff',textAlign:'left',cursor:'pointer',transition:'all 0.15s ease'}}><div style={{display:'flex',alignItems:'center',gap:'10px'}}><span className="avatar pink" style={{width:'36px',height:'36px',fontSize:'12px'}}>{initials(acc.username||'IG')}</span><div><div style={{display:'flex',alignItems:'center',gap:'6px'}}><b style={{fontSize:'14px',color:'#221a36'}}>@{acc.username||'Instagram Account'}</b><span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'8px',background:acc.verified?'#e6f7ed':'#fff7e6',color:acc.verified?'#137333':'#b06000',fontWeight:600}}>{acc.verified?'Active':'Unverified'}</span></div><small style={{color:'#6f6785',display:'block',marginTop:'2px'}}>Model: {p?.label||'Primary'} · Tone: {acc.tone||data.settings.tone}</small></div></div><div style={{textAlign:'right'}}><span style={{fontSize:'12px',fontWeight:700,color:'#7354da'}}>{accThreads.length} chats</span>{accReviews.length>0&&<small style={{display:'block',color:'#c41d7f',fontWeight:600}}>{accReviews.length} to review</small>}</div></button>;})}</div><DialogFooter><button className="button" onClick={()=>setAccountGateOpen(false)}>Close</button></DialogFooter></DialogContent></Dialog><Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="help-dialog"><DialogHeader><DialogTitle>Welcome to your control room.</DialogTitle><DialogDescription>Everything you need to manage Nina’s Instagram replies.</DialogDescription></DialogHeader><div className="help-steps"><p><b>1. Connect</b> · Add your Instagram account tokens and API keys in Connections.</p><p><b>2. Make it yours</b> · Add examples and account facts in Personality, then generate a real test reply.</p><p><b>3. Go live</b> · Connect the public webhook receiver. Choose automatic replies or draft approvals in Automation.</p></div><DialogFooter><button className="button primary" onClick={()=>{setHelpOpen(false);navigate('connections');}}>Open connections</button></DialogFooter></DialogContent></Dialog><Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}><DialogContent className="mobile-menu-dialog" style={{maxWidth:'480px',width:'94vw',borderRadius:'18px',padding:'20px'}}><DialogHeader><div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'4px'}}><span className="brand-mark" style={{width:'32px',height:'34px',fontSize:'24px',lineHeight:'32px',borderRadius:'8px'}}>n<span>✦</span></span><div><DialogTitle style={{fontSize:'17px',fontWeight:700}}>Workspace Menu</DialogTitle><DialogDescription style={{fontSize:'12px'}}>All automation, testing, and settings</DialogDescription></div></div></DialogHeader><div className="mobile-menu-grid" style={{display:'flex',flexDirection:'column',gap:'8px',margin:'14px 0'}}>{[{id:'automation',name:'Automation Rules & Breaks',desc:'Schedules, pause windows, & spicy triggers',icon:Clock},{id:'testing',name:'Test Lab & Sandbox',desc:'Test models, uncensored chat, & API latencies',icon:FlaskConical},{id:'connections',name:'Instagram & API Connections',desc:'Instagram accounts, Groq, Gemini & fallback keys',icon:Link2},{id:'usage',name:'Usage, Limits & Quotas',desc:'Real-time provider capacity & rate-limit monitor',icon:Activity},{id:'security',name:'Security & Phone Access',desc:'Owner access, encryption, & phone pairing',icon:LockKeyhole},{id:'activity',name:'Activity Log & Exports',desc:'Timeline of saved changes, tests, and replies',icon:Activity}].map(item=><button key={item.id} type="button" onClick={()=>{navigate(item.id);setMobileMenuOpen(false);}} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 13px',borderRadius:'10px',border:view===item.id?'1.5px solid #7354da':'1px solid #ebe6f5',background:view===item.id?'#f5f0fc':'#faf9fd',textAlign:'left',cursor:'pointer',gap:'10px',transition:'all 0.15s ease'}}><div style={{display:'flex',alignItems:'center',gap:'10px'}}><div style={{padding:'8px',borderRadius:'8px',background:view===item.id?'#e9ddfa':'#eeeaf7',color:'#684db8',display:'flex',alignItems:'center',justifyContent:'center'}}><item.icon size={17}/></div><div><b style={{fontSize:'13px',display:'block',color:'#261c3e'}}>{item.name}</b><small style={{fontSize:'11px',color:'#78728d'}}>{item.desc}</small></div></div><ChevronRight size={14} style={{color:'#9e95b3',flexShrink:0}}/></button>)}</div><DialogFooter style={{flexDirection:'column',gap:'8px'}}><button type="button" className="button" style={{width:'100%',justifyContent:'center',fontSize:'13px'}} onClick={()=>{setMobileMenuOpen(false);setAccountGateOpen(true);}}><Instagram size={14} style={{color:'#7354da'}}/><span>Switch Managed Account ({accountFilter==='all'?'All Accounts':'@'+((c.accounts||[]).find(a=>a.id===accountFilter)?.username||'Account')})</span></button><button type="button" className="button subtle" style={{width:'100%',justifyContent:'center'}} onClick={()=>setMobileMenuOpen(false)}>Close</button></DialogFooter></DialogContent></Dialog>

 <AlertDialog open={!!deleteId} onOpenChange={v=>{if(!v)setDeleteId('');}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this conversation?</AlertDialogTitle><AlertDialogDescription>Remove its saved history, draft, and pending jobs from Nina. Messages already on Instagram remain there.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={()=>run('delete',async()=>{await threadAction('delete',undefined,undefined,deleteId);setSelectedId('');},'Conversation deleted')}>Delete conversation</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 {dirty&&<aside className="mobile-floating-save" aria-label="Unsaved workspace changes"><div className="mobile-save-content"><span className="save-pulse-dot"/><span>Unsaved profile changes</span></div><button className="button primary mobile-save-action" disabled={!saved||!!busy} onClick={()=>run('settings',()=>saveSettings(),'Changes saved')}><Save size={14}/>{busy==='settings'?'Saving…':'Save changes'}</button></aside>}
 <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{[{id:'overview',label:'Home',icon:LayoutDashboard},{id:'dms',label:'DMs',icon:MessageCircle,count:threads.filter(t=>t.channel==='dm'&&t.status!=='resolved').length},{id:'comments',label:'Comments',icon:Heart,count:threads.filter(t=>t.channel==='comment'&&t.status!=='resolved').length},{id:'personality',label:'Voice',icon:Sparkles},{id:'menu',label:'Menu',icon:SlidersHorizontal}].map(item=><button key={item.id} type="button" className={'nav-item '+((item.id==='menu'?['automation','testing','connections','usage','security','activity'].includes(view):view===item.id)?'active':'')} onClick={()=>{if(item.id==='menu'){setMobileMenuOpen(true);}else if((item.id==='dms'||item.id==='comments'||item.id==='inbox')&&(view===item.id)&&mobileChatView){setMobileChatView(false);}else{navigate(item.id);}}}><item.icon size={20}/>{!!item.count&&item.count>0&&<span className="mobile-nav-badge">{item.count}</span>}<span>{item.label}</span></button>)}</nav>
 
<Dialog open={drivePickerOpen} onOpenChange={setDrivePickerOpen}>
  <DialogContent className="drive-picker-dialog" style={{maxWidth:'680px',maxHeight:'85vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
    <DialogHeader>
      <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
        <span className="avatar small purple"><Sparkles size={14}/></span>
        <DialogTitle style={{fontSize:'17px',fontWeight:700}}>Select Photo from Dedicated Drive Folder</DialogTitle>
      </div>
      <DialogDescription>
        Browsing photos exclusively from folder: <strong style={{color:'#7354da'}}>📁 {driveFolderName||'Nina_Automation_Snaps'}</strong>
      </DialogDescription>
    </DialogHeader>
    <div style={{flex:1,overflowY:'auto',padding:'12px 0'}}>
      {driveLoading?(
        <div style={{textAlign:'center',padding:'40px',color:'#766e8a'}}>
          <Loader2 className="animate-spin" size={24} style={{margin:'0 auto 10px'}}/>
          <p>Loading photos from <strong>{driveFolderName||'Nina_Automation_Snaps'}</strong>…</p>
        </div>
      ):driveFiles.length===0?(
        <div style={{textAlign:'center',padding:'35px 20px',color:'#766e8a',background:'#faf8fe',borderRadius:'12px',border:'1px dashed #e1d6f4',margin:'10px 0'}}>
          <p style={{marginBottom:'14px',fontSize:'13px',color:'#4a3d66'}}>No photos found in your dedicated folder <strong>📁 {driveFolderName||'Nina_Automation_Snaps'}</strong> yet.</p>
          <label className="button primary" style={{fontSize:'12px',display:'inline-flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
            <Upload size={14}/>Upload Photo Directly to this Folder
            <input type="file" accept="image/*" style={{display:'none'}} onChange={async(e)=>{
              const file = e.target.files?.[0];
              if(!file) return;
              try {
                setDriveLoading(true);
                const url = await handlePhotoUpload(file);
                if(driveTargetCallback){
                  driveTargetCallback(url, file.name.replace(/\.[^/.]+$/, ""));
                  setDrivePickerOpen(false);
                  toast.success('Uploaded to ' + (driveFolderName||'Nina_Automation_Snaps') + ' and attached!');
                }
              } catch (err: any) {
                toast.error(err.message);
              } finally {
                setDriveLoading(false);
              }
            }}/>
          </label>
        </div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))',gap:'10px'}}>
          {driveFiles.map(file=>(
            <button key={file.id} type="button" className="drive-photo-card" onClick={()=>handleSelectDriveFile(file.id,file.name)}>
              <div className="drive-photo-thumb">
                {file.thumbnailLink?(
                  <img src={file.thumbnailLink} alt={file.name}/>
                ):(
                  <Sparkles size={24} style={{color:'#7354da'}}/>
                )}
              </div>
              <span style={{fontSize:'11px',fontWeight:600,color:'#2c1d4d',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',width:'100%'}} title={file.name}>{file.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
    <DialogFooter style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <label className="button subtle btn-compact" style={{fontSize:'12px',display:'inline-flex',alignItems:'center',gap:'6px',cursor:'pointer'}}>
        <Upload size={13}/>Upload New Photo
        <input type="file" accept="image/*" style={{display:'none'}} onChange={async(e)=>{
          const file = e.target.files?.[0];
          if(!file) return;
          try {
            setDriveLoading(true);
            const url = await handlePhotoUpload(file);
            if(driveTargetCallback){
              driveTargetCallback(url, file.name.replace(/\.[^/.]+$/, ""));
              setDrivePickerOpen(false);
              toast.success('Uploaded to ' + (driveFolderName||'Nina_Automation_Snaps') + ' and attached!');
            }
          } catch (err: any) {
            toast.error(err.message);
          } finally {
            setDriveLoading(false);
          }
        }}/>
      </label>
      <button type="button" className="button subtle" onClick={()=>setDrivePickerOpen(false)}>Cancel</button>
    </DialogFooter>
  </DialogContent>
</Dialog>
</SidebarProvider>;

}
