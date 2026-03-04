import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { DomainResult, DomainStatus, GeneratorConfig } from './types';
import { generateDomains } from './services/generatorService';
import { exportToJSON, exportToCSV, copyToClipboard } from './services/exportService';
import { FilterPanel } from './components/FilterPanel';
import { DomainItem } from './components/DomainItem';

type ViewFilter = 'all' | 'available' | 'taken';

export default function App() {
  const [config, setConfig] = useState<GeneratorConfig>({
    mode: 'patterns',
    tld: 'cz',
    includeSingleLetter: true,
    includeDoubleLetter: true,
    includeTripleLetter: false,
    includeQuadrupleLetter: false,
    includeQuintupleLetter: false,
    includeSextupleLetter: false,
    includeNumberNumber: true,
    includeLetterNumber: false,
    includeNumberLetter: false,
    excludedChars: 'q,x,w',
    onlyChars: '',
    mustContain: '',
    startsWith: '',
    wordList: '',
    suffixes: '',
    prefixes: '',
  });

  const [domains, setDomains] = useState<DomainResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ checked: 0, total: 0, available: 0, taken: 0 });
  const [viewFilter, setViewFilter] = useState<ViewFilter>('available');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleExportJSON = () => exportToJSON(domains, config.tld);
  const handleExportCSV = () => exportToCSV(domains, config.tld);
  const handleCopy = async () => {
    await copyToClipboard(domains);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const scanRef = useRef(false);
  const isInitialLoad = useRef(true);

  // Load saved data on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('domainHunterResults');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.domains?.length > 0) {
          setDomains(data.domains);
          setConfig(data.config);
          setProgress(data.progress);
          console.log(`Restored ${data.domains.length} domains from localStorage`);
        }
      }
    } catch (e) {
      console.error('Failed to load saved data:', e);
    }
    isInitialLoad.current = false;
  }, []);

  // Auto-save whenever domains change
  useEffect(() => {
    if (isInitialLoad.current || domains.length === 0) return;

    try {
      const data = { domains, config, progress, savedAt: Date.now() };
      localStorage.setItem('domainHunterResults', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  }, [domains, config, progress]);

  const clearSavedData = useCallback(() => {
    localStorage.removeItem('domainHunterResults');
    setDomains([]);
    setProgress({ checked: 0, total: 0, available: 0, taken: 0 });
  }, []);

  const handleGenerate = useCallback(() => {
    setIsScanning(false);
    scanRef.current = false;

    const generatedNames = generateDomains(config);
    const initialDomains: DomainResult[] = generatedNames.map((name) => ({
      name,
      status: DomainStatus.Unknown,
    }));

    setDomains(initialDomains);
    setProgress({ checked: 0, total: initialDomains.length, available: 0, taken: 0 });
  }, [config]);

  const startScan = useCallback(async () => {
    if (domains.length === 0) return;

    setIsScanning(true);
    scanRef.current = true;

    const unknownDomains = domains.filter((d) => d.status === DomainStatus.Unknown);
    const domainNames = unknownDomains.map((d) => d.name);

    let checkedCount = domains.filter(
      (d) => d.status !== DomainStatus.Unknown && d.status !== DomainStatus.Checking
    ).length;
    let availableCount = domains.filter((d) => d.status === DomainStatus.Available).length;
    let takenCount = domains.filter((d) => d.status === DomainStatus.Taken).length;

    // Mark all unknown as checking
    setDomains((prev) =>
      prev.map((d) =>
        d.status === DomainStatus.Unknown
          ? { ...d, status: DomainStatus.Checking }
          : d
      )
    );

    try {
      const response = await fetch('/api/check/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: domainNames }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Stream failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (scanRef.current) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6);
          try {
            const event = JSON.parse(json);
            if (event.done) break;

            const status =
              event.status === 'AVAILABLE' ? DomainStatus.Available :
              event.status === 'TAKEN' ? DomainStatus.Taken :
              DomainStatus.Error;

            setDomains((prev) =>
              prev.map((d) =>
                d.name === event.domain
                  ? { ...d, status, checkedAt: Date.now() }
                  : d
              )
            );

            checkedCount++;
            if (status === DomainStatus.Available) availableCount++;
            if (status === DomainStatus.Taken) takenCount++;

            setProgress({
              checked: checkedCount,
              total: domains.length,
              available: availableCount,
              taken: takenCount,
            });
          } catch {
            // skip malformed line
          }
        }
      }

      if (!scanRef.current) {
        reader.cancel();
      }
    } catch (err) {
      console.error('Scan error:', err);
    }

    setIsScanning(false);
    scanRef.current = false;
  }, [domains]);

  const stopScan = useCallback(() => {
    scanRef.current = false;
    setIsScanning(false);
  }, []);

  const displayDomains = useMemo(() => {
    return domains.filter((d) => {
      if (viewFilter === 'available') {
        if (progress.checked === 0) return true;
        return (
          d.status === DomainStatus.Available ||
          d.status === DomainStatus.Checking ||
          d.status === DomainStatus.Unknown ||
          d.status === DomainStatus.Error
        );
      }
      if (viewFilter === 'taken') {
        return d.status === DomainStatus.Taken;
      }
      return true;
    });
  }, [domains, viewFilter, progress.checked]);

  const progressPercent = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;
  const scanComplete = progress.checked > 0 && progress.checked >= progress.total;

  return (
    <div className="h-full flex flex-col md:flex-row bg-dark-950 text-slate-200 noise-bg">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-lg bg-dark-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white shadow-lg"
      >
        <i className={`fas ${sidebarOpen ? 'fa-times' : 'fa-bars'}`}></i>
      </button>

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 fixed md:relative z-40 w-80 lg:w-[340px] flex-none bg-dark-900/95 md:bg-dark-900/60 border-r border-slate-800/60 flex flex-col h-full overflow-y-auto transition-transform duration-300 backdrop-blur-xl`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-slate-800/40">
          <div className="flex items-center gap-2.5">
            <span className="bg-gradient-to-br from-brand-500 to-blue-600 px-2.5 py-1 rounded-lg text-xs font-black uppercase shadow-lg shadow-brand-500/20 tracking-wider">
              .{config.tld}
            </span>
            <h1 className="text-xl font-display font-extrabold text-white tracking-tight">
              Hunter
            </h1>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5 tracking-wide">
            v2.0.0 · Premium Domain Discovery
          </p>
        </div>

        {/* Config Panel */}
        <div className="p-4 flex-1 space-y-5">
          <FilterPanel
            config={config}
            onChange={setConfig}
            disabled={isScanning}
            onGenerate={handleGenerate}
          />

          {/* Scanner Status */}
          {domains.length > 0 && (
            <div className="bg-dark-950/50 p-4 rounded-xl border border-slate-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Scanner
                </h3>
                {isScanning && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                  </span>
                )}
                {scanComplete && !isScanning && (
                  <span className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider">
                    Complete
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-mono">
                  <span>
                    {progress.checked}/{progress.total}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-dark-950 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-brand-600 to-brand-400"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-dark-950/60 p-2 rounded-lg text-center border border-slate-800/30">
                  <div className="text-[9px] text-slate-600 uppercase font-bold tracking-wider">
                    Found
                  </div>
                  <div className="text-lg font-mono font-bold text-emerald-400">
                    {progress.available}
                  </div>
                </div>
                <div className="bg-dark-950/60 p-2 rounded-lg text-center border border-slate-800/30">
                  <div className="text-[9px] text-slate-600 uppercase font-bold tracking-wider">
                    Taken
                  </div>
                  <div className="text-lg font-mono font-bold text-rose-400/60">
                    {progress.taken}
                  </div>
                </div>
                <div className="bg-dark-950/60 p-2 rounded-lg text-center border border-slate-800/30">
                  <div className="text-[9px] text-slate-600 uppercase font-bold tracking-wider">
                    Checked
                  </div>
                  <div className="text-lg font-mono font-bold text-white/80">
                    {progress.checked}
                  </div>
                </div>
              </div>

              {/* Scan Controls */}
              <div className="flex gap-2">
                {!isScanning && progress.checked < domains.length && (
                  <button
                    onClick={startScan}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.97] flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-play text-[10px]"></i>
                    <span>{progress.checked > 0 ? 'Resume Scan' : 'Start Scan'}</span>
                  </button>
                )}
                {isScanning && (
                  <button
                    onClick={stopScan}
                    className="flex-1 py-2.5 bg-rose-600/80 hover:bg-rose-500 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-rose-600/20 active:scale-[0.97] flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-stop text-[10px]"></i>
                    <span>Stop</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/30 space-y-2">
          {domains.length > 0 && (
            <button
              onClick={clearSavedData}
              disabled={isScanning}
              className="w-full py-2 px-3 rounded-lg text-xs font-medium transition-all bg-dark-950/50 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800/30 hover:border-rose-500/20 disabled:opacity-40"
            >
              <i className="fas fa-trash-can mr-1.5"></i>
              Clear All Data
            </button>
          )}
          <p className="text-[10px] text-slate-700 text-center leading-relaxed">
            Authoritative RDAP · AI by Gemini 2.5 Flash
            <br />
            Auto-saves to browser · NXDOMAIN ≠ guaranteed
          </p>
        </div>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Bar */}
        <div className="h-14 border-b border-slate-800/40 bg-dark-900/40 backdrop-blur-sm flex items-center justify-between px-4 md:px-6 flex-none">
          <div className="flex items-center gap-2 ml-10 md:ml-0">
            {(['available', 'all', 'taken'] as ViewFilter[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setViewFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                  viewFilter === filter
                    ? filter === 'available'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                      : filter === 'taken'
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                      : 'bg-brand-500/15 text-brand-400 border border-brand-500/25'
                    : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                }`}
              >
                {filter === 'available' ? `Available (${progress.available})` : filter === 'taken' ? `Taken (${progress.taken})` : 'All'}
              </button>
            ))}
          </div>
          {/* Export Buttons */}
          {progress.available > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700/50 flex items-center gap-1.5"
                title="Copy domain list"
              >
                <i className={`fas ${copySuccess ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
                <span className="hidden lg:inline">{copySuccess ? 'Copied!' : 'Copy'}</span>
              </button>
              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700/50 flex items-center gap-1.5"
                title="Export as CSV"
              >
                <i className="fas fa-file-csv"></i>
                <span className="hidden lg:inline">CSV</span>
              </button>
              <button
                onClick={handleExportJSON}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700/50 flex items-center gap-1.5"
                title="Export as JSON"
              >
                <i className="fas fa-file-code"></i>
                <span className="hidden lg:inline">JSON</span>
              </button>
            </div>
          )}
        </div>

        {/* Grid Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {domains.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-brand-600/20 to-purple-600/10 flex items-center justify-center border border-brand-500/10">
                  <i className="fas fa-globe text-4xl text-brand-500/40"></i>
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                  <i className="fas fa-magnifying-glass text-emerald-500/40 text-xs"></i>
                </div>
              </div>
              <h2 className="text-lg font-display font-bold text-slate-400 mb-2">
                Ready to Hunt
              </h2>
              <p className="text-sm text-slate-600 max-w-xs leading-relaxed">
                Configure your patterns in the sidebar, then generate a domain list and start scanning for available names.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {displayDomains.map((item) => (
                  <DomainItem key={item.name} item={item} />
                ))}
              </div>
              {displayDomains.length === 0 && (
                <div className="text-center py-20 text-slate-600">
                  <i className="fas fa-filter text-3xl mb-3 block opacity-30"></i>
                  <p className="text-sm">No domains match the current filter.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
