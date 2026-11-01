// ─── WhatsApp Web Client — Baileys (QR Code Scanning) ───────────────────
// Connects to WhatsApp via the multi-device Web protocol.
// User scans a QR code with their phone → linked device → receives messages.

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type BaileysEventMap,
  type WAMessageContent,
  type proto,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { join } from 'path';
import { EventEmitter } from 'events';

// ── Types ───────────────────────────────────────────────────────────────

export type ConnectionState = 'disconnected' | 'connecting' | 'qr' | 'connected';

export type WAClientEvent = {
  type: 'qr' | 'connected' | 'disconnected' | 'message';
  data?: any;
};

const dummyLogger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => dummyLogger,
};

// ── Singleton Client ────────────────────────────────────────────────────

class WhatsAppClient extends EventEmitter {
  private sock: WASocket | null = null;
  private qrCode: string = '';
  private qrDataUrl: string = '';
  private state: ConnectionState = 'disconnected';
  private connectedPhone: string = '';
  private connectedName: string = '';
  private reconnectAttempts = 0;
  private maxReconnects = 10;
  private authDir: string;
  private messageHandler: ((msg: any) => Promise<void>) | null = null;
  private isConnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  public readonly tenantId: string;

  constructor(tenantId: string = 'biz_titan_watches') {
    super();
    this.tenantId = tenantId;
    // Store auth state per tenant to guarantee complete connection & device isolation
    if (tenantId === 'biz_titan_watches') {
      this.authDir = join(process.cwd(), '.wa-auth');
    } else {
      this.authDir = join(process.cwd(), '.wa-auth', tenantId);
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  getQRCode(): string {
    return this.qrCode;
  }

  getQRDataUrl(): string {
    return this.qrDataUrl;
  }

  getConnectedPhone(): string {
    return this.connectedPhone;
  }

  getConnectedName(): string {
    return this.connectedName;
  }

  getStatus() {
    return {
      state: this.state,
      qrCode: this.qrCode,
      qrDataUrl: this.qrDataUrl,
      connectedPhone: this.connectedPhone,
      connectedName: this.connectedName,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  setMessageHandler(handler: (msg: any) => Promise<void>) {
    this.messageHandler = handler;
  }

  async connect(): Promise<void> {
    if (this.sock && this.state === 'connected') {
      return;
    }
    if (this.isConnecting) {
      return;
    }
    this.isConnecting = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }

    this.state = 'connecting';
    this.emit('state', this.state);

    try {
      const { state: authState, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion();

      const socketFactory = (makeWASocket as any).default || makeWASocket;
      const sock = socketFactory({
        version,
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, dummyLogger as any),
        },
        logger: dummyLogger as any,
        printQRInTerminal: true,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
      });
      this.sock = sock;

      // Handle credentials update
      sock.ev.on('creds.update', saveCreds);

      // Handle connection updates
      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCode = qr;
          const qrFn = (QRCode as any).toDataURL || (QRCode as any).default?.toDataURL;
          this.qrDataUrl = await qrFn(qr, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          });
          this.state = 'qr';
          this.emit('qr', { qr: this.qrCode, dataUrl: this.qrDataUrl });
          this.emit('state', this.state);
        }

        if (connection === 'close') {
          this.isConnecting = false;
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log(`[WA] Connection closed (code: ${statusCode})`);

          this.state = 'disconnected';
          this.qrCode = '';
          this.qrDataUrl = '';
          this.emit('state', this.state);

          const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 440;

          if (shouldReconnect && this.reconnectAttempts < this.maxReconnects) {
            this.reconnectAttempts++;
            console.log(`[WA] Reconnecting in 4s... (attempt ${this.reconnectAttempts})`);
            this.reconnectTimer = setTimeout(() => this.connect(), 4000);
          } else if (statusCode === DisconnectReason.loggedOut) {
            console.log('[WA] Logged out. Clear auth and scan again.');
            this.emit('logged_out');
          }
        }

        if (connection === 'open') {
          this.isConnecting = false;
          this.state = 'connected';
          this.reconnectAttempts = 0;
          this.qrCode = '';
          this.qrDataUrl = '';
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }

          // Extract connected user info
          const me = this.sock?.user;
          if (me) {
            this.connectedPhone = me.id.split(':')[0] || me.id.split('@')[0] || '';
            this.connectedName = me.name || '';
          }

          this.emit('connected', {
            phone: this.connectedPhone,
            name: this.connectedName,
          });
          this.emit('state', this.state);
          console.log(`[WA] Connected as ${this.connectedName} (${this.connectedPhone})`);
        }
      });

      // Handle incoming messages
      sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;

          const jid = msg.key.remoteJid;
          if (!jid) continue;

          // Skip status broadcasts
          if (jid === 'status@broadcast') continue;

          // Send read receipt (blue tick like a real person)
          try {
            await sock.readMessages([msg.key]);
          } catch {}

          const isGroup = jid.endsWith('@g.us');
          const senderPhone = isGroup
            ? (msg.key.participant || '').replace('@s.whatsapp.net', '')
            : jid.replace('@s.whatsapp.net', '');

          // Extract message text (unwrap ephemeral / viewOnce messages)
          let text = '';
          let mediaType: string | undefined;
          let m: any = msg.message;
          if (m?.ephemeralMessage?.message) m = m.ephemeralMessage.message;
          if (m?.viewOnceMessage?.message) m = m.viewOnceMessage.message;
          if (m?.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
          if (m?.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

          if (m.conversation) {
            text = m.conversation;
          } else if (m.extendedTextMessage?.text) {
            text = m.extendedTextMessage.text;
          } else if (m.imageMessage) {
            mediaType = 'image';
            text = m.imageMessage.caption || '[Image]';
          } else if (m.videoMessage) {
            mediaType = 'video';
            text = m.videoMessage.caption || '[Video]';
          } else if (m.audioMessage) {
            mediaType = 'audio';
            text = '[Voice Message]';
          } else if (m.documentMessage) {
            mediaType = 'document';
            text = m.documentMessage.fileName || '[Document]';
          } else if (m.stickerMessage) {
            mediaType = 'sticker';
            text = '[Sticker]';
          } else if (m.locationMessage) {
            mediaType = 'location';
            text = `[Location: ${m.locationMessage.degreesLatitude},${m.locationMessage.degreesLongitude}]`;
          } else if (m.contactMessage) {
            mediaType = 'contact';
            text = m.contactMessage.displayName || '[Contact]';
          } else if (m.buttonsResponseMessage) {
            text = m.buttonsResponseMessage.selectedDisplayText || '';
          } else if (m.listResponseMessage) {
            text = m.listResponseMessage.title || '';
          }

          if (!text) continue;

          // Get sender name
          let senderName = msg.pushName || senderPhone;
          console.log(`[WA] Incoming from ${senderName} (${senderPhone}): "${text.slice(0, 50)}"`);

          const event = {
            id: msg.key.id || crypto.randomUUID(),
            jid,
            senderPhone,
            senderName,
            text: text.slice(0, 2000),
            mediaType,
            isGroup,
            groupId: isGroup ? jid : undefined,
            timestamp: (msg.messageTimestamp as number) * 1000 || Date.now(),
            rawKey: msg.key,
          };

          // Pass to handler
          try {
            if (this.messageHandler) {
              await this.messageHandler({ ...event, tenantId: this.tenantId });
            } else {
              const { handleIncomingMessage } = await import('./message-handler');
              await handleIncomingMessage(event);
            }
          } catch (e) {
            console.error('[WA] Message handler error:', e);
          }

          this.emit('message', event);
        }
      });
    } catch (e) {
      console.error('[WA] Connection error:', e);
      this.state = 'disconnected';
      this.emit('state', this.state);
    }
  }

  async disconnect(): Promise<void> {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
    this.state = 'disconnected';
    this.qrCode = '';
    this.qrDataUrl = '';
    this.connectedPhone = '';
    this.connectedName = '';
    this.emit('state', this.state);
  }

  async logout(): Promise<void> {
    if (this.sock) {
      await this.sock.logout();
      this.sock = null;
    }
    this.state = 'disconnected';
    this.qrCode = '';
    this.qrDataUrl = '';
    this.connectedPhone = '';
    this.connectedName = '';

    // Clean auth files
    const fs = await import('fs');
    if (fs.existsSync(this.authDir)) {
      fs.rmSync(this.authDir, { recursive: true, force: true });
    }

    this.emit('state', this.state);
  }

  async sendMessage(jid: string, text: string): Promise<string> {
    // Wait briefly if currently connecting
    if (this.state === 'connecting') {
      console.log('[WA] ⏳ Waiting for connection before sending message...');
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (this.isConnected()) break;
      }
    }

    if (!this.sock || this.state !== 'connected') {
      console.error(`[WA] Cannot send message: state=${this.state}, sock=${!!this.sock}`);
      throw new Error('WhatsApp not connected. Scan QR code first.');
    }

    let targetJid = jid.trim().replace(/^wa:/, '');

    // Strip device specifier (:1, :2, etc.) from WhatsApp individual JID
    if (targetJid.includes('@s.whatsapp.net')) {
      targetJid = targetJid.replace(/:.*@s\.whatsapp\.net/, '@s.whatsapp.net');
    } else if (targetJid.includes('@lid')) {
      targetJid = targetJid.replace(/:.*@lid/, '@lid');
    } else if (!targetJid.includes('@')) {
      targetJid = targetJid.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    }

    console.log(`[WA] 📤 Sending to ${targetJid}: "${text.slice(0, 50)}..."`);

    // Natural human typing indicator
    try {
      await this.sock.sendPresenceUpdate('composing', targetJid);
      const typingDelay = Math.min(Math.max(text.length * 35, 1200), 3500);
      await new Promise((r) => setTimeout(r, typingDelay));
      await this.sock.sendPresenceUpdate('paused', targetJid);
    } catch {}

    const result = await this.sock.sendMessage(targetJid, { text });
    console.log(`[WA] ✅ Message delivered to socket, id: ${result?.key?.id}`);
    return result?.key?.id || '';
  }

  async sendLocation(
    jid: string,
    degreesLatitude: number,
    degreesLongitude: number,
    name?: string,
    address?: string
  ): Promise<string> {
    console.log(`[WA] 📍 sendLocation disabled: location is displayed in admin dashboard radar only.`);
    return '';
  }

  async sendMessageToPhone(phone: string, text: string): Promise<string> {
    return this.sendMessage(phone, text);
  }

  isConnected(): boolean {
    return this.state === 'connected' && !!this.sock;
  }
}

// ── Multi-Tenant Client Manager (stored on globalThis for Next.js) ──────

const globalForWA = globalThis as unknown as {
  __waClients?: Map<string, WhatsAppClient>;
};

export function getWhatsAppClient(tenantId: string = 'biz_titan_watches'): WhatsAppClient {
  if (!globalForWA.__waClients) {
    globalForWA.__waClients = new Map<string, WhatsAppClient>();
  }
  let client = globalForWA.__waClients.get(tenantId);
  if (!client) {
    client = new WhatsAppClient(tenantId);
    globalForWA.__waClients.set(tenantId, client);
  }
  return client;
}

export { WhatsAppClient };

