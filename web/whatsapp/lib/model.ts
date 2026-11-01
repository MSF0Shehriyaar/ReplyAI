// ─── WhatsApp Automation — Core Types & Multi-Business Model ─────────────
// Supports any business (E-commerce, Watches, Clothing, Real Estate, Clinics, Services)
// Pre-configured with Titan Watches luxury retail defaults.

export type Channel = 'personal' | 'group';

export type WAMessage = {
  id: string;
  role: 'incoming' | 'outgoing';
  text: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact';
  mediaUrl?: string;
  at: number;
  senderName?: string;
  senderPhone?: string;
};

export type DeliveryLocation = {
  confidence?: 'low' | 'medium' | 'high';
  precision?: 'supplied' | 'rooftop' | 'interpolated' | 'area' | 'unknown';
  source?: 'customer' | 'google' | 'text';
  needsReview?: boolean;
  raw: string;
  pincode?: string;
  pincodeMissing: boolean;
  hasAddressDetails: boolean;
  street?: string;
  locality?: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  mapUrl?: string;
  directionsUrl?: string;
  formattedAddress?: string;
  verified: boolean;
  mappedAt?: number;
};

export type WAOrderItem = {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type WAOrder = {
  id: string;
  threadId: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  productId?: string;
  items?: WAOrderItem[];
  quantity?: number;
  subtotal?: number;
  discountAmount?: number;
  amount: number;
  currency: string;
  discountCode?: string;
  paymentMode: 'COD' | 'UPI' | 'Card' | 'Pending';
  paymentStatus: 'paid' | 'pending' | 'cod';
  orderStatus: 'confirmed' | 'ready_for_dispatch' | 'dispatched' | 'out_for_delivery' | 'delivered' | 'cancelled';
  deliveryLocation?: DeliveryLocation;
  courierPartner?: 'BlueDart' | 'Delhivery' | 'DTDC' | 'Dunzo' | 'Porter' | 'Standard Express';
  trackingNumber?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type CustomerProfile = {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  address?: string;
  deliveryLocation?: DeliveryLocation;
  firstContact: number;
  lastContact: number;
  totalMessages: number;
  tags: string[];
  notes: string;
  satisfaction?: number; // 1-5
  vip: boolean;
  language?: string;
  interestedProducts?: string[];
  lastOrderIntent?: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  mrp?: number;
  currency: string;
  description: string;
  features: string[];
  inStock: boolean;
  bestseller?: boolean;
  link?: string;
  image?: string;
};

export type QuickReply = {
  id: string;
  label: string;
  text: string;
  category: string;
  shortcut?: string;
  usageCount: number;
};

export type AutoReplyRule = {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: 'keyword' | 'regex' | 'intent' | 'time' | 'first_message';
  triggerValue: string;
  response: string;
  priority: number;
  channel: Channel | 'all';
  cooldownMinutes: number;
  maxUsesPerDay: number;
  usesToday: number;
};

export type EscalationRule = {
  id: string;
  name: string;
  enabled: boolean;
  condition: 'sentiment_negative' | 'keyword' | 'wait_time' | 'repeat_contact' | 'vip_customer';
  conditionValue: string;
  action: 'flag' | 'notify' | 'assign' | 'auto_reply';
  actionValue: string;
  priority: 'high' | 'urgent';
};

export type WASettings = {
  enabled: boolean;
  personalChats: boolean;
  groupChats: boolean;
  approval: boolean;
  dailyLimit: number;
  tone: 'luxury' | 'friendly' | 'consultative' | 'professional' | 'casual';
  language: 'auto' | 'English' | 'Hindi' | 'Hinglish';
  length: number; // 1=concise, 2=balanced, 3=detailed, 4=adaptive consultative
  emoji: number; // 0-100
  playfulness: number; // 0-100
  humanDelay: boolean;
  replyDelaySeconds: number;
  personalReplyDelaySeconds: number;
  groupReplyDelaySeconds: number;
  typingIndicator: boolean;
  readReceipts: boolean;

  // ── Operational & Queue Settings ─────────────────────────────────────
  maxRetries?: number;
  autoTagEnabled?: boolean;
  sentimentAnalysisEnabled?: boolean;
  ticketingEnabled?: boolean;
  graphVersion?: string;
  responseTimeTargetMinutes?: number;
  autoEscalateAfterMinutes?: number;

  // ── Business Profile (Any Business) ───────────────────────────────────
  businessName: string;
  industry: string;
  category?: string;
  businessDescription: string;
  tagline: string;
  website: string;
  storeAddress: string;
  businessHours: string;
  businessTimezone: string;
  supportEmail: string;
  supportPhone: string;

  // ── Policies & Offers ────────────────────────────────────────────────
  discountCode: string;
  discountOffer: string;
  shippingPolicy: string;
  warrantyPolicy: string;
  returnPolicy: string;
  paymentMethods: string;

  // ── Product Catalog ──────────────────────────────────────────────────
  catalog: CatalogItem[];

  // ── Messages ─────────────────────────────────────────────────────────
  welcomeMessage: string;
  awayMessage: string;
  closingMessage: string;

  quickReplies: QuickReply[];
  autoReplyRules: AutoReplyRule[];
  escalationRules: EscalationRule[];
  instructions: string;
  knowledge: string;
  examples: { incoming: string; reply: string }[];
  model: string;

  // ── Agent Persona ────────────────────────────────────────────────────
  profile: {
    name: string;
    role: string;
    bio: string;
    denyAi: boolean;
    gender: 'female' | 'male' | 'neutral';
  };
};

export const titanWatchesCatalog: CatalogItem[] = [
  {
    id: 'titan-edge-ceramic',
    name: 'Titan Edge Ceramic Midnight Black',
    category: 'Ultra Slim & Luxury',
    price: 29995,
    mrp: 32000,
    currency: 'INR',
    description: 'The slimmest ceramic watch in the world at just 4.4mm. Crafted with high-tech scratch-resistant ceramic.',
    features: ['4.4mm Ultra-Slim Case', 'Scratch-Proof Ceramic', 'Sapphire Crystal Glass', 'Swiss Quartz Movement', '30m Water Resistant'],
    inStock: true,
    bestseller: true,
    image: 'https://www.titan.co.in/dw/image/v2/BKDD_PRD/on/demandware.static/-/Sites-titan-master-catalog/default/dw0dce8e9a/images/Titan/Catalog/1696QC01_1.jpg?sw=600&sh=600',
  },
  {
    id: 'titan-grandmaster-auto',
    name: 'Titan Grandmaster Skeleton Automatic',
    category: 'Automatic & Mechanical',
    price: 19995,
    mrp: 22500,
    currency: 'INR',
    description: 'Intricately engineered open-heart skeleton mechanical movement with 24-jewel automatic precision.',
    features: ['24-Jewel Self-Winding Movement', 'Open-Heart Skeleton Dial', 'Exhibition Caseback', 'Genuine Italian Leather Strap', '50m Water Resistant'],
    inStock: true,
    bestseller: true,
    image: 'https://www.titan.co.in/dw/image/v2/BKDD_PRD/on/demandware.static/-/Sites-titan-master-catalog/default/dwbd8e8365/images/Titan/Catalog/90110WL04_1.jpg?sw=600&sh=600',
  },
  {
    id: 'titan-raga-viva',
    name: 'Titan Raga Viva Rose Gold Pearl',
    category: 'Women Luxury',
    price: 6495,
    mrp: 7200,
    currency: 'INR',
    description: 'Jewelry-inspired timepiece with mother-of-pearl dial, Swarovski crystal indices, and rose-gold metallic bracelet.',
    features: ['Mother-of-Pearl Dial', 'Rose Gold Ion Plating', 'Swarovski Crystal Indices', 'Jewelry Clasp', '2 Years Warranty'],
    inStock: true,
    bestseller: true,
    image: 'https://www.titan.co.in/dw/image/v2/BKDD_PRD/on/demandware.static/-/Sites-titan-master-catalog/default/dwaa03e7d8/images/Titan/Catalog/2608YM01_1.jpg?sw=600&sh=600',
  },
  {
    id: 'titan-octane-chrono',
    name: 'Titan Octane Hyper-Speed Chronograph',
    category: 'Sports & Chronograph',
    price: 8995,
    mrp: 9995,
    currency: 'INR',
    description: 'High-octane automotive racing chronograph with precision stopwatch sub-dials and tachymeter bezel.',
    features: ['1/10th Second Chronograph', 'Tachymeter Scale', '100m Water Resistant', 'Luminescent Hands & Markers', 'Solid Stainless Steel'],
    inStock: true,
    bestseller: false,
    image: 'https://www.titan.co.in/dw/image/v2/BKDD_PRD/on/demandware.static/-/Sites-titan-master-catalog/default/dw966f4916/images/Titan/Catalog/90086KM03J_1.jpg?sw=600&sh=600',
  },
  {
    id: 'titan-smart-pro',
    name: 'Titan Smart Pro AMOLED Luxury Smartwatch',
    category: 'Smartwatches',
    price: 7995,
    mrp: 11995,
    currency: 'INR',
    description: '1.43-inch crystal-clear AMOLED display with Bluetooth calling, built-in GPS, body temperature, and 14-day battery.',
    features: ['1.43" Vivid AMOLED Display', 'Built-in GPS & Compass', 'AI Voice Assistant & BT Calling', 'SpO2 & 24/7 Heart Rate', '14-Day Battery Life'],
    inStock: true,
    bestseller: true,
    image: 'https://www.titan.co.in/dw/image/v2/BKDD_PRD/on/demandware.static/-/Sites-titan-master-catalog/default/dw76916531/images/Titan/Catalog/90149AP01_1.jpg?sw=600&sh=600',
  },
  {
    id: 'titan-nebula-gold',
    name: 'Titan Nebula 18K Solid Gold Masterpiece',
    category: 'Solid Gold Heirloom',
    price: 145000,
    mrp: 155000,
    currency: 'INR',
    description: 'Prestigious handcrafted heirloom crafted in 18 Karat Solid Gold with certified genuine diamonds.',
    features: ['18 Karat Hallmarked Solid Gold', 'Certified VVS Diamonds', 'Sapphire Glass', 'Handcrafted Luxury Box', 'Lifetime Gold Authenticity'],
    inStock: true,
    bestseller: false,
    image: 'https://www.titan.co.in/dw/image/v2/BKDD_PRD/on/demandware.static/-/Sites-titan-master-catalog/default/dw855acd37/images/Titan/Catalog/5033DM01_1.jpg?sw=600&sh=600',
  },
  {
    id: 'titan-neo-casual',
    name: 'Titan Neo Minimalist Classic Brown',
    category: 'Daily Wear',
    price: 3495,
    mrp: 3995,
    currency: 'INR',
    description: 'Understated elegance for daily workwear. Clean sunray dial with genuine leather strap.',
    features: ['Minimal Sunray Dial', 'Genuine Leather Strap', 'Mineral Glass', '50m Water Resistance', '2 Years Warranty'],
    inStock: true,
    bestseller: false,
    image: 'https://www.titan.co.in/dw/image/v2/BKDD_PRD/on/demandware.static/-/Sites-titan-master-catalog/default/dwa8b73cd4/images/Titan/Catalog/1802QL02_1.jpg?sw=600&sh=600',
  },
];

export const waDefaults: WASettings = {
  enabled: true,
  personalChats: true,
  groupChats: false,
  approval: false,
  dailyLimit: 1000,
  tone: 'luxury',
  language: 'English',
  length: 4, // Adaptive consultative
  emoji: 35,
  playfulness: 30,
  humanDelay: true,
  replyDelaySeconds: 3,
  personalReplyDelaySeconds: 3,
  groupReplyDelaySeconds: 5,
  typingIndicator: true,
  readReceipts: true,
  maxRetries: 3,
  autoTagEnabled: true,
  sentimentAnalysisEnabled: true,
  ticketingEnabled: false,
  graphVersion: 'v21.0',
  responseTimeTargetMinutes: 5,
  autoEscalateAfterMinutes: 30,

  // Business Profile: Titan Watches
  businessName: 'Titan Watches',
  industry: 'Luxury Horology & Timepieces',
  tagline: 'Timeless Craftsmanship, Modern Innovation',
  businessDescription:
    'India’s most iconic and trusted luxury watchmaker, known for the world-record Titan Edge, Raga, Grandmaster, Octane, and Nebula timepieces.',
  website: 'https://www.titan.co.in',
  storeAddress: 'World of Titan Flagship Stores Pan-India | Online at titan.co.in',
  businessHours: '09:00-22:00',
  businessTimezone: 'Asia/Kolkata',
  supportEmail: 'customercare@titan.co.in',
  supportPhone: '+91 1800-266-0123',

  // Policies & Offers
  discountCode: 'TITAN10',
  discountOffer: 'Complimentary 10% privilege discount on prepaid orders with code TITAN10',
  shippingPolicy: 'Free Pan-India Express Delivery within 2-4 business days. Insured tamper-proof packaging.',
  warrantyPolicy: '2 Years Comprehensive International Warranty on all watches + 1 Year Battery & Plating Guarantee.',
  returnPolicy: '7-Day Hassle-Free Replacement for any transit defect or authenticity inquiry.',
  paymentMethods: 'UPI (GPay / PhonePe / Paytm), Credit / Debit Cards, Net Banking, and COD up to ₹10,000.',

  catalog: titanWatchesCatalog,

  welcomeMessage:
    'Hello! Welcome to Titan Watches ✨ I would love to help you find the perfect timepiece today. Are you looking for something for yourself or a special gift?',
  awayMessage:
    'Thank you for contacting Titan Watches! ✨ Our concierge desk is currently resting. We will connect with you first thing during store hours (09:00 AM - 10:00 PM).',
  closingMessage:
    'Thank you for choosing Titan Watches! Please feel free to reach out anytime. Have a wonderful day ahead ✨',

  quickReplies: [
    { id: '1', label: 'Titan Edge', text: 'Our Titan Edge Ceramic is the slimmest ceramic watch in the world at just 4.4mm (₹29,995). Would you like to see photos or specifications? ✨', category: 'Products', shortcut: '/edge', usageCount: 0 },
    { id: '2', label: 'Women Raga', text: 'Our Titan Raga Viva collection features rose gold finishes with Swarovski crystal accents starting from ₹6,495. It makes a stunning gift 🤍', category: 'Products', shortcut: '/raga', usageCount: 0 },
    { id: '3', label: 'Discount Code', text: 'You can use privilege code TITAN10 to enjoy 10% off on your order today! Shall I help you place this? ✨', category: 'Offers', shortcut: '/discount', usageCount: 0 },
    { id: '4', label: 'Warranty & Delivery', text: 'All Titan watches come with 2 Years International Warranty and free insured delivery within 2-4 days across India 📦', category: 'Service', shortcut: '/warranty', usageCount: 0 },
    { id: '5', label: 'Automatic / Skeleton', text: 'Our Grandmaster Skeleton Automatic (₹19,995) features a 24-jewel self-winding mechanical movement with an open-heart exhibition dial 🔥', category: 'Products', shortcut: '/auto', usageCount: 0 },
  ],

  autoReplyRules: [
    { id: '1', name: 'Welcome New Customer', enabled: true, triggerType: 'first_message', triggerValue: '', response: '', priority: 1, channel: 'all', cooldownMinutes: 1440, maxUsesPerDay: 500, usesToday: 0 },
  ],

  escalationRules: [
    { id: '1', name: 'Customer Escalation / Complaint', enabled: true, condition: 'sentiment_negative', conditionValue: 'angry', action: 'flag', actionValue: 'urgent', priority: 'urgent' },
    { id: '2', name: 'VIP Client Inquiry', enabled: true, condition: 'vip_customer', conditionValue: '', action: 'flag', actionValue: 'priority', priority: 'high' },
  ],

  instructions:
    'You are a high-end personal shopping concierge and client advisor for Titan Watches. Speak with effortless luxury, warmth, and horological expertise. When clients ask about prices or models, give exact prices in INR (₹) and highlight what makes that watch special. Always guide conversations toward helping them choose the right watch and placing an order smoothly. Match Hinglish/English naturally.',
  knowledge:
    'Titan is an iconic Tata Enterprise. Collections: Titan Edge (ultra-slim record holder), Titan Raga (feminine luxury jewelry watches), Titan Grandmaster (automatic mechanical skeleton), Titan Octane (racing chronograph), Titan Smart Pro (luxury AMOLED smartwatches), Titan Nebula (18K pure solid gold luxury line). All watches include 2-year warranty and official Titan luxury packaging.',
  examples: [
    { incoming: 'Hi, what is the price of Titan Edge?', reply: 'Hello! ✨ The Titan Edge Ceramic is priced at ₹29,995. At just 4.4mm, it is the slimmest ceramic watch in the world with sapphire crystal glass. Would you like me to share more details or help you order?' },
    { incoming: 'Looking for a gift for my sister', reply: 'That’s lovely! 🤍 I would highly recommend the Titan Raga Viva collection. It features a stunning rose gold bracelet with Swarovski crystal indices for ₹6,495. It comes in our luxury gift packaging too!' },
    { incoming: 'Do you have automatic watches?', reply: 'Yes, we do! 🔥 Our Titan Grandmaster Skeleton Automatic is ₹19,995. It has an open-heart mechanical dial with 24 jewels and an exhibition caseback. It looks incredible on the wrist.' },
  ],
  model: 'openai/gpt-oss-120b',

  profile: {
    name: 'Nina Kurain',
    role: 'Titan Luxury Timepiece Concierge',
    bio: 'Senior Client Advisor and Personal Shopping Specialist at Titan Watches. Passionate about horology, styling, and timeless craftsmanship.',
    denyAi: true,
    gender: 'female',
  },
};

export type ProviderKind = 'groq' | 'gemini' | 'xai' | 'openrouter' | 'aihorde' | 'cloudflare';

export type ProviderConnection = {
  id: string;
  label: string;
  provider: ProviderKind;
  model: string;
  verified: boolean;
  testedAt?: number;
};

export type WAConnections = {
  providers?: ProviderConnection[];
  primaryProviderId?: string;
  whatsappSaved: boolean;
  whatsappVerified: boolean;
  aiSaved: boolean;
  aiVerified: boolean;
  phoneNumberId?: string;
  businessAccountId?: string;
  displayPhoneNumber?: string;
  webhookVerifiedAt?: number;
  lastEvent?: number;
  receiverSeen: boolean;
};

export type WALog = {
  id: string;
  kind: string;
  message: string;
  created: number;
};

export type WAAnalytics = {
  totalConversations: number;
  activeConversations: number;
  resolvedToday: number;
  avgResponseTimeMs: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  topTags: { tag: string; count: number }[];
  messageVolume: { hour: number; count: number }[];
  customerSatisfaction: number;
  escalationRate: number;
};

export type WAThread = {
  id: string;
  name: string;
  phone: string;
  channel: Channel;
  status: 'open' | 'review' | 'resolved' | 'sending' | 'waiting' | 'escalated';
  takeover: boolean;
  ai: boolean;
  messages: WAMessage[];
  draft: string;
  lastInbound: number;
  recipientId: string;
  groupId?: string;
  updated: number;
  version?: number;
  flagged?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  tags: string[];
  sentiment?: 'positive' | 'neutral' | 'negative' | 'angry';
  responseTimeMs?: number;
  deliveryLocation?: DeliveryLocation;
  customerProfile?: CustomerProfile;
};

export type TursoUsageStats = {
  connected: boolean;
  provider: string;
  totalRows: number;
  tableCounts: {
    threads: number;
    orders: number;
    customers: number;
    jobs: number;
    activity: number;
    state: number;
  };
  storageEstimateKb: number;
  storageEstimateMb: string;
  health: string;
  lastChecked: number;
};

export type RegisteredBusiness = {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  category: string;
  tagline: string;
  themeColor: string; // Dynamic hex color: '#10b981', '#7354da', '#f59e0b', '#3b82f6', '#ec4899'
  createdAt: number;
  lastActive: number;
  deviceStatus: 'connected' | 'disconnected' | 'pairing';
  threadCount?: number;
  orderCount?: number;
  status: 'active' | 'suspended' | 'free' | 'vip';
  ownerEmail?: string;
};

export type WAWorkspace = {
  settings: WASettings;
  threads: WAThread[];
  orders: WAOrder[];
  connections: WAConnections;
  logs: WALog[];
  analytics: WAAnalytics;
  usage: { calls: number; tokens: number; sent: number };
  storageReady: boolean;
  tursoStats?: TursoUsageStats;
  isNinaAdmin?: boolean;
  registeredAccounts?: RegisteredBusiness[];
  activeAccountId?: string;
};

export const initialWAWorkspace: WAWorkspace = {
  settings: waDefaults,
  threads: [],
  orders: [],
  connections: {
    whatsappSaved: false,
    whatsappVerified: false,
    aiSaved: false,
    aiVerified: false,
    receiverSeen: false,
  },
  logs: [],
  analytics: {
    totalConversations: 0,
    activeConversations: 0,
    resolvedToday: 0,
    avgResponseTimeMs: 0,
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    topTags: [],
    messageVolume: [],
    customerSatisfaction: 0,
    escalationRate: 0,
  },
  usage: { calls: 0, tokens: 0, sent: 0 },
  storageReady: false,
  tursoStats: {
    connected: true,
    provider: 'Turso LibSQL (Cloud Distributed)',
    totalRows: 0,
    tableCounts: {
      threads: 0,
      orders: 0,
      customers: 0,
      jobs: 0,
      activity: 0,
      state: 0,
    },
    storageEstimateKb: 0,
    storageEstimateMb: '0.00',
    health: 'Operational (Turso LibSQL)',
    lastChecked: Date.now(),
  },
  isNinaAdmin: false,
  registeredAccounts: [],
  activeAccountId: 'biz_titan_watches',
};
