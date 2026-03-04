export const RDAP_ENDPOINTS: Record<string, string> = {
  cz: 'https://rdap.nic.cz/domain/',
  com: 'https://rdap.verisign.com/com/v1/domain/',
  app: 'https://rdap.nic.google/rdap/domain/',
  io: 'https://rdap.identitydigital.services/rdap/domain/',
  ai: 'https://rdap.identitydigital.services/rdap/domain/',
};

const RDAP_FALLBACK = 'https://rdap.org/domain/';

type DomainStatus = 'AVAILABLE' | 'TAKEN' | 'ERROR';

export interface CheckResult {
  domain: string;
  status: DomainStatus;
  cached: boolean;
}

export async function checkCache(kv: KVNamespace, domain: string): Promise<DomainStatus | null> {
  const taken = await kv.get(`taken:${domain}`);
  if (taken) return 'TAKEN';
  const avail = await kv.get(`avail:${domain}`);
  if (avail) return 'AVAILABLE';
  return null;
}

export async function dnsPreFilter(domain: string): Promise<boolean | null> {
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

export async function checkRdap(domain: string): Promise<DomainStatus> {
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

export async function cacheResult(kv: KVNamespace, domain: string, status: DomainStatus): Promise<void> {
  if (status === 'TAKEN') {
    await kv.put(`taken:${domain}`, '1', { expirationTtl: 30 * 24 * 60 * 60 });
  } else if (status === 'AVAILABLE') {
    await kv.put(`avail:${domain}`, '1', { expirationTtl: 24 * 60 * 60 });
  }
}

export async function checkDomain(kv: KVNamespace, domain: string): Promise<CheckResult> {
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
