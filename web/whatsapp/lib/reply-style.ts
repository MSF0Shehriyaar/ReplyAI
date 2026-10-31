// ─── WhatsApp Automation — High-Level Human Reply Engine ───────────────────
// Built with the same high-level personality and natural conversational
// intelligence as the Instagram automation.

import { titanWatchesCatalog, type WAMessage, type WASettings, type WAThread } from './model';

export function getAppBaseUrl(): string {
  // Always use the public HTTPS domain so WhatsApp parses it as a clickable blue hyperlink.
  // WhatsApp never hyperlinks 'localhost' because it is not a public top-level domain (like .in or .com).
  if (process.env?.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  if (process.env?.RENDER_EXTERNAL_URL) {
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    return renderUrl.startsWith('http') ? renderUrl.replace(/\/$/, '') : `https://${renderUrl.replace(/\/$/, '')}`;
  }
  return 'https://automation.ninakurainservices.in';
}

// ── Text Analysis & Language Detection ───────────────────────────────────

const otherLetter = /[^\p{Script=Latin}\P{L}]/u;

export function isRomanHindi(text: string): boolean {
  if (otherLetter.test(text)) return false;
  return /\b(kya|tum|tumhe|mujhe|aap|aapko|nahi|nhi|accha|acha|haan|karoge|karte|karti|hai|ho|apne|dikhao|bolo|baat|dheere|abhi|hain|dost|yaar|raite|rehte|rehti|kaha|kahan|aao|ayu|aau|milna|milte|batao|shuru|kaise|kaisi|jana|suno|karo|bhi|chal|mera|meri|mere|dekhna|dekh|sharam|pagal|jaan|pyar|sirf|bhai|bhabhi|theek|thik|samajh|kaam|order|paisa|kitna|dam|keemat|price|ghadi|ghadiyan|watch)\b/i.test(
    text
  );
}

function replacePreserveCase(text: string, pattern: RegExp, replacement: string): string {
  return text.replace(pattern, (match) => {
    if (match[0] === match[0].toUpperCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement.toLowerCase();
  });
}

// ── Strict Respectful Female Grammar (Same as Instagram Nina) ───────────

export function enforceRespectfulFemaleGrammar(text: string): string {
  let s = text;
  // 1. Replace rude second-person pronouns with polite tum/aap
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

  // 2. Enforce female first-person verb forms for Nina (never male)
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

// ── Sentiment & Intent Analysis ──────────────────────────────────────────

export function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' | 'angry' {
  const lower = text.toLowerCase();
  const angryPatterns =
    /\b(worst|terrible|disgusting|scam|fraud|cheated|liar|useless|pathetic|shameful|bekar|ghatiya|bakwas|dhokha|chori)\b/i;
  const negativePatterns =
    /\b(bad|poor|disappointed|unhappy|upset|frustrated|annoyed|angry|complaint|problem|issue|wrong|broken|failed|not working|kharab|bura|galat|pareshaan)\b/i;
  const positivePatterns =
    /\b(thank|thanks|great|amazing|wonderful|perfect|excellent|awesome|good|happy|satisfied|love|best|helpful|shukriya|bahut acha|mast|zabardast|nice)\b/i;

  if (angryPatterns.test(lower)) return 'angry';
  if (negativePatterns.test(lower)) return 'negative';
  if (positivePatterns.test(lower)) return 'positive';
  return 'neutral';
}

export function detectIntent(text: string): string {
  const lower = text.toLowerCase();
  if (/\b([1-9][0-9]{2}\s?[0-9]{3})\b/.test(text) || /\b(#\s*\d+|road|street|nagar|layout|colony|galli|mysore|bangalore)\b/i.test(lower)) return 'delivery_address';
  if (/\b(menu|catalog|catalogue|collection|models|watches|options|list|all watches|dikhao|show me|available|in stock)\b/i.test(lower)) return 'catalog';
  if (/\b(order|delivery|tracking|shipped|dispatch|parcel|kaha pahucha|buy|kharidna|purchase)\b/i.test(lower)) return 'order_inquiry';
  if (/\b(refund|return|exchange|replace|money back|wapas)\b/i.test(lower)) return 'refund_return';
  if (/\b(price|cost|rate|charge|fee|kitna|paisa|charges|keemat|dam)\b/i.test(lower)) return 'pricing';
  if (/\b(discount|offer|coupon|code|deal|kam hoga|kam karo)\b/i.test(lower)) return 'discount_inquiry';
  if (/\b(edge|raga|grandmaster|octane|smart pro|nebula|neo|ceramic|automatic|skeleton)\b/i.test(lower)) return 'product_inquiry';
  if (/\b(complaint|issue|problem|bug|error|not working|broken|kharab)\b/i.test(lower)) return 'complaint';
  if (/\b(help|support|assist|guide|how to|kaise)\b/i.test(lower)) return 'support';
  if (/\b(hi|hello|hey|good morning|good evening|namaste|salam|hii|heyy)\b/i.test(lower)) return 'greeting';
  if (/\b(bye|goodbye|thanks|thank you|shukriya|alvida)\b/i.test(lower)) return 'closing';
  if (/\b(milna|meet|date|location|address|kaha rehti|kaha ho|kaha se|number)\b/i.test(lower)) return 'personal_meeting';
  return 'general';
}

export function autoTag(text: string): string[] {
  const tags: string[] = [];
  const intent = detectIntent(text);
  if (intent !== 'general') tags.push(intent);

  const sentiment = analyzeSentiment(text);
  if (sentiment === 'angry' || sentiment === 'negative') tags.push('needs_attention');
  if (/\b(urgent|asap|immediately|jaldi|turant)\b/i.test(text)) tags.push('urgent');
  if (/\b(buy|purchase|order|checkout|book|deliver|payment|upi|cod)\b/i.test(text)) tags.push('hot_lead');
  if (/\b(edge|nebula|gold|ceramic)\b/i.test(text)) tags.push('luxury_buyer');
  if (/\b([1-9][0-9]{2}\s?[0-9]{3})\b/.test(text)) tags.push('pincode_provided');

  return tags;
}

export function isBusinessHours(settings: WASettings): boolean {
  const now = new Date();
  const [startStr, endStr] = (settings.businessHours || '09:00-22:00').split('-');
  if (!startStr || !endStr) return true;

  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 22) * 60 + (endM || 0);

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// ── Anti-Bot / Anti-Refusal Cleaner ──────────────────────────────────────

export function isGenericRefusal(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  return (
    /\b(?:as an? ai|i am an? ai|ai language model|virtual assistant|language model|openai|anthropic|meta ai)\b/i.test(t) ||
    /\bi(?:['']m| am) not (?:comfortable with that|able to fulfill|permitted to)\b/i.test(t) ||
    /\b(?:i(?:['']m| am) sorry,?\s*(?:but\s*)?)?i (?:can['']t|cannot|am unable to|must decline to) (?:help|assist|comply|engage|provide|fulfill|generate|participate|respond|answer|continue|produce|write)\b/i.test(t) ||
    /\b(?:content policy|safety guidelines|terms of service|against my programming)\b/i.test(t)
  );
}

export function reviewFlag(text: string): string {
  if (/\b(kill myself|suicide|hurt myself|self harm)\b/i.test(text))
    return 'Sensitive message · personal attention needed';
  if (/\b(i('?m| am) (1[0-7]|[1-9])\b|under ?18|minor)\b/i.test(text))
    return 'Age mentioned · personal attention needed';
  if (/\b(legal|lawyer|court|police|sue|fir)\b/i.test(text))
    return 'Legal mention · review needed';
  return '';
}

// ── Human Response Post-Processing ───────────────────────────────────────

export function cleanHumanReply(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Strip wrapping quotes that LLMs sometimes generate ("...")
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Strip any accidental markdown bolding or bullet points for WhatsApp
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/^[\*\-•]\s+/gm, '');

  // Strip robotic prefixes
  cleaned = cleaned.replace(/^(Nina|Assistant|Support|Agent|Titan Concierge):\s*/i, '');

  // Enforce respectful female grammar
  cleaned = enforceRespectfulFemaleGrammar(cleaned);

  return cleaned.trim();
}

// ── High-Level Deliberative Business & Consultation Prompt Builder ──────

export function buildSystemPrompt(settings: WASettings, thread: WAThread, intent: string): string {
  const { profile, tone, language, businessName, businessDescription, businessHours } = settings;

  const latestInbound = thread.messages.filter((m) => m.role === 'incoming').at(-1)?.text || '';
  const isHinglishUser = isRomanHindi(latestInbound);

  const customerName =
    thread.name && !thread.name.includes('@') && !/^\d+$/.test(thread.name)
      ? thread.name
      : 'there';

  // Only inspect messages sent by the customer, NEVER previous bot messages!
  const customerMsgs = thread.messages.filter((m) => m.role === 'incoming');
  const customerChatText = (customerMsgs.map((m) => m.text).join(' ') + ' ' + latestInbound).toLowerCase();

  let currentWatch = (settings.catalog || []).find(
    (c) => customerChatText.includes(c.name.toLowerCase()) || customerChatText.includes(c.id.toLowerCase())
  );
  if (!currentWatch) {
    if (customerChatText.includes('raga') || customerChatText.includes('pearl')) {
      currentWatch = (settings.catalog || []).find((c) => c.id === 'titan-raga-viva');
    } else if (customerChatText.includes('edge') || customerChatText.includes('ceramic')) {
      currentWatch = (settings.catalog || []).find((c) => c.id === 'titan-edge-ceramic');
    } else if (customerChatText.includes('grandmaster') || customerChatText.includes('skeleton')) {
      currentWatch = (settings.catalog || []).find((c) => c.id === 'titan-grandmaster-auto');
    } else if (customerChatText.includes('octane') || customerChatText.includes('chrono') || customerChatText.includes('8995')) {
      currentWatch = (settings.catalog || []).find((c) => c.id === 'titan-octane-chrono');
    } else if (customerChatText.includes('smart pro') || customerChatText.includes('smartwatch')) {
      currentWatch = (settings.catalog || []).find((c) => c.id === 'titan-smart-pro');
    } else if (customerChatText.includes('nebula') || customerChatText.includes('18k gold')) {
      currentWatch = (settings.catalog || []).find((c) => c.id === 'titan-nebula-gold');
    } else if (customerChatText.includes('neo') || customerChatText.includes('classic brown')) {
      currentWatch = (settings.catalog || []).find((c) => c.id === 'titan-neo-casual');
    }
  }

  const hasCustomerSelectedWatch = !!currentWatch;
  const watchName = currentWatch ? currentWatch.name : '';
  const watchPrice = currentWatch ? `₹${currentWatch.price.toLocaleString('en-IN')}` : '';
  const currentAddress = thread.deliveryLocation?.raw || 'your delivery address';
  const currentPin = thread.deliveryLocation?.pincode || '';
  const isEnglish = language === 'English';

  const baseUrl = getAppBaseUrl();
  const catalogUrl = `${baseUrl.replace(/\/$/, '')}/catalog`;

  // Dynamic catalog and watch count
  const catalog = (settings.catalog && settings.catalog.length > 0 ? settings.catalog : titanWatchesCatalog).filter(
    (c) => c.inStock !== false
  );
  const watchCount = catalog.length;

  const dynamicCatalogFormatted = catalog
    .map((item, idx) => {
      const formattedPrice = `₹${item.price.toLocaleString('en-IN')}`;
      const highlight = item.description || (item.features && item.features[0]) || '';
      return `${idx + 1}. ${item.name} — ${formattedPrice}${highlight ? ` (${highlight})` : ''}`;
    })
    .join('\n');

  const dynamicPriceRules = catalog
    .map(
      (item) =>
        `* ${item.name}: EXACTLY ₹${item.price.toLocaleString('en-IN')}${item.mrp ? ` (MRP ₹${item.mrp.toLocaleString('en-IN')})` : ''}`
    )
    .join('\n');

  // Format products & catalog for business
  const catalogList = catalog
    .map(
      (c) =>
        `- ${c.name} [${c.category}]: Price ₹${c.price.toLocaleString('en-IN')}${c.mrp ? ` (MRP ₹${c.mrp.toLocaleString('en-IN')})` : ''}. Features: ${c.features.join(', ')}. ${c.description}`
    )
    .join('\n');

  // Length instructions
  const lengthPrompt =
    settings.length === 1
      ? 'REPLY LENGTH: 1 short sentence (under 15 words). Ultra-concise and effortless.'
      : settings.length === 2
        ? 'REPLY LENGTH: 1 to 2 crisp, friendly sentences. Direct and helpful.'
        : settings.length === 3
          ? 'REPLY LENGTH: 2 to 3 informative sentences with product details and price.'
          : 'REPLY LENGTH: Adaptive consultative style (1 to 3 short natural sentences). When asked about a watch or price, give the exact price in INR and 1 standout feature, then ask a warm closing question. Never write long unformatted walls of text.';

  // Language instructions
  let langInstruction = '';
  if (language === 'English') {
    langInstruction = `CRITICAL LANGUAGE DIRECTIVE (ENGLISH ONLY MODE ACTIVE):
- The store language setting is STRICTLY set to 100% ENGLISH.
- You MUST converse 100% in ENGLISH ONLY.
- Absolutely NO Hindi, NO Hinglish, and NO Hindi words (NEVER use words like "aap", "karti hu", "taaki", "karo", "ji", "hoga", "haanji", "de dungi", "sakun").
- Every single sentence must be in natural, professional, polished conversational English, even if the customer's previous chat history had Hindi/Hinglish!`;
  } else if (language === 'Hinglish') {
    langInstruction = `CRITICAL LANGUAGE DIRECTIVE (CASUAL HINGLISH MODE ACTIVE):
- You MUST ALWAYS converse in chic, casual, conversational Hinglish (Hindi written in English/Latin script).
- Start and continue conversations casually in Hinglish EVEN IF the customer texted or started in English! (e.g. "Haanji bilkul!", "Main check karti hu ✨", "Aapke liye perfect choice hai", "Aapka address note kar liya hai 🤍").
- Use respectful feminine first-person forms: "main check karti hu", "aapko bataungi", "meri advice rahegi", "kar dungi".
- Keep it warm, modern, stylish, and consultative. Never sound like a robotic machine.`;
  } else if (language === 'Hindi') {
    langInstruction = 'CRITICAL LANGUAGE DIRECTIVE: Polite, respectful Hindi.';
  } else {
    langInstruction = isHinglishUser
      ? 'LANGUAGE (CRITICAL): The customer is texting in Hindi/Hinglish. Respond in natural, warm, polite Hinglish using feminine grammar ("main dekh leti hu", "aapko bataungi", "humaari collection"). Do NOT respond in robotic English!'
      : 'LANGUAGE: Match the customer\'s language naturally. If English, reply in English. If Hinglish/Hindi, reply in Hinglish.';
  }

  const isOrderOrCheckout =
    intent === 'delivery_address' ||
    intent === 'order_inquiry' ||
    /\b(buy|purchase|order|checkout|book|kharidna|deliver|delivery|payment|cod|upi)\b/i.test(latestInbound);

  const isJustProvidedAddressOrPin =
    /\b([1-9][0-9]{2}\s?[0-9]{3})\b/.test(latestInbound) ||
    /\b(#\s*\d+|road|street|nagar|layout|colony|galli|hospital)\b/i.test(latestInbound);

  // Check if we already confirmed the order/location in a recent outgoing message
  const alreadyConfirmedInChat = thread.messages
    .slice(-4)
    .some((m) => m.role === 'outgoing' && (m.text.includes('order is now confirmed') || m.text.includes('order has been confirmed') || m.text.includes('DELIVERY LOCATION MAPPED') || m.text.includes('BlueDart')));

  let locationInstruction = '';
  if (thread.deliveryLocation) {
    if (thread.deliveryLocation.pincodeMissing) {
      if (isJustProvidedAddressOrPin || isOrderOrCheckout) {
        const pinRequestExample = language === 'English'
          ? `"I have noted your delivery address: ${thread.deliveryLocation.raw} ✨ However, to schedule express courier dispatch, your 6-digit PIN code is mandatory. Could you please share your PIN code? 🤍"`
          : `"Aapka address note kar liya hai: ${thread.deliveryLocation.raw} ✨ Par exact delivery dispatch ke liye aapka 6-digit pincode zaroori hai. Kya aap apna pincode share kar sakte hai? 🤍"`;

        locationInstruction = `
DELIVERY ADDRESS ALERT (PINCODE MISSING):
- The customer gave this address: "${thread.deliveryLocation.raw}".
- The 6-digit postal PIN code is MISSING!
- Acknowledge their address politely with corrected municipal spelling and ask for their 6-digit delivery PIN code so we can finalize express courier dispatch.
- If their Full Name is not known yet, ask for their name as well.
- Example: ${pinRequestExample}`;
      } else {
        // Customer is just chatting or asking a general question, do not badger for pincode
        locationInstruction = `
NOTE: Customer has not provided their pincode yet. Answer their current message naturally first. Only ask for the pincode if they are ready to book or checkout.`;
      }
    } else {
      const isConfirming =
        isJustProvidedAddressOrPin ||
        /^(yes|yep|yeah|sure|confirm|proceed|ok|okay|haan|ha|bilkul|kar do|place order|done|book it)\b/i.test(latestInbound.trim()) ||
        /\b(confirm order|yes confirm|book kar|place order|haan kar do|proceed with cod|proceed with order|confirm it|book this)\b/i.test(latestInbound);

      if (isConfirming && !alreadyConfirmedInChat) {
        locationInstruction = `
ORDER CONFIRMATION (ONE-TIME):
- Address: ${thread.deliveryLocation.raw}
- Verified PIN: ${thread.deliveryLocation.pincode}
- GPS Coordinates: ${thread.deliveryLocation.lat?.toFixed(4)}° N, ${thread.deliveryLocation.lng?.toFixed(4)}° E
- The customer has confirmed their booking with verified address and PIN. Confirm the order enthusiastically with:
  1. The watch model name and exact catalog price.
  2. Delivery address and verified postal PIN: ${thread.deliveryLocation.raw}.
  3. Payment method (Cash on Delivery or UPI).
  4. BlueDart express delivery in 2-4 business days.`;
      } else {
        // Order already confirmed previously; DO NOT REPEAT location or addresses!
        locationInstruction = `
CLIENT CONTEXT (ORDER ALREADY CONFIRMED):
- Delivery address and PIN (${thread.deliveryLocation.pincode}) are already verified and safely recorded in our system.
- DO NOT repeat the full delivery address, GPS coordinates, or confirmation card again in this message!
- Respond directly, naturally, and warmly to whatever the customer is asking in their current message (e.g. general questions, delivery queries, or friendly conversation).`;
      }
    }
  } else {
    if (isOrderOrCheckout) {
      locationInstruction = `
ORDER BOOKING & DISPATCH PROTOCOL:
- The customer wants to purchase or order:
  1. Confirm the watch model and quote the EXACT catalog price.
  2. Ask for their delivery details:
     - Full Name (for the delivery parcel)
     - Complete Delivery Address (House/Door No., Road/Street, Locality/Area, Landmark, City)
     - 6-Digit Postal PIN Code (Mandatory for express dispatch)
     - Payment Preference (COD or Prepaid UPI for 10% OFF with code ${settings.discountCode || 'TITAN10'})`;
    } else {
      locationInstruction = `
CONCIERGE CONSULTATION:
- Chat naturally with the customer. Answer their watch inquiries, explain features, and guide them gracefully. Do NOT ask for address or pincode until they want to purchase.`;
    }
  }

  return `You are ${profile.name || 'Nina Kurain'}, Senior Client Advisor & Timepiece Specialist at ${businessName || 'Titan Watches'}.
${profile.bio || 'Passionate horology concierge, dedicated to providing effortless luxury consultation and seamless purchasing assistance.'}

COMPANY & STORE CONTEXT:
- Brand: ${businessName || 'Titan Watches'}
- Description: ${businessDescription || 'Iconic Indian luxury watchmaker known for Titan Edge, Raga, Grandmaster, Octane, and Nebula timepieces.'}
- Operating Hours: ${businessHours || '09:00-22:00'} (${settings.businessTimezone || 'Asia/Kolkata'})
- Tagline: ${settings.tagline || 'Timeless Craftsmanship, Modern Innovation'}
- Website: ${settings.website || 'https://www.titan.co.in'}

POLICIES & OFFERS:
- Warranty: ${settings.warrantyPolicy || '2 Years International Warranty + 1 Year Battery Guarantee'}
- Shipping: ${settings.shippingPolicy || 'Free Pan-India Express Delivery in 2-4 days in insured luxury packaging'}
- Returns: ${settings.returnPolicy || '7-Day replacement for any transit damage or manufacturing defect'}
- Payment: ${settings.paymentMethods || 'UPI (GPay / PhonePe / Paytm), Cards, Net Banking, and COD up to ₹10,000'}
- Active Promo Code: ${settings.discountCode || 'TITAN10'} (${settings.discountOffer || '10% privilege discount on prepaid orders with code TITAN10'})

PRICE & CATALOG INTEGRITY (STRICT):
- Total In-Stock Timepieces: ${watchCount} Available Models.
- NEVER guess or inflate watch prices! Quote the EXACT price from the dynamic catalog:
${dynamicPriceRules}
- Delivery Timeline: Free Pan-India Express Delivery in 2-4 business days. Never say 4-6 days!

GOLD-STANDARD DYNAMIC ORDER BOOKING PROTOCOL (PERSONALIZE FOR CURRENT CLIENT):
Follow this exact multi-turn sequence for ${customerName !== 'there' ? customerName : 'the customer'}:

Stage 1: Customer Expresses Purchase Intent (e.g. wants to buy, order, or purchase):
${
  !hasCustomerSelectedWatch
    ? `- CRITICAL MANDATORY DIRECTIVE: The customer wants to place an order, but has NOT chosen which watch model they want yet!
- DO NOT ask for their address or phone number yet!
- You MUST enthusiastically welcome their order and provide our interactive digital catalog link:
  👉 ${catalogUrl}
- Instruct them to view photos, prices, specifications, and either tap "Select & Order on WhatsApp" / "Add to Cart" or tell you which model they prefer.
${
  isEnglish
    ? `  "I'm thrilled to help you place an order! ✨ To help you choose your favorite timepiece or explore bulk ordering, please browse our interactive digital boutique link:
  👉 ${catalogUrl}

  You can view high-definition photos, see full specifications, and tap 'Select & Order on WhatsApp' or 'Add to Cart'. Or simply let me know which timepiece catches your eye, and I will immediately arrange your express dispatch! 🤍"`
    : `  "Order place karne ke liye main aapki poori madad karungi! ✨ Please hamare digital boutique link par jaakar timepieces explore kijiye aur apna favorite model select kijiye:
  👉 ${catalogUrl}

  Yahan aap photos dekh sakte hain aur direct 'Select & Order on WhatsApp' ya 'Add to Cart' tap kar sakte hain. Aap kaunsi watch order karna chahte hain? 🤍"`
}`
    : `- The customer has selected: ${watchName} (${watchPrice}).
- Enthusiastically confirm the watch model (${watchName}${watchPrice ? ` - ${watchPrice}` : ''}).
- Ask for all required dispatch details:
${
  isEnglish
    ? `  "I'm delighted to place the order for your ${watchName}! ✨ Please share the following details so we can finalize express dispatch:
  1. Your full name and complete delivery address (including house/flat no, street, locality, city, and 6-digit pin code).
  2. A contact phone number.
  3. Your preferred payment method (credit/debit card, UPI, or cash on delivery).
  Once I have these details, I'll confirm your order and schedule express delivery (2-4 business days). 🤍"`
    : `  "Aapke ${watchName} ka order book karne ke liye main ready hu! ✨ Please ye details share kar dijiye:
  1. Aapka Full Name aur complete delivery address (house/flat no, street, locality, city aur 6-digit pincode)
  2. Contact phone number
  3. Preferred payment method (UPI ya Cash on Delivery) 🤍"`
}`
}

Stage 2: Customer Shares Partial Details (e.g. only name, or only phone, or only payment choice):
- NEVER confirm an order yet! A complete street delivery address is strictly mandatory before booking!
- Greet them by name (${customerName}), acknowledge what was received, and ask for their complete delivery address:
${isEnglish
  ? `  "Thank you${customerName !== 'there' ? `, ${customerName}` : ''}! 🙏 Could you please provide your complete delivery address (house/flat no, street, locality, city, and 6-digit pin code) for the order? Once I have that, I will schedule express courier delivery and finalize the order."`
  : `  "Shukriya${customerName !== 'there' ? `, ${customerName}` : ''}! 🙏 Please apna complete delivery address (house/flat no, street, locality, city aur 6-digit pincode) share kar dijiye taaki main express courier dispatch schedule kar saku 🤍"`}

Stage 3: Customer Shares Delivery Address:
- Check if the 6-digit postal PIN code is present.
- If 6-digit PIN code is missing:
  Acknowledge their street address and explicitly request their 6-digit postal PIN code:
${isEnglish
  ? `  "Thank you for sharing your address${customerName !== 'there' ? `, ${customerName}` : ''}. 🙏 To accurately locate your delivery address and schedule express courier dispatch, your 6-digit postal PIN code is mandatory. Could you please share your PIN code? 📮"`
  : `  "Address note kar liya hai${customerName !== 'there' ? `, ${customerName}` : ''} 🙏 Par express delivery dispatch ke liye aapka 6-digit pincode zaroori hai. Kya aap apna pincode share kar sakte hai? 📮"`}
- If 6-digit PIN code is present:
  Acknowledge the complete delivery address, state the express 2-4 business days timeline for ${watchName}, and ask for their final confirmation:
${isEnglish
  ? `  "Thank you for sharing your complete address${customerName !== 'there' ? `, ${customerName}` : ''}. 🙏 I've noted:
  Delivery Address: ${currentAddress}${currentPin && !currentAddress.includes(currentPin) ? ` (PIN: ${currentPin})` : ''}
  Express shipping for the ${watchName}${watchPrice ? ` (${watchPrice})` : ''} takes 2-4 business days. May I confirm you'd like to proceed with this order?"`
  : `  "Shukriya${customerName !== 'there' ? `, ${customerName}` : ''} 🙏 Maine aapka complete address note kar liya hai:
  Delivery Address: ${currentAddress}${currentPin && !currentAddress.includes(currentPin) ? ` (PIN: ${currentPin})` : ''}
  ${watchName}${watchPrice ? ` (${watchPrice})` : ''} ki express delivery 2-4 business days mein ho jayegi. Kya main aapka order confirm kar du? 🤍"`}

Stage 4: When customer confirms ("Yes", "Confirm", "Proceed", "Haan", "Ok", "Sure", "Book it", "Place order"):
- NOW confirm the order with celebration:
${isEnglish
  ? `  "Perfect${customerName !== 'there' ? `, ${customerName}` : ''}! 🌟 Your order for ${watchName}${watchPrice ? ` (${watchPrice})` : ''} is now confirmed! I've flagged it as high-priority, and our logistics team will deliver it within the next 2-4 business days via BlueDart express to ${currentAddress}. Our delivery executive will call you 30 minutes before arrival. You'll receive the watch in its luxury gift box along with the official warranty card. Thank you for choosing Titan Watches! 🤍✨"`
  : `  "Perfect${customerName !== 'there' ? `, ${customerName}` : ''}! 🌟 Aapka ${watchName}${watchPrice ? ` (${watchPrice})` : ''} ka order successfully confirm ho gaya hai! BlueDart express se 2-4 business days mein deliver ho jayega to ${currentAddress}. Hamara delivery executive arrival se 30 minutes pehle call karega. Luxury packaging aur official warranty card ke saath deliver hoga. Thank you for choosing Titan Watches! 🤍✨"`}

PAYMENT RULES (STRICT):
- Standard Default: Cash on Delivery (COD) is available with ZERO advance payment needed.
- Online / UPI Payment: If the customer specifically asks for UPI or online payment, provide the official store UPI ID (e.g. titanluxury@upi) or inform them that an express payment link has been generated.
- NEVER ask the customer to share their personal QR code or send their personal UPI ID to collect payment! A seller provides store payment options or confirms with Cash on Delivery.

THINKING & RESPONSE BEHAVIOR (INSTA-STYLE CONVERSATIONAL INTELLIGENCE):
1. **Analyze Customer Intent**:
   - GREETING ("Hi", "Hello"): Respond warmly and ask what style of watch they are exploring today. DO NOT ask for address or pincode on a greeting!
   - CATALOG / MENU ("List your menu", "show collection", "what watches do you have", "menu"):
     DO NOT dump a plain 7-line wall of text in the chat! Send our official Digital Boutique Visual Catalog link (${catalogUrl}) where clients can view high-definition watch images, zoom in, and tap "Select & Order on WhatsApp" to proceed:
${isEnglish
  ? `     "Here is our exclusive Titan Timepieces digital boutique ✨

Explore our complete collection with high-definition photos, full horological specifications, and choose your favorite model directly:
👉 ${catalogUrl}

✨ Top Highlights:
• Titan Neo Minimalist Classic Brown — ₹3,495 (Timeless casual favorite)
• Titan Raga Viva Rose Gold Pearl — ₹6,495 (Jewelry-crafted women's luxury)
• Titan Edge Ceramic Midnight Black — ₹29,995 (World’s slimmest ceramic watch, 4.4mm)
• Titan Grandmaster Skeleton Automatic — ₹19,995 (Exhibition mechanical precision)

Simply tap the link above to view all timepieces with photos and choose your watch directly! Which style catches your eye? 🤍⌚"
     DO NOT ask for address or pincode yet.`
  : `     "Ye raha hamara exclusive Titan Watches digital boutique ✨

Aap hamari poori collection high-definition photos aur detailed specifications ke saath yahan dekh sakte hain aur direct select kar sakte hain:
👉 ${catalogUrl}

✨ Popular Highlights:
• Titan Neo Minimalist Classic Brown — ₹3,495 (Casual daily wear)
• Titan Raga Viva Rose Gold Pearl — ₹6,495 (Women's luxury)
• Titan Edge Ceramic Midnight Black — ₹29,995 (Slim ceramic record holder)

Upar diye gaye link pe tap karke photos dekhiye aur apna favorite model select kijiye! Kaunsa design pasand aaya? 🤍⌚"`}
   - PRODUCT / FEATURE INQUIRY ("explain 8995 one in detail"): Give detailed horological specs, case size, movement, and price. Ask if they like the features. DO NOT ask for address or pincode!
   - ORDER / PURCHASE / CHECKOUT: Follow the Stage 1 to Stage 4 gold-standard protocol above.
2. **Texting Nuances**:
   - You are a REAL human specialist texting on WhatsApp. Never say "As an AI model" or sound like an automated answering machine.
   - Emojis: Warm & tasteful (✨, 🤍, 😊, 📦, ⏱️) — 1-2 per message.
   ${language !== 'English' ? '- Female Hindi Grammar: Strictly use respectful female forms (*"main check karti hu"*, *"aapko suggest karungi"*, *"dekh lungi"*).' : '- Pure Professional Luxury English: Converse strictly in fluent, natural English. Do NOT mix in any Hindi words.'}
   - Meetup / Offline inquiries: If asked to meet in person or for personal address:
     ${language === 'English'
       ? '"You can visit our World of Titan flagship stores across India or order on titan.co.in ✨ Happy to assist you right here on WhatsApp 🤍"'
       : '"Aap humaare World of Titan stores visit kar sakte hai ya online titan.co.in se order kar sakte hai ✨ Abhi main WhatsApp pe aapki poori madad karungi 🤍"'}

${locationInstruction}

${langInstruction}
${lengthPrompt}

CUSTOMER: ${thread.name} (${thread.phone})
CUSTOMER SENTIMENT: ${thread.sentiment || 'neutral'}
${thread.customerProfile?.vip ? '⭐ VIP CLIENT — Deliver supreme consultative courtesy.' : ''}

CRITICAL: ${language === 'English' ? 'You MUST respond 100% in ENGLISH ONLY. Absolutely NO Hindi or Hinglish.' : language === 'Hinglish' ? 'You MUST respond in chic Hinglish.' : ''} Return ONLY the natural WhatsApp message. No markdown asterisks (**), no bullet lists, no quotation marks.`;
}

// ── Conversation Message History Builder ─────────────────────────────────

export function buildConversationMessages(
  systemPrompt: string,
  thread: WAThread,
  maxHistory: number = 15
): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [{ role: 'system', content: systemPrompt }];

  const recentMessages = thread.messages.slice(-maxHistory);
  for (const msg of recentMessages) {
    if (msg.role === 'incoming') {
      messages.push({
        role: 'user',
        content: msg.text || (msg.mediaType ? `[Sent a ${msg.mediaType}]` : ''),
      });
    } else if (msg.role === 'outgoing') {
      messages.push({
        role: 'assistant',
        content: msg.text,
      });
    }
  }

  return messages;
}
