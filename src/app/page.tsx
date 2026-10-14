'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Compass,
  Trash2,
  HelpCircle,
  Navigation,
  Share2,
  Check,
  Download,
  Upload,
  ArrowUpDown,
  Plus,
  Crosshair,
  Layers,
  ChevronDown,
  ChevronUp,
  MapPin,
  List,
  X,
  FileSpreadsheet,
  FileCode,
} from 'lucide-react';
import type { MapVector, AdjustingPoint, BasemapId } from '@/components/MapComponent';
import BearingModal from '@/components/BearingModal';
import PlaceSearch from '@/components/PlaceSearch';
import {
  encodeMapStateToHash,
  decodeMapStateFromHash,
  MapViewState,
} from '@/lib/codec';
import {
  CalculationMode,
  calculateGeographicBearing,
  calculateRhumbBearing,
  formatDistance,
} from '@/lib/bearing';
import {
  exportToGeoJSON,
  exportToGPX,
  exportToKML,
  exportToCSV,
  importFromGeoJSON,
  importFromCSV,
  downloadFile,
} from '@/lib/geoio';

// Dynamically import MapComponent to disable SSR
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-3">
      <Compass className="w-10 h-10 animate-spin text-blue-500" />
      <span className="text-sm font-medium">Loading Map...</span>
    </div>
  ),
});

