import { DomainResult, DomainStatus, VerificationStatus } from '../types';

export interface ExportData {
  exportedAt: string;
  tld: string;
  totalChecked: number;
  totalAvailable: number;
  domains: ExportedDomain[];
}

export interface ExportedDomain {
  name: string;
  status: string;
  verified: boolean;
  checkedAt?: string;
}

export const exportToJSON = (
  domains: DomainResult[],
  tld: string
): void => {
  const available = domains.filter(
    (d) => d.status === DomainStatus.Available &&
           d.verification !== VerificationStatus.VerifyFailed
  );

  const data: ExportData = {
    exportedAt: new Date().toISOString(),
    tld,
    totalChecked: domains.filter(d => d.status !== DomainStatus.Unknown).length,
    totalAvailable: available.length,
    domains: available.map((d) => ({
      name: d.name,
      status: d.status,
      verified: d.verification === VerificationStatus.Verified,
      checkedAt: d.checkedAt ? new Date(d.checkedAt).toISOString() : undefined,
    })),
  };

  downloadFile(
    JSON.stringify(data, null, 2),
    `domains-${tld}-${Date.now()}.json`,
    'application/json'
  );
};

export const exportToCSV = (
  domains: DomainResult[],
  tld: string
): void => {
  const available = domains.filter(
    (d) => d.status === DomainStatus.Available &&
           d.verification !== VerificationStatus.VerifyFailed
  );

  const header = 'domain,verified,checked_at';
  const rows = available.map((d) => {
    const verified = d.verification === VerificationStatus.Verified ? 'yes' : 'no';
    const checkedAt = d.checkedAt ? new Date(d.checkedAt).toISOString() : '';
    return `${d.name},${verified},${checkedAt}`;
  });

  const csv = [header, ...rows].join('\n');

  downloadFile(
    csv,
    `domains-${tld}-${Date.now()}.csv`,
    'text/csv'
  );
};

export const copyToClipboard = async (
  domains: DomainResult[]
): Promise<void> => {
  const available = domains.filter(
    (d) => d.status === DomainStatus.Available &&
           d.verification !== VerificationStatus.VerifyFailed
  );

  const text = available.map((d) => d.name).join('\n');
  await navigator.clipboard.writeText(text);
};

const downloadFile = (content: string, filename: string, type: string): void => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
