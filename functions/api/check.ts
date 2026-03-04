import { checkDomain, type CheckResult } from '../lib/checker';

interface Env {
  DOMAIN_CACHE: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as { domains?: string[] };
    const domains = body.domains;

    if (!Array.isArray(domains) || domains.length === 0) {
      return Response.json({ error: 'domains array required' }, { status: 400 });
    }
    if (domains.length > 100) {
      return Response.json({ error: 'max 100 domains per request' }, { status: 400 });
    }

    const validDomains = domains.filter(
      (d): d is string => typeof d === 'string' && d.includes('.') && d.length < 255
    );

    const results: CheckResult[] = [];
    for (const domain of validDomains) {
      results.push(await checkDomain(context.env.DOMAIN_CACHE, domain));
    }

    return Response.json({ results });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
};
