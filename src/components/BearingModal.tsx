'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  parseCoordinate,
  calculateGeographicBearing,
  calculateRhumbBearing,
  calculatePlanarBearing,
  calculateDestinationPoint,
  CalculationMode,
  CARDINAL_POINTS,
  isWhat3WordsFormat,
} from '@/lib/bearing';
import {
  formatCoordinateString,
  validateGeographicBounds,
} from '@/lib/coordinates';
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
  Sparkles,
  Map as MapIcon,
  Navigation,
  Crosshair,
  Search,
} from 'lucide-react';
import PlaceSearch from './PlaceSearch';

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
    note: 'North-Northeast heading ~17.6°',
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
    note: 'Great Circle Northwest ~333°',
  },
];

interface BearingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPointA?: string;
  initialPointB?: string;
  selectedVectorId?: string | null;
  onPlotOnMap?: (from: [number, number], to: [number, number], label?: string) => void;
  onUpdateSelectedVector?: (id: string, from: [number, number], to: [number, number], label?: string) => void;
  initialMode?: CalculationMode;
}

export default function BearingModal({
  isOpen,
  onClose,
  initialPointA = '30.2672, -97.7431',
  initialPointB = '32.7767, -96.7970',
  selectedVectorId,
  onPlotOnMap,
  onUpdateSelectedVector,
  initialMode = 'geographic',
}: BearingModalProps) {
  const [calculationTab, setCalculationTab] = useState<'points' | 'project'>('points');
  const [coord1Str, setCoord1Str] = useState(initialPointA);
  const [coord2Str, setCoord2Str] = useState(initialPointB);
  const [mode, setMode] = useState<CalculationMode>(initialMode);
  const [copied, setCopied] = useState(false);

  // Forward projection state
  const [projBearing, setProjBearing] = useState('45');
  const [projDistance, setProjDistance] = useState('100');
  const [projDistUnit, setProjDistUnit] = useState<'km' | 'mi' | 'nm' | 'm'>('km');

  // Search input state
  const [activeSearchTarget, setActiveSearchTarget] = useState<'p1' | 'p2' | null>(null);

  // what3words integration state
  const [w3wKey, setW3wKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [resolving1, setResolving1] = useState(false);
  const [resolving2, setResolving2] = useState(false);
  const [w3wError1, setW3wError1] = useState<string | null>(null);
  const [w3wError2, setW3wError2] = useState<string | null>(null);

  // Needle shortest-path smooth rotation
  const [needleAngle, setNeedleAngle] = useState(0);
  const prevNeedleAngleRef = useRef(0);

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

  // Validation
  const p1Bounds = useMemo(
    () => (parsedP1 && mode !== 'planar' ? validateGeographicBounds(parsedP1.lat, parsedP1.lon) : { valid: true }),
    [parsedP1, mode]
  );
  const p2Bounds = useMemo(
    () => (parsedP2 && mode !== 'planar' ? validateGeographicBounds(parsedP2.lat, parsedP2.lon) : { valid: true }),
    [parsedP2, mode]
  );

  // Compute forward projection destination point
  const projectedP2 = useMemo(() => {
    if (!parsedP1 || !p1Bounds.valid) return null;
    const b = parseFloat(projBearing);
    const d = parseFloat(projDistance);
    if (isNaN(b) || isNaN(d) || d < 0) return null;

    let dKm = d;
    if (projDistUnit === 'mi') dKm = d * 1.609344;
    else if (projDistUnit === 'nm') dKm = d * 1.852;
    else if (projDistUnit === 'm') dKm = d / 1000;

    return calculateDestinationPoint(parsedP1, b, dKm, mode);
  }, [parsedP1, p1Bounds.valid, projBearing, projDistance, projDistUnit, mode]);

  // Main calculation result
  const result = useMemo(() => {
    const targetP2 = calculationTab === 'project' ? projectedP2 : parsedP2;
    if (!parsedP1 || !targetP2 || !p1Bounds.valid || (calculationTab === 'points' && !p2Bounds.valid)) {
      return null;
    }

    if (mode === 'geographic') {
      return calculateGeographicBearing(parsedP1, targetP2);
    } else if (mode === 'rhumb') {
      return calculateRhumbBearing(parsedP1, targetP2);
    } else {
      return calculatePlanarBearing(parsedP1, targetP2);
    }
  }, [parsedP1, parsedP2, projectedP2, calculationTab, p1Bounds.valid, p2Bounds.valid, mode]);

  // Update needle angle with shortest-path rotation across 0/360
  const bearingVal = result?.bearing;
  useEffect(() => {
    if (bearingVal !== undefined) {
      const target = bearingVal;
      const current = prevNeedleAngleRef.current;
      const diff = (((target - (current % 360)) + 540) % 360) - 180;
      const nextAngle = current + diff;
      prevNeedleAngleRef.current = nextAngle;
      setNeedleAngle(nextAngle);
    }
  }, [bearingVal]);

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
        `https://api.what3words.com/v2/convert-to-coordinates?words=${encodeURIComponent(
          cleaned
        )}&key=${encodeURIComponent(apiKey)}`
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

  const handlePlotOnMapClick = () => {
    const targetP2 = calculationTab === 'project' ? projectedP2 : parsedP2;
    if (!parsedP1 || !targetP2) return;

    const from: [number, number] = [parsedP1.lat, parsedP1.lon];
    const to: [number, number] = [targetP2.lat, targetP2.lon];

    if (selectedVectorId && onUpdateSelectedVector) {
      onUpdateSelectedVector(selectedVectorId, from, to);
    } else if (onPlotOnMap) {
      onPlotOnMap(from, to);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-700/70 rounded-2xl shadow-2xl overflow-y-auto flex flex-col text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 sm:px-6 py-3.5 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
              <Compass className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                Bearing Calculator & Compass
              </h2>
              <p className="text-[11px] text-slate-400">
                Supports DD, DMS, DM, Plus Codes, what3words & Forward Projection
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            {/* Mode Switcher */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setMode('geographic')}
                className={`px-2 py-1 rounded-md flex items-center gap-1 transition-all text-[11px] ${
                  mode === 'geographic'
                    ? 'bg-blue-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Great Circle navigation along Earth sphere"
              >
                <Globe className="w-3 h-3" />
                <span>Great Circle</span>
              </button>
              <button
                onClick={() => setMode('rhumb')}
                className={`px-2 py-1 rounded-md flex items-center gap-1 transition-all text-[11px] ${
                  mode === 'rhumb'
                    ? 'bg-blue-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Rhumb Line constant compass heading"
              >
                <Compass className="w-3 h-3" />
                <span>Rhumb Line</span>
              </button>
              <button
                onClick={() => setMode('planar')}
                className={`px-2 py-1 rounded-md flex items-center gap-1 transition-all text-[11px] ${
                  mode === 'planar'
                    ? 'bg-blue-600 text-white font-medium shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Cartesian 2D coordinates (compass.py)"
              >
                <Layers className="w-3 h-3" />
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

        {/* Calculation Tab Toggle (2 Points vs Forward Projection) */}
        <div className="px-5 sm:px-6 pt-3 flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setCalculationTab('points')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                calculationTab === 'points'
                  ? 'bg-slate-800 text-sky-400 border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Point A → Point B (Inverse)
            </button>
            <button
              onClick={() => setCalculationTab('project')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                calculationTab === 'project'
                  ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Forward Projection (A + Heading)</span>
            </button>
          </div>

          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            className="text-[11px] text-slate-400 hover:text-sky-400 flex items-center gap-1 transition-colors"
          >
            <Key className="w-3 h-3" />
            <span>{w3wKey ? 'w3w Key Configured' : 'what3words Key'}</span>
          </button>
        </div>

        {/* Optional what3words API Key banner */}
        {showKeyInput && (
          <div className="mx-6 mt-3 p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col gap-1.5 text-xs animate-in fade-in">
            <label className="text-[11px] text-slate-300 font-medium">
              what3words API Key (stored in your browser):
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={w3wKey}
                onChange={(e) => handleSaveKey(e.target.value)}
                placeholder="Paste what3words API key"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => setShowKeyInput(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Modal Content */}
        <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Inputs & Presets */}
          <div className="md:col-span-6 flex flex-col gap-4">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-blue-400" />
                  {calculationTab === 'points' ? 'Coordinates / Locations' : 'Starting Coordinate (Point A)'}
                </h3>
                {calculationTab === 'points' && (
                  <button
                    onClick={handleSwap}
                    title="Swap Point A and Point B"
                    className="text-xs text-slate-400 hover:text-blue-400 flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/60 rounded-md transition-colors border border-slate-700/50"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    Swap
                  </button>
                )}
              </div>

              {/* Point 1 (Start Point A) */}
              <div className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Starting Point (Point A)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setActiveSearchTarget(activeSearchTarget === 'p1' ? null : 'p1')
                      }
                      className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                    >
                      <Search className="w-3 h-3" />
                      <span>Search Place</span>
                    </button>
                    <button
                      onClick={handleUseLocation}
                      className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>GPS</span>
                    </button>
                  </div>
                </div>

                {activeSearchTarget === 'p1' && (
                  <div className="mb-2">
                    <PlaceSearch
                      placeholder="Search location for Point A..."
                      onSelectLocation={(lat, lon) => {
                        setCoord1Str(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                        setActiveSearchTarget(null);
                      }}
                    />
                  </div>
                )}

                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={coord1Str}
                    onChange={(e) => {
                      setCoord1Str(e.target.value);
                      setW3wError1(null);
                    }}
                    placeholder="e.g. 30.2672, -97.7431, 30° 16' N, 97° 44' W, or ///filled.count.soap"
                    className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm focus:outline-none transition-all ${
                      parsedP1 && p1Bounds.valid
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
                  p1Bounds.valid ? (
                    <div className="mt-1 text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{mode === 'planar' ? 'Y:' : 'Lat:'} <strong className="text-slate-200">{parsedP1.lat.toFixed(5)}°</strong></span>
                      <span>{mode === 'planar' ? 'X:' : 'Lon:'} <strong className="text-slate-200">{parsedP1.lon.toFixed(5)}°</strong></span>
                      {mode !== 'planar' && (
                        <span className="text-slate-400 font-mono text-[10px]">
                          ({formatCoordinateString(parsedP1.lat, parsedP1.lon, 'DMS')})
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-rose-400 font-medium">{p1Bounds.error}</p>
                  )
                ) : isW3w1 ? (
                  <p className="mt-1 text-[11px] text-indigo-400">
                    Detected what3words address. Click &quot;Convert 3 words&quot; to fetch coordinates.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-rose-400">Enter valid DD, DMS, DM, or Plus Code</p>
                )}
                {w3wError1 && <p className="mt-1 text-[11px] text-rose-400 font-medium">{w3wError1}</p>}
              </div>

              {/* Inverse Mode: Point 2 (Target Point B) */}
              {calculationTab === 'points' ? (
                <>
                  <div className="flex items-center justify-center my-0.5 text-slate-600">
                    <ArrowRight className="w-3.5 h-3.5 transform rotate-90 md:rotate-0" />
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-medium text-slate-300">
                        Target Point (Point B)
                      </label>
                      <button
                        onClick={() =>
                          setActiveSearchTarget(activeSearchTarget === 'p2' ? null : 'p2')
                        }
                        className="text-[11px] text-sky-400 hover:underline flex items-center gap-1"
                      >
                        <Search className="w-3 h-3" />
                        <span>Search Place</span>
                      </button>
                    </div>

                    {activeSearchTarget === 'p2' && (
                      <div className="mb-2">
                        <PlaceSearch
                          placeholder="Search location for Point B..."
                          onSelectLocation={(lat, lon) => {
                            setCoord2Str(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
                            setActiveSearchTarget(null);
                          }}
                        />
                      </div>
                    )}

                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={coord2Str}
                        onChange={(e) => {
                          setCoord2Str(e.target.value);
                          setW3wError2(null);
                        }}
                        placeholder="e.g. 32.7767, -96.7970, or ///daring.lion.race"
                        className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm focus:outline-none transition-all ${
                          parsedP2 && p2Bounds.valid
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
                      p2Bounds.valid ? (
                        <div className="mt-1 text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>{mode === 'planar' ? 'Y:' : 'Lat:'} <strong className="text-slate-200">{parsedP2.lat.toFixed(5)}°</strong></span>
                          <span>{mode === 'planar' ? 'X:' : 'Lon:'} <strong className="text-slate-200">{parsedP2.lon.toFixed(5)}°</strong></span>
                          {mode !== 'planar' && (
                            <span className="text-slate-400 font-mono text-[10px]">
                              ({formatCoordinateString(parsedP2.lat, parsedP2.lon, 'DMS')})
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-rose-400 font-medium">{p2Bounds.error}</p>
                      )
                    ) : isW3w2 ? (
                      <p className="mt-1 text-[11px] text-indigo-400">
                        Detected what3words address. Click &quot;Convert 3 words&quot; to fetch coordinates.
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-rose-400">Enter valid DD, DMS, DM, or Plus Code</p>
                    )}
                    {w3wError2 && <p className="mt-1 text-[11px] text-rose-400 font-medium">{w3wError2}</p>}
                  </div>
                </>
              ) : (
                /* Forward Projection Inputs */
                <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-amber-300 mb-1">
                        Bearing / Heading (°)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="360"
                        step="0.1"
                        value={projBearing}
                        onChange={(e) => setProjBearing(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-1.5 text-sm text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-amber-300 mb-1">
                        Distance & Unit
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={projDistance}
                          onChange={(e) => setProjDistance(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-lg px-3 py-1.5 text-sm text-slate-100 font-mono"
                        />
                        <select
                          value={projDistUnit}
                          onChange={(e) => setProjDistUnit(e.target.value as 'km' | 'mi' | 'nm' | 'm')}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 text-xs text-slate-200"
                        >
                          <option value="km">km</option>
                          <option value="mi">mi</option>
                          <option value="nm">nm</option>
                          <option value="m">m</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {projectedP2 && (
                    <div className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-lg text-xs flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-semibold text-amber-300">
                        Projected Destination (Point B)
                      </span>
                      <span className="font-mono text-amber-100 font-semibold">
                        {projectedP2.lat.toFixed(6)}, {projectedP2.lon.toFixed(6)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="text-[11px] text-slate-400/90 flex items-start gap-1.5 pt-2 border-t border-slate-800/80">
                <Info className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                <span>
                  {mode === 'geographic'
                    ? 'Great-circle geodesic arc over spherical Earth.'
                    : mode === 'rhumb'
                    ? 'Rhumb line: path of constant compass heading.'
                    : 'Planar cartesian 2D coordinates (dx, dy).'}
                </span>
              </div>
            </div>

            {/* Quick Presets */}
            {calculationTab === 'points' && (
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 sm:p-4">
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
                      className="text-left p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 transition-all text-xs group cursor-pointer"
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
            )}
          </div>

          {/* Right Column: Visual Compass & Results */}
          <div className="md:col-span-6 flex flex-col items-center justify-between text-center bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-inner">
            <div className="w-full flex justify-between items-center mb-1">
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

            {/* Visual Compass Dial */}
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

              {/* Smooth Shortest-Path Rotating Compass Needle */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-transform duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                style={{
                  transform: `rotate(${needleAngle}deg)`,
                }}
              >
                <div className="relative flex flex-col items-center h-36 sm:h-44 w-5">
                  <div className="w-0 h-0 border-x-[7px] border-x-transparent border-b-[70px] sm:border-b-[85px] border-b-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                  <div className="w-4 h-4 rounded-full bg-slate-900 border-2 border-slate-200 z-10 -my-2 shadow-md flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-blue-400" />
                  </div>
                  <div className="w-0 h-0 border-x-[7px] border-x-transparent border-t-[70px] sm:border-t-[85px] border-t-slate-500" />
                </div>
              </div>
            </div>

            {/* Readout */}
            {result ? (
              <div className="w-full mt-1 flex flex-col items-center">
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

                {/* Magnetic & Navigation Metrics Grid */}
                <div className="w-full grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-800 text-left">
                  {result.magneticBearing !== undefined && (
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-[10px] uppercase font-semibold text-sky-400 block">
                        Magnetic Bearing
                      </span>
                      <span className="text-xs font-semibold font-mono text-slate-100">
                        {result.magneticBearing.toFixed(1)}° Mag
                      </span>
                      {result.magneticDeclination !== undefined && (
                        <span className="text-[10px] text-slate-400 block">
                          Var: {Math.abs(result.magneticDeclination).toFixed(1)}°{' '}
                          {result.magneticDeclination >= 0 ? 'E' : 'W'}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Reverse Bearing (B→A)
                    </span>
                    <span className="text-xs font-semibold font-mono text-slate-200">
                      {result.backBearing.toFixed(1)}°
                    </span>
                    {result.finalBearing !== undefined && mode === 'geographic' && (
                      <span className="text-[10px] text-slate-400 block">
                        Arrival: {result.finalBearing.toFixed(1)}°
                      </span>
                    )}
                  </div>

                  {result.distanceKm !== undefined ? (
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 col-span-2">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                        Distance
                      </span>
                      <div className="flex items-baseline justify-between text-xs font-semibold font-mono text-slate-200">
                        <span>{result.distanceKm.toFixed(1)} km</span>
                        <span className="text-slate-400 font-normal">{result.distanceMiles?.toFixed(1)} mi</span>
                        <span className="text-slate-400 font-normal">{result.distanceNauticalMiles?.toFixed(1)} nm</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 col-span-2">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                        Magnitude (Cartesian)
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
                Enter valid coordinates or location to compute compass bearing.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer with Two-Way Map Plotting Button */}
        <div className="px-6 py-3.5 bg-slate-950/70 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] text-slate-400">
            {selectedVectorId ? (
              <span>Editing vector on map</span>
            ) : (
              <span>Plot vector directly onto OpenStreetMap</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {result && (
              <button
                onClick={handlePlotOnMapClick}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all shadow flex items-center gap-1.5 cursor-pointer"
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>
                  {selectedVectorId ? 'Update Vector on Map' : 'Plot Vector on Map & View'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
