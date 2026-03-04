import { checkDomain } from '../../lib/checker';

interface Env {
  DOMAIN_CACHE: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let domains: string[];
  try {
    const body = await context.request.json() as { domains?: string[] };
    if (!Array.isArray(body.domains) || body.domains.length === 0) {
      return Response.json({ error: 'domains array required' }, { status: 400 });
    }
    domains = body.domains.filter(
      (d): d is string => typeof d === 'string' && d.includes('.') && d.length < 255
    );
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const kv = context.env.DOMAIN_CACHE;

  const stream = new ReadableStream({
    async start(controller) {
      for (const domain of domains) {
        try {
          const result = await checkDomain(kv, domain);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ domain, status: 'ERROR', cached: false })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
