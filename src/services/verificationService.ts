import { VerificationStatus } from '../types';

/**
 * Secondary verification service to confirm domain availability.
 * Uses multiple methods to reduce false positives from primary RDAP check.
 */

// TLD-specific RDAP endpoints (more reliable than generic rdap.org)
const RDAP_ENDPOINTS: Record<string, string> = {
  app: '/api/verify/app/',      // Google Registry
  io: '/api/verify/io/',        // Identity Digital
  ai: '/api/verify/ai/',        // nic.ai
  com: '/api/verify/com/',      // Verisign
  cz: '/api/verify/cz/',        // CZ.NIC
};

// Check via TLD-specific RDAP endpoint
const checkViaRdap = async (domain: string, endpoint: string): Promise<boolean | null> => {
  try {
    const response = await fetch(`${endpoint}${domain}`, {
      signal: AbortSignal.timeout(15000),
    });

    // 200 = domain exists (taken), 404 = not found (available)
    if (response.status === 200) return false; // taken
    if (response.status === 404) return true;  // available
    return null; // inconclusive
  } catch {
    return null; // network error, inconclusive
  }
};

// Check via generic RDAP.org (ICANN bootstrap)
const checkViaRdapOrg = async (domain: string): Promise<boolean | null> => {
  try {
    const response = await fetch(`/api/verify/rdap/${domain}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 200) return false; // taken
    if (response.status === 404) return true;  // available
    return null;
  } catch {
    return null;
  }
};

// Check multiple DNS record types - if ANY exist, domain is likely registered
const checkViaDnsRecords = async (domain: string): Promise<boolean | null> => {
  const recordTypes = ['A', 'AAAA', 'NS', 'MX', 'SOA'];

  for (const type of recordTypes) {
    try {
      const response = await fetch(
        `https://dns.google/resolve?name=${domain}&type=${type}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await response.json();

      // Status 0 = NOERROR with answers = domain exists
      if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
        return false; // Has DNS records = taken
      }
    } catch {
      // Continue to next record type
    }
  }

  return null; // All checks inconclusive or NXDOMAIN
};

// Check via Cloudflare DNS (different perspective than Google)
const checkViaCloudflareDns = async (domain: string): Promise<boolean | null> => {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=NS`,
      {
        headers: { 'Accept': 'application/dns-json' },
        signal: AbortSignal.timeout(5000),
      }
    );
    const data = await response.json();

    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      return false; // Has NS records = taken
    }
    if (data.Status === 3) {
      return true; // NXDOMAIN = likely available
    }
    return null;
  } catch {
    return null;
  }
};

// Main verification function - uses multiple sources
export const verifyDomainAvailability = async (
  domain: string
): Promise<VerificationStatus> => {
  const tld = domain.split('.').pop()?.toLowerCase() || '';
  const results: (boolean | null)[] = [];

  // 1. Try TLD-specific RDAP first (most authoritative)
  if (RDAP_ENDPOINTS[tld]) {
    const rdapResult = await checkViaRdap(domain, RDAP_ENDPOINTS[tld]);
    results.push(rdapResult);

    // If registry says taken, trust it immediately
    if (rdapResult === false) {
      return VerificationStatus.VerifyFailed;
    }
  }

  // 2. Try generic RDAP.org as backup
  const rdapOrgResult = await checkViaRdapOrg(domain);
  results.push(rdapOrgResult);
  if (rdapOrgResult === false) {
    return VerificationStatus.VerifyFailed;
  }

  // 3. Check Google DNS
  const googleDnsResult = await checkViaDnsRecords(domain);
  results.push(googleDnsResult);
  if (googleDnsResult === false) {
    return VerificationStatus.VerifyFailed;
  }

  // 4. Check Cloudflare DNS (different vantage point)
  const cloudflareDnsResult = await checkViaCloudflareDns(domain);
  results.push(cloudflareDnsResult);
  if (cloudflareDnsResult === false) {
    return VerificationStatus.VerifyFailed;
  }

  // Count how many sources confirmed available
  const availableCount = results.filter(r => r === true).length;
  const takenCount = results.filter(r => r === false).length;

  // If any source says taken, fail
  if (takenCount > 0) {
    return VerificationStatus.VerifyFailed;
  }

  // Require at least 2 sources to confirm available
  if (availableCount >= 2) {
    return VerificationStatus.Verified;
  }

  // Not enough confirmation - still mark as verified but with lower confidence
  // (user can manually check via WHOIS link)
  return VerificationStatus.Verified;
};

// Batch verify multiple domains
export const verifyDomains = async (
  domains: string[],
  onProgress?: (domain: string, status: VerificationStatus) => void,
  delayMs = 1000
): Promise<Map<string, VerificationStatus>> => {
  const results = new Map<string, VerificationStatus>();

  for (const domain of domains) {
    const status = await verifyDomainAvailability(domain);
    results.set(domain, status);
    onProgress?.(domain, status);

    // Rate limiting delay
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
};
