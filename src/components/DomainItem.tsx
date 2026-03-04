import React, { useState } from 'react';
import { DomainResult, DomainStatus, AIAnalysis, VerificationStatus } from '../types';
import { verifyDomainAvailability } from '../services/verificationService';

interface DomainItemProps {
  item: DomainResult;
  onStatusChange?: (name: string, status: DomainStatus) => void;
  onVerificationChange?: (name: string, verification: VerificationStatus) => void;
}

const ValuationBadge: React.FC<{ value: string }> = ({ value }) => {
  const colors: Record<string, string> = {
    Premium: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    High: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    Medium: 'bg-blue-400/15 text-blue-300 border-blue-400/30',
    Low: 'bg-slate-400/15 text-slate-400 border-slate-400/20',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
        colors[value] || colors.Low
      }`}
    >
      {value}
    </span>
  );
};

export const DomainItem: React.FC<DomainItemProps> = React.memo(({ item, onStatusChange, onVerificationChange }) => {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<DomainStatus>(item.status);
  const [localVerification, setLocalVerification] = useState<VerificationStatus | undefined>(item.verification);

  const tld = item.name.split('.').pop()?.toLowerCase() || '';

  const handleVerify = async () => {
    if (verifying) return;
    setVerifying(true);
    setLocalVerification(VerificationStatus.Verifying);

    try {
      const result = await verifyDomainAvailability(item.name);
      setLocalVerification(result);
      onVerificationChange?.(item.name, result);

      // If verification failed, update status to Taken
      if (result === VerificationStatus.VerifyFailed) {
        setLocalStatus(DomainStatus.Taken);
        onStatusChange?.(item.name, DomainStatus.Taken);
      }
    } catch (err) {
      console.error('Verification failed:', err);
      setLocalVerification(VerificationStatus.Unverified);
    } finally {
      setVerifying(false);
    }
  };

  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);

    // RDAP endpoints via proxy (avoids rate limiting)
    // Note: .ai and .io use DNS fallback (no reliable RDAP)
    const rdapEndpoints: Record<string, string> = {
      cz: '/api/rdap/cz/',
      com: '/api/rdap/com/',
      app: '/api/rdap/app/',
    };

    try {
      let newStatus: DomainStatus;

      if (rdapEndpoints[tld]) {
        let retries = 3;
        let response: Response | null = null;

        while (retries > 0) {
          response = await fetch(`${rdapEndpoints[tld]}${item.name}`);
          if (response.status !== 503 && response.status !== 429) break;
          retries--;
          if (retries > 0) {
            console.log(`Rate limited, waiting 15s...`);
            await new Promise(r => setTimeout(r, 15000));
          }
        }

        newStatus = response?.status === 200 ? DomainStatus.Taken :
                    response?.status === 404 ? DomainStatus.Available :
                    DomainStatus.Error;
      } else {
        // Fallback to DNS for TLDs without RDAP (.io, etc)
        const response = await fetch(`https://dns.google/resolve?name=${item.name}&type=NS`);
        const data = await response.json();
        newStatus = data.Status === 3 ? DomainStatus.Available : DomainStatus.Taken;
      }

      setLocalStatus(newStatus);
      onStatusChange?.(item.name, newStatus);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Check failed:', errorMsg, err);
      setError(errorMsg);
      setLocalStatus(DomainStatus.Error);
    } finally {
      setChecking(false);
    }
  };

  const handleAnalyze = async () => {
    if (analyzing || analysis) return;
    setAnalyzing(true);
    setError(null);
    try {
      const { analyzeDomain } = await import('../services/geminiService');
      const result = await analyzeDomain(item.name);
      setAnalysis(result);
    } catch {
      setError('AI analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  const displayStatus = localStatus !== DomainStatus.Unknown ? localStatus : item.status;

  // Minimal card for taken domains
  if (displayStatus === DomainStatus.Taken) {
    return (
      <div className="px-3 py-2 rounded-lg border border-slate-800/50 bg-slate-900/20 flex items-center justify-between text-xs opacity-35 hover:opacity-50 transition-opacity">
        <span className="font-mono text-slate-500 truncate">{item.name}</span>
        <i className="fas fa-times-circle text-rose-800"></i>
      </div>
    );
  }

  // Checking state
  if (checking || displayStatus === DomainStatus.Checking) {
    return (
      <div className="p-4 rounded-xl border border-brand-500/20 bg-brand-500/5 relative overflow-hidden">
        <div className="absolute inset-0 scan-line"></div>
        <div className="flex justify-between items-center relative z-10">
          <h3 className="text-base font-mono font-bold text-brand-300">
            {item.name}
          </h3>
          <i className="fas fa-circle-notch fa-spin text-brand-400"></i>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-500/70 mt-1 block relative z-10">
          Checking...
        </span>
      </div>
    );
  }

  // Unknown state - show Check button
  if (displayStatus === DomainStatus.Unknown) {
    return (
      <div className="p-4 rounded-xl border border-slate-700/40 bg-dark-900/40 hover:border-slate-600/50 transition-all">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-mono font-bold text-slate-400">
            {item.name}
          </h3>
          <button
            onClick={handleCheck}
            className="px-2 py-1 bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 rounded text-xs font-semibold transition-all"
          >
            Check
          </button>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">
            Not checked
          </span>
          <a
            href={tld === 'cz' ? `https://www.nic.cz/whois/domain/${item.name}/` : `https://who.is/whois/${item.name}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-slate-600 hover:text-slate-400 hover:underline transition-colors"
          >
            WHOIS ↗
          </a>
        </div>
      </div>
    );
  }

  // Error state
  if (displayStatus === DomainStatus.Error) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-mono font-bold text-amber-400">
            {item.name}
          </h3>
          <button
            onClick={handleCheck}
            className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded text-xs font-semibold transition-all"
          >
            Retry
          </button>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mt-1 block">
          {error || 'Check failed'}
        </span>
        <a
          href={tld === 'cz' ? `https://www.nic.cz/whois/domain/${item.name}/` : `https://who.is/whois/${item.name}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-amber-500 hover:underline mt-1 block"
        >
          Check WHOIS ↗
        </a>
      </div>
    );
  }

  // Verification badge component
  const VerificationBadge = () => {
    if (localVerification === VerificationStatus.Verified) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
          <i className="fas fa-shield-check"></i>
          Verified
        </span>
      );
    }
    if (localVerification === VerificationStatus.Verifying) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-400">
          <i className="fas fa-circle-notch fa-spin"></i>
          Verifying...
        </span>
      );
    }
    if (localVerification === VerificationStatus.VerifyFailed) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">
          <i className="fas fa-times-circle"></i>
          Not Available
        </span>
      );
    }
    return null;
  };

  // Available state — the main card
  const isVerified = localVerification === VerificationStatus.Verified;
  const isVerifyFailed = localVerification === VerificationStatus.VerifyFailed;

  return (
    <div className={`p-4 rounded-xl border-2 transition-all duration-300 hover:-translate-y-0.5 animate-fade-in ${
      isVerified
        ? 'border-emerald-400/50 bg-emerald-500/10 card-glow-available'
        : isVerifyFailed
        ? 'border-rose-500/30 bg-rose-500/5'
        : 'border-emerald-500/30 bg-emerald-500/5 card-glow-available'
    }`}>
      <div className="flex justify-between items-start mb-1">
        <h3 className={`text-lg font-mono font-bold tracking-tight ${
          isVerifyFailed ? 'text-rose-300' : 'text-emerald-300'
        }`}>
          {item.name}
        </h3>
        {isVerified ? (
          <i className="fas fa-shield-check text-emerald-400 text-lg"></i>
        ) : isVerifyFailed ? (
          <i className="fas fa-times-circle text-rose-400 text-lg"></i>
        ) : (
          <i className="fas fa-check-circle text-emerald-400 text-lg"></i>
        )}
      </div>

      <div className="flex items-center justify-between mt-1">
        {localVerification ? (
          <VerificationBadge />
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-500/70">
            Available
          </span>
        )}
        <a
          href={tld === 'cz' ? `https://www.nic.cz/whois/domain/${item.name}/` : `https://who.is/whois/${item.name}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-emerald-600 hover:text-emerald-400 hover:underline transition-colors"
        >
          WHOIS ↗
        </a>
      </div>

      {/* Verify Button - only show if not yet verified */}
      {!localVerification && !isVerifyFailed && (
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="w-full mt-3 py-2 px-3 bg-brand-500/10 hover:bg-brand-500/20 text-brand-300 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-brand-500/10 hover:border-brand-500/20 disabled:opacity-50"
        >
          <i className={`fas ${verifying ? 'fa-circle-notch fa-spin' : 'fa-shield-check'}`}></i>
          <span>{verifying ? 'Verifying...' : 'Verify Availability'}</span>
        </button>
      )}

      {/* AI Analysis Section */}
      <div className="mt-3 pt-3 border-t border-dashed border-emerald-500/20">
        {!analysis && !analyzing && !error && (
          <button
            onClick={handleAnalyze}
            className="w-full py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 border border-emerald-500/10 hover:border-emerald-500/20"
          >
            <i className="fas fa-wand-magic-sparkles"></i>
            <span>AI Analyze</span>
          </button>
        )}

        {analyzing && (
          <div className="text-center py-3 text-emerald-400 text-xs">
            <i className="fas fa-brain fa-bounce mr-2"></i>
            <span className="animate-pulse">Analyzing...</span>
          </div>
        )}

        {analysis && (
          <div className="space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider">
                Value
              </span>
              <ValuationBadge value={analysis.valuation} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider">
                Brandability
              </span>
              <div className="flex gap-[3px]">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-3 rounded-sm transition-all ${
                      i < analysis.brandability
                        ? 'bg-emerald-400'
                        : 'bg-emerald-900/40'
                    }`}
                  ></div>
                ))}
              </div>
            </div>

            <div className="bg-emerald-900/20 p-2.5 rounded-lg border border-emerald-500/10 space-y-2">
              <p className="text-[11px] text-emerald-200/70 italic leading-relaxed">
                "{analysis.reasoning}"
              </p>
              <div className="flex flex-wrap gap-1">
                {analysis.niche.map((n) => (
                  <span
                    key={n}
                    className="px-1.5 py-0.5 bg-emerald-500/10 rounded text-[9px] uppercase font-semibold text-emerald-400/80 tracking-wide"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-400/70 text-xs text-center py-2 flex items-center justify-center gap-1.5">
            <i className="fas fa-exclamation-circle"></i>
            <span>{error}</span>
            <button
              onClick={() => {
                setError(null);
              }}
              className="ml-2 text-red-400 hover:text-red-300 underline"
            >
              retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