export default function Home() {
  const [vectors, setVectors] = useState<MapVector[]>([]);
  const [pendingPoint, setPendingPoint] = useState<[number, number] | null>(null);
  const [adjustingPoint, setAdjustingPoint] = useState<AdjustingPoint | null>(null);
  const [calculationMode, setCalculationMode] = useState<CalculationMode>('geographic');
  const [currentBasemap, setCurrentBasemap] = useState<BasemapId>('dark');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPointA, setModalPointA] = useState('30.2672, -97.7431');
  const [modalPointB, setModalPointB] = useState('32.7767, -96.7970');
  const [editingVectorId, setEditingVectorId] = useState<string | null>(null);

  // Sharing & Export State
  const [copiedShare, setCopiedShare] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showVectorDrawer, setShowVectorDrawer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // View state tracking
  const [currentViewState, setCurrentViewState] = useState<MapViewState | undefined>(undefined);
  const [initialViewState, setInitialViewState] = useState<MapViewState | undefined>(undefined);
  const [flyToTarget, setFlyToTarget] = useState<{
    center: [number, number];
    zoom?: number;
    timestamp: number;
  } | null>(null);
  const viewStateRef = useRef<MapViewState | undefined>(undefined);

  useEffect(() => {
    viewStateRef.current = currentViewState;
  }, [currentViewState]);

  // 1. Load vectors, view state, mode, and basemap from URL hash on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash.startsWith('v=')) {
        const encodedData = hash.substring(2);
        const { vectors: decoded, viewState, mode, basemap } = decodeMapStateFromHash(encodedData);
        if (decoded.length > 0) {
          setVectors(decoded);
          const first = decoded[0];
          setModalPointA(`${first.from[0].toFixed(6)}, ${first.from[1].toFixed(6)}`);
          setModalPointB(`${first.to[0].toFixed(6)}, ${first.to[1].toFixed(6)}`);
        }
        if (viewState) {
          setInitialViewState(viewState);
          setCurrentViewState(viewState);
        }
        if (mode) setCalculationMode(mode);
        if (basemap && (basemap === 'osm' || basemap === 'dark' || basemap === 'topo' || basemap === 'satellite')) {
          setCurrentBasemap(basemap as BasemapId);
        }
      }
    }
  }, []);

  // 2. Synchronize URL hash
  const syncHash = (
    currentVectors: MapVector[],
    view?: MapViewState,
    mode: CalculationMode = calculationMode,
    bmap: BasemapId = currentBasemap
  ) => {
    if (typeof window !== 'undefined') {
      if (currentVectors.length > 0 || view) {
        const encoded = encodeMapStateToHash(currentVectors, view || viewStateRef.current, mode, bmap);
        window.history.replaceState(null, '', `#v=${encoded}`);
      } else {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  };

  const handleAddVector = (newVec: MapVector) => {
    setVectors((prev) => {
      const next = [...prev, newVec];
      syncHash(next, viewStateRef.current);
      return next;
    });
    setAdjustingPoint(null);
  };

  const handleUpdateVector = (updatedVec: MapVector) => {
    setVectors((prev) => {
      const next = prev.map((v) => (v.id === updatedVec.id ? updatedVec : v));
      syncHash(next, viewStateRef.current);
      return next;
    });
  };

  const handleSetPendingPoint = (point: [number, number] | null) => {
    setPendingPoint(point);
    if (point) setAdjustingPoint(null);
  };

  const handleSetAdjustingPoint = (adj: AdjustingPoint | null) => {
    setAdjustingPoint(adj);
    if (adj) setPendingPoint(null);
  };

  const handleSelectVector = (vec: MapVector) => {
    setEditingVectorId(vec.id);
    setModalPointA(`${vec.from[0].toFixed(6)}, ${vec.from[1].toFixed(6)}`);
    setModalPointB(`${vec.to[0].toFixed(6)}, ${vec.to[1].toFixed(6)}`);
    setIsModalOpen(true);
  };

  const handleClearVectors = () => {
    setVectors([]);
    setPendingPoint(null);
    setAdjustingPoint(null);
    setEditingVectorId(null);
    syncHash([], viewStateRef.current);
  };

  // Per-Vector Actions
  const handleDeleteVector = (id: string) => {
    setVectors((prev) => {
      const next = prev.filter((v) => v.id !== id);
      syncHash(next, viewStateRef.current);
      return next;
    });
  };

  const handleReverseVector = (vec: MapVector) => {
    const calc =
      calculationMode === 'rhumb'
        ? calculateRhumbBearing(
            { lat: vec.to[0], lon: vec.to[1] },
            { lat: vec.from[0], lon: vec.from[1] }
          )
        : calculateGeographicBearing(
            { lat: vec.to[0], lon: vec.to[1] },
            { lat: vec.from[0], lon: vec.from[1] }
          );

    const reversed: MapVector = {
      ...vec,
      from: vec.to,
      to: vec.from,
      bearing: calc.bearing,
      cardinal: calc.cardinal,
      distanceKm: calc.distanceKm || 0,
    };
    handleUpdateVector(reversed);
  };

  const handleChainFromVector = (vec: MapVector) => {
    setPendingPoint(vec.to);
    setAdjustingPoint(null);
    setFlyToTarget({
      center: vec.to,
      zoom: currentViewState?.zoom,
      timestamp: Date.now(),
    });
  };

  const handleCenterOnVector = (vec: MapVector) => {
    const midLat = (vec.from[0] + vec.to[0]) / 2;
    const midLng = (vec.from[1] + vec.to[1]) / 2;
    setFlyToTarget({
      center: [midLat, midLng],
      zoom: Math.max(currentViewState?.zoom || 7, 7),
      timestamp: Date.now(),
    });
  };

  // Two-way modal handlers
  const handlePlotFromModal = (from: [number, number], to: [number, number]) => {
    const calc =
      calculationMode === 'rhumb'
        ? calculateRhumbBearing({ lat: from[0], lon: from[1] }, { lat: to[0], lon: to[1] })
        : calculateGeographicBearing({ lat: from[0], lon: from[1] }, { lat: to[0], lon: to[1] });

    const newVector: MapVector = {
      id: 'vec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      from,
      to,
      bearing: calc.bearing,
      cardinal: calc.cardinal,
      distanceKm: calc.distanceKm || 0,
    };
    handleAddVector(newVector);

    const midLat = (from[0] + to[0]) / 2;
    const midLng = (from[1] + to[1]) / 2;
    setFlyToTarget({
      center: [midLat, midLng],
      zoom: 8,
      timestamp: Date.now(),
    });
  };

  const handleUpdateFromModal = (id: string, from: [number, number], to: [number, number]) => {
    const calc =
      calculationMode === 'rhumb'
        ? calculateRhumbBearing({ lat: from[0], lon: from[1] }, { lat: to[0], lon: to[1] })
        : calculateGeographicBearing({ lat: from[0], lon: from[1] }, { lat: to[0], lon: to[1] });

    const updated: MapVector = {
      id,
      from,
      to,
      bearing: calc.bearing,
      cardinal: calc.cardinal,
      distanceKm: calc.distanceKm || 0,
    };
    handleUpdateVector(updated);

    const midLat = (from[0] + to[0]) / 2;
    const midLng = (from[1] + to[1]) / 2;
    setFlyToTarget({
      center: [midLat, midLng],
      zoom: 8,
      timestamp: Date.now(),
    });
  };

  const handleOpenCalculatorDirectly = () => {
    setEditingVectorId(null);
    if (vectors.length > 0) {
      const last = vectors[vectors.length - 1];
      setModalPointA(`${last.from[0].toFixed(6)}, ${last.from[1].toFixed(6)}`);
      setModalPointB(`${last.to[0].toFixed(6)}, ${last.to[1].toFixed(6)}`);
    }
    setIsModalOpen(true);
  };

  const handleShare = async () => {
    if (typeof window === 'undefined') return;
    const encoded = encodeMapStateToHash(
      vectors,
      viewStateRef.current,
      calculationMode,
      currentBasemap
    );
    const url = `${window.location.origin}${window.location.pathname}#v=${encoded}`;

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2500);
      } else {
        prompt('Copy this link to share your vector map:', url);
      }
    } catch {
      prompt('Copy this link to share your vector map:', url);
    }
  };

  // Export handlers
  const handleExport = (format: 'geojson' | 'gpx' | 'kml' | 'csv') => {
    if (vectors.length === 0) return;
    setShowExportMenu(false);

    if (format === 'geojson') {
      const content = exportToGeoJSON(vectors);
      downloadFile(content, 'coordy-vectors.geojson', 'application/geo+json');
    } else if (format === 'gpx') {
      const content = exportToGPX(vectors);
      downloadFile(content, 'coordy-vectors.gpx', 'application/gpx+xml');
    } else if (format === 'kml') {
      const content = exportToKML(vectors);
      downloadFile(content, 'coordy-vectors.kml', 'application/vnd.google-earth.kml+xml');
    } else if (format === 'csv') {
      const content = exportToCSV(vectors);
      downloadFile(content, 'coordy-vectors.csv', 'text/csv');
    }
  };

  // File import handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      let imported: MapVector[] = [];
      const lowerName = file.name.toLowerCase();

      try {
        if (lowerName.endsWith('.geojson') || lowerName.endsWith('.json')) {
          imported = importFromGeoJSON(content);
        } else if (lowerName.endsWith('.csv')) {
          imported = importFromCSV(content);
        } else {
          // Attempt GeoJSON then CSV
          try {
            imported = importFromGeoJSON(content);
          } catch {
            imported = importFromCSV(content);
          }
        }

        if (imported.length > 0) {
          setVectors((prev) => {
            const next = [...prev, ...imported];
            syncHash(next, viewStateRef.current);
            return next;
          });
          alert(`Successfully imported ${imported.length} vector(s)!`);
        } else {
          alert('Could not find valid vectors in the uploaded file.');
        }
      } catch (err) {
        alert('Failed to parse import file: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Cumulative metrics
  const totalDistanceKm = vectors.reduce((sum, v) => sum + v.distanceKm, 0);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* 1. Map Viewport */}
      <div className="absolute inset-0">
        <MapComponent
          vectors={vectors}
          onAddVector={handleAddVector}
          onUpdateVector={handleUpdateVector}
          pendingPoint={pendingPoint}
          onSetPendingPoint={handleSetPendingPoint}
          adjustingPoint={adjustingPoint}
          onSetAdjustingPoint={handleSetAdjustingPoint}
          onSelectVector={handleSelectVector}
          onViewStateChange={(vs) => {
            setCurrentViewState(vs);
            if (vectors.length > 0) {
              syncHash(vectors, vs);
            }
          }}
          initialViewState={initialViewState}
          mode={calculationMode}
          currentBasemap={currentBasemap}
          onBasemapChange={(bm) => {
            setCurrentBasemap(bm);
            syncHash(vectors, viewStateRef.current, calculationMode, bm);
          }}
          flyToTarget={flyToTarget}
        />
      </div>

      {/* 2. Top Header & Navigation Bar */}
      <header className="absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 z-10 pointer-events-none flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Brand Badge & Search */}
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <div className="flex items-center gap-2.5 px-3.5 py-2 bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400 shrink-0">
              <Compass className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                Coordy
              </h1>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium">Vector Bearing & Compass</p>
            </div>
          </div>

          {/* Place Search Bar */}
          <div className="w-52 sm:w-64">
            <PlaceSearch
              placeholder="Search places & fly to..."
              onSelectLocation={(lat, lon) => {
                setFlyToTarget({
                  center: [lat, lon],
                  zoom: 12,
                  timestamp: Date.now(),
                });
              }}
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 self-end md:self-auto overflow-x-auto">
          {/* Share Button */}
          <button
            onClick={handleShare}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 border rounded-xl shadow-xl backdrop-blur-md text-xs font-semibold transition-all cursor-pointer ${
              copiedShare
                ? 'bg-emerald-600/90 text-white border-emerald-400/50 scale-105'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400/40 hover:scale-102'
            }`}
            title="Share exact vectors, zoom level, basemap, and coordinates"
          >
            {copiedShare ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-100" />
                <span className="hidden sm:inline">Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share</span>
              </>
            )}
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={vectors.length === 0}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-2 border rounded-xl shadow-lg backdrop-blur-md text-xs font-semibold transition-all cursor-pointer ${
                vectors.length > 0
                  ? 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700/80'
                  : 'bg-slate-900/40 text-slate-500 border-slate-800/40 cursor-not-allowed'
              }`}
              title="Export vectors to GeoJSON, GPX, KML, or CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-40 bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md p-1.5 z-50 flex flex-col gap-1 text-xs">
                <button
                  onClick={() => handleExport('geojson')}
                  className="px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>GeoJSON</span>
                  <span className="text-[10px] text-slate-400 font-mono">.geojson</span>
                </button>
                <button
                  onClick={() => handleExport('gpx')}
                  className="px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>GPX Route</span>
                  <span className="text-[10px] text-slate-400 font-mono">.gpx</span>
                </button>
                <button
                  onClick={() => handleExport('kml')}
                  className="px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>Google Earth</span>
                  <span className="text-[10px] text-slate-400 font-mono">.kml</span>
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="px-2.5 py-1.5 rounded-lg text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>Spreadsheet</span>
                  <span className="text-[10px] text-slate-400 font-mono">.csv</span>
                </button>
              </div>
            )}
          </div>

          {/* Import File Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".geojson,.json,.csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl shadow-lg backdrop-blur-md text-xs font-semibold transition-all cursor-pointer"
            title="Import vectors from GeoJSON or CSV file"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
          </button>

          {/* Clear Button */}
          {vectors.length > 0 && (
            <button
              onClick={handleClearVectors}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-slate-900/90 hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 border border-slate-700/80 hover:border-rose-700/80 rounded-xl shadow-lg backdrop-blur-md text-xs font-semibold transition-all cursor-pointer"
              title="Clear all vectors on map"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          {/* Open Calculator Modal */}
          <button
            onClick={handleOpenCalculatorDirectly}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/30 rounded-xl shadow-xl backdrop-blur-md text-xs font-semibold transition-all cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>Calculator</span>
          </button>
        </div>
      </header>

      {/* Active Endpoint Adjustment Floating Banner */}
      {adjustingPoint && (
        <div className="absolute top-24 sm:top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-950/95 border border-amber-500/70 rounded-2xl shadow-2xl backdrop-blur-md text-xs text-amber-200">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
            <span className="font-semibold">
              Adjusting {adjustingPoint.endpoint === 'from' ? 'Point A (Start)' : 'Point B (End)'}
            </span>
            <span className="text-amber-300/80 hidden sm:inline">
              — Click on map or drag endpoint to relocate
            </span>
            <button
              onClick={() => setAdjustingPoint(null)}
              className="px-2.5 py-1 bg-amber-900/80 hover:bg-amber-800 text-amber-100 rounded-lg text-[11px] font-semibold transition-colors border border-amber-600/50 cursor-pointer"
            >
              Cancel (Esc)
            </button>
          </div>
        </div>
      )}

      {/* 3. Instruction Bar (Bottom Left) */}
      <div className="absolute bottom-4 left-3 sm:bottom-6 sm:left-4 z-10 pointer-events-auto max-w-xs sm:max-w-sm">
        <div className="p-3 sm:p-3.5 bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md text-xs text-slate-200 flex flex-col gap-2">
          <div className="flex items-center justify-between font-semibold text-slate-100">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-sky-400" />
              <span>Vector Navigation:</span>
            </div>
            {currentViewState && (
              <span className="text-[10px] text-slate-400 font-mono">
                Zoom: {currentViewState.zoom}
              </span>
            )}
          </div>
          <ol className="list-decimal list-inside text-slate-300 space-y-1 text-[11px] leading-relaxed">
            <li>
              Click map to set <strong className="text-sky-400">Point A</strong>.
            </li>
            <li>
              Move mouse for live preview, click again to set <strong className="text-rose-400">Point B</strong>.
            </li>
            <li>
              Drag <strong className="text-amber-400">Point A or B</strong> anytime to fine-tune.
            </li>
            <li>
              Click any vector line to inspect full <strong className="text-blue-400">Compass metrics</strong>.
            </li>
          </ol>

          {pendingPoint && (
            <div className="mt-1 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
              <span className="text-sky-300 flex items-center gap-1.5 animate-pulse">
                <Navigation className="w-3 h-3" />
                Point A selected! Click to place Point B.
              </span>
              <button
                onClick={() => setPendingPoint(null)}
                className="text-slate-400 hover:text-rose-400 text-[10px] underline cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Vectors Drawer / List Summary (Bottom Right) */}
      {vectors.length > 0 && (
        <div className="absolute bottom-4 right-3 sm:bottom-6 sm:right-4 z-10 pointer-events-auto">
          {/* Mobile Toggle Button */}
          <div className="sm:hidden flex justify-end mb-2">
            <button
              onClick={() => setShowVectorDrawer(!showVectorDrawer)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-xl shadow-xl text-xs font-semibold text-slate-200"
            >
              <List className="w-3.5 h-3.5 text-blue-400" />
              <span>Vectors ({vectors.length})</span>
            </button>
          </div>

          <div
            className={`w-72 sm:w-80 p-3 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md text-xs flex flex-col gap-2 max-h-64 sm:max-h-72 overflow-hidden ${
              showVectorDrawer ? 'block' : 'hidden sm:flex'
            }`}
          >
            <div className="font-semibold text-slate-200 flex justify-between items-center pb-1.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span>Drawn Vectors</span>
                <span className="text-[10px] bg-blue-600/30 text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-500/30">
                  {vectors.length}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Total: {formatDistance(totalDistanceKm * 1000)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
              {vectors.map((vec, idx) => (
                <div
                  key={vec.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/40 text-[11px] transition-all group"
                >
                  <button
                    onClick={() => handleSelectVector(vec)}
                    className="flex-1 text-left truncate flex items-center gap-2 cursor-pointer"
                  >
                    <span className="text-slate-400 font-mono text-[10px]">#{idx + 1}</span>
                    <span className="font-mono font-bold text-white group-hover:text-sky-300">
                      {vec.bearing.toFixed(1)}° {vec.cardinal}
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      {formatDistance(vec.distanceKm * 1000)}
                    </span>
                  </button>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    {/* Center on map */}
                    <button
                      onClick={() => handleCenterOnVector(vec)}
                      className="p-1 hover:text-sky-300 text-slate-400 transition-colors"
                      title="Center on map"
                    >
                      <Crosshair className="w-3 h-3" />
                    </button>

                    {/* Chain from B */}
                    <button
                      onClick={() => handleChainFromVector(vec)}
                      className="p-1 hover:text-amber-300 text-slate-400 transition-colors"
                      title="Chain new vector from Point B"
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    {/* Reverse A <-> B */}
                    <button
                      onClick={() => handleReverseVector(vec)}
                      className="p-1 hover:text-blue-300 text-slate-400 transition-colors"
                      title="Reverse vector direction"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                    </button>

                    {/* Delete Vector */}
                    <button
                      onClick={() => handleDeleteVector(vec.id)}
                      className="p-1 hover:text-rose-400 text-slate-400 transition-colors"
                      title="Delete this vector"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Bearing Modal Popup */}
      <BearingModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingVectorId(null);
        }}
        initialPointA={modalPointA}
        initialPointB={modalPointB}
        selectedVectorId={editingVectorId}
        onPlotOnMap={handlePlotFromModal}
        onUpdateSelectedVector={handleUpdateFromModal}
        initialMode={calculationMode}
      />
    </div>
  );
}
