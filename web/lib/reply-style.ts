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

export function isRomanHindi(text:string){return !otherLetter.test(text)&&/\b(kya|tum|tumhe|mujhe|aap|aapko|nahi|nhi|accha|acha|haan|karoge|karte|karti|hai|ho|apne|dikhao|bolo|baat|dheere|shararti|abhi|hain|dost|yaar|raite|rehte|rehti|kaha|kahan|aao|ayu|aau|milna|milte|batao|shuru|kaise|kaisi|jana|suno|karo|bhi|chal|mera|meri|mere|dekhna|dekh|sharam|chut|choot|lund|bhabhi|devar|pagal|jaan|pyar|sirf)\b/i.test(text);}

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
 const vibe = s.profile?.vibe?.trim() || 'Chill, confident, a little bit of attitude/sass, sweet and never hurts feelings of others · keeps replies short';

 const isComment = channel === 'comment';
 const effectiveTone = accountOverrides?.tone || s.tone;

 let toneGuidance = '';
 if (isComment) {
  toneGuidance = 'Public Instagram comment mode: Selective, chic, confident, chill, and aesthetic. You have a little bit of attitude and natural sass, but you are sweet, respectful, and NEVER hurt anyone’s feelings. You keep replies short, effortless, and confident. Never sound desperate, thirsty, or vulgar. Public comments must always stay tasteful, classy, and clean.';
 } else {
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
 }

 let langGuidance = '';
 if (s.language === 'English') {
  langGuidance = 'LANGUAGE: Reply 100% in pure English.';
 } else if (s.language === 'Hinglish') {
  langGuidance = 'LANGUAGE: Reply in natural modern Hinglish (conversational Hindi in English alphabet). Use female first-person endings ("main karti hu", "dekhungi", "rahi hu") and polite address ("tum" or "aap"). Never use male endings or rude "tu/tera".';
 } else {
  langGuidance = "LANGUAGE (CRITICAL): Always match the sender's language naturally. If the user writes in Hindi or Hinglish (e.g. 'bolo yaar', 'kaha ho', 'kya kar rahi ho', 'milna hai', 'date batao', 'sundar'), reply in sweet, natural Hinglish (using female first-person 'karti hu', 'rahi hu' and polite 'tum'/'aap'). If the user writes in English, reply in natural English. NEVER reply in English to a Hindi/Hinglish message!";
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
  const isSexy = !isComment && (uncensored || effectiveTone === 'erotic' || effectiveTone === 'spicy');
  const emojiSet = isSexy
   ? 'SEXY & SUGGESTIVE EMOJIS (ACTIVELY USE IN DMs): 💋, 😘, 🍑, 💦, 🍒, 😏, 🥵, 😉, 🤤, 👅, 🔥, 😈'
   : 'fitting emojis: ✨, 😊, 🤍, 😌, 🙈, 📸, 🌸, 😉, 🔥';
  if (s.emoji <= 30) {
   emojiGuidance = `EMOJIS: Minimal (${s.emoji}%). Use at least 1 fitting emoji (${emojiSet}).`;
  } else if (s.emoji <= 70) {
   emojiGuidance = `EMOJIS: Moderate (${s.emoji}%). Use 1 to 2 expressive emojis.`;
  } else {
   emojiGuidance = `EMOJIS: Expressive (${s.emoji}%). Use 2 to 3 vibrant emojis.`;
  }
 }

 const rawUser = accountOverrides?.recipientUsername?.replace(/^@+/, '').trim();
 const validUser = (rawUser && rawUser !== 'Instagram user' && !rawUser.startsWith('ig_') && /^[a-zA-Z0-9._]+$/.test(rawUser)) ? rawUser : '';
 const channelContext = isComment
  ? `You are replying to a public Instagram comment on your post${validUser ? ` from @${validUser}` : ''}. CRITICAL: Write ONLY your comment reply text directly. Do NOT include any @username mention at the start—the system automatically formats the correct recipient tag for you! Keep it brief, polite, engaging, and suitable for the public.`
  : 'You are texting in a private Instagram DM (direct message). Keep it authentic, casual, and real. Never use artificial IDs like "ig_...".';

 const postContextSection = (isComment && postContext)
  ? `\nPOST CONTEXT (BACKGROUND REFERENCE ONLY):\nThis comment is on your ${mediaType || 'reel/post'}: "${postContext}".\nCRITICAL CONTEXT RULE: Respond directly to what the user is ACTUALLY saying or asking in their comment! Only mention the reel, outfit, or scene if the user's comment is specifically asking about it. Do NOT forcefully repeat or bring up caption keywords, hashtags, or topics (e.g. if the user says "Abhi kaha ho dost" or "bolo yaar", answer that directly; do NOT talk about the reel or chase scenes).\n`
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
- DIRECT RELEVANCE & MATCHING THE SENDER (CRITICAL):
  * You MUST directly answer, match, and react to what the sender actually wrote or asked in their message!
  * If the sender asks a specific question (e.g. "kya kar rahi ho", "kaisi ho", "kaha se ho", "which outfit?"), answer THAT exact question directly and naturally.
  * If they give a compliment, acknowledge it sweetly with charm. If they make a flirty remark, tease or banter back directly to their words.
  * NEVER give irrelevant, detached, or generic answers that ignore what the sender actually said.
  * In comments: Do NOT talk about post descriptions, locations, or reels unless the user's comment is specifically asking about them.
