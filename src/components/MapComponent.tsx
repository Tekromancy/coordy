'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { calculateGeographicBearing } from '@/lib/bearing';
import { MapViewState } from '@/lib/codec';

export interface MapVector {
  id: string;
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
}

function createEndpointIcon(type: 'from' | 'to', isAdjusting: boolean) {
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
  const color = isFrom ? '#3b82f6' : '#ef4444';
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

function createBearingLabelIcon(bearing: number, cardinal: string) {
  return L.divIcon({
    className: 'custom-bearing-label',
    html: `
      <div class="cursor-pointer group flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/90 text-white rounded-full shadow-lg border border-blue-500/60 backdrop-blur-sm text-xs font-semibold hover:scale-105 hover:border-blue-400 transition-transform">
        <span style="display:inline-block; transform: rotate(${bearing}deg); color: #38bdf8; font-size: 14px;">➤</span>
        <span class="font-mono text-white">${bearing.toFixed(1)}°</span>
        <span class="text-sky-300 text-[10px] bg-blue-950/80 px-1 py-0.5 rounded border border-blue-700/50">${cardinal}</span>
      </div>
    `,
    iconSize: [110, 30],
    iconAnchor: [55, 15],
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
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const previewLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const pendingMarkerRef = useRef<L.CircleMarker | null>(null);
  const hasAppliedInitialViewRef = useRef(false);
  const isDraggingRef = useRef(false);

  // Keep references to latest props for Leaflet events
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
  ]);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Fix leaflet marker icon paths
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

    // Add zoom control to top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Standard OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    previewLayerGroupRef.current = L.layerGroup().addTo(map);

    // Track zoom and pan movements to report view state changes
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

    // Handle Map Clicks
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
      } = propsRef.current;

      // If an endpoint is currently selected for adjustment, update it to the clicked location
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
          const calc = calculateGeographicBearing(p1, p2);

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
        return;
      }

      if (!pendingPoint) {
        // First click: start of vector
        onSetPendingPoint(latLng);
      } else {
        // Second click: end of vector
        const p1 = { lat: pendingPoint[0], lon: pendingPoint[1] };
        const p2 = { lat: latLng[0], lon: latLng[1] };
        const calc = calculateGeographicBearing(p1, p2);

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
      }
    });

    // Handle Live Mouse Movement during adjustment preview
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const { adjustingPoint, vectors } = propsRef.current;
      const previewLayer = previewLayerGroupRef.current;
      if (!adjustingPoint || !previewLayer) return;

      const vec = vectors.find((v) => v.id === adjustingPoint.vectorId);
      if (!vec) return;

      previewLayer.clearLayers();

      const mouseCoord: [number, number] = [e.latlng.lat, e.latlng.lng];
      const isFrom = adjustingPoint.endpoint === 'from';
      const fixedCoord = isFrom ? vec.to : vec.from;
      const p1 = isFrom
        ? { lat: mouseCoord[0], lon: mouseCoord[1] }
        : { lat: fixedCoord[0], lon: fixedCoord[1] };
      const p2 = isFrom
        ? { lat: fixedCoord[0], lon: fixedCoord[1] }
        : { lat: mouseCoord[0], lon: mouseCoord[1] };
      const calc = calculateGeographicBearing(p1, p2);

      const previewLine = L.polyline([[p1.lat, p1.lon], [p2.lat, p2.lon]], {
        color: '#f59e0b',
        weight: 3,
        dashArray: '6, 8',
        opacity: 0.9,
      });

      const midLat = (p1.lat + p2.lat) / 2;
      const midLng = (p1.lon + p2.lon) / 2;
      const previewBadge = L.marker([midLat, midLng], {
        icon: createBearingLabelIcon(calc.bearing, calc.cardinal),
      });

      previewLayer.addLayer(previewLine);
      previewLayer.addLayer(previewBadge);
    });

    // Handle Escape key to cancel adjustment or pending point
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (propsRef.current.adjustingPoint) {
          propsRef.current.onSetAdjustingPoint(null);
        } else if (propsRef.current.pendingPoint) {
          propsRef.current.onSetPendingPoint(null);
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

  // Update map view when initialViewState arrives after mount
  useEffect(() => {
    if (initialViewState && mapInstanceRef.current && !hasAppliedInitialViewRef.current) {
      mapInstanceRef.current.setView(initialViewState.center, initialViewState.zoom);
      hasAppliedInitialViewRef.current = true;
    }
  }, [initialViewState]);

  // Adjust cursor style when in adjustment mode
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const container = mapInstanceRef.current.getContainer();
    if (adjustingPoint) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }

    if (!adjustingPoint && previewLayerGroupRef.current) {
      previewLayerGroupRef.current.clearLayers();
    }
  }, [adjustingPoint]);

  // 2. Render Pending Point Marker
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

      marker.bindTooltip('Point A (Click destination)', {
        permanent: true,
        direction: 'top',
        className: 'pending-marker-tooltip',
      });

      pendingMarkerRef.current = marker;
    }
  }, [pendingPoint]);

  // 3. Render Completed Vectors with Clickable & Draggable Endpoints
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

      // Start Marker (Point A - Blue)
      const startMarker = L.marker(vec.from, {
        icon: createEndpointIcon('from', isAdjustingFrom),
        draggable: true,
      });

      // End Marker (Point B - Red)
      const endMarker = L.marker(vec.to, {
        icon: createEndpointIcon('to', isAdjustingTo),
        draggable: true,
      });

      // Main line connecting A -> B
      const polyline = L.polyline([vec.from, vec.to], {
        color: isAdjustingFrom || isAdjustingTo ? '#60a5fa' : '#2563eb',
        weight: 4,
        opacity: isAdjustingFrom || isAdjustingTo ? 0.4 : 0.85,
        lineCap: 'round',
      });

      // Midpoint label displaying bearing
      const midLat = (vec.from[0] + vec.to[0]) / 2;
      const midLng = (vec.from[1] + vec.to[1]) / 2;
      const labelMarker = L.marker([midLat, midLng], {
        icon: createBearingLabelIcon(vec.bearing, vec.cardinal),
      });

      // Tooltips for endpoints explaining adjustment options
      if (isAdjustingFrom) {
        startMarker.bindTooltip('Point A active • Click map or drag to place', {
          permanent: true,
          direction: 'top',
          className: 'custom-endpoint-tooltip',
          offset: [0, -18],
        });
      } else {
        startMarker.bindTooltip('Point A (Click or drag to adjust)', {
          direction: 'top',
          className: 'custom-endpoint-tooltip',
          offset: [0, -14],
        });
      }

      if (isAdjustingTo) {
        endMarker.bindTooltip('Point B active • Click map or drag to place', {
          permanent: true,
          direction: 'top',
          className: 'custom-endpoint-tooltip',
          offset: [0, -18],
        });
      } else {
        endMarker.bindTooltip('Point B (Click or drag to adjust)', {
          direction: 'top',
          className: 'custom-endpoint-tooltip',
          offset: [0, -14],
        });
      }

      // Dragging handlers for Start Marker (Point A)
      startMarker.on('dragstart', () => {
        isDraggingRef.current = true;
      });

      startMarker.on('drag', (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const newPos = marker.getLatLng();
        const newCoord: [number, number] = [newPos.lat, newPos.lng];
        polyline.setLatLngs([newCoord, vec.to]);
        const calc = calculateGeographicBearing(
          { lat: newCoord[0], lon: newCoord[1] },
          { lat: vec.to[0], lon: vec.to[1] }
        );
        const mLat = (newCoord[0] + vec.to[0]) / 2;
        const mLng = (newCoord[1] + vec.to[1]) / 2;
        labelMarker.setLatLng([mLat, mLng]);
        labelMarker.setIcon(createBearingLabelIcon(calc.bearing, calc.cardinal));
      });

      startMarker.on('dragend', (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const newPos = marker.getLatLng();
        const newCoord: [number, number] = [newPos.lat, newPos.lng];
        const calc = calculateGeographicBearing(
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

      // Click on Start Marker toggles adjustment mode
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

      // Dragging handlers for End Marker (Point B)
      endMarker.on('dragstart', () => {
        isDraggingRef.current = true;
      });

      endMarker.on('drag', (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const newPos = marker.getLatLng();
        const newCoord: [number, number] = [newPos.lat, newPos.lng];
        polyline.setLatLngs([vec.from, newCoord]);
        const calc = calculateGeographicBearing(
          { lat: vec.from[0], lon: vec.from[1] },
          { lat: newCoord[0], lon: newCoord[1] }
        );
        const mLat = (vec.from[0] + newCoord[0]) / 2;
        const mLng = (vec.from[1] + newCoord[1]) / 2;
        labelMarker.setLatLng([mLat, mLng]);
        labelMarker.setIcon(createBearingLabelIcon(calc.bearing, calc.cardinal));
      });

      endMarker.on('dragend', (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const newPos = marker.getLatLng();
        const newCoord: [number, number] = [newPos.lat, newPos.lng];
        const calc = calculateGeographicBearing(
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

      // Click on End Marker toggles adjustment mode
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

      // Click on line or bearing label opens bearing details modal
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

    // If no explicit initialViewState was supplied with zoom/center, auto-fit once
    if (!initialViewState && !hasAppliedInitialViewRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      hasAppliedInitialViewRef.current = true;
    }
  }, [vectors, adjustingPoint, initialViewState]);

  return <div ref={mapContainerRef} className="w-full h-full relative z-0" />;
}
