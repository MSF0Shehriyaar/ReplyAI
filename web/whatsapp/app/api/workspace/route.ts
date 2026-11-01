import {hasSessionCredentials} from '@/lib/session-credentials';
import {catalogPublication,saveCatalogPublication} from '@/lib/catalog-publication';
import {profileFields,missingBusinessProfile} from '@/lib/business-profile';
import {generateReply} from '@/lib/server';
// ─── WhatsApp Workspace API — Multi-Tenant State Management ─────────────
import { NextRequest, NextResponse } from 'next/server';
import {
  initDatabase,
  readState,
  writeState,
  settings,
  saveSettings,
  allThreads,
  allOrders,
  saveOrder,
  getOrder,
  deleteOrder,
  connectionStatus,
  computeAnalytics,
  errorResponse,
  AppError,
  audit,
  saveSecret,
  saveTenantSecret,
  tenantSecret,
  assertActiveTenant,
  secret,
  db,
  getThread,
  saveThread,
  sendReply,
  getOrCreateCustomer,
  saveCustomerProfile,
  selectedProvider,
  providerSecretId,
  getAllTenants,
  getTenant,
  updateBusinessTenantStatus,
  deleteBusinessTenant,
  getTursoStats,
} from '@/lib/server';
import { workspaceSchema } from '@/lib/validation';
import { readJSON } from '@/lib/request-security';
import { consumeRateLimit } from '@/lib/rate-limit';
import { providerConfig } from '@/lib/provider-config';
import { queueStatus, processNextJob } from '@/lib/queue';
import { waDefaults, type WASettings, type RegisteredBusiness } from '@/lib/model';
import { requireTenantAccess, requireMasterAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET — Load tenant-scoped workspace state
export async function GET(request: NextRequest) {
  try {
    if(!hasSessionCredentials(request)) throw new AppError('Authentication required. Please sign in.',401);
    await initDatabase();

    const targetTenantId = request.nextUrl.searchParams.get('tenantId');
    const { session, tenantId } = await requireTenantAccess(request, targetTenantId);

    const isNinaAdmin = session.role === 'master_admin';

    // Parallel fetch for tenant-scoped resources
    const [s, threads, orders, connections, analytics, queue, usage] = await Promise.all([
      settings(tenantId),
      allThreads(tenantId),
      allOrders(tenantId),
      connectionStatus(tenantId),
      computeAnalytics(tenantId),
      queueStatus(tenantId),
      db().prepare('SELECT calls,tokens,sent,received FROM tenant_usage WHERE tenant_id=?').bind(tenantId).first().then(row=>row || {calls:0,tokens:0,sent:0,received:0}),
    ]);

    let registeredAccounts: RegisteredBusiness[] = [];
    let tursoStats = undefined;
    let logs: any[] = [];

    if (isNinaAdmin) {
      // Nina Master Admin sees platform-wide business directory, live DB usage, and audit logs
      const [allBiz, stats, activityRows] = await Promise.all([
        getAllTenants(),
        getTursoStats(),
        db()
          .prepare('SELECT * FROM wa_activity ORDER BY created DESC LIMIT 100')
          .all<any>()
          .then((r) => r?.results || []),
      ]);
      registeredAccounts = allBiz;
      tursoStats = stats;
      logs = activityRows;
    } else {
      // Regular business users only see their own business profile and tenant-scoped logs
      const myBiz = await getTenant(tenantId);
      if (myBiz) registeredAccounts = [myBiz];
      logs = await db()
        .prepare('SELECT * FROM wa_activity WHERE tenant_id = ? ORDER BY created DESC LIMIT 50')
        .bind(tenantId)
        .all<any>()
        .then((r) => r?.results || []);
    }

    return NextResponse.json(
      {
        settings: s,
        catalogPublication:await catalogPublication(tenantId),
        threads,
        orders,
        connections: isNinaAdmin ? connections : {...connections,providers:[],primaryProviderId:undefined},
        logs,
        analytics,
        queue,
        usage,
        storageReady: true,
        ...(isNinaAdmin?{tursoStats,isNinaAdmin:true}:{}),
        registeredAccounts,
        activeAccountId: tenantId,
        userRole: session.role,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (e) {
    return errorResponse(e);
  }
}

// POST — Handle tenant-authorized workspace mutations
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const parsed = workspaceSchema.safeParse(await readJSON(request));
    if (!parsed.success) throw new AppError('Invalid workspace action or fields.',400);
    const body:any = parsed.data;
    const action = String(body.action || '').trim();

    const targetTenantId = body.tenantId || body.businessId || request.nextUrl.searchParams.get('tenantId');
    const { session, tenantId } = await requireTenantAccess(request, targetTenantId);

    const isNinaAdmin = session.role === 'master_admin';
    await consumeRateLimit('workspace:'+session.userId,120,60000);
    const operatorActions = new Set(['approve-thread','edit-draft','send-manual','takeover','resolve','set-priority','add-tag','remove-tag','send-quick-reply','update-order-status']);
    if (session.role === 'business_operator' && !operatorActions.has(action)) throw new AppError('Business administrator access required.',403);
    if (!['reactivate-business','suspend-business','delete-business','refresh-turso-stats'].includes(action)) await assertActiveTenant(tenantId);

    // ── Master Admin Privileged Business Controls ─────────────────────────
    if (action === 'suspend-business') {
      await requireMasterAdmin(request);
      const bizId = String(body.businessId || '').trim();
      if (!bizId) throw new AppError('businessId required', 400);
      if (bizId === 'biz_titan_watches') {
        throw new AppError('The private owner workspace cannot be suspended.', 400);
      }
      await updateBusinessTenantStatus(bizId, 'suspended');
      await audit('Tenant suspended', `Master Admin suspended business: ${bizId}`, bizId);
      return NextResponse.json({ ok: true, registeredAccounts: await getAllTenants() });
    }

    if (action === 'reactivate-business') {
      await requireMasterAdmin(request);
      const bizId = String(body.businessId || '').trim();
      if (!bizId) throw new AppError('businessId required', 400);
      await updateBusinessTenantStatus(bizId, 'active');
      await audit('Tenant reactivated', `Master Admin reactivated business: ${bizId}`, bizId);
      return NextResponse.json({ ok: true, registeredAccounts: await getAllTenants() });
    }

    if (action === 'delete-business') {
      await requireMasterAdmin(request);
      const bizId = String(body.businessId || '').trim();
      if (!bizId) throw new AppError('businessId required', 400);
      await deleteBusinessTenant(bizId);
      await audit('Tenant deleted', `Master Admin deleted business: ${bizId}`, bizId);
      return NextResponse.json({ ok: true, registeredAccounts: await getAllTenants() });
    }

    if (action === 'refresh-turso-stats') {
      await requireMasterAdmin(request);
      const tursoStats = await getTursoStats();
      return NextResponse.json({ ok: true, tursoStats });
    }

    // ── Tenant-Scoped Settings ──────────────────────────────────────────
    if(action==='save-catalog') {
      const ids=body.catalog.map((item:{id:string})=>item.id);
      if(new Set(ids).size!==ids.length)throw new AppError('Product identifiers must be unique.',400);
      const current=await settings(tenantId);
      const categories=Array.from(new Set([...(body.categories??current.categories??[]),...body.catalog.map((item:{category:string})=>item.category)].map((category:any)=>String(category).trim()).filter(Boolean))) as string[];
      await saveSettings({...current,catalog:body.catalog,categories},tenantId);
      await audit('Catalog updated',`Saved ${body.catalog.length} products`,tenantId);
      return NextResponse.json({ok:true});
    }
    if(action==='save-catalog-publication')return NextResponse.json({ok:true,publication:await saveCatalogPublication(tenantId,body.slug,body.published)});
    if (['save-settings','save-profile','save-automation'].includes(action)) {
      if (!body.settings) throw new AppError('Settings payload required', 400);
      let updated=body.settings;
      if(action==='save-profile') {
        const current=await settings(tenantId);
        const fields=[...profileFields.map(f=>f.key),'website','tagline'] as const;
        updated={...current,...Object.fromEntries(fields.map(key=>[key,body.settings[key]])),profile:{...current.profile,name:body.settings.profile.name,role:body.settings.profile.role,bio:body.settings.profile.bio}};
        const missing=missingBusinessProfile(updated);
        if(missing.length)throw new AppError('Complete your business profile: '+missing.join(', '),400);
      } else if(action==='save-automation') {
        const current=await settings(tenantId);
        const fields=['enabled','personalChats','groupChats','approval','dailyLimit','tone','language','length','emoji','playfulness','humanDelay','personalReplyDelaySeconds','groupReplyDelaySeconds','typingIndicator','maxRetries','autoTagEnabled','sentimentAnalysisEnabled','instructions','examples','welcomeMessage','awayMessage','closingMessage','autoReplyRules'] as const;
        updated={...current,...Object.fromEntries(fields.map(key=>[key,body.settings[key]])),profile:{...current.profile,gender:body.settings.profile.gender}};
      }
      if(updated.enabled) {
        const missing=missingBusinessProfile(updated);
        if(missing.length)throw new AppError('Complete your business profile before enabling replies: '+missing.join(', '),412);
      }
      await saveSettings(updated, tenantId);
      await audit('Settings updated', 'WhatsApp automation settings updated', tenantId);
      return NextResponse.json({ ok: true, settings: await settings(tenantId) });
    }

    // ── Tenant-Scoped Credentials ────────────────────────────────────────
    if (action === 'save-credentials') {
      let count = 0;
      if (body.waAccessToken) {
        await saveTenantSecret(tenantId,'wa_access_token',body.waAccessToken);
        count++;
      }
      if (body.waAppSecret || body.waVerifyToken) {
        await requireMasterAdmin(request);
        if(body.waAppSecret) await saveSecret('wa_app_secret',body.waAppSecret);
        if(body.waVerifyToken) await saveSecret('wa_verify_token',body.waVerifyToken);
        count++;
      }
      if (body.waPhoneNumberId) {
        const token=body.waAccessToken || await tenantSecret(tenantId,'wa_access_token');
        if(!token) throw new AppError('Access token required to verify this phone.',400);
        const response=await fetch('https://graph.facebook.com/'+(await settings(tenantId)).graphVersion+'/'+body.waPhoneNumberId+'?fields=id,display_phone_number', {headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
        const phoneInfo=await response.json();
        if(!response.ok || phoneInfo.id !== body.waPhoneNumberId || !phoneInfo.display_phone_number) throw new AppError('Could not verify ownership of this WhatsApp phone.',403);
        const {claimWhatsAppNumber}=await import('@/lib/number-ownership');
        const displayPhone=await claimWhatsAppNumber(tenantId,phoneInfo.display_phone_number);
        const d = db();
        await d
          .prepare(
            `INSERT INTO tenant_connections (tenant_id, phone_number_id, updated_at,provider,display_phone_number) VALUES (?, ?, ?,'cloud',?)
             ON CONFLICT(tenant_id) DO UPDATE SET phone_number_id=excluded.phone_number_id,provider='cloud',display_phone_number=excluded.display_phone_number, updated_at=excluded.updated_at`
          )
          .bind(tenantId, body.waPhoneNumberId, Date.now(),displayPhone)
          .run();
        count++;
      }
      if (body.groqKey) {
        await saveTenantSecret(tenantId,'groq_key',body.groqKey);
        count++;
      }
      if (!count) throw new AppError('Provide at least one credential to save.');
      await audit('Credentials saved', `Saved ${count} credential(s)`, tenantId);
      const connections=await connectionStatus(tenantId);
      return NextResponse.json({ ok: true, connections:isNinaAdmin?connections:{...connections,providers:[],primaryProviderId:undefined} });
    }

    // ── Tenant-Scoped Conversation Actions ──────────────────────────────
    if (action === 'approve-thread') {
      const thread = await getThread(body.threadId, tenantId);
      if (!thread) throw new AppError('Thread not found.', 404);
      if (!thread.draft) throw new AppError('No draft to approve.');

      await sendReply(thread, thread.draft, tenantId);
      thread.draft = '';
      return NextResponse.json({ ok: true });
    }

    if (action === 'edit-draft') {
      const thread = await getThread(body.threadId, tenantId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.draft = body.draft || '';
      await saveThread(thread, tenantId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'send-manual') {
      const thread = await getThread(body.threadId, tenantId);
      if (!thread) throw new AppError('Thread not found.', 404);
      await sendReply(thread, body.text, tenantId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'takeover') {
      const thread = await getThread(body.threadId, tenantId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.takeover = !thread.takeover;
      thread.ai = !thread.takeover;
      await saveThread(thread, tenantId);
      await audit('Takeover', `${thread.takeover ? 'Manual' : 'AI'} mode for ${thread.name}`, tenantId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'resolve') {
      const thread = await getThread(body.threadId, tenantId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.status = 'resolved';
      thread.draft = '';
      await saveThread(thread, tenantId);
      await audit('Resolved', `Conversation with ${thread.name} resolved`, tenantId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'set-priority') {
      const thread = await getThread(body.threadId, tenantId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.priority = body.priority;
      await saveThread(thread, tenantId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'add-tag') {
      const thread = await getThread(body.threadId, tenantId);
      if (!thread) throw new AppError('Thread not found.', 404);
      if (!thread.tags.includes(body.tag)) thread.tags.push(body.tag);
      await saveThread(thread, tenantId);
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove-tag') {
      const thread = await getThread(body.threadId, tenantId);
      if (!thread) throw new AppError('Thread not found.', 404);
      thread.tags = thread.tags.filter((t) => t !== body.tag);
      await saveThread(thread, tenantId);
      return NextResponse.json({ ok: true });
    }

    // ── Tenant-Scoped Customer Profile ──────────────────────────────────
    if (action === 'update-customer') {
      const customer = await getOrCreateCustomer(body.phone, undefined, tenantId);
      Object.assign(customer, body.updates);
      await saveCustomerProfile(customer, tenantId);
      return NextResponse.json({ ok: true, customer });
    }

    if (action === 'toggle-vip') {
      const customer = await getOrCreateCustomer(body.phone, undefined, tenantId);
      customer.vip = !customer.vip;
      await saveCustomerProfile(customer, tenantId);
      await audit('VIP', `${customer.name} ${customer.vip ? 'marked' : 'unmarked'} as VIP`, tenantId);
      return NextResponse.json({ ok: true, customer });
    }

    // ── Tenant-Scoped Background Queue Process ──────────────────────────
    if(action==='test-ai') {
      await consumeRateLimit('test-ai:'+tenantId,10,60000);
      if(missingBusinessProfile(await settings(tenantId)).length)throw new AppError('Complete your business profile before testing replies.',412);
      const reply=await generateReply({id:'preview',name:'Test customer',phone:'',channel:'personal',status:'open',takeover:false,ai:true,messages:[{id:'preview',role:'incoming',text:body.text,at:Date.now()}],lastInbound:Date.now(),updated:Date.now(),tags:[],draft:'',recipientId:'',priority:'normal'},tenantId);
      return NextResponse.json({ok:true,reply:reply||'This message requires personal review. No automatic reply was generated.'});
    }
    if(action==='retry-queue') {
      if(missingBusinessProfile(await settings(tenantId)).length)throw new AppError('Complete your business profile before retrying replies.',412);
      await db().prepare("UPDATE wa_jobs SET status='pending',attempts=0,created=? WHERE tenant_id=? AND status IN ('pending','failed')").bind(Date.now(),tenantId).run();
      await audit('Queue retry','Business administrator requested a retry of saved replies.',tenantId);
      return NextResponse.json({ok:true,...await processNextJob(tenantId)});
    }
    if (action === 'process') {
      const result = await processNextJob(tenantId);
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Quick Replies ───────────────────────────────────────────────────
    if (action === 'send-quick-reply') {
      const thread = await getThread(body.threadId, tenantId);
      if (!thread) throw new AppError('Thread not found.', 404);
      await sendReply(thread, body.text, tenantId);

      const s = await settings(tenantId);
      const qr = s.quickReplies.find((q) => q.id === body.quickReplyId);
      if (qr) {
        qr.usageCount++;
        await saveSettings(s, tenantId);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Tenant-Scoped Orders ────────────────────────────────────────────
    if (action === 'save-order') {
      await saveOrder(body.order, tenantId);
      await audit('Order saved', `Order ${body.order.id} for ${body.order.customerName} saved`, tenantId);
      return NextResponse.json({ ok: true, orders: await allOrders(tenantId) });
    }

    if (action === 'delete-order') {
      await deleteOrder(body.orderId, tenantId);
      await audit('Order deleted', `Order ${body.orderId} deleted`, tenantId);
      return NextResponse.json({ ok: true, orders: await allOrders(tenantId) });
    }

    if (action === 'update-order-status') {
      const order = await getOrder(body.orderId, tenantId);
      if (!order) throw new AppError('Order not found', 404);
      order.orderStatus = body.status;
      if (body.trackingNumber) order.trackingNumber = body.trackingNumber;
      if (body.courierPartner) order.courierPartner = body.courierPartner;
      order.updatedAt = Date.now();
      await saveOrder(order, tenantId);
      await audit('Order status updated', `Order ${order.id} status changed to ${order.orderStatus}`, tenantId);
      return NextResponse.json({ ok: true, orders: await allOrders(tenantId) });
    }

    throw new AppError('Unknown action: ' + action, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
