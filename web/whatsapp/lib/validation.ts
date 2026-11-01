import { z } from 'zod';
import {deliveryAddressSchema} from './checkout-contract';
import type {WASettings} from './model';
import {waDefaults} from './model';
import { tenantIdSchema } from './request-security';

const text = z.string().max(4000);
const id = z.string().min(1).max(160);
const money = z.number().finite().nonnegative().max(1e10);
const location = z.object({structuredAddress:deliveryAddressSchema.optional(),confidence:z.enum(['low','medium','high']).optional(),precision:z.enum(['supplied','rooftop','interpolated','area','unknown']).optional(),source:z.enum(['customer','google','text']).optional(),needsReview:z.boolean().optional(),raw:text,pincode:text.optional(),pincodeMissing:z.boolean(),hasAddressDetails:z.boolean(),street:text.optional(),locality:text.optional(),city:text.optional(),state:text.optional(),lat:z.number().min(-90).max(90).optional(),lng:z.number().min(-180).max(180).optional(),mapUrl:text.optional(),directionsUrl:text.optional(),formattedAddress:text.optional(),verified:z.boolean(),mappedAt:z.number().optional()}).strict();
const orderStatus = z.enum(['confirmed','ready_for_dispatch','dispatched','out_for_delivery','delivered','cancelled']);
const courier = z.enum(['BlueDart','Delhivery','DTDC','Dunzo','Porter','Standard Express']);
export const orderSchema = z.object({checkoutId:z.string().uuid().optional(),id,threadId:id,customerName:text,customerPhone:id,productName:text,productId:id.optional(),items:z.array(z.object({productId:id.optional(),productName:text,quantity:z.number().int().positive(),unitPrice:money,totalPrice:money}).strict()).max(200).optional(),quantity:z.number().int().positive().optional(),subtotal:money.optional(),discountAmount:money.optional(),amount:money,currency:z.string().length(3),discountCode:text.optional(),paymentMode:z.enum(['COD','UPI','Card','Pending']),paymentStatus:z.enum(['paid','pending','cod']),orderStatus,deliveryLocation:location.optional(),courierPartner:courier.optional(),trackingNumber:text.optional(),notes:text.optional(),createdAt:z.number().finite(),updatedAt:z.number().finite()}).strict();

function shapeFromDefault(value: unknown): z.ZodTypeAny {
  if (typeof value === 'boolean') return z.boolean();
  if (typeof value === 'number') return z.number().finite().nonnegative().max(1e7);
  if (typeof value === 'string') return text;
  if (Array.isArray(value)) return z.array(value.length ? shapeFromDefault(value[0]) : text).max(500);
  return z.object(Object.fromEntries(Object.entries(value as object).map(([k,v])=>[k,shapeFromDefault(v)]))).strict();
}
export const settingsSchema = (shapeFromDefault(waDefaults) as z.AnyZodObject).extend({
  dailyLimit:z.number().int().min(1).max(10000),length:z.number().int().min(1).max(4),emoji:z.number().min(0).max(100),playfulness:z.number().min(0).max(100),
  category:text.optional(), tone:z.enum(['luxury','friendly','consultative','professional','casual']),language:z.enum(['auto','English','Hindi','Hinglish']),
  categories:z.array(z.string().trim().min(1).max(80)).max(1000).optional(),catalogCheckoutRequired:z.boolean().optional(),
  examples:z.array(z.object({incoming:text,reply:text}).strict()).max(500),
  quickReplies:z.array(z.object({id,label:text,text,category:text,shortcut:text.optional(),usageCount:z.number().nonnegative()}).strict()).max(500),
  escalationRules:z.array(z.object({id,name:text,enabled:z.boolean(),condition:z.enum(['sentiment_negative','keyword','wait_time','repeat_contact','vip_customer']),conditionValue:text,action:z.enum(['flag','notify','assign','auto_reply']),actionValue:text,priority:z.enum(['high','urgent'])}).strict()).max(100),
  personalReplyDelaySeconds:z.number().min(0).max(60),groupReplyDelaySeconds:z.number().min(0).max(60),replyDelaySeconds:z.number().min(0).max(60),maxRetries:z.number().int().min(1).max(10).optional(),
  catalog:z.array(z.object({id,name:text,category:text,price:money,mrp:money.optional(),currency:text,description:text,features:z.array(text).max(50),inStock:z.boolean(),bestseller:z.boolean().optional(),link:text.optional(),image:text.optional()}).strict()).max(500),
  autoReplyRules:z.array(z.object({id,name:text,enabled:z.boolean(),triggerType:z.enum(['keyword','intent','time','first_message']),triggerValue:text,response:text,priority:z.number(),channel:z.enum(['personal','group','all']),cooldownMinutes:z.number().nonnegative(),maxUsesPerDay:z.number().nonnegative(),usesToday:z.number().nonnegative()}).strict()).max(100),
}).strict();
export function parseSettings(value: unknown): WASettings { return settingsSchema.parse(value) as WASettings; }
const base={tenantId:tenantIdSchema.optional(),businessId:tenantIdSchema.optional()};
const action=(name:string, fields: Record<string,z.ZodTypeAny>={})=>z.object({...base,action:z.literal(name),...fields}).strict();
export const workspaceSchema=z.union([
  ...['suspend-business','reactivate-business','delete-business'].map(n=>action(n,{businessId:tenantIdSchema})),
  action('refresh-turso-stats'),action('save-settings',{settings:settingsSchema}),
  action('save-catalog',{catalog:settingsSchema.shape.catalog,categories:settingsSchema.shape.categories}),
  action('save-catalog-publication',{slug:z.string().max(64),published:z.boolean()}),
  action('save-profile',{settings:settingsSchema}),action('save-automation',{settings:settingsSchema}),
  action('test-ai',{text:text.min(1)}),action('retry-queue'),
  action('save-credentials',{waAccessToken:z.string().min(1).max(8192).optional(),waPhoneNumberId:z.string().regex(/^\d{1,30}$/).optional(),groqKey:z.string().min(1).max(8192).optional(),waAppSecret:z.string().min(16).max(512).optional(),waVerifyToken:z.string().min(16).max(512).optional()}),
  ...['approve-thread','takeover','resolve'].map(n=>action(n,{threadId:id})),
  action('edit-draft',{threadId:id,draft:text}),action('send-manual',{threadId:id,text:text.min(1)}),
  action('set-priority',{threadId:id,priority:z.enum(['normal','high','urgent'])}),
  ...['add-tag','remove-tag'].map(n=>action(n,{threadId:id,tag:z.string().min(1).max(80)})),
  action('update-customer',{phone:id,updates:z.object({name:text,email:text,city:text,address:text,notes:text,vip:z.boolean(),language:text,tags:z.array(text).max(50)}).partial().strict()}),
  action('toggle-vip',{phone:id}),action('process'),action('send-quick-reply',{threadId:id,text:text.min(1),quickReplyId:id}),
  action('save-order',{order:orderSchema}),action('delete-order',{orderId:id}),action('update-order-status',{orderId:id,status:orderStatus,trackingNumber:text.optional(),courierPartner:courier.optional()}),
] as unknown as [z.ZodTypeAny,z.ZodTypeAny,...z.ZodTypeAny[]]);
