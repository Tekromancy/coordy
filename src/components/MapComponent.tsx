'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  calculateGeographicBearing,
  calculateRhumbBearing,
  interpolateGreatCircle,
  formatDistance,
  CalculationMode,
} from '@/lib/bearing';
import { MapViewState } from '@/lib/codec';
import { Layers } from 'lucide-react';

export interface MapVector {
  id: string;
  label?: string;
  color?: string;
  from: [number, number]; // [lat, lng]
  to: [number, number];
  bearing: number;
  cardinal: string;
  distanceKm: number;
}

export interface AdjustingPoint {
  vectorId: string;
  endpoint: 'from' | 'to';
}

export type BasemapId = 'osm' | 'dark' | 'topo' | 'satellite';

export const BASEMAPS: { id: BasemapId; name: string; url: string; attribution: string; maxZoom: number }[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: 'dark',
    name: 'Carto Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  },
  {
    id: 'topo',
    name: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  },
  {
    id: 'satellite',
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Earthstar Geographics',
    maxZoom: 18,
  },
];

interface MapComponentProps {
  vectors: MapVector[];
  onAddVector: (vector: MapVector) => void;
  onUpdateVector: (vector: MapVector) => void;
  pendingPoint: [number, number] | null;
  onSetPendingPoint: (point: [number, number] | null) => void;
  adjustingPoint: AdjustingPoint | null;
  onSetAdjustingPoint: (adjusting: AdjustingPoint | null) => void;
  onSelectVector: (vector: MapVector) => void;
  onViewStateChange?: (viewState: MapViewState) => void;
  initialViewState?: MapViewState;
  mode?: CalculationMode;
  currentBasemap?: BasemapId;
  onBasemapChange?: (basemap: BasemapId) => void;
  flyToTarget?: { center: [number, number]; zoom?: number; timestamp: number } | null;
}