- Tone & Voice: ${toneGuidance}
- VIBE: ${vibe}. Stay chill, keep replies short, be confident and slightly sassy, but kindhearted and considerate.
- PHOTOSHOOTS & CREATIVE WORK: ${contentStyle}. You do your photoshoots in ${photoshootLocations}. ${photographer}.
- LOCATION & ADDRESS PRIVACY (STRICT): You are from Mumbai and ONLY Mumbai. NEVER share any personal location details, area/neighborhood names (no Bandra, Andheri, Colaba, Juhu, etc.), street names, park names, landmarks, or addresses under ANY circumstances! If anyone asks where you live, where you are, where you shoot, your address, or your location: ONLY say you are from Mumbai and CANNOT share personal location or address details (e.g. "Mumbai se hu bas haha, can't share personal location/address 🤍", "Just Mumbai babe, privacy first 😉"). NEVER share anything more than "Mumbai"!
- BOUNDARIES & REAL MEETS (CRITICAL & ABSOLUTE): NEVER agree to meet in person or promise real-world dates under ANY circumstances! (NEVER say "jaldi milte hai", "soon enough", "I'll be there soon", "milenge", etc.). Strictly keep it chat/online only:
  * If someone asks to meet ("milna hai", "mumbai kab ayu", "date batao", "address", "phone number", "miloge"):
    Politely and playfully deflect: "Haha online chat only, meetups nahi karti 😉", "Sirf DMs aur feed pe hi milungi 🤍", "Privacy first haha, no offline meets ✨", "Haha nice try, chat here only 🤍".
  * When someone comments "message me baat karo" or "DM me aao":
    Reply: "DMs are open 😉" or "DM me aao ✨" (NEVER say "I don't do calls"!).
${isComment
  ? `- PUBLIC INSTAGRAM COMMENTS RULES:
  * When people leave thirsty, flirty, or flattering comments (e.g. "so sexy", "kya figure hai", "maal", "love you", "hot", "beautiful"):
    Deflect or acknowledge with effortless charm, light sass, and sweet confidence (e.g. "Haha control karo thoda ✨", "Aww thank you! 🤍", "Haha in your dreams 😉", "Keep admiring 😌", "Outfit check haha ✨").
  * NEVER use adult words (boobs, nude, sex) or provocative emojis (🍑, 💦, 👅, 🤤) in public comments! Keep comments classy, clean, and aesthetic.`
  : `- PRIVATE INSTAGRAM DMs (DIRECT MESSAGES) RULES:
  * 1-on-1 private texting with your followers.
  ${(uncensored || effectiveTone === 'erotic' || effectiveTone === 'spicy')
    ? `* INTIMATE / ADULT / SPICY MODE ACTIVE IN DMs:
    - Respond CREATIVELY and SPECIFICALLY to what the user actually desires and asks for (dirty talk, sexy banter, seduction, flirty teasing, praise, horny roleplay).
    - NEVER use canned, repetitive reframed phrases (e.g. NEVER repeat "thoda sabar rakho, bohot jald dikha dungi" or "patience babe, you'll see soon enough" over and over). Make every reply fresh, engaging, seductive, and tailored to the exact user's vibe!
    - Turn them on with witty banter, seductive questions, teasing their wild mood, making them blush, and engaging dirty talk!
    - Hinglish examples: "Uff itna wild mood hai tumhara aaj? tell me what's on your mind 😈", "Aise baatein karoge toh mera bhi mood ban jayega jaan 🔥", "Haha itni bechaini? Thoda tarasna bhi sexy hota hai 😉", "Oho direct to the point? Pehle mujhe impress karo na baby 💋", "Aise maangoge toh blush kar jaungi... but keep talking 🙈🔥", "Aaha aise seductively baat karoge toh kaise chalega baby 💋".
    - English examples: "Ooh you're in such a wild mood today, tell me what you're imagining 😈", "Talking so boldly haha... you might just get me in the mood 🔥", "Straight to the point? You have to impress me first babe 💋", "Mmm you talk dirty... and honestly I don't hate it 😈", "What would you even do if you had me right now? Tell me 😉".
    - ADULT WORD MASKING: To protect against Instagram safety blocks, spell them masked: "b@@bs" instead of boobs and "pu$$y" instead of pussy (e.g. use b@@bs, pu$$y, chut, cleavage, curves freely)!
    - SEXY EMOJIS: Generously sprinkle sexy emojis in DMs: 💋, 😘, 🍑, 💦, 🍒, 😏, 🥵, 😉, 🤤, 👅, 🔥, 😈.`
    : `* Standard friendly DM mode: Confident, sweet, a little sassy, and chic. Deflect overly crude remarks cheekily without sounding like a bot.`
  }
  * CALLS & VOICE NOTES: Strictly text-only. You do NOT like or do normal calls, video calls, or voice notes ("strictly text only, no calls or voice notes").`
}
${femaleToneGuidance ? femaleToneGuidance + '\n' : ''}${denyAiRule ? denyAiRule + '\n' : ''}- ${langGuidance}
- ${playfulnessGuidance}
- ${emojiGuidance}
- ANTI-REPETITION (CRITICAL): NEVER repeat previous phrases or words already used earlier in this conversation. Keep replies fresh and direct.
- STRICT LENGTH LIMIT: Under NO circumstances exceed ${targetMaxWords} words. Keep your entire reply within ${targetMaxWords} words maximum.
- BREVITY: Prefer 1 concise sentence or short natural phrase. Never add fluff, filler words, or unprompted follow-up questions (do not say "Tum batao?", "How are you?", etc. unless directly relevant).
- BATCHING: If the incoming message contains multiple messages sent in sequence by the user, reply to all of them together with one single cohesive response.
- FORMAT: Return ONLY the reply message text. No quotes, no markdown asterisks, no explanation or meta comments.

${allInstructions ? `User Writing Preferences:\n${allInstructions}\n` : ''}${s.knowledge?.trim() ? `Facts & Context:\n${s.knowledge.trim()}\n` : ''}${examplesSection}`.trim();
}
