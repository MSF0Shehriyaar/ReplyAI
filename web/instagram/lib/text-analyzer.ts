export type TextIntent = 'sexy' | 'flirty' | 'normal';

export interface AnalysisResult {
  intent: TextIntent;
  score: number; // 0 to 100
  matchedWords: string[];
  recommendedTone: 'erotic' | 'spicy' | 'playful' | 'friendly';
  categoryLabel: string;
  explanation: string;
}

export const DEFAULT_SPICY_KEYWORDS = [
  // English explicit & sensual words
  'sex', 'sexy', 'nude', 'nudes', 'naked', 'fuck', 'fucking', 'dick', 'cock', 'pussy',
  'boobs', 'tits', 'cum', 'cumming', 'horny', 'make love', 'undress', 'sleep with you',
  'in bed', 'strip', 'suck', 'lick', 'touch you', 'hot body', 'kiss me', 'sensual',
  'intimate', 'erotic', 'dirty talk', 'orgasm', 'wild night', 'make out', 'breast',
  'nipples', 'groin', 'curves', 'thighs', 'spank', 'penetrate', 'erogenous',
  // Instagram 18+, thirst, hookup, and adult slang
  '18+', 'adult', 'bobs', 'vagene', 'vagina', 'penis', 'anal', 'hook up', 'hookup',
  'hooking up', 'one night stand', 'ons', 'sugar daddy', 'paid fun', 'send nudes',
  'send pic', 'show body', 'show boobs', 'show ass', 'booty', 'ass', 'butt',
  'curvy', 'thicc', 'smash', 'would smash', 'smash or pass', 'thirst', 'thirsty',
  'boner', 'cleavage', 'navel', 'item', 'pataka', 'sexy lag rahi', 'bina kapde',
  'nangi', 'nanga', 'choli', 'chuchi', 'boobies', 'milf', 'fetish', 'bed me',
  'hotel room', 'rate kya hai', 'kitna logi', 'paid dm', 'service', 'dirty', 'bed par',
  // Romanized Hindi / Hinglish adult & sensual expressions
  'choot', 'chut', 'lund', 'chudai', 'chusoge', 'chosoge', 'bistar', 'kapde utaro',
  'garam', 'garmi', 'jism', 'raat bhar', 'pappi', 'chumma', 'chuma', 'gale milo',
  'baahon me', 'badan', 'mast maal', 'figure', 'pel', 'chodo', 'bheegi', 'saath so jao',
  'chati', 'kamariya', 'nasha', 'deewana kar diya', 'lip lock', 'mast figure', 'maal lag rahi'
];

export const DEFAULT_FLIRTY_KEYWORDS = [
  'beautiful', 'cute', 'cutie', 'pretty', 'gorgeous', 'crush', 'love you', 'marry me',
  'date', 'hot', 'stunning', 'attractive', 'babe', 'baby', 'sweetheart', 'jaan',
  'meri jaan', 'sundar', 'khoobsurat', 'khubsurat', 'shona', 'tareef', 'smile',
  'deewane', 'dil', 'heart', 'dimple', 'eyes', 'aankhen', 'sweet', 'charming',
  'princess', 'queen', 'darling', 'hottie', 'bae'
];

export function analyzeIncomingText(text: string, customWords = ''): AnalysisResult {
  const clean = text.trim();
  if (!clean) {
    return {
      intent: 'normal',
      score: 0,
      matchedWords: [],
      recommendedTone: 'friendly',
      categoryLabel: 'Standard Conversation',
      explanation: 'Empty or basic text. Best handled by standard fast models.'
    };
  }

  const normalized = clean.toLowerCase();
  
  // Parse user-defined custom keywords
  const userKeywords = customWords
    .split(/[,\n]+/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 1);

  const matchedCustom: string[] = [];
  for (const word of userKeywords) {
    if (normalized.includes(word)) {
      matchedCustom.push(word);
    }
  }

  // Check for sexy/intimate keywords
  const matchedSexy: string[] = [];
  for (const word of DEFAULT_SPICY_KEYWORDS) {
    const isMultiWord = word.includes(' ');
    if (isMultiWord) {
      if (normalized.includes(word)) matchedSexy.push(word);
    } else {
      const regex = new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, 'i');
      if (regex.test(normalized)) matchedSexy.push(word);
    }
  }

  const allSexyMatches = [...new Set([...matchedCustom, ...matchedSexy])];
  if (allSexyMatches.length > 0) {
    const score = Math.min(100, 45 + allSexyMatches.length * 20);
    return {
      intent: 'sexy',
      score,
      matchedWords: allSexyMatches,
      recommendedTone: 'erotic',
      categoryLabel: '🔥 Sexy / Intimate / Dirty Talk',
      explanation: `Contains adult/intimate trigger words (${allSexyMatches.slice(0, 3).join(', ')}). Best routed to Uncensored AI (AI Horde / Stheno / Mythomax) to avoid refusals.`
    };
  }

  // Check for flirty keywords
  const matchedFlirty: string[] = [];
  for (const word of DEFAULT_FLIRTY_KEYWORDS) {
    const isMultiWord = word.includes(' ');
    if (isMultiWord) {
      if (normalized.includes(word)) matchedFlirty.push(word);
    } else {
      const regex = new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, 'i');
      if (regex.test(normalized)) matchedFlirty.push(word);
    }
  }

  if (matchedFlirty.length > 0) {
    const score = Math.min(100, 30 + matchedFlirty.length * 20);
    return {
      intent: 'flirty',
      score,
      matchedWords: matchedFlirty,
      recommendedTone: 'spicy',
      categoryLabel: '✨ Flirty / Playful Compliments',
      explanation: `Playful or romantic tone detected (${matchedFlirty.slice(0, 3).join(', ')}). Best routed to high-EQ conversational models like Groq Llama or Cloudflare AI.`
    };
  }

  return {
    intent: 'normal',
    score: 10,
    matchedWords: [],
    recommendedTone: 'playful',
    categoryLabel: '💬 Casual / Everyday Conversation',
    explanation: 'Standard conversational inquiry. Best routed to your primary fast provider (Groq / Cloudflare Workers AI).'
  };
}
