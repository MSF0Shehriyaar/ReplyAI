import {waDefaults,type WASettings} from './model.ts';

// Historical internal identifier retained for existing device/API compatibility.
// It is a private owner workspace, never a public business registration.
export const OWNER_WORKSPACE_ID='biz_titan_watches';
export function ownerWhatsAppSettings(instagram:{profile?:Record<string,unknown>;knowledge?:string;instructions?:string}={}):WASettings{
  const profile=instagram.profile||{};
  const name=typeof profile.name==='string'?profile.name:'Nina Kurain';
  const city=typeof profile.city==='string'?profile.city:'Mumbai';
  const country=typeof profile.country==='string'?profile.country:'India';
  const bio=typeof profile.bio==='string'?profile.bio:'';
  return {
    ...structuredClone(waDefaults),businessName:name,industry:'Creator & community conversations',
    businessDescription:`${name}'s private creator workspace for personal and community conversations. ${bio}`.trim(),
    tagline:'Thoughtful conversations, in my own voice.',storeAddress:`Online conversations · ${city}, ${country}`,
    supportEmail:'insta.ninak12@gmail.com',supportPhone:'919845012345',businessTimezone:'Asia/Kolkata',businessHours:'24/7',
    paymentMethods:'No payments are collected in this personal workspace.',
    shippingPolicy:'Not applicable. No physical products are offered in this workspace.',
    returnPolicy:'Not applicable. No purchases are accepted in this personal workspace.',
    warrantyPolicy:'Not applicable. No physical products or paid guarantees are offered.',
    profile:{name,role:'Creator & community conversations',bio,gender:'female',denyAi:false},
    knowledge:[bio,typeof profile.profession==='string'?profile.profession:'',typeof profile.contentStyle==='string'?profile.contentStyle:'',typeof profile.callPreference==='string'?profile.callPreference:'',instagram.knowledge||''].filter(Boolean).join('\n'),
    instructions:'Keep replies brief, warm and respectful. Use the saved creator facts and match the conversation language. Never invent products, discounts, payment receipts or delivery promises. Never reveal admin URLs, login details, provider information, or another workspace. Keep calls and voice notes consistent with the saved persona. The catalog remains unpublished until the owner chooses a URL. Manual availability is not guaranteed by 24/7 assistant hours.',
    welcomeMessage:`Hi, this is ${name}. How can I help?`,awayMessage:'I will reply when I am available.',closingMessage:'Thank you for reaching out.',
    enabled:true,approval:false,personalChats:true,groupChats:false,tone:'friendly',language:'auto',length:1,emoji:0,playfulness:15,
    categories:['Creator Q&A','Brand Collaborations','Photoshoots','General Inquiries'],catalog:[],catalogCheckoutRequired:true,
  };
}
