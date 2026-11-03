import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchingReplyRules} from './whatsapp/lib/reply-rules.ts';

const rule=(id,patch={})=>({id,name:id,enabled:true,triggerType:'keyword',triggerValue:'watch',channel:'all',priority:1,response:'Saved reply',cooldownMinutes:30,maxUsesPerDay:5,usesToday:0,...patch});
test('empty keywords cannot match customers and legacy regex rules never execute',()=>{
  assert.deepEqual(matchingReplyRules([rule('empty',{triggerValue:' , , '}),rule('unsafe',{triggerType:'regex',triggerValue:'(a+)+$'})],'unrelated question','personal',false,true),[]);
  assert.equal(matchingReplyRules([rule('valid',{triggerValue:'watch, , price'})],'Watch price','personal',false,true).length,1);
});
test('rules respect channel, priority, first contact, hours and detected intent',()=>{
  const rules=[rule('group',{channel:'group',priority:99}),rule('off',{enabled:false}),rule('keyword'),rule('price',{triggerType:'intent',triggerValue:'pricing',priority:5}),rule('welcome',{triggerType:'first_message',priority:4}),rule('away',{triggerType:'time',triggerValue:'outside_hours',priority:3})];
  assert.deepEqual(matchingReplyRules(rules,'watch price','personal',true,false).map(r=>r.id),['price','welcome','away','keyword']);
  assert.deepEqual(matchingReplyRules(rules,'watch','personal',false,true).map(r=>r.id),['keyword']);
});
