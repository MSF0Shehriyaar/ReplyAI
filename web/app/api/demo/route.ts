import { secret } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const started = Date.now();
  try {
    interface DemoRequestBody {
      message?: string;
      simulatedFailover?: boolean;
      history?: Array<{ sender?: string; content?: string }>;
    }

    const body = (await request.json()) as DemoRequestBody;
    const message = (body.message || '').trim();
    const simulatedFailover = Boolean(body.simulatedFailover);
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return Response.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    // Evaluate message intent
    const lower = message.toLowerCase();
    let detectedIntent = 'general';
    if (lower.includes('sponsor') || lower.includes('collab') || lower.includes('partner') || lower.includes('media kit') || lower.includes('brand') || lower.includes('rate')) {
      detectedIntent = 'business';
    } else if (lower.includes('support') || lower.includes('help') || lower.includes('error') || lower.includes('documentation') || lower.includes('webhook') || lower.includes('bug')) {
      detectedIntent = 'support';
    } else if (lower.includes('urgent') || lower.includes('critical') || lower.includes('spike') || lower.includes('asap')) {
      detectedIntent = 'escalation';
    }

    // Retrieve active Groq key
    let groqKey: string | null = (globalThis as any).GROQ_API_KEY || (typeof process !== 'undefined' ? process.env.GROQ_API_KEY : null) || null;
    if (!groqKey) {
      try {
        groqKey = await secret('groq_key');
      } catch {
        // ignore
      }
    }

    // Handle Failover Simulator Toggle
    if (simulatedFailover) {
      await new Promise(r => setTimeout(r, 550));
      return Response.json({
        reply: `Hello! Primary gateway encountered a simulated failover condition. Message was automatically routed through our backup Google Gemini 2.5 channel. How can I assist you?`,
        providerUsed: 'Google Gemini 2.5 Flash (Failover Hook)',
        durationMs: Date.now() - started,
        tokens: 36,
        intent: detectedIntent
      });
    }

    // Call Groq Live API
    if (groqKey) {
      try {
        const systemPrompt = `You are ReplyAI, an articulate, friendly, and helpful AI engagement assistant for social platforms.
Respond to the user naturally, warmly, and concisely (1 to 2 sentences, under 40 words).
Be polite, engaging, and professional. Avoid robotic clichés like "As an AI" or repetitive boilerplate.`;

        const chatMessages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-6).map(h => ({
            role: h.sender === 'user' ? 'user' : 'assistant',
            content: h.content || ''
          })),
          { role: 'user', content: message }
        ];

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: chatMessages,
            max_tokens: 300,
            temperature: 0.7
          })
        });

        if (groqRes.ok) {
          const groqData: any = await groqRes.json();
          const reply = groqData.choices?.[0]?.message?.content?.trim();
          if (reply) {
            return Response.json({
              reply,
              providerUsed: 'Groq (GPT-OSS-120B Live API)',
              durationMs: Date.now() - started,
              tokens: groqData.usage?.total_tokens || 35,
              intent: detectedIntent
            });
          }
        }
      } catch (err) {
        console.warn('Groq live API call failed:', err);
      }
    }

    // Standard fallback
    return Response.json({
      reply: 'Hi there! Thank you for getting in touch with ReplyAI. How can we help you today?',
      providerUsed: 'ReplyAI Gateway',
      durationMs: Date.now() - started,
      tokens: 22,
      intent: detectedIntent
    });
  } catch (err: any) {
    return Response.json({
      error: err.message || 'Internal error processing demo reply'
    }, { status: 500 });
  }
}
