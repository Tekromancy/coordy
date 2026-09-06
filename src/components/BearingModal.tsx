'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  parseCoordinate, 
  calculateGeographicBearing, 
  calculatePlanarBearing, 
  CalculationMode,
  CARDINAL_POINTS,
  isWhat3WordsFormat
} from '@/lib/bearing';
import { 
  Compass, 
  ArrowRight, 
  ArrowUpDown, 
  Globe, 
  MapPin, 
  Info, 
  Check, 
  Copy, 
  Layers,
  X,
  Key,
  Loader2,
  Sparkles
} from 'lucide-react';

interface Preset {
  name: string;
  p1: string;
  p2: string;
  note: string;
}

const PRESETS: Preset[] = [
  {
    name: 'Austin to Dallas (Texas)',
    p1: '30.2672, -97.7431',
    p2: '32.7767, -96.7970',
    note: 'North-Northeast heading ~18°',
  },
  {
    name: 'what3words: London (Trafalgar to Eye)',
    p1: 'filled.count.soap',
    p2: 'daring.lion.race',
    note: 'London Landmark 3 words',
  },
  {
    name: 'London to Paris',
    p1: '51.5074, -0.1278',
    p2: '48.8566, 2.3522',
    note: 'South-Southeast heading ~149°',
  },
  {
    name: 'New York to Tokyo',
    p1: '40.7128, -74.0060',
    p2: '35.6762, 139.6503',
    note: 'Great Circle Northwest ~337°',
  },
];

interface BearingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPointA?: string;
  initialPointB?: string;
}

