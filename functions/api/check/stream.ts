interface Env {
  DOMAIN_CACHE: KVNamespace;
}

const RDAP_ENDPOINTS: Record<string, string> = {
  cz: 'https://rdap.nic.cz/domain/',
  com: 'https://rdap.verisign.com/com/v1/domain/',
  app: 'https://rdap.nic.google/rdap/domain/',
  io: 'https://rdap.identitydigital.services/rdap/domain/',
  ai: 'https://rdap.identitydigital.services/rdap/domain/',
};

const RDAP_FALLBACK = 'https://rdap.org/domain/';

type DomainStatus = 'AVAILABLE' | 'TAKEN' | 'ERROR';

async function checkCache(kv: KVNamespace, domain: string): Promise<DomainStatus | null> {
  const taken = await kv.get(`taken:${domain}`);
  if (taken) return 'TAKEN';
  const avail = await kv.get(`avail:${domain}`);
  if (avail) return 'AVAILABLE';
  return null;
}

async function dnsPreFilter(domain: string): Promise<boolean | null> {
  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=NS`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data: any = await response.json();
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) return true;
    if (data.Status === 3) return false;
    return null;
  } catch {
    return null;
  }
}

async function checkRdap(domain: string): Promise<DomainStatus> {
  const tld = domain.split('.').pop()?.toLowerCase() || '';
  const endpoint = RDAP_ENDPOINTS[tld] || RDAP_FALLBACK;
  try {
    const response = await fetch(`${endpoint}${domain}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/rdap+json' },
    });
    if (response.status === 200) return 'TAKEN';
    if (response.status === 404) return 'AVAILABLE';
    return 'ERROR';
  } catch {
    return 'ERROR';
  }
}

async function cacheResult(kv: KVNamespace, domain: string, status: DomainStatus): Promise<void> {
  if (status === 'TAKEN') {
    await kv.put(`taken:${domain}`, '1', { expirationTtl: 30 * 24 * 60 * 60 });
  } else if (status === 'AVAILABLE') {
    await kv.put(`avail:${domain}`, '1', { expirationTtl: 24 * 60 * 60 });
  }
}

async function checkDomain(kv: KVNamespace, domain: string): Promise<{ domain: string; status: DomainStatus; cached: boolean }> {
  const cached = await checkCache(kv, domain);
  if (cached) return { domain, status: cached, cached: true };

  const dnsTaken = await dnsPreFilter(domain);
  if (dnsTaken === true) {
    await cacheResult(kv, domain, 'TAKEN');
    return { domain, status: 'TAKEN', cached: false };
  }

  const rdapStatus = await checkRdap(domain);
  if (rdapStatus !== 'ERROR') {
    await cacheResult(kv, domain, rdapStatus);
  }

  return { domain, status: rdapStatus, cached: false };
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
