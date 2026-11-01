import {z} from 'zod';
import type {DeliveryAddress} from './model';
export function normalizeCustomerPhone(value:string){const digits=value.replace(/[^0-9]/g,'');return digits.length===10?'91'+digits:digits;}
const phone=z.string().max(32).regex(/^\+?[0-9()\s-]+$/).transform(normalizeCustomerPhone).refine(value=>/^[1-9][0-9]{7,14}$/.test(value),'Enter a valid phone number with country code.');
export const deliveryAddressSchema=z.object({
  fullName:z.string().trim().min(2).max(120),phone,alternatePhone:z.string().max(32).optional().transform(value=>value?normalizeCustomerPhone(value):undefined).refine(value=>!value||/^[1-9][0-9]{7,14}$/.test(value),'Invalid alternate number.'),
  line1:z.string().trim().min(3).max(180),line2:z.string().trim().min(5).max(180),locality:z.string().trim().min(2).max(120),landmark:z.string().trim().max(120).optional(),
  city:z.string().trim().min(2).max(100),state:z.string().trim().min(2).max(100),pincode:z.string().regex(/^[1-9][0-9]{5}$/,'Enter a six-digit Indian PIN code.'),country:z.literal('India'),
  type:z.enum(['home','work','other']),instructions:z.string().trim().max(500).optional(),
  coordinates:z.object({lat:z.number().finite().min(-90).max(90),lng:z.number().finite().min(-180).max(180),accuracy:z.number().finite().positive().max(100000)}).strict().optional(),
}).strict();
export const catalogCheckoutSchema=z.object({slug:z.string().min(3).max(64),requestKey:z.string().uuid(),items:z.array(z.object({productId:z.string().min(1).max(160),quantity:z.number().int().min(1).max(500)}).strict()).min(1).max(100),address:deliveryAddressSchema,consent:z.literal(true)}).strict();
export type CatalogCheckoutInput=z.infer<typeof catalogCheckoutSchema>;
export function formatDeliveryAddress(address:DeliveryAddress){return [address.line1,address.line2,address.locality,address.landmark,address.city,address.state,address.pincode,address.country].filter(Boolean).join(', ');}
