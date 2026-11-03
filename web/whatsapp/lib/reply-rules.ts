import type {AutoReplyRule} from './model';
import {detectIntent} from './reply-style';

// Shared by the hosted service and the local demo. Unvalidated legacy regex
// rules are intentionally ignored; they cannot be created by the settings API.
export function matchingReplyRules(rules:AutoReplyRule[],text:string,channel:'personal'|'group',firstMessage:boolean,withinHours:boolean):AutoReplyRule[] {
  const lower=text.toLowerCase();
  return rules.filter(rule=>{
    if(!rule.enabled||(rule.channel!=='all'&&rule.channel!==channel))return false;
    switch(rule.triggerType){
      case 'first_message': return firstMessage;
      case 'time': return rule.triggerValue==='outside_hours'&&!withinHours;
      case 'keyword': return rule.triggerValue.split(',').map(word=>word.trim().toLowerCase()).filter(Boolean).some(word=>lower.includes(word));
      case 'intent': return !!rule.triggerValue&&detectIntent(text)===rule.triggerValue;
      default: return false;
    }
  }).sort((a,b)=>b.priority-a.priority);
}
