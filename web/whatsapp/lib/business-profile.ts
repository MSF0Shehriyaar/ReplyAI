import type {WASettings} from './model';
export const profileFields=[
  {key:'businessName',label:'Business name',reason:'Used in your dashboard and customer replies.'},
  {key:'industry',label:'Industry or service category',reason:'Helps the assistant understand what your business provides.'},
  {key:'businessDescription',label:'What your business does',reason:'Gives the assistant accurate context instead of guessing.'},
  {key:'supportEmail',label:'Customer support email',reason:'Provides a real contact for questions that need your team.'},
  {key:'supportPhone',label:'Customer WhatsApp number',reason:'Used for public catalog enquiries. Include the country code; connecting the device is verified separately.'},
  {key:'storeAddress',label:'Business address or service area',reason:'Helps answer location questions. For an online business, describe where you serve customers.'},
  {key:'businessHours',label:'Business hours',reason:'Used for availability and away rules. Use 09:00-18:00 or 24/7.'},
  {key:'businessTimezone',label:'Timezone',reason:'Makes business hours match your local time, for example Asia/Kolkata.'},
  {key:'paymentMethods',label:'Accepted payment methods',reason:'Prevents the assistant from inventing payment options.'},
  {key:'shippingPolicy',label:'Delivery or service fulfilment',reason:'Prevents unsupported delivery dates and charges. Enter Not applicable if you do not deliver.'},
  {key:'returnPolicy',label:'Returns or cancellation policy',reason:'Gives customers the actual rules before they commit.'},
  {key:'warrantyPolicy',label:'Warranty or service guarantee',reason:'Prevents false promises. Enter No warranty offered if that is your policy.'},
  {key:'knowledge',label:'Business facts and frequently asked questions',reason:'Provides verified answers to common questions about your business.'},
] as const;
export function missingBusinessProfile(settings:WASettings) {
  const missing:string[]=profileFields.filter(f=>!settings[f.key]?.trim()).map(f=>f.label);
  if(settings.supportEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.supportEmail))missing.push('Valid support email');
  if(settings.supportPhone&&!/^[1-9][0-9]{7,14}$/.test(settings.supportPhone.replace(/[^0-9]/g,'')))missing.push('Valid international WhatsApp number');
  if(settings.businessHours&&!/^(24\/7|([01]\d|2[0-3]):[0-5]\d\s*-\s*([01]\d|2[0-3]):[0-5]\d)$/.test(settings.businessHours.trim()))missing.push('Hours as HH:MM-HH:MM or 24/7');
  try {new Intl.DateTimeFormat('en',{timeZone:settings.businessTimezone});}catch {missing.push('Valid timezone');}
  if(!settings.profile?.name?.trim())missing.push('Assistant name');
  if(!settings.profile?.role?.trim())missing.push('Assistant role');
  return missing;
}
