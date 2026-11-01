import {hasSessionCredentials} from '@/lib/session-credentials';
import {requireMasterAdmin,revokeSession} from '@/lib/auth';
import {db,initDatabase,AppError,errorResponse,audit,providerConnections,settings,freshBusinessSettings} from '@/lib/server';
import {missingBusinessProfile} from '@/lib/business-profile';
import {knownWhatsAppDevices} from '@/lib/whatsapp-client';
import {readJSON} from '@/lib/request-security';
import {consumeRateLimit} from '@/lib/rate-limit';
import {z} from 'zod';
import {isPrivateWorkspaceRequest} from '../../../../shared/private-workspace-bridge';
export const dynamic='force-dynamic';

export async function GET(request:Request) {
  try {
    if(!await isPrivateWorkspaceRequest(request))return new Response(null,{status:404});
    if(!hasSessionCredentials(request))throw new AppError('Owner authentication required.',401);
    await initDatabase();const owner=await requireMasterAdmin(request);
    const now=Date.now(),since=now-30*86400000;
    const params=new URL(request.url).searchParams;
    const page=(key:string)=>Math.min(100000,Math.max(1,Number.parseInt(params.get(key)||'1',10)||1));
    const usersPage=page('usersPage'),sessionsPage=page('sessionsPage'),activityPage=page('activityPage'),pageSize=50;
    const [tenants,users,sessions,activity,daily,logins,providers,queue,totals,branding,ownerRows,failures,configs,masterConfig]=await Promise.all([
      db().prepare(`SELECT b.id,b.name,b.owner_name AS ownerName,b.owner_email AS ownerEmail,b.status,b.created_at AS createdAt,b.updated_at AS updatedAt,
        COALESCE(u.calls,0) AS calls,COALESCE(u.tokens,0) AS tokens,COALESCE(u.sent,0) AS sent,COALESCE(u.received,0) AS received,
        (SELECT count(*) FROM business_users WHERE tenant_id=b.id) AS users,
        (SELECT count(*) FROM wa_threads WHERE tenant_id=b.id) AS chats,
        (SELECT count(*) FROM wa_orders WHERE tenant_id=b.id) AS orders,
        (SELECT count(*) FROM wa_jobs WHERE tenant_id=b.id AND status='failed') AS failed,
        COALESCE((SELECT phone FROM whatsapp_number_owners WHERE tenant_id=b.id),(SELECT display_phone_number FROM tenant_connections WHERE tenant_id=b.id)) AS connectedPhone,
        (SELECT provider FROM tenant_connections WHERE tenant_id=b.id AND phone_number_id IS NOT NULL) AS connectionProvider,
        (SELECT max(last_seen_at) FROM auth_sessions WHERE tenant_id=b.id AND revoked_at IS NULL AND expires_at>?) AS lastSeenAt
        FROM business_tenants b LEFT JOIN tenant_usage u ON u.tenant_id=b.id WHERE b.status<>'deleted' ORDER BY b.created_at DESC`).bind(now).all(),
      db().prepare(`SELECT u.id,u.name,u.email,u.role,u.status,u.tenant_id AS tenantId,u.created_at AS createdAt,b.name AS businessName,b.status AS businessStatus,
        (SELECT max(created_at) FROM auth_sessions WHERE user_id=u.id) AS lastLoginAt,
        (SELECT max(last_seen_at) FROM auth_sessions WHERE user_id=u.id) AS lastSeenAt,
        (SELECT count(*) FROM auth_sessions WHERE user_id=u.id AND tenant_id=u.tenant_id AND role=u.role AND revoked_at IS NULL AND expires_at>? AND u.status='active' AND b.status='active') AS sessions
        FROM business_users u JOIN business_tenants b ON b.id=u.tenant_id WHERE b.status<>'deleted' ORDER BY u.created_at DESC,u.id LIMIT ? OFFSET ?`).bind(now,pageSize,(usersPage-1)*pageSize).all(),
      db().prepare(`SELECT s.id,s.user_id AS userId,u.name,u.email,s.tenant_id AS tenantId,b.name AS businessName,s.role,s.created_at AS createdAt,s.expires_at AS expiresAt,s.last_seen_at AS lastSeenAt,s.revoked_at AS revokedAt,s.ip,s.user_agent AS userAgent,
        CASE WHEN s.revoked_at IS NOT NULL THEN 'revoked' WHEN s.expires_at<=? THEN 'expired' WHEN u.status<>'active' OR b.status<>'active' OR s.role<>u.role OR s.tenant_id<>u.tenant_id THEN 'blocked' ELSE 'active' END AS status
        FROM auth_sessions s JOIN business_users u ON u.id=s.user_id JOIN business_tenants b ON b.id=s.tenant_id ORDER BY s.created_at DESC,s.id LIMIT ? OFFSET ?`).bind(now,pageSize,(sessionsPage-1)*pageSize).all(),
      db().prepare('SELECT a.id,a.kind,a.message,a.created,a.tenant_id AS tenantId,b.name AS businessName FROM wa_activity a LEFT JOIN business_tenants b ON b.id=a.tenant_id ORDER BY a.created DESC,a.id LIMIT ? OFFSET ?').bind(pageSize,(activityPage-1)*pageSize).all(),
      db().prepare('SELECT day,SUM(calls) AS calls,SUM(tokens) AS tokens,SUM(sent) AS sent,SUM(received) AS received FROM tenant_daily_usage WHERE day>=? GROUP BY day ORDER BY day').bind(new Date(since).toISOString().slice(0,10)).all(),
      db().prepare("SELECT date(created/1000,'unixepoch') AS day,COUNT(*) AS count FROM wa_activity WHERE kind='User login' AND created>=? GROUP BY day ORDER BY day").bind(since).all(),
      providerConnections(),
      db().prepare('SELECT status,COUNT(*) AS count FROM wa_jobs GROUP BY status').all(),
      db().prepare(`SELECT (SELECT count(*) FROM business_users u JOIN business_tenants b ON b.id=u.tenant_id WHERE b.status<>'deleted') AS users,
        (SELECT count(*) FROM auth_sessions) AS sessions,(SELECT count(*) FROM wa_activity) AS activities,
        (SELECT count(*) FROM auth_sessions s JOIN business_users u ON u.id=s.user_id JOIN business_tenants b ON b.id=s.tenant_id WHERE s.revoked_at IS NULL AND s.expires_at>? AND u.status='active' AND b.status='active' AND s.role=u.role AND s.tenant_id=u.tenant_id) AS activeSessions,
        (SELECT count(DISTINCT s.user_id) FROM auth_sessions s JOIN business_users u ON u.id=s.user_id JOIN business_tenants b ON b.id=s.tenant_id WHERE s.revoked_at IS NULL AND s.expires_at>? AND s.last_seen_at>? AND u.status='active' AND b.status='active' AND s.role=u.role AND s.tenant_id=u.tenant_id) AS recentlyActiveUsers,
        (SELECT count(*) FROM wa_activity WHERE kind='User login' AND created>?) AS loginsToday,
        (SELECT count(*) FROM business_tenants WHERE created_at>? AND status<>'deleted') AS registrationsToday`).bind(now,now,now-300000,new Date().setUTCHours(0,0,0,0),new Date().setUTCHours(0,0,0,0)).first(),
      db().prepare("SELECT payload FROM workspace_state WHERE key='settings'").first<{payload:string}>(),
      db().prepare("SELECT key,payload FROM workspace_state WHERE key LIKE 'owner_session:%'").all<{key:string;payload:string}>(),
      db().prepare("SELECT key,payload FROM wa_state WHERE key LIKE 'ai_failure:%' ORDER BY key").all<{key:string;payload:string}>(),
      db().prepare('SELECT tenant_id,payload FROM tenant_settings').all<{tenant_id:string;payload:string}>(),
      settings('biz_titan_watches'),
    ]);
    const ownerSessions=ownerRows.results.flatMap(row=>{try{const s=JSON.parse(row.payload);return [{id:row.key.slice('owner_session:'.length),name:s.user||'Owner',createdAt:s.createdAt||null,lastSeenAt:s.lastSeenAt||null,expiresAt:s.expiresAt||null,status:s.revokedAt?'revoked':s.expiresAt>now?'active':'expired',current:row.key==='owner_session:'+owner.jti}];}catch{return [];}});
    let ninaName='Nina';try{ninaName=(branding&&JSON.parse(branding.payload).profile?.name)||ninaName;}catch{}
    const queueCounts=Object.fromEntries(queue.results.map((row:any)=>[row.status,Number(row.count)]));
    const configMap=new Map(configs.results.map(row=>[row.tenant_id,row.payload]));
    const devices=knownWhatsAppDevices();
    const businesses=tenants.results.map((tenant:any)=>{
      let config=tenant.id==='biz_titan_watches'?masterConfig:freshBusinessSettings(tenant.name);
      try{if(configMap.has(tenant.id))config={...config,...JSON.parse(configMap.get(tenant.id)!)};}catch{}
      const device=devices.get(tenant.id);
      return {...tenant,connectedPhone:device?.phone||tenant.connectedPhone,connectionState:tenant.connectionProvider==='cloud'?'cloud_configured':device?.state||'disconnected',automation:{enabled:!!config.enabled,approval:!!config.approval,profileReady:missingBusinessProfile(config).length===0,products:config.catalog?.length||0}};
    });
    const providerStatus=await Promise.all(providers.map(async p=>{const limit=await db().prepare('SELECT payload FROM workspace_state WHERE key=?').bind('provider_limit:'+p.id).first<{payload:string}>();let until=0;try{until=limit?JSON.parse(limit.payload).until:0;}catch{}return {id:p.id,label:p.label,provider:p.provider,model:p.model,verified:p.verified,cooldownUntil:until>now?until:null};}));
    return Response.json({at:now,ownerName:owner.name,ninaName,tenants:businesses,users:users.results,sessions:sessions.results,ownerSessions,activity:activity.results,daily:daily.results,logins:logins.results,providers:providerStatus,queue:queueCounts,totals,health:{database:'available',uptimeSeconds:Math.floor(process.uptime()),providerFailures:failures.results.map(row=>{let at=0;try{at=JSON.parse(row.payload).at||0;}catch{}return {providerId:row.key.slice('ai_failure:'.length),at};})},pagination:{pageSize,usersPage,sessionsPage,activityPage},dailyTracking:'Daily AI and message totals are recorded from this update onward; earlier totals remain cumulative.'},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
}

export async function POST(request:Request) {
  try {
    if(!await isPrivateWorkspaceRequest(request))return new Response(null,{status:404});
    if(!hasSessionCredentials(request))throw new AppError('Owner authentication required.',401);
    await initDatabase();const owner=await requireMasterAdmin(request);
    await consumeRateLimit('admin-access:'+owner.userId,30,60000);
    const body=z.object({action:z.literal('revoke-session'),id:z.string().uuid(),kind:z.enum(['business','owner'])}).strict().parse(await readJSON(request,2048));
    if(body.kind==='owner') {
      if(body.id===owner.jti)throw new AppError('Use Sign out to end your current owner session.',400);
      await db().prepare("UPDATE workspace_state SET payload=json_set(payload,'$.revokedAt',?) WHERE key=?").bind(Date.now(),'owner_session:'+body.id).run();
    }else await revokeSession(body.id);
    await audit('Session revoked',owner.name+' revoked a '+body.kind+' session.');
    return Response.json({ok:true});
  }catch(error){if(error instanceof z.ZodError)return errorResponse(new AppError('Invalid session action.',400));return errorResponse(error);}
}
