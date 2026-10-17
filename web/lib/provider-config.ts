import type { ProviderKind, InstagramAccount } from './model';
export const providerConfig:Record<ProviderKind,{name:string;base:string}> = {
 groq:{name:'Groq',base:'https://api.groq.com/openai/v1'},
 gemini:{name:'Gemini',base:'https://generativelanguage.googleapis.com/v1beta/openai'},
 xai:{name:'Grok · xAI',base:'https://api.x.ai/v1'},
 openrouter:{name:'OpenRouter',base:'https://openrouter.ai/api/v1'},
 aihorde:{name:'AI Horde (Uncensored)',base:'https://aihorde.net/api/v2'},
 cloudflare:{name:'Cloudflare Workers AI',base:'https://api.cloudflare.com/client/v4/accounts'},
};
export function completionBody(provider:ProviderKind,model:string,messages:{role:string;content:string}[],temperature?:number){
 return {model:provider==='gemini'?model.replace(/^models\//,''):model,messages,temperature:temperature ?? .75,stop:['\nUser:','\n[User','\n\nUser:','\n[You replied]','<|eot_id|>','<|end_of_text|>'],...(provider==='groq'?{max_completion_tokens:500,...(model.startsWith('openai/')?{reasoning_effort:'low'}:{})}:{max_tokens:500}),...(provider==='gemini'?{reasoning_effort:'low'}:{})};
}
export function accountForEntry(accounts:InstagramAccount[],ownerId:unknown){return accounts.find(a=>a.verified&&a.igId&&a.igId===String(ownerId));}
export function accountThreadId(accountId:string,channel:'dm'|'comment',id:string){return (accountId==='legacy-instagram'?'':accountId+':')+channel+':'+id;}
