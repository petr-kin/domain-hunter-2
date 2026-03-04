import React, { useState } from 'react';
import { DomainResult, DomainStatus, AIAnalysis } from '../types';

interface DomainItemProps {
  item: DomainResult;
}

const ValuationBadge: React.FC<{ value: string }> = ({ value }) => {
  const colors: Record<string, string> = {
    Premium: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    High: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    Medium: 'bg-blue-400/15 text-blue-300 border-blue-400/30',
    Low: 'bg-slate-400/15 text-slate-400 border-slate-400/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${colors[value] || colors.Low}`}>
      {value}
    </span>
  );
};

const AFFILIATE_URL = 'https://www.namecheap.com/domains/registration/results/?domain=';

export const DomainItem: React.FC<DomainItemProps> = React.memo(({ item }) => {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tld = item.name.split('.').pop()?.toLowerCase() || '';

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

  // Minimal card for taken domains
  if (item.status === DomainStatus.Taken) {
    return (
      <div className="px-3 py-2 rounded-lg border border-slate-800/50 bg-slate-900/20 flex items-center justify-between text-xs opacity-35 hover:opacity-50 transition-opacity">
        <span className="font-mono text-slate-500 truncate">{item.name}</span>
        <i className="fas fa-times-circle text-rose-800"></i>
      </div>
    );
  }

  // Checking state
  if (item.status === DomainStatus.Checking) {
    return (
      <div className="p-4 rounded-xl border border-brand-500/20 bg-brand-500/5 relative overflow-hidden">
        <div className="absolute inset-0 scan-line"></div>
        <div className="flex justify-between items-center relative z-10">
          <h3 className="text-base font-mono font-bold text-brand-300">{item.name}</h3>
          <i className="fas fa-circle-notch fa-spin text-brand-400"></i>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-500/70 mt-1 block relative z-10">
          Checking...
        </span>
      </div>
    );
  }

  // Unknown state
  if (item.status === DomainStatus.Unknown) {
    return (
      <div className="p-4 rounded-xl border border-slate-700/40 bg-dark-900/40 hover:border-slate-600/50 transition-all">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-mono font-bold text-slate-400">{item.name}</h3>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-700">Not checked</span>
          <a
            href={tld === 'cz' ? `https://www.nic.cz/whois/domain/${item.name}/` : `https://who.is/whois/${item.name}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-slate-600 hover:text-slate-400 hover:underline transition-colors"
          >
            WHOIS
          </a>
        </div>
      </div>
    );
  }

  // Error state
  if (item.status === DomainStatus.Error) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-mono font-bold text-amber-400">{item.name}</h3>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mt-1 block">
          Check failed
        </span>
        <a
          href={tld === 'cz' ? `https://www.nic.cz/whois/domain/${item.name}/` : `https://who.is/whois/${item.name}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-amber-500 hover:underline mt-1 block"
        >
          Check WHOIS
        </a>
      </div>
    );
  }

  // Available state — main card with Buy button
  return (
    <div className="p-4 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 card-glow-available transition-all duration-300 hover:-translate-y-0.5 animate-fade-in">
      <div className="flex justify-between items-start mb-1">
        <h3 className="text-lg font-mono font-bold tracking-tight text-emerald-300">
          {item.name}
        </h3>
        <i className="fas fa-check-circle text-emerald-400 text-lg"></i>
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-500/70">
          Available
        </span>
        <a
          href={tld === 'cz' ? `https://www.nic.cz/whois/domain/${item.name}/` : `https://who.is/whois/${item.name}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-emerald-600 hover:text-emerald-400 hover:underline transition-colors"
        >
          WHOIS
        </a>
      </div>

      {/* Buy / Register Button */}
      <a
        href={`${AFFILIATE_URL}${item.name}`}
        target="_blank"
        rel="noreferrer"
        className="w-full mt-3 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-[0.97]"
      >
        <i className="fas fa-cart-shopping"></i>
        <span>Register Domain</span>
      </a>

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
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider">Value</span>
              <ValuationBadge value={analysis.valuation} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider">Brandability</span>
              <div className="flex gap-[3px]">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-3 rounded-sm transition-all ${
                      i < analysis.brandability ? 'bg-emerald-400' : 'bg-emerald-900/40'
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
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300 underline">
              retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