export default function BearingModal({
  isOpen,
  onClose,
  initialPointA = '30.2672, -97.7431',
  initialPointB = '32.7767, -96.7970',
}: BearingModalProps) {
  const [coord1Str, setCoord1Str] = useState(initialPointA);
  const [coord2Str, setCoord2Str] = useState(initialPointB);
  const [mode, setMode] = useState<CalculationMode>('geographic');
  const [copied, setCopied] = useState(false);

  // what3words integration state
  const [w3wKey, setW3wKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [resolving1, setResolving1] = useState(false);
  const [resolving2, setResolving2] = useState(false);
  const [w3wError1, setW3wError1] = useState<string | null>(null);
  const [w3wError2, setW3wError2] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('coordy_w3w_key');
      if (stored) setW3wKey(stored);
    }
  }, []);

  useEffect(() => {
    if (initialPointA) setCoord1Str(initialPointA);
    if (initialPointB) setCoord2Str(initialPointB);
  }, [initialPointA, initialPointB, isOpen]);

  const parsedP1 = useMemo(() => parseCoordinate(coord1Str), [coord1Str]);
  const parsedP2 = useMemo(() => parseCoordinate(coord2Str), [coord2Str]);

  const isW3w1 = useMemo(() => isWhat3WordsFormat(coord1Str), [coord1Str]);
  const isW3w2 = useMemo(() => isWhat3WordsFormat(coord2Str), [coord2Str]);

  const result = useMemo(() => {
    if (!parsedP1 || !parsedP2) return null;
    if (mode === 'geographic') {
      return calculateGeographicBearing(parsedP1, parsedP2);
    } else {
      return calculatePlanarBearing(parsedP1, parsedP2);
    }
  }, [parsedP1, parsedP2, mode]);

  if (!isOpen) return null;

  const handleSaveKey = (val: string) => {
    setW3wKey(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('coordy_w3w_key', val);
    }
  };

  const resolveW3w = async (field: 1 | 2) => {
    const raw = field === 1 ? coord1Str : coord2Str;
    const setResolving = field === 1 ? setResolving1 : setResolving2;
    const setError = field === 1 ? setW3wError1 : setW3wError2;
    const setCoord = field === 1 ? setCoord1Str : setCoord2Str;

    setError(null);
    setResolving(true);

    try {
      const cleaned = raw
        .trim()
        .replace(/^[\/\s]+/, '')
        .split(/[\s.]+/)
        .filter(Boolean)
        .join('.');

      const apiKey = w3wKey || process.env.NEXT_PUBLIC_WHAT3WORDS_API_KEY;

      if (!apiKey) {
        setShowKeyInput(true);
        setError('what3words API key needed to convert words to coordinates.');
        return;
      }

      const res = await fetch(
        `https://api.what3words.com/v2/convert-to-coordinates?words=${encodeURIComponent(cleaned)}&key=${encodeURIComponent(apiKey)}`
      );
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error?.message || data.error || 'Failed to resolve what3words address');
        return;
      }

      setCoord(`${data.coordinates.lat.toFixed(6)}, ${data.coordinates.lng.toFixed(6)}`);
    } catch {
      setError('Network error contacting what3words API.');
    } finally {
      setResolving(false);
    }
  };

  const handleSwap = () => {
    const temp = coord1Str;
    setCoord1Str(coord2Str);
    setCoord2Str(temp);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUseLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoord1Str(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        },
        (err) => {
          alert('Could not retrieve geolocation: ' + err.message);
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/70 rounded-2xl shadow-2xl overflow-y-auto flex flex-col text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Compass className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                Bearing Calculator & Compass
              </h2>
              <p className="text-xs text-slate-400">Supports lat/lon, 2D vectors & what3words (///word.word.word)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <div className="hidden sm:flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
              <button
                onClick={() => setMode('geographic')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all ${
                  mode === 'geographic'
                    ? 'bg-blue-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Geographic</span>
              </button>
              <button
                onClick={() => setMode('planar')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all ${
                  mode === 'planar'
                    ? 'bg-blue-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Planar 2D</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Optional what3words API Key banner / toggle */}
        <div className="px-6 pt-3">
          <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800 px-3 py-2 rounded-xl text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="font-semibold text-rose-400 font-mono">{'///'}</span>
              <span>what3words Integration: Enter 3 words like <code className="text-sky-300">filled.count.soap</code></span>
            </div>
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="text-[11px] text-slate-400 hover:text-sky-400 flex items-center gap-1 transition-colors"
            >
              <Key className="w-3 h-3" />
              <span>{w3wKey ? 'API Key Configured' : 'Set API Key'}</span>
            </button>
          </div>

          {showKeyInput && (
            <div className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col gap-1.5 text-xs animate-in fade-in">
              <label className="text-[11px] text-slate-300 font-medium">
                what3words API Key (saved locally in your browser):
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={w3wKey}
                  onChange={(e) => handleSaveKey(e.target.value)}
                  placeholder="Paste your free or commercial API key from what3words.com"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => setShowKeyInput(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs"
                >
                  Done
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                You can get an API key from <a href="https://what3words.com/select-plan" target="_blank" rel="noreferrer" className="text-sky-400 underline">what3words.com</a>. You can also configure <code>WHAT3WORDS_API_KEY</code> on your server environment.
              </p>
            </div>
          )}
        </div>

        {/* Modal Content */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Inputs & Presets */}
          <div className="md:col-span-6 flex flex-col gap-4">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-5 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  Coordinates / Locations
                </h3>
                <button
                  onClick={handleSwap}
                  title="Swap Point A and Point B"
                  className="text-xs text-slate-400 hover:text-blue-400 flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/60 rounded-md transition-colors border border-slate-700/50"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  Swap
                </button>
              </div>

              {/* Point 1 */}
              <div className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Starting Point (Point A)
                  </label>
                  <button
                    onClick={handleUseLocation}
                    className="text-[11px] text-sky-400 hover:underline"
                  >
                    Use GPS
                  </button>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={coord1Str}
                    onChange={(e) => {
                      setCoord1Str(e.target.value);
                      setW3wError1(null);
                    }}
                    placeholder="e.g. 30.2672, -97.7431 or ///filled.count.soap"
                    className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm focus:outline-none transition-all ${
                      parsedP1
                        ? 'border-slate-700 focus:border-blue-500'
                        : isW3w1
                        ? 'border-indigo-500/80 focus:border-indigo-400'
                        : 'border-rose-500/50 focus:border-rose-500'
                    }`}
                  />
                  {isW3w1 && (
                    <button
                      onClick={() => resolveW3w(1)}
                      disabled={resolving1}
                      className="absolute right-1.5 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-semibold flex items-center gap-1 shadow"
                    >
                      {resolving1 ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>Convert 3 words</span>
                    </button>
                  )}
                </div>
                {parsedP1 ? (
                  <div className="mt-1 text-[11px] text-slate-400 flex gap-3">
                    <span>{mode === 'geographic' ? 'Lat:' : 'Y:'} <strong className="text-slate-200">{parsedP1.lat.toFixed(5)}</strong></span>
                    <span>{mode === 'geographic' ? 'Lon:' : 'X:'} <strong className="text-slate-200">{parsedP1.lon.toFixed(5)}</strong></span>
                  </div>
                ) : isW3w1 ? (
                  <p className="mt-1 text-[11px] text-indigo-400 flex items-center gap-1">
                    <span>Detected what3words address. Click &quot;Convert 3 words&quot; to fetch coordinates.</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-rose-400">Invalid coordinate or 3-word format</p>
                )}
                {w3wError1 && (
                  <p className="mt-1 text-[11px] text-rose-400 font-medium">{w3wError1}</p>
                )}
              </div>

              <div className="flex items-center justify-center my-0.5 text-slate-600">
                <ArrowRight className="w-3.5 h-3.5 transform rotate-90 md:rotate-0" />
              </div>

              {/* Point 2 */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Target Point (Point B)
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={coord2Str}
                    onChange={(e) => {
                      setCoord2Str(e.target.value);
                      setW3wError2(null);
                    }}
                    placeholder="e.g. 32.7767, -96.7970 or ///daring.lion.race"
                    className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm focus:outline-none transition-all ${
                      parsedP2
                        ? 'border-slate-700 focus:border-blue-500'
                        : isW3w2
                        ? 'border-indigo-500/80 focus:border-indigo-400'
                        : 'border-rose-500/50 focus:border-rose-500'
                    }`}
                  />
                  {isW3w2 && (
                    <button
                      onClick={() => resolveW3w(2)}
                      disabled={resolving2}
                      className="absolute right-1.5 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-semibold flex items-center gap-1 shadow"
                    >
                      {resolving2 ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>Convert 3 words</span>
                    </button>
                  )}
                </div>
                {parsedP2 ? (
                  <div className="mt-1 text-[11px] text-slate-400 flex gap-3">
                    <span>{mode === 'geographic' ? 'Lat:' : 'Y:'} <strong className="text-slate-200">{parsedP2.lat.toFixed(5)}</strong></span>
                    <span>{mode === 'geographic' ? 'Lon:' : 'X:'} <strong className="text-slate-200">{parsedP2.lon.toFixed(5)}</strong></span>
                  </div>
                ) : isW3w2 ? (
                  <p className="mt-1 text-[11px] text-indigo-400 flex items-center gap-1">
                    <span>Detected what3words address. Click &quot;Convert 3 words&quot; to fetch coordinates.</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-rose-400">Invalid coordinate or 3-word format</p>
                )}
                {w3wError2 && (
                  <p className="mt-1 text-[11px] text-rose-400 font-medium">{w3wError2}</p>
                )}
              </div>

              <div className="text-[11px] text-slate-400/90 flex items-start gap-1.5 pt-2 border-t border-slate-800/80">
                <Info className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                <span>
                  {mode === 'geographic'
                    ? 'Geographic great-circle navigation over Earth sphere.'
                    : 'Planar cartesian 2D coordinates matching compass.py.'}
                </span>
              </div>
            </div>

            {/* Presets */}
            <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Quick Presets
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setCoord1Str(preset.p1);
                      setCoord2Str(preset.p2);
                    }}
                    className="text-left p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 transition-all text-xs group"
                  >
                    <div className="font-medium text-slate-200 group-hover:text-blue-300 truncate">
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {preset.note}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Visual Compass & Results */}
          <div className="md:col-span-6 flex flex-col items-center justify-between text-center bg-slate-950/60 border border-slate-800/80 rounded-xl p-5 shadow-inner">
            <div className="w-full flex justify-between items-center mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Compass Visualizer
              </span>
              {result && (
                <button
                  onClick={() => handleCopy(`${result.bearing.toFixed(2)}°`)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded-md border border-slate-700/50 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>

            {/* Visual Compass Graphic */}
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 my-2 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-slate-700/80 bg-slate-950/80 shadow-inner flex items-center justify-center">
                {CARDINAL_POINTS.map((pt, idx) => {
                  const angle = idx * 22.5;
                  const isMajor = idx % 4 === 0;
                  return (
                    <div
                      key={pt.code}
                      className="absolute w-full h-full flex flex-col items-center justify-start pointer-events-none"
                      style={{ transform: `rotate(${angle}deg)` }}
                    >
                      <div
                        className={`w-0.5 ${
                          isMajor ? 'h-2.5 bg-slate-300 font-bold' : 'h-1 bg-slate-600'
                        }`}
                      />
                    </div>
                  );
                })}

                <span className="absolute top-2 font-bold text-[11px] text-rose-400">N</span>
                <span className="absolute right-2.5 font-bold text-[11px] text-slate-300">E</span>
                <span className="absolute bottom-2 font-bold text-[11px] text-slate-300">S</span>
                <span className="absolute left-2.5 font-bold text-[11px] text-slate-300">W</span>
              </div>

              {/* Rotating Compass Needle */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-transform duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                style={{
                  transform: `rotate(${result ? result.bearing : 0}deg)`,
                }}
              >
                <div className="relative flex flex-col items-center h-36 sm:h-44 w-5">
                  <div
                    className="w-0 h-0 border-x-[7px] border-x-transparent border-b-[70px] sm:border-b-[85px] border-b-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                  />
                  <div className="w-4 h-4 rounded-full bg-slate-900 border-2 border-slate-200 z-10 -my-2 shadow-md flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-blue-400" />
                  </div>
                  <div
                    className="w-0 h-0 border-x-[7px] border-x-transparent border-t-[70px] sm:border-t-[85px] border-t-slate-500"
                  />
                </div>
              </div>
            </div>

            {/* Readout */}
            {result ? (
              <div className="w-full mt-2 flex flex-col items-center">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold tracking-tight text-white font-mono">
                    {result.bearing.toFixed(2)}°
                  </span>
                  <span className="text-base font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                    {result.cardinal}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {result.cardinalName}
                </p>

                <div className="w-full grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800 text-left">
                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Reverse Bearing
                    </span>
                    <span className="text-xs font-semibold font-mono text-slate-200">
                      {result.backBearing.toFixed(2)}°
                    </span>
                  </div>

                  {result.distanceKm !== undefined ? (
                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                        Distance
                      </span>
                      <span className="text-xs font-semibold font-mono text-slate-200">
                        {result.distanceKm.toFixed(1)} km <span className="text-[10px] text-slate-400">({result.distanceMiles?.toFixed(1)} mi)</span>
                      </span>
                    </div>
                  ) : (
                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                        Magnitude
                      </span>
                      <span className="text-xs font-semibold font-mono text-slate-200">
                        {result.distanceMeters?.toFixed(4)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-6 text-slate-400 text-xs">
                Enter valid coordinates or 3 words to compute compass bearing.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow"
          >
            Done & Return to Map
          </button>
        </div>
      </div>
    </div>
  );
}
