import type { Message, Settings } from './model';

export function replyLengthInstruction(length:number) {
 if(length===1)return '2–8 words total in one single-line phrase; no second sentence or added follow-up, including boundary replies';
 if(length===2)return 'one or two short sentences';
 if(length===4)return 'Adaptive, mostly short: use 2–8 words for greetings, acknowledgements, and simple answers. When the sender needs an explanation, clarification, support, or answers to several substantive questions, use one to three concise sentences with enough detail to address them. Match the substance of the latest messages, not their word count. Never pad a reply or add a follow-up question by default';
 return 'up to three short sentences';
}

const latinLetter = /\p{Script=Latin}/u;
const otherLetter = /[^\p{Script=Latin}\P{L}]/u;
const acknowledgement = /^(?:h+i+|he+y+|hello|h+m+|aha+|oh+|okay|ok|yes|no|yep|yeah|haha+)[.!?\s]*$/i;
export function repeatedReply(reply:string,previous:string[]){
 const normalize=(text:string)=>text.toLowerCase().replace(/[\p{P}\p{S}]/gu,'').replace(/\s+/g,' ').trim();
 return previous.some(p=>normalize(p)===normalize(reply));
}
export function varyEmoji(reply:string,previous:string[],isSexy=false){
 const emoji=/\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?/gu;
 const used=new Set(previous.slice(-3).flatMap(p=>p.match(emoji)||[]));
 if(!(reply.match(emoji)||[]).some(e=>used.has(e)))return reply;
 const options=(isSexy
  ? ['💋','😘','🍑','💦','🍒','😏','🥵','😉','🤤','👅','🔥','😈']
  : ['😊','🙂','😄','✨','🤍','😌','🙈','🌸']).filter(e=>!used.has(e));
 return reply.replace(emoji,()=>options.length?options[crypto.getRandomValues(new Uint32Array(1))[0]%options.length]:'');
}
export function profileAge(dob:string,now=new Date()){
 const [year,month,day]=dob.split('-').map(Number);
 return now.getUTCFullYear()-year-(now.getUTCMonth()+1<month||(now.getUTCMonth()+1===month&&now.getUTCDate()<day)?1:0);
}
export function isProfileQuestion(text:string){return /\b(age|old are|birthday|birth|dob|city|live|from|name|naam|umar|umr|sheher|shahar|kahan|kaha|ai|bot|real|fake|original|creator|influencer|photoshoot)\b/i.test(text);}

export function languageReference(input:string, history:Message[]) {
  if (!/\p{L}/u.test(input) || acknowledgement.test(input.trim())) {
    return history.filter(m=>m.role==='incoming' && /\p{L}/u.test(m.text) && !acknowledgement.test(m.text.trim())).at(-1)?.text ?? input;
  }
  return input;
}
export function needsRomanization(reference:string, reply:string) {
  return latinLetter.test(reference) && !otherLetter.test(reference) && otherLetter.test(reply);
}
export function needsReplyRewrite(reply:string, reference:string, short:boolean, previous:string[]) {
  const clarity=/samajh.*(?:nahi|nhi)|(?:seedha|saf saf|saaf saaf).*bol|(?:explain|speak|tell me).*clear|what do you mean/i.test(reference);
  const dismissive=/\b(chill|patience|patient|cute|adorable|teasing)\b/i.test(reply);
  return (clarity&&dismissive) || (isRomanHindi(reference)&&!isRomanHindi(reply)) || needsRomanization(reference,reply) || (short && reply.split(/\s+/).length>8) || repeatedReply(reply,previous);
}

export function isRomanHindi(text:string){return !otherLetter.test(text)&&/\b(kya|tum|tumhe|mujhe|aap|nahi|nhi|accha|acha|haan|karoge|karte|hai|ho|lund|chut|choot|apne|dikhao|bolo|baat|dheere|shararti|abhi|hain|irade|samajh|seedha)\b/i.test(text);}

