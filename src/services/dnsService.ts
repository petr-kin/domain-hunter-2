import { DomainStatus } from '../types';

const GOOGLE_DNS_API = 'https://dns.google/resolve';

export const checkDomainAvailability = async (
  domain: string,
  signal?: AbortSignal
): Promise<DomainStatus> => {
  const tld = domain.split('.').pop()?.toLowerCase() || '';

  // Use RDAP for .cz domains (queries actual registry)
  if (tld === 'cz') {
    return checkCzDomain(domain);
  }

  // Fallback to DNS for other TLDs
  return checkViaDNS(domain, signal);
};

const checkCzDomain = async (domain: string): Promise<DomainStatus> => {
  const url = `https://rdap.nic.cz/domain/${domain}`;

  try {
    console.log(`Checking: ${url}`);

    const response = await fetch(url);

    console.log(`${domain}: status ${response.status}`);

    if (response.status === 200) {
      return DomainStatus.Taken;
    } else if (response.status === 404) {
      return DomainStatus.Available;
    } else {
      return DomainStatus.Error;
    }
  } catch (error) {
    console.error(`Fetch error for ${domain}:`, error);
    return DomainStatus.Error;
  }
};

const checkViaDNS = async (
  domain: string,
  signal?: AbortSignal
): Promise<DomainStatus> => {
  try {
    const response = await fetch(`${GOOGLE_DNS_API}?name=${domain}&type=NS`, { signal });
    if (!response.ok) {
      return DomainStatus.Error;
    }
    const data = await response.json();

    if (data.Status === 3) {
      return DomainStatus.Available;
    }
    return DomainStatus.Taken;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return DomainStatus.Unknown;
    }
    console.error(`DNS error for ${domain}:`, error);
    return DomainStatus.Error;
  }
};
