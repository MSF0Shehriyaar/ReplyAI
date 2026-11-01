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
  structuredAddress?: DeliveryAddress;
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

export type DeliveryAddress={fullName:string;phone:string;alternatePhone?:string;line1:string;line2:string;locality:string;landmark?:string;city:string;state:string;pincode:string;country:'India';type:'home'|'work'|'other';instructions?:string;coordinates?:{lat:number;lng:number;accuracy:number}};
export type CatalogPublication={slug:string;published:boolean;url:string};

export type WAOrderItem = {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type WAOrder = {
  checkoutId?:string;
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
  categories?:string[];
  catalogCheckoutRequired?:boolean;
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

export const waDefaults:WASettings={
  categories:[],catalogCheckoutRequired:true,
  enabled:false,personalChats:true,groupChats:false,approval:true,dailyLimit:100,tone:'friendly',language:'auto',length:2,emoji:0,playfulness:0,humanDelay:false,replyDelaySeconds:0,personalReplyDelaySeconds:0,groupReplyDelaySeconds:0,typingIndicator:false,readReceipts:false,
  maxRetries:3,autoTagEnabled:true,sentimentAnalysisEnabled:true,ticketingEnabled:false,graphVersion:'v21.0',responseTimeTargetMinutes:5,autoEscalateAfterMinutes:30,
  businessName:'Business workspace',industry:'',businessDescription:'',tagline:'',website:'',storeAddress:'',businessHours:'09:00-18:00',businessTimezone:'Asia/Kolkata',supportEmail:'',supportPhone:'',
  discountCode:'',discountOffer:'',shippingPolicy:'',warrantyPolicy:'',returnPolicy:'',paymentMethods:'',catalog:[],quickReplies:[],autoReplyRules:[],escalationRules:[],
  welcomeMessage:'Welcome! How can we help?',awayMessage:'We will respond during business hours.',closingMessage:'Thank you for contacting us.',instructions:'',knowledge:'',examples:[],model:'openai/gpt-oss-120b',
  profile:{name:'Support',role:'Customer support',bio:'',denyAi:false,gender:'neutral'},
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
  catalogPublication?:CatalogPublication;
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
  userRole?:'master_admin'|'business_admin'|'business_operator';
  queue?:{pending:number;processing:number;failed:number;done:number};
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
  activeAccountId: undefined,
};