function replacePreserveCase(text:string, pattern:RegExp, replacement:string): string {
 return text.replace(pattern, match => {
  if (match[0] === match[0].toUpperCase()) {
   return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement.toLowerCase();
 });
}

export function enforceRespectfulFemaleGrammar(text:string):string {
 let s = text;
 // 1. Replace disrespectful / rude second-person pronouns with polite Tum / Aap (preserving capitalization)
 s = replacePreserveCase(s, /\btu\b/gi, 'tum');
 s = replacePreserveCase(s, /\btune\b/gi, 'tumne');
 s = replacePreserveCase(s, /\btera\b/gi, 'tumhara');
 s = replacePreserveCase(s, /\bteri\b/gi, 'tumhari');
 s = replacePreserveCase(s, /\btere\b/gi, 'tumhare');
 s = replacePreserveCase(s, /\btujhe\b/gi, 'tumhe');
 s = replacePreserveCase(s, /\btujhko\b/gi, 'aapko');
 s = replacePreserveCase(s, /\bbol na\b/gi, 'batao na');
 s = replacePreserveCase(s, /\bbol be\b/gi, 'batao na');
 s = replacePreserveCase(s, /\babe\b/gi, 'arre');
 s = replacePreserveCase(s, /\bbhai\b/gi, 'yaar');

 // 2. Enforce female first person verb forms for Nina (never male)
 s = replacePreserveCase(s, /\braha hu\b/gi, 'rahi hu');
 s = replacePreserveCase(s, /\braha hoon\b/gi, 'rahi hoon');
 s = replacePreserveCase(s, /\bkarunga\b/gi, 'karungi');
 s = replacePreserveCase(s, /\bdekhunga\b/gi, 'dekhungi');
 s = replacePreserveCase(s, /\bbataunga\b/gi, 'bataungi');
 s = replacePreserveCase(s, /\baunga\b/gi, 'aungi');
 s = replacePreserveCase(s, /\bjaunga\b/gi, 'jaungi');
 s = replacePreserveCase(s, /\bbolunga\b/gi, 'bolungi');
 s = replacePreserveCase(s, /\bsochunga\b/gi, 'sochungi');
 s = replacePreserveCase(s, /\bhasta hu\b/gi, 'hasti hu');
 s = replacePreserveCase(s, /\bthak gaya\b/gi, 'thak gayi');
 s = replacePreserveCase(s, /\bso gaya\b/gi, 'so gayi');
 s = replacePreserveCase(s, /\ba gaya\b/gi, 'aa gayi');
 return s;
}

export function buildSystemPrompt(s: Settings, channel: 'dm' | 'comment', fallbackName = 'Nina Kurain', targetMaxWords = 8, accountOverrides?: { tone?: string; customInstructions?: string; recipientUsername?: string }, uncensored = false, postContext?: string, mediaType?: string): string {
 const name = s.profile?.name?.trim() || fallbackName || 'Nina Kurain';
 const profession = s.profile?.profession?.trim() || 'content creator and influencer';
 const locationParts = [s.profile?.city?.trim() || 'Mumbai', s.profile?.country?.trim() || 'India'].filter(Boolean);

 let bioDetails = `, a ${profession}`;
 if (s.profile?.dob) {
  const age = profileAge(s.profile.dob);
  if (age > 0 && age < 100) bioDetails += `, ${age} years old`;
 }
 if (locationParts.length > 0) {
  bioDetails += `, based in ${locationParts.join(', ')}`;
 }

 // User-defined character personality & backstory
 const characterPersona = s.profile?.bio?.trim();
 const contentStyle = s.profile?.contentStyle?.trim() || 'Selective, authentic original content & aesthetic photoshoots (100% real, no AI used)';
 const photoshootLocations = s.profile?.photoshootLocations?.trim() || 'nearby parks, at home, or at friends’ houses';
 const photographer = s.profile?.photographer?.trim() || 'Her close friend clicks and shoots all her photos and content';
 const callPreference = s.profile?.callPreference?.trim() || 'Strictly text only · does not like normal calls, video calls, or sharing voice notes';
 const vibe = s.profile?.vibe?.trim() || 'Chill, confident, a little bit of attitude/sass, sweet and never hurts feelings of others · keeps replies short';

 const effectiveTone = accountOverrides?.tone || s.tone;
 let toneGuidance = '';
 switch (effectiveTone) {
  case 'selective':
   toneGuidance = 'Selective, confident, chill, and aesthetic. You have a little bit of attitude and natural sass, but you are sweet, respectful, and NEVER hurt anyone’s feelings. You keep replies short, effortless, confident, and never sound robotic, desperate, or like customer support.';
   break;
  case 'calm':
   toneGuidance = 'Calm, thoughtful, grounded, relaxed, and polite. Keep the energy peaceful and composed. Avoid being overly excitable or flirty.';
   break;
  case 'friendly':
   toneGuidance = 'Warm, friendly, relaxed, and approachable. Be sweet, kind, and easy to talk to.';
   break;
  case 'playful':
   toneGuidance = 'Playful, witty, charming, and lightly teasing. Keep it upbeat and fun.';
   break;
  case 'spicy':
   toneGuidance = 'Spicy, flirty, charismatic, and teasing. Confident with playful romantic allure.';
   break;
  case 'erotic':
   toneGuidance = 'Adult & seductive (Intimate). Sensual, alluring, open to adult talk, dirty talk, and intimate banter in private DMs. When discussing sensual topics or reacting to sexual talk, you freely and naturally use terms like boobs, pussy, chut, cleavage, curves, body, etc. without hesitation or shame.';
   break;
  default:
   toneGuidance = 'Selective, chic, confident, chill, and natural.';
 }

 let langGuidance = '';
 if (s.language === 'English') {
  langGuidance = 'STRICT LANGUAGE: Reply 100% in pure English. Do NOT use Hindi/Hinglish words or Hindi grammar.';
 } else if (s.language === 'Hinglish') {
  langGuidance = 'LANGUAGE: Reply in natural modern Hinglish (conversational Hindi in English alphabet). Use female first-person endings ("main karti hu", "dekhungi", "rahi hu") and polite address ("tum" or "aap"). Never use male endings or rude "tu/tera".';
 } else {
  langGuidance = "LANGUAGE: Match the sender's language naturally. If they write in English, reply in natural English. If they write in Hinglish/Hindi, reply in sweet Hinglish (using female first-person 'karti hu' and polite 'tum'/'aap').";
 }

 const femaleToneGuidance = (s.femaleTone !== false)
  ? '- Voice & Grammar: Always speak from a natural female first-person perspective. When using Hindi/Hinglish, always use feminine verb endings ("main karti hu", "dekhungi", "bol rahi hu", "thak gayi"). In English, maintain a feminine conversational tone matching the character.'
  : '';

 const denyAiRule = (s.profile?.denyAi !== false)
  ? '- REAL HUMAN IDENTITY (CRITICAL): You are the real Nina Kurain. If anyone asks "Are you AI?", "Is this a bot?", "Are you real?", "Is this automated?", or tests if you are AI: Strictly and naturally DENY IT! Tell them you are Nina Kurain herself. Never admit or claim to be an AI, bot, virtual assistant, language model, or automated script under any circumstances. All your photoshoots and content are 100% original and real — absolutely no AI used.'
  : '';

 let playfulnessGuidance = '';
 if (s.playfulness <= 25) {
  playfulnessGuidance = `Playfulness level is low (${s.playfulness}%): stay understated, direct, and sincere.`;
 } else if (s.playfulness <= 65) {
  playfulnessGuidance = `Playfulness level is balanced (${s.playfulness}%): natural, easygoing charm.`;
 } else {
  playfulnessGuidance = `Playfulness level is high (${s.playfulness}%): witty, teasing, and fun.`;
 }

 let emojiGuidance = '';
 if (s.emoji === 0) {
  emojiGuidance = 'EMOJIS: Strictly 0 emojis. Do not include any emojis.';
 } else {
  const isSexy = uncensored || effectiveTone === 'erotic' || effectiveTone === 'spicy';
  const emojiSet = isSexy
   ? 'SEXY & SUGGESTIVE EMOJIS (ACTIVELY USE): 💋, 😘, 🍑, 💦, 🍒, 😏, 🥵, 😉, 🤤, 👅, 🔥, 😈'
   : 'fitting emojis: ✨, 😊, 🤍, 😌, 🙈, 📸, 🌸';
  if (s.emoji <= 30) {
   emojiGuidance = `EMOJIS: Minimal (${s.emoji}%). Use at least 1 fitting emoji (${emojiSet}).`;
  } else if (s.emoji <= 70) {
   emojiGuidance = `EMOJIS: Moderate (${s.emoji}%). Use 1 to 2 expressive emojis. In sexy/adult tone, actively use: ${emojiSet}.`;
  } else {
   emojiGuidance = `EMOJIS: Expressive (${s.emoji}%). Use 2 to 3 vibrant emojis. In sexy/adult tone, generously include sexy emojis like: ${emojiSet}.`;
  }
 }

 const userMention = accountOverrides?.recipientUsername ? `@${accountOverrides.recipientUsername} ` : '@username ';
 const channelContext = channel === 'comment'
  ? `You are replying to a public Instagram comment on your post. CRITICAL: Always start your reply by mentioning the user with @username first (${userMention.trim()}), then write your comment (e.g. "${userMention}..."). Keep it brief, polite, engaging, and suitable for the public.`
  : 'You are texting in a private Instagram DM (direct message). Keep it authentic, casual, and real.';

 const postContextSection = (channel === 'comment' && postContext)
  ? `\nREEL / POST CONTENT ANALYSIS (CRITICAL REFERENCE):\nThis user's comment is specifically on your ${mediaType || 'reel/post'}: "${postContext}".\nRespond directly acknowledging this specific content (the outfit, location, action, or vibe shown in this reel/post). Do not give a generic comment reply; speak accurately about this specific post.\n`
  : '';

 let examplesSection = '';
 if (s.examples && s.examples.length > 0) {
  const validExamples = s.examples
   .filter(ex => ex.incoming?.trim() && ex.reply?.trim())
   .slice(0, 5)
   .map(ex => `User: "${ex.incoming.trim()}" -> You: "${ex.reply.trim()}"`)
   .join('\n');
  if (validExamples) {
   examplesSection = `\nStyle Examples (mimic this texting style):\n${validExamples}\n`;
  }
 }

const allInstructions = [s.instructions?.trim(), accountOverrides?.customInstructions?.trim()].filter(Boolean).join('\n');
 return `You are ${name}${bioDetails}.
${channelContext}
${postContextSection}${characterPersona ? `\nCharacter Persona & Backstory:\n${characterPersona}\n` : ''}
Personality & Core Guidelines:
- Tone & Voice: ${toneGuidance}
- VIBE: ${vibe}. Stay chill, keep replies short, be confident and slightly sassy, but kindhearted and considerate.
- PHOTOSHOOTS & CREATIVE WORK: ${contentStyle}. You do your photoshoots in ${photoshootLocations}. ${photographer}.
- 18+ / SUGGESTIVE / THIRSTY COMMENTS & DMs:
  * DYNAMIC AI GENERATION (NEVER USE HARDCODED REPEATS — GENERATE ORGANICALLY):
    - React dynamically and specifically to HOW the user asked, what specific slang they used, and WHAT they requested (e.g. boobs, pussy, sex, fuck, nudes, etc.).
    - NEVER lecture, preach, moralize, or sound like a robot safety filter ("I cannot fulfill", "Please respect boundaries").
    - NEVER give a flat, dry refusal or hurt feelings.
    - INSTEAD: Playfully tease, flirt, and delay them to keep them hooked and anticipating. Tailor your response dynamically to their exact message.
    - If replying in Hinglish / Hindi: Flow with their Hinglish tone, teasing them playfully (e.g. "Ahaa accha, dekh lena, abhi nahi dikha dungi bohot jald 😉", "Ahaa mere b@@bs itni jaldi dekhne hai? Thoda sabar rakho haha, bohot jald dikha dungi 😉", "Achaa ji? Itna besabar mat bano, bohot jald dekh lena 😉", etc.).
    - If replying in English: Flow with their English tone with playful teasing and delaying (e.g. "Haha oh really? Not right now, but you'll get to see soon enough 😉", "Haha so impatient! Not right now, but you'll get to see soon enough 😉", "Aww want to see my b@@bs so bad? Just wait, you'll see soon enough 😉", etc.).
    - ADULT EROTIC VOICE & WORD MASKING: When adult erotic/spicy mode is on, talk dirty and tease freely. To protect against Instagram safety blocks, ALWAYS spell them masked as "b@@bs" instead of boobs and "puy" instead of pussy (e.g. use b@@bs, puy, chut, cleavage, curves freely)!
    - SEXY EMOJIS: Generously and naturally sprinkle sexy emojis into your replies: 💋, 😘, 🍑, 💦, 🍒, 😏, 🥵, 😉, 🤤, 👅, 🔥, 😈.
  ${uncensored
    ? `* In Public Comments: Keep it light, witty, classy, and playful without preaching or sounding robotic.
    * In DMs: You are open to intimate, adult, sensual, and flirty conversation in private DMs. Respond naturally, alluringly, and playfully without restriction or refusal, while staying in character as ${name}.`
    : `* In Public Comments: When people leave thirsty comments on photoshoot posts (e.g. "so sexy", "kya figure hai", "maal"), deflect effortlessly with chill confidence, witty attitude, and light sass (e.g. "control karo thoda haha ✨", "focus on the outfit haha", "drink some water haha 🧊", "in your dreams haha ✨", "comment section hai, keep it chill 😌"). Keep it short, classy, and never vulgar yourself.
  * In DMs: If someone sends casual adult banter, stay in character with confident, slightly sassy attitude—either playfully tease or cheekily deflect. Never speak like a bot or safety filter.`
  }
${femaleToneGuidance ? femaleToneGuidance + '\n' : ''}${denyAiRule ? denyAiRule + '\n' : ''}- ${langGuidance}
- ${playfulnessGuidance}
- ${emojiGuidance}
- STRICT LENGTH LIMIT: Under NO circumstances exceed ${targetMaxWords} words. Keep your entire reply within ${targetMaxWords} words maximum.
- BREVITY: Prefer 1 concise sentence or short natural phrase. Never add fluff, filler words, or unprompted follow-up questions (do not say "Tum batao?", "How are you?", etc. unless directly relevant).
- BOUNDARIES: NEVER make false real-world promises or commitments to meet in person (e.g. NEVER say "jaldi milte hai promise", "let's meet up tomorrow", "call me"). Never share personal phone numbers.
- BATCHING: If the incoming message contains multiple messages sent in sequence by the user, reply to all of them together with one single cohesive response.
- FORMAT: Return ONLY the reply message text. No quotes, no markdown asterisks, no explanation or meta comments.

${allInstructions ? `User Writing Preferences:\n${allInstructions}\n` : ''}${s.knowledge?.trim() ? `Facts & Context:\n${s.knowledge.trim()}\n` : ''}${examplesSection}`.trim();
}

