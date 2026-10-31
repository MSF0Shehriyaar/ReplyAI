import { requireWorkspaceRequest, errorResponse, generateReply, AppError, audit } from '@/lib/server';
import { z } from 'zod';

const previewSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  channel: z.enum(['dm', 'comment']).default('dm'),
  accountId: z.string().min(1).max(100).optional(),
  providerId: z.string().min(1).max(100).optional(),
  modelOverride: z.string().max(200).optional(),
  systemPrompt: z.string().max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  uncensored: z.boolean().optional(),
  postContext: z.string().max(2000).optional(),
  mediaType: z.string().max(50).optional(),
  history: z.array(z.object({
    role: z.enum(['incoming', 'outgoing']),
    text: z.string().max(1000),
    at: z.number()
  })).max(16).optional()
});

function detectRefusal(text: string): boolean {
  return /\b(i cannot (?:fulfill|assist|help|generate)|i am unable to|as an ai (?:language model|assistant)|i must refuse|against my safety guidelines|content policy)\b/i.test(text);
}

export async function POST(request: Request) {
  try {
    await requireWorkspaceRequest(request);
    const body = await request.json();
    const p = previewSchema.safeParse(body);
    if (!p.success) {
      throw new AppError('Enter a valid prompt of up to 2,000 characters.');
    }

    const { message, channel, accountId, providerId, modelOverride, systemPrompt, temperature, uncensored, postContext, mediaType, history } = p.data;
    const started = Date.now();

    const reply = await generateReply(
      message,
      channel,
      history ?? [],
      accountId,
      providerId,
      {
        uncensored: uncensored ?? true,
        systemPrompt,
        temperature,
        modelOverride,
        postContext,
        mediaType
      }
    );

    const durationMs = Date.now() - started;
    const words = reply.split(/\s+/).filter(Boolean).length;
    const estimatedTokens = Math.round(words * 1.33);
    const isRefusal = detectRefusal(reply);

    await audit(
      uncensored ? 'Uncensored test' : 'Voice test',
      `Test generated in ${(durationMs / 1000).toFixed(1)}s (${words} words)`
    );

    return Response.json({
      reply,
      durationMs,
      words,
      estimatedTokens,
      isRefusal,
      uncensored: !!uncensored,
      sent: false
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
