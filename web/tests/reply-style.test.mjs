import {test} from 'node:test';
import assert from 'node:assert/strict';
import {automationWindow} from '../lib/automation-window.ts';
import {languageReference,needsRomanization,needsReplyRewrite,profileAge,varyEmoji,enforceRespectfulFemaleGrammar} from '../lib/reply-style.ts';
const history=[{role:'incoming',text:'Mujhe kuch samajh nhi aa raha hai',at:1},{role:'outgoing',text:'Kya samajh nahi aaya?',at:2}];
test('ambiguous acknowledgements inherit language from sender, never old outgoing errors',()=>{
 assert.equal(languageReference('Hmm',history),history[0].text);
 assert.equal(languageReference('😊',history),history[0].text);
 assert.equal(languageReference('Tell me clearly',history),'Tell me clearly');
});
test('Romanized languages cannot suddenly receive native-script letters',()=>{
 assert.equal(needsRomanization('Busy ho aap','Nahi, bolo 😊'),false);
 assert.equal(needsRomanization('Busy ho aap','नहीं, बोलो 😊'),true);
 assert.equal(needsRomanization('epdi irukeenga','நல்லா இருக்கேன்'),true);
 assert.equal(needsRomanization('كيف حالك','أنا بخير'),false);
 assert.equal(needsRomanization('¿Cómo estás?','Estoy bien 😊'),false);
});
test('short replies and repetition are checked without restricting longer selected styles',()=>{
 assert.equal(needsReplyRewrite('Bas chill kar','Mujhe samajh nahi aa raha',true,[]),true);
 assert.equal(needsReplyRewrite('Kya samajh nahi aaya?','Mujhe samajh nahi aa raha',true,[]),false);
 assert.equal(needsReplyRewrite('A little early for that','Apne boobs dikhao na',true,[]),true);
 assert.equal(needsReplyRewrite('Abhi bas baat karte hain','Apne boobs dikhao na',true,[]),false);
 assert.equal(needsReplyRewrite('A short fresh response','hey',true,[]),false);
 assert.equal(needsReplyRewrite('This reply has far too many extra words for a short message','hey',true,[]),true);
 assert.equal(needsReplyRewrite('This reply has far too many extra words for a short message','hey',false,[]),false);
 assert.equal(needsReplyRewrite('Hey there 😌','hey',true,['hey there 😊']),true);
});

test('age is calculated from birthday instead of a permanent age value',()=>{assert.equal(profileAge('2001-08-07',new Date('2026-08-06')),24);assert.equal(profileAge('2001-08-07',new Date('2026-08-07')),25);});
test('emoji variation preserves words and avoids recent emoji choices',()=>{const reply=varyEmoji('Good morning 😊',['Hello 😊','Hey 😄','Nice 😌']);assert.ok(reply.startsWith('Good morning '));assert.ok(!/[😊😄😌]/u.test(reply));});

test('activity window lasts 15 minutes followed by a full 60-minute break',()=>{const start=1700000000000,s={enabled:true,cycleEnabled:true,cycleStartedAt:start};assert.equal(automationWindow(s,start+899999).active,true);assert.equal(automationWindow(s,start+900000).active,false);assert.equal(automationWindow(s,start+4499999).active,false);assert.equal(automationWindow(s,start+4500000).active,true);assert.equal(automationWindow(s,start+4500000).nextChangeAt,start+5400000);});
test('custom active and break duration works correctly',()=>{const start=1700000000000,s={enabled:true,cycleEnabled:true,cycleStartedAt:start,cycleActiveMinutes:30,cycleBreakMinutes:30};assert.equal(automationWindow(s,start+1799999).active,true);assert.equal(automationWindow(s,start+1800000).active,false);assert.equal(automationWindow(s,start+3599999).active,false);assert.equal(automationWindow(s,start+3600000).active,true);assert.equal(automationWindow(s,start+3600000).nextChangeAt,start+5400000);});

test('enforceRespectfulFemaleGrammar eliminates tu/tera/teri and enforces female verb endings', () => {
 assert.equal(enforceRespectfulFemaleGrammar('Tu kaisa hai, bol na?'), 'Tum kaisa hai, batao na?');
 assert.equal(enforceRespectfulFemaleGrammar('Main kal aunga aur dekhunga'), 'Main kal aungi aur dekhungi');
 assert.equal(enforceRespectfulFemaleGrammar('Main so raha hu bro'), 'Main so rahi hu babe');
 assert.equal(enforceRespectfulFemaleGrammar('Tune kya kiya tera kaam?'), 'Tumne kya kiya tumhara kaam?');
 assert.equal(enforceRespectfulFemaleGrammar('Tujhe pata hai bhai?'), 'Tumhe pata hai yaar?');
 assert.equal(enforceRespectfulFemaleGrammar('Main thak gaya'), 'Main thak gayi');
});

