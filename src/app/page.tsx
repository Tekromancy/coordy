'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Compass, Trash2, HelpCircle, Navigation, Share2, Check, Link2 } from 'lucide-react';
import type { MapVector, AdjustingPoint } from '@/components/MapComponent';
import BearingModal from '@/components/BearingModal';
import { encodeMapStateToHash, decodeMapStateFromHash, MapViewState } from '@/lib/codec';

// Dynamically import MapComponent to disable SSR since Leaflet relies on browser `window`
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-3">
      <Compass className="w-10 h-10 animate-spin text-blue-500" />
      <span className="text-sm font-medium">Loading OpenStreetMap...</span>
    </div>
  ),
});

export default function Home() {
  const [vectors, setVectors] = useState<MapVector[]>([]);
  const [pendingPoint, setPendingPoint] = useState<[number, number] | null>(null);
  const [adjustingPoint, setAdjustingPoint] = useState<AdjustingPoint | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPointA, setModalPointA] = useState('30.2672, -97.7431');
  const [modalPointB, setModalPointB] = useState('32.7767, -96.7970');
  const [copiedShare, setCopiedShare] = useState(false);
  
  // Track current map center and zoom level
  const [currentViewState, setCurrentViewState] = useState<MapViewState | undefined>(undefined);
  const [initialViewState, setInitialViewState] = useState<MapViewState | undefined>(undefined);
  const viewStateRef = useRef<MapViewState | undefined>(undefined);

  useEffect(() => {
    viewStateRef.current = currentViewState;
  }, [currentViewState]);

  // 1. Load vectors and zoom state from URL hash on mount if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash.startsWith('v=')) {
        const encodedData = hash.substring(2);
        const { vectors: decoded, viewState } = decodeMapStateFromHash(encodedData);
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
      }
    }
  }, []);

  // 2. Synchronize URL hash when vectors or zoom changes
  const syncHash = (currentVectors: MapVector[], view?: MapViewState) => {
    if (typeof window !== 'undefined') {
      if (currentVectors.length > 0 || view) {
        const encoded = encodeMapStateToHash(currentVectors, view || viewStateRef.current);
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
    setModalPointA(`${vec.from[0].toFixed(6)}, ${vec.from[1].toFixed(6)}`);
    setModalPointB(`${vec.to[0].toFixed(6)}, ${vec.to[1].toFixed(6)}`);
    setIsModalOpen(true);
  };

  const handleClearVectors = () => {
    setVectors([]);
    setPendingPoint(null);
    setAdjustingPoint(null);
    syncHash([], viewStateRef.current);
  };

  const handleOpenCalculatorDirectly = () => {
    if (vectors.length > 0) {
      const last = vectors[vectors.length - 1];
      setModalPointA(`${last.from[0].toFixed(6)}, ${last.from[1].toFixed(6)}`);
      setModalPointB(`${last.to[0].toFixed(6)}, ${last.to[1].toFixed(6)}`);
    }
    setIsModalOpen(true);
  };

  const handleShare = async () => {
    if (typeof window === 'undefined') return;
    
    // Encode both vectors and the exact zoom/pan view state
    const encoded = encodeMapStateToHash(vectors, viewStateRef.current);
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

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* 1. OpenStreetMap Viewport */}
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
            // Optionally update URL hash dynamically on pan/zoom
            if (vectors.length > 0) {
              syncHash(vectors, vs);
            }
          }}
          initialViewState={initialViewState}
        />
      </div>

      {/* 2. Top Navigation Bar */}
      <header className="absolute top-4 left-4 right-4 z-10 pointer-events-none flex items-center justify-between">
        {/* Brand Badge */}
        <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md">
          <div className="w-8 h-8 rounded-xl bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400">
            <Compass className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              Coordy
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">OpenStreetMap Vector Bearing</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Share Button */}
          <button
            onClick={handleShare}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl shadow-xl backdrop-blur-md text-xs font-semibold transition-all ${
              copiedShare
                ? 'bg-emerald-600/90 hover:bg-emerald-600 text-white border-emerald-400/50 scale-105'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400/40 hover:scale-102'
            }`}
            title="Copy link to share this vector map and zoom level"
          >
            {copiedShare ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-100" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Map & Zoom</span>
              </>
            )}
          </button>

          {vectors.length > 0 && (
            <button
              onClick={handleClearVectors}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/90 hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 border border-slate-700/80 hover:border-rose-700/80 rounded-xl shadow-lg backdrop-blur-md text-xs font-semibold transition-all"
              title="Clear all vectors on map"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear ({vectors.length})</span>
            </button>
          )}

          <button
            onClick={handleOpenCalculatorDirectly}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/30 rounded-xl shadow-xl backdrop-blur-md text-xs font-semibold transition-all"
          >
            <Compass className="w-4 h-4" />
            <span>Calculator Modal</span>
          </button>
        </div>
      </header>

      {/* Active Endpoint Adjustment Floating Banner */}
      {adjustingPoint && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
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
      <div className="absolute bottom-6 left-4 z-10 pointer-events-auto max-w-sm">
        <div className="p-3.5 bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md text-xs text-slate-200 flex flex-col gap-2">
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
              Click on the map to set <strong className="text-sky-400">Point A</strong>.
            </li>
            <li>
              Click another location to set <strong className="text-rose-400">Point B</strong>.
            </li>
            <li>
              A vector with its bearing label is drawn immediately.
            </li>
            <li>
              Click or drag an <strong className="text-amber-400">endpoint (A or B)</strong> to adjust any vector.
            </li>
            <li>
              Click <strong className="text-indigo-400">Share Map & Zoom</strong> to send your exact vectors, pan position, and zoom level!
            </li>
          </ol>

          {pendingPoint && (
            <div className="mt-1 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
              <span className="text-sky-300 flex items-center gap-1.5 animate-pulse">
                <Navigation className="w-3 h-3" />
                Point A selected! Click Point B.
              </span>
              <button
                onClick={() => setPendingPoint(null)}
                className="text-slate-400 hover:text-rose-400 text-[10px] underline cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {adjustingPoint && (
            <div className="mt-1 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
              <span className="text-amber-300 flex items-center gap-1.5 animate-pulse">
                <Navigation className="w-3 h-3 text-amber-400" />
                Adjusting {adjustingPoint.endpoint === 'from' ? 'Point A' : 'Point B'}! Click new location or drag.
              </span>
              <button
                onClick={() => setAdjustingPoint(null)}
                className="text-slate-400 hover:text-amber-400 text-[10px] underline cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Vectors Counter / List Summary (Bottom Right) */}
      {vectors.length > 0 && (
        <div className="hidden sm:block absolute bottom-6 right-4 z-10 pointer-events-auto max-w-xs">
          <div className="p-3 bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md text-xs max-h-48 overflow-y-auto">
            <div className="font-semibold text-slate-300 mb-1.5 flex justify-between items-center">
              <span>Vectors on Map</span>
              <span className="text-[10px] bg-blue-600/30 text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-500/30">
                {vectors.length}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {vectors.map((vec, idx) => (
                <button
                  key={vec.id}
                  onClick={() => handleSelectVector(vec)}
                  className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/40 text-[11px] transition-all text-left group"
                >
                  <span className="text-slate-400 font-mono">#{idx + 1}</span>
                  <span className="font-mono font-bold text-white group-hover:text-sky-300">
                    {vec.bearing.toFixed(1)}° {vec.cardinal}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {vec.distanceKm.toFixed(0)} km
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Bearing Modal Popup */}
      <BearingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialPointA={modalPointA}
        initialPointB={modalPointB}
      />
    </div>
  );
}
