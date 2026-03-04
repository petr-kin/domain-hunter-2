import { DomainResult, DomainStatus } from '../types';

export const exportToJSON = (domains: DomainResult[], tld: string): void => {
  const available = domains.filter((d) => d.status === DomainStatus.Available);
  const data = {
    exportedAt: new Date().toISOString(),
    tld,
    totalChecked: domains.filter((d) => d.status !== DomainStatus.Unknown).length,
    totalAvailable: available.length,
    domains: available.map((d) => ({
      name: d.name,
      checkedAt: d.checkedAt ? new Date(d.checkedAt).toISOString() : undefined,
    })),
  };
  downloadFile(JSON.stringify(data, null, 2), `domains-${tld}-${Date.now()}.json`, 'application/json');
};

export const exportToCSV = (domains: DomainResult[], tld: string): void => {
  const available = domains.filter((d) => d.status === DomainStatus.Available);
  const header = 'domain,checked_at';
  const rows = available.map((d) => {
    const checkedAt = d.checkedAt ? new Date(d.checkedAt).toISOString() : '';
    return `${d.name},${checkedAt}`;
  });
  downloadFile([header, ...rows].join('\n'), `domains-${tld}-${Date.now()}.csv`, 'text/csv');
};

export const copyToClipboard = async (domains: DomainResult[]): Promise<void> => {
  const available = domains.filter((d) => d.status === DomainStatus.Available);
  await navigator.clipboard.writeText(available.map((d) => d.name).join('\n'));
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
