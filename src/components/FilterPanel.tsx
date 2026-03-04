import React from 'react';
import { GeneratorConfig } from '../types';
import { countDomains } from '../services/generatorService';

interface FilterPanelProps {
  config: GeneratorConfig;
  onChange: (newConfig: GeneratorConfig) => void;
  disabled: boolean;
  onGenerate: () => void;
}

const SUPPORTED_TLDS = ['cz', 'com', 'ai', 'app', 'io'];

const PATTERN_OPTIONS: {
  key: keyof GeneratorConfig;
  label: string;
  desc: string;
}[] = [
  { key: 'includeSingleLetter', label: 'x', desc: '1' },
  { key: 'includeDoubleLetter', label: 'xx', desc: '2' },
  { key: 'includeTripleLetter', label: 'xxx', desc: '3' },
  { key: 'includeQuadrupleLetter', label: 'xxxx', desc: '4' },
  { key: 'includeQuintupleLetter', label: 'xxxxx', desc: '5' },
  { key: 'includeSextupleLetter', label: 'xxxxxx', desc: '6' },
  { key: 'includeNumberNumber', label: 'yy', desc: '##' },
  { key: 'includeLetterNumber', label: 'xy', desc: 'a1' },
  { key: 'includeNumberLetter', label: 'yx', desc: '1a' },
];