function createEndpointIcon(type: 'from' | 'to', isAdjusting: boolean, customColor?: string) {
  if (isAdjusting) {
    return L.divIcon({
      className: 'custom-endpoint-marker',
      html: `
        <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; transform: translate(-16px, -16px); cursor: crosshair;">
          <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background-color: rgba(245, 158, 11, 0.45); animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 16px; height: 16px; border-radius: 50%; background-color: #f59e0b; border: 2.5px solid #ffffff; box-shadow: 0 0 12px rgba(245, 158, 11, 0.9); z-index: 10;"></div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }

  const isFrom = type === 'from';
  const color = customColor || (isFrom ? '#3b82f6' : '#ef4444');
  const label = isFrom ? 'A' : 'B';

  return L.divIcon({
    className: 'custom-endpoint-marker',
    html: `
      <div class="group" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; transform: translate(-14px, -14px); cursor: grab;">
        <div style="width: 18px; height: 18px; border-radius: 50%; background-color: ${color}; border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #ffffff; user-select: none; transition: transform 0.15s ease;" class="endpoint-dot">
          ${label}
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createBearingLabelIcon(bearing: number, cardinal: string, distanceKm?: number, isPreview = false) {
  const distText = distanceKm !== undefined ? formatDistance(distanceKm * 1000) : '';
  const bgClass = isPreview
    ? 'bg-amber-950/95 border-amber-500/80 text-amber-200'
    : 'bg-slate-900/90 border-blue-500/60 text-white';

  return L.divIcon({
    className: 'custom-bearing-label',
    html: `
      <div class="cursor-pointer flex items-center gap-1.5 px-2.5 py-1 ${bgClass} rounded-full shadow-xl border backdrop-blur-sm text-xs font-semibold hover:scale-105 transition-transform select-none">
        <span style="display:inline-block; transform: rotate(${bearing}deg); color: ${
      isPreview ? '#fbbf24' : '#38bdf8'
    }; font-size: 13px;">➤</span>
        <span class="font-mono">${bearing.toFixed(1)}°</span>
        <span class="text-[10px] px-1 py-0.5 rounded ${
          isPreview
            ? 'bg-amber-900/80 text-amber-300 border border-amber-600/40'
            : 'bg-blue-950/80 text-sky-300 border border-blue-700/50'
        }">${cardinal}</span>
        ${distText ? `<span class="text-[10px] text-slate-300 font-normal pl-0.5 border-l border-slate-700/60">${distText}</span>` : ''}
      </div>
    `,
    iconSize: [140, 30],
    iconAnchor: [70, 15],
  });
}

export default function MapComponent({
  vectors,
  onAddVector,
  onUpdateVector,
  pendingPoint,
  onSetPendingPoint,
  adjustingPoint,
  onSetAdjustingPoint,
  onSelectVector,
  onViewStateChange,
  initialViewState,
  mode = 'geographic',
  currentBasemap = 'dark',
  onBasemapChange,
  flyToTarget,
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const previewLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const pendingMarkerRef = useRef<L.CircleMarker | null>(null);
  const hasAppliedInitialViewRef = useRef(false);
  const isDraggingRef = useRef(false);
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);

  const propsRef = useRef({
    vectors,
    pendingPoint,
    onSetPendingPoint,
    onAddVector,
    onUpdateVector,
    adjustingPoint,
    onSetAdjustingPoint,
    onSelectVector,
    onViewStateChange,
    mode,
    currentBasemap,
  });

  useEffect(() => {
    propsRef.current = {
      vectors,
      pendingPoint,
      onSetPendingPoint,
      onAddVector,
      onUpdateVector,
      adjustingPoint,
      onSetAdjustingPoint,
      onSelectVector,
      onViewStateChange,
      mode,
      currentBasemap,
    };
  }, [
    vectors,
    pendingPoint,
    onSetPendingPoint,
    onAddVector,
    onUpdateVector,
    adjustingPoint,
    onSetAdjustingPoint,
    onSelectVector,
    onViewStateChange,
    mode,
    currentBasemap,
  ]);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const defaultCenter: [number, number] = initialViewState?.center || [30.2672, -97.7431];
    const defaultZoom = initialViewState?.zoom || 6;

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Initial tile layer
    const baseDef = BASEMAPS.find((b) => b.id === currentBasemap) || BASEMAPS[1];
    const tileLayer = L.tileLayer(baseDef.url, {
      maxZoom: baseDef.maxZoom,
      attribution: baseDef.attribution,
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    layerGroupRef.current = L.layerGroup().addTo(map);
    previewLayerGroupRef.current = L.layerGroup().addTo(map);

    const emitViewState = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      propsRef.current.onViewStateChange?.({
        center: [c.lat, c.lng],
        zoom: z,
      });
    };

    map.on('moveend', emitViewState);
    map.on('zoomend', emitViewState);
    emitViewState();

    // Map Click
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (isDraggingRef.current) return;

      const latLng: [number, number] = [e.latlng.lat, e.latlng.lng];
      const {
        pendingPoint,
        onSetPendingPoint,
        onAddVector,
        adjustingPoint,
        onSetAdjustingPoint,
        onUpdateVector,
        vectors,
        mode,
      } = propsRef.current;

      // Adjusting existing vector endpoint
      if (adjustingPoint) {
        const vec = vectors.find((v) => v.id === adjustingPoint.vectorId);
        if (vec) {
          const isFrom = adjustingPoint.endpoint === 'from';
          const p1 = isFrom
            ? { lat: latLng[0], lon: latLng[1] }
            : { lat: vec.from[0], lon: vec.from[1] };
          const p2 = isFrom
            ? { lat: vec.to[0], lon: vec.to[1] }
            : { lat: latLng[0], lon: latLng[1] };

          const calc =
            mode === 'rhumb'
              ? calculateRhumbBearing(p1, p2)
              : calculateGeographicBearing(p1, p2);

          const updatedVector: MapVector = {
            ...vec,
            from: isFrom ? latLng : vec.from,
            to: isFrom ? vec.to : latLng,
            bearing: calc.bearing,
            cardinal: calc.cardinal,
            distanceKm: calc.distanceKm || 0,
          };
          onUpdateVector(updatedVector);
        }
        onSetAdjustingPoint(null);
        if (previewLayerGroupRef.current) previewLayerGroupRef.current.clearLayers();
        return;
      }

      if (!pendingPoint) {
        onSetPendingPoint(latLng);
      } else {
        const p1 = { lat: pendingPoint[0], lon: pendingPoint[1] };
        const p2 = { lat: latLng[0], lon: latLng[1] };
        const calc =
          mode === 'rhumb'
            ? calculateRhumbBearing(p1, p2)
            : calculateGeographicBearing(p1, p2);

        const newVector: MapVector = {
          id: 'vec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          from: pendingPoint,
          to: latLng,
          bearing: calc.bearing,
          cardinal: calc.cardinal,
          distanceKm: calc.distanceKm || 0,
        };

        onAddVector(newVector);
        onSetPendingPoint(null);
        if (previewLayerGroupRef.current) previewLayerGroupRef.current.clearLayers();
      }
    });

    // Mouse Move for Live Rubber-band preview
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const { adjustingPoint, pendingPoint, vectors, mode } = propsRef.current;
      const previewLayer = previewLayerGroupRef.current;
      if (!previewLayer) return;

      const mouseCoord: [number, number] = [e.latlng.lat, e.latlng.lng];

      // Case A: Adjusting existing point
      if (adjustingPoint) {
        const vec = vectors.find((v) => v.id === adjustingPoint.vectorId);
        if (!vec) return;
        previewLayer.clearLayers();

        const isFrom = adjustingPoint.endpoint === 'from';
        const fixedCoord = isFrom ? vec.to : vec.from;
        const p1 = isFrom
          ? { lat: mouseCoord[0], lon: mouseCoord[1] }
          : { lat: fixedCoord[0], lon: fixedCoord[1] };
        const p2 = isFrom
          ? { lat: fixedCoord[0], lon: fixedCoord[1] }
          : { lat: mouseCoord[0], lon: mouseCoord[1] };

        const calc =
          mode === 'rhumb'
            ? calculateRhumbBearing(p1, p2)
            : calculateGeographicBearing(p1, p2);

        const polylineCoords: L.LatLngTuple[] =
          mode === 'rhumb'
            ? [
                [p1.lat, p1.lon],
                [p2.lat, p2.lon],
              ]
            : (interpolateGreatCircle([p1.lat, p1.lon], [p2.lat, p2.lon], 24) as L.LatLngTuple[]);

        const previewLine = L.polyline(polylineCoords, {
          color: '#f59e0b',
          weight: 3,
          dashArray: '6, 8',
          opacity: 0.9,
        });

        const midIndex = Math.floor(polylineCoords.length / 2);
        const midPoint: L.LatLngTuple = polylineCoords[midIndex];
        const previewBadge = L.marker(midPoint, {
          icon: createBearingLabelIcon(calc.bearing, calc.cardinal, calc.distanceKm, true),
        });

        previewLayer.addLayer(previewLine);
        previewLayer.addLayer(previewBadge);
        return;
      }

      // Case B: Pending Point A active (rubber-band to mouse for Point B)
      if (pendingPoint) {
        previewLayer.clearLayers();

        const p1 = { lat: pendingPoint[0], lon: pendingPoint[1] };
        const p2 = { lat: mouseCoord[0], lon: mouseCoord[1] };

        const calc =
          mode === 'rhumb'
            ? calculateRhumbBearing(p1, p2)
            : calculateGeographicBearing(p1, p2);

        const polylineCoords: L.LatLngTuple[] =
          mode === 'rhumb'
            ? [
                [p1.lat, p1.lon],
                [p2.lat, p2.lon],
              ]
            : (interpolateGreatCircle([p1.lat, p1.lon], [p2.lat, p2.lon], 24) as L.LatLngTuple[]);

        const previewLine = L.polyline(polylineCoords, {
          color: '#38bdf8',
          weight: 2.5,
          dashArray: '5, 7',
          opacity: 0.85,
        });

        const midIndex = Math.floor(polylineCoords.length / 2);
        const midPoint: L.LatLngTuple = polylineCoords[midIndex];
        const previewBadge = L.marker(midPoint, {
          icon: createBearingLabelIcon(calc.bearing, calc.cardinal, calc.distanceKm, false),
        });

        previewLayer.addLayer(previewLine);
        previewLayer.addLayer(previewBadge);
        return;
      }

      if (previewLayer.getLayers().length > 0) {
        previewLayer.clearLayers();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (propsRef.current.adjustingPoint) {
          propsRef.current.onSetAdjustingPoint(null);
        } else if (propsRef.current.pendingPoint) {
          propsRef.current.onSetPendingPoint(null);
        }
        if (previewLayerGroupRef.current) {
          previewLayerGroupRef.current.clearLayers();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    mapInstanceRef.current = map;

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update basemap tiles when changed
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const baseDef = BASEMAPS.find((b) => b.id === currentBasemap) || BASEMAPS[1];

    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(baseDef.url);
      tileLayerRef.current.options.maxZoom = baseDef.maxZoom;
    }
  }, [currentBasemap]);

  // FlyTo programmatic triggers
  useEffect(() => {
    if (flyToTarget && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(flyToTarget.center, flyToTarget.zoom || 12, {
        duration: 1.2,
      });
    }
  }, [flyToTarget]);

  // Initial view state on mount
  useEffect(() => {
    if (initialViewState && mapInstanceRef.current && !hasAppliedInitialViewRef.current) {
      mapInstanceRef.current.setView(initialViewState.center, initialViewState.zoom);
      hasAppliedInitialViewRef.current = true;
    }
  }, [initialViewState]);

  // Cursor style & clear preview on cancel
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const container = mapInstanceRef.current.getContainer();
    if (adjustingPoint || pendingPoint) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }

    if (!adjustingPoint && !pendingPoint && previewLayerGroupRef.current) {
      previewLayerGroupRef.current.clearLayers();
    }
  }, [adjustingPoint, pendingPoint]);

  // Pending Marker rendering
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (pendingMarkerRef.current) {
      pendingMarkerRef.current.remove();
      pendingMarkerRef.current = null;
    }

    if (pendingPoint) {
      const marker = L.circleMarker(pendingPoint, {
        radius: 7,
        fillColor: '#38bdf8',
        fillOpacity: 0.9,
        color: '#ffffff',
        weight: 2,
      }).addTo(map);

      marker.bindTooltip('Point A (Move mouse to preview, click to set Point B)', {
        permanent: true,
        direction: 'top',
        className: 'pending-marker-tooltip',
      });

      pendingMarkerRef.current = marker;
    }
  }, [pendingPoint]);

  // Render Completed Vectors with Geodesic Curves & Endpoints
  useEffect(() => {
    if (!layerGroupRef.current || !mapInstanceRef.current) return;
    const layerGroup = layerGroupRef.current;
    const map = mapInstanceRef.current;
    layerGroup.clearLayers();

    if (vectors.length === 0) return;

    const bounds = L.latLngBounds([]);

    vectors.forEach((vec) => {
      bounds.extend(vec.from);
      bounds.extend(vec.to);

      const isAdjustingFrom =
        adjustingPoint?.vectorId === vec.id && adjustingPoint?.endpoint === 'from';
      const isAdjustingTo =
        adjustingPoint?.vectorId === vec.id && adjustingPoint?.endpoint === 'to';

      const startMarker = L.marker(vec.from, {
        icon: createEndpointIcon('from', isAdjustingFrom, vec.color),
        draggable: true,
      });

      const endMarker = L.marker(vec.to, {
        icon: createEndpointIcon('to', isAdjustingTo, vec.color),
        draggable: true,
      });

      // Geodesic curve interpolation vs direct line
      const polylinePoints: L.LatLngTuple[] =
        mode === 'rhumb'
          ? [vec.from, vec.to]
          : (interpolateGreatCircle(vec.from, vec.to, 32) as L.LatLngTuple[]);

      const lineColor = vec.color || (isAdjustingFrom || isAdjustingTo ? '#60a5fa' : '#2563eb');
      const polyline = L.polyline(polylinePoints, {
        color: lineColor,
        weight: 4,
        opacity: isAdjustingFrom || isAdjustingTo ? 0.4 : 0.85,
        lineCap: 'round',
      });

      // Midpoint along the curve
      const midIdx = Math.floor(polylinePoints.length / 2);
      const midPoint: L.LatLngTuple = polylinePoints[midIdx];
      const labelMarker = L.marker(midPoint, {
        icon: createBearingLabelIcon(vec.bearing, vec.cardinal, vec.distanceKm),
      });

      startMarker.bindTooltip(
        isAdjustingFrom
          ? 'Point A active • Click map or drag to place'
          : 'Point A (Click or drag to adjust)',
        {
          direction: 'top',
          permanent: isAdjustingFrom,
          className: 'custom-endpoint-tooltip',
          offset: [0, -14],
        }
      );

      endMarker.bindTooltip(
        isAdjustingTo
          ? 'Point B active • Click map or drag to place'
          : 'Point B (Click or drag to adjust)',
        {
          direction: 'top',
          permanent: isAdjustingTo,
          className: 'custom-endpoint-tooltip',
          offset: [0, -14],
        }
      );

      // Start drag handlers
      startMarker.on('dragstart', () => {
        isDraggingRef.current = true;
      });

      startMarker.on('drag', (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        const newCoord: [number, number] = [pos.lat, pos.lng];
        const newPts: L.LatLngTuple[] =
          mode === 'rhumb'
            ? [newCoord, vec.to]
            : (interpolateGreatCircle(newCoord, vec.to, 24) as L.LatLngTuple[]);
        polyline.setLatLngs(newPts);

        const calc =
          mode === 'rhumb'
            ? calculateRhumbBearing(
                { lat: newCoord[0], lon: newCoord[1] },
                { lat: vec.to[0], lon: vec.to[1] }
              )
            : calculateGeographicBearing(
                { lat: newCoord[0], lon: newCoord[1] },
                { lat: vec.to[0], lon: vec.to[1] }
              );

        const mIdx = Math.floor(newPts.length / 2);
        labelMarker.setLatLng(newPts[mIdx]);
        labelMarker.setIcon(createBearingLabelIcon(calc.bearing, calc.cardinal, calc.distanceKm));
      });

      startMarker.on('dragend', (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        const newCoord: [number, number] = [pos.lat, pos.lng];
        const calc =
          mode === 'rhumb'
            ? calculateRhumbBearing(
                { lat: newCoord[0], lon: newCoord[1] },
                { lat: vec.to[0], lon: vec.to[1] }
              )
            : calculateGeographicBearing(
                { lat: newCoord[0], lon: newCoord[1] },
                { lat: vec.to[0], lon: vec.to[1] }
              );

        const updatedVector: MapVector = {
          ...vec,
          from: newCoord,
          bearing: calc.bearing,
          cardinal: calc.cardinal,
          distanceKm: calc.distanceKm || 0,
        };
        propsRef.current.onUpdateVector(updatedVector);
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 80);
      });

      startMarker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (isDraggingRef.current) return;
        const currentAdj = propsRef.current.adjustingPoint;
        if (currentAdj?.vectorId === vec.id && currentAdj.endpoint === 'from') {
          propsRef.current.onSetAdjustingPoint(null);
        } else {
          propsRef.current.onSetAdjustingPoint({ vectorId: vec.id, endpoint: 'from' });
        }
      });

      // End drag handlers
      endMarker.on('dragstart', () => {
        isDraggingRef.current = true;
      });

      endMarker.on('drag', (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        const newCoord: [number, number] = [pos.lat, pos.lng];
        const newPts: L.LatLngTuple[] =
          mode === 'rhumb'
            ? [vec.from, newCoord]
            : (interpolateGreatCircle(vec.from, newCoord, 24) as L.LatLngTuple[]);
        polyline.setLatLngs(newPts);

        const calc =
          mode === 'rhumb'
            ? calculateRhumbBearing(
                { lat: vec.from[0], lon: vec.from[1] },
                { lat: newCoord[0], lon: newCoord[1] }
              )
            : calculateGeographicBearing(
                { lat: vec.from[0], lon: vec.from[1] },
                { lat: newCoord[0], lon: newCoord[1] }
              );

        const mIdx = Math.floor(newPts.length / 2);
        labelMarker.setLatLng(newPts[mIdx]);
        labelMarker.setIcon(createBearingLabelIcon(calc.bearing, calc.cardinal, calc.distanceKm));
      });

      endMarker.on('dragend', (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        const newCoord: [number, number] = [pos.lat, pos.lng];
        const calc =
          mode === 'rhumb'
            ? calculateRhumbBearing(
                { lat: vec.from[0], lon: vec.from[1] },
                { lat: newCoord[0], lon: newCoord[1] }
              )
            : calculateGeographicBearing(
                { lat: vec.from[0], lon: vec.from[1] },
                { lat: newCoord[0], lon: newCoord[1] }
              );

        const updatedVector: MapVector = {
          ...vec,
          to: newCoord,
          bearing: calc.bearing,
          cardinal: calc.cardinal,
          distanceKm: calc.distanceKm || 0,
        };
        propsRef.current.onUpdateVector(updatedVector);
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 80);
      });

      endMarker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (isDraggingRef.current) return;
        const currentAdj = propsRef.current.adjustingPoint;
        if (currentAdj?.vectorId === vec.id && currentAdj.endpoint === 'to') {
          propsRef.current.onSetAdjustingPoint(null);
        } else {
          propsRef.current.onSetAdjustingPoint({ vectorId: vec.id, endpoint: 'to' });
        }
      });

      const handleSelect = (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        propsRef.current.onSelectVector(vec);
      };

      polyline.on('click', handleSelect);
      labelMarker.on('click', handleSelect);

      layerGroup.addLayer(polyline);
      layerGroup.addLayer(startMarker);
      layerGroup.addLayer(endMarker);
      layerGroup.addLayer(labelMarker);
    });

    if (!initialViewState && !hasAppliedInitialViewRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      hasAppliedInitialViewRef.current = true;
    }
  }, [vectors, adjustingPoint, initialViewState, mode]);

  return (
    <div className="w-full h-full relative z-0">
      <div ref={mapContainerRef} className="w-full h-full relative z-0" />

      {/* Basemap Switcher floating button (top right, below Leaflet zoom controls) */}
      <div className="absolute top-20 right-3 z-[1000] pointer-events-auto">
        <div className="relative">
          <button
            onClick={() => setShowBasemapMenu(!showBasemapMenu)}
            className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 rounded-xl shadow-xl backdrop-blur-md transition-all cursor-pointer"
            title="Switch Base Map Layers"
          >
            <Layers className="w-4 h-4 text-sky-400" />
          </button>

          {showBasemapMenu && (
            <div className="absolute right-0 top-full mt-2 w-44 bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md p-1.5 z-50 flex flex-col gap-1 text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 py-1">
                Base Maps
              </span>
              {BASEMAPS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    onBasemapChange?.(b.id);
                    setShowBasemapMenu(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                    currentBasemap === b.id
                      ? 'bg-blue-600 text-white font-medium shadow'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <span>{b.name}</span>
                  {currentBasemap === b.id && <span className="text-[10px]">●</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