export const FilterPanel: React.FC<FilterPanelProps> = ({
  config,
  onChange,
  disabled,
  onGenerate,
}) => {
  const handleChange = (key: keyof GeneratorConfig, value: unknown) => {
    onChange({ ...config, [key]: value });
  };

  const estimatedCount = countDomains(config);
  const isPatternMode = config.mode === 'patterns';

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex gap-1 p-1 bg-dark-950/60 rounded-lg">
        <button
          onClick={() => handleChange('mode', 'patterns')}
          disabled={disabled}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
            isPatternMode
              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
              : 'text-slate-500 hover:text-slate-300'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <i className="fas fa-shapes mr-1.5"></i>
          Patterns
        </button>
        <button
          onClick={() => handleChange('mode', 'wordlist')}
          disabled={disabled}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
            !isPatternMode
              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
              : 'text-slate-500 hover:text-slate-300'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <i className="fas fa-list mr-1.5"></i>
          Word List
        </button>
      </div>

      {/* TLD Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.15em]">
            Extension
          </label>
          <span className="text-[11px] text-slate-600 font-mono">
            ~{estimatedCount.toLocaleString()} domains
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUPPORTED_TLDS.map((ext) => (
            <button
              key={ext}
              onClick={() => handleChange('tld', ext)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold uppercase transition-all duration-200 ${
                config.tld === ext
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/30 scale-105'
                  : 'bg-dark-900/80 text-slate-500 hover:text-slate-300 border border-slate-700/50 hover:border-slate-600'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              .{ext}
            </button>
          ))}
        </div>
      </div>

      {isPatternMode ? (
        <>
          {/* Pattern Toggles */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.15em]">
              Patterns
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {PATTERN_OPTIONS.map(({ key, label, desc }) => (
                <label
                  key={key}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-lg cursor-pointer transition-all duration-200
                    border text-center ${
                      config[key as keyof GeneratorConfig]
                        ? 'bg-brand-500/10 border-brand-500/30 text-brand-300'
                        : 'bg-dark-900/30 border-transparent text-slate-500 hover:border-slate-700/50'
                    }
                    ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-dark-900/60'}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={config[key as keyof GeneratorConfig] as boolean}
                    onChange={(e) => handleChange(key, e.target.checked)}
                    disabled={disabled}
                    className="hidden"
                  />
                  <span className="text-xs font-mono font-bold">{label}</span>
                  <span className="text-[9px] text-slate-600">{desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Character Filters */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.15em]">
              Filters
            </label>

            {/* Starts With */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <i className="fas fa-arrow-right text-amber-500/60 text-[10px]"></i>
                <span className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider">Starts with</span>
              </div>
              <input
                type="text"
                value={config.startsWith}
                onChange={(e) => handleChange('startsWith', e.target.value)}
                disabled={disabled}
                placeholder="e.g. you → your, youth"
                className="w-full bg-dark-900/80 border border-amber-500/20 rounded-lg py-1.5 px-3 text-sm text-white
                  focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50
                  placeholder-slate-700 transition-all disabled:opacity-40"
              />
            </div>

            {/* Must Contain */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <i className="fas fa-asterisk text-brand-500/60 text-[10px]"></i>
                <span className="text-[10px] font-semibold text-brand-400/80 uppercase tracking-wider">Contains</span>
              </div>
              <input
                type="text"
                value={config.mustContain}
                onChange={(e) => handleChange('mustContain', e.target.value)}
                disabled={disabled}
                placeholder="e.g. ai → xai, aim, raid"
                className="w-full bg-dark-900/80 border border-brand-500/20 rounded-lg py-1.5 px-3 text-sm text-white
                  focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500/50
                  placeholder-slate-700 transition-all disabled:opacity-40"
              />
            </div>

            {/* Only Use */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <i className="fas fa-filter text-emerald-500/60 text-[10px]"></i>
                <span className="text-[10px] font-semibold text-emerald-400/80 uppercase tracking-wider">Only chars</span>
              </div>
              <input
                type="text"
                value={config.onlyChars}
                onChange={(e) => handleChange('onlyChars', e.target.value)}
                disabled={disabled}
                placeholder="e.g. abcde (limit alphabet)"
                className="w-full bg-dark-900/80 border border-emerald-500/20 rounded-lg py-1.5 px-3 text-sm text-white
                  focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50
                  placeholder-slate-700 transition-all disabled:opacity-40"
              />
            </div>

            {/* Exclude */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <i className="fas fa-ban text-rose-500/60 text-[10px]"></i>
                <span className="text-[10px] font-semibold text-rose-400/80 uppercase tracking-wider">Exclude</span>
              </div>
              <input
                type="text"
                value={config.excludedChars}
                onChange={(e) => handleChange('excludedChars', e.target.value)}
                disabled={disabled}
                placeholder="e.g. qxw"
                className="w-full bg-dark-900/80 border border-rose-500/20 rounded-lg py-1.5 px-3 text-sm text-white
                  focus:outline-none focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50
                  placeholder-slate-700 transition-all disabled:opacity-40"
              />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Word List Mode */}
          <div className="space-y-3">
            {/* Word List Textarea */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.15em]">
                Words (one per line)
              </label>
              <textarea
                value={config.wordList}
                onChange={(e) => handleChange('wordList', e.target.value)}
                disabled={disabled}
                placeholder="cloud&#10;smart&#10;quick&#10;data"
                rows={5}
                className="w-full bg-dark-900/80 border border-slate-700/50 rounded-lg py-2 px-3 text-sm text-white
                  focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500/50
                  placeholder-slate-700 transition-all disabled:opacity-40 resize-none font-mono"
              />
            </div>

            {/* Prefixes */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <i className="fas fa-arrow-left text-emerald-500/60 text-[10px]"></i>
                <span className="text-[10px] font-semibold text-emerald-400/80 uppercase tracking-wider">Prefixes</span>
              </div>
              <input
                type="text"
                value={config.prefixes}
                onChange={(e) => handleChange('prefixes', e.target.value)}
                disabled={disabled}
                placeholder="e.g. get, my, go (comma separated)"
                className="w-full bg-dark-900/80 border border-emerald-500/20 rounded-lg py-1.5 px-3 text-sm text-white
                  focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50
                  placeholder-slate-700 transition-all disabled:opacity-40"
              />
            </div>

            {/* Suffixes */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <i className="fas fa-arrow-right text-amber-500/60 text-[10px]"></i>
                <span className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider">Suffixes</span>
              </div>
              <input
                type="text"
                value={config.suffixes}
                onChange={(e) => handleChange('suffixes', e.target.value)}
                disabled={disabled}
                placeholder="e.g. ly, io, hub, app (comma separated)"
                className="w-full bg-dark-900/80 border border-amber-500/20 rounded-lg py-1.5 px-3 text-sm text-white
                  focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50
                  placeholder-slate-700 transition-all disabled:opacity-40"
              />
            </div>

            <p className="text-[10px] text-slate-600">
              Generates: word, prefix+word, word+suffix, prefix+word+suffix
            </p>
          </div>
        </>
      )}

      {/* Generate Button */}
      <button
        onClick={onGenerate}
        disabled={disabled}
        className={`w-full py-3 px-4 rounded-xl font-bold text-sm tracking-wide shadow-lg transition-all
          duration-200 transform active:scale-[0.97] flex items-center justify-center gap-2
          ${
            disabled
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
              : 'bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white hover:shadow-brand-500/25'
          }`}
      >
        <i className="fas fa-bolt"></i>
        <span>Generate & Reset List</span>
      </button>
    </div>
  );
};
