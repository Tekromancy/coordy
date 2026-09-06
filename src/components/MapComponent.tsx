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

interface MapComponentProps {
  vectors: MapVector[];
  onAddVector: (vector: MapVector) => void;
  pendingPoint: [number, number] | null;
  onSetPendingPoint: (point: [number, number] | null) => void;
  onSelectVector: (vector: MapVector) => void;
  onViewStateChange?: (viewState: MapViewState) => void;
  initialViewState?: MapViewState;
}

export default function MapComponent({
  vectors,
  onAddVector,
  pendingPoint,
  onSetPendingPoint,
  onSelectVector,
  onViewStateChange,
  initialViewState,
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const pendingMarkerRef = useRef<L.CircleMarker | null>(null);
  const hasAppliedInitialViewRef = useRef(false);

  // Keep references to props so Leaflet event handlers always access the latest callbacks
  const propsRef = useRef({
    pendingPoint,
    onSetPendingPoint,
    onAddVector,
    onSelectVector,
    onViewStateChange,
  });

  useEffect(() => {
    propsRef.current = {
      pendingPoint,
      onSetPendingPoint,
      onAddVector,
      onSelectVector,
      onViewStateChange,
    };
  }, [pendingPoint, onSetPendingPoint, onAddVector, onSelectVector, onViewStateChange]);

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

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;

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

    // Initial emit
    emitViewState();

    // Handle Map Clicks
    map.on('click', (e: L.LeafletMouseEvent) => {
      const latLng: [number, number] = [e.latlng.lat, e.latlng.lng];
      const { pendingPoint, onSetPendingPoint, onAddVector } = propsRef.current;

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

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update map view when initialViewState arrives after mount (e.g. from async decode)
  useEffect(() => {
    if (initialViewState && mapInstanceRef.current && !hasAppliedInitialViewRef.current) {
      mapInstanceRef.current.setView(initialViewState.center, initialViewState.zoom);
      hasAppliedInitialViewRef.current = true;
    }
  }, [initialViewState]);

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

  // 3. Render Completed Vectors
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

      // Start Marker (Blue point)
      const startMarker = L.circleMarker(vec.from, {
        radius: 5,
        fillColor: '#3b82f6',
        fillOpacity: 1,
        color: '#ffffff',
        weight: 2,
      });

      // End Marker (Red arrow point)
      const endMarker = L.circleMarker(vec.to, {
        radius: 5,
        fillColor: '#ef4444',
        fillOpacity: 1,
        color: '#ffffff',
        weight: 2,
      });

      // Main line connecting A -> B
      const polyline = L.polyline([vec.from, vec.to], {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85,
        lineCap: 'round',
      });

      // Calculate midpoint for bearing label
      const midLat = (vec.from[0] + vec.to[0]) / 2;
      const midLng = (vec.from[1] + vec.to[1]) / 2;

      // Small Custom HTML Label displaying bearing
      const labelIcon = L.divIcon({
        className: 'custom-bearing-label',
        html: `
          <div class="cursor-pointer group flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/90 text-white rounded-full shadow-lg border border-blue-500/60 backdrop-blur-sm text-xs font-semibold hover:scale-105 hover:border-blue-400 transition-transform">
            <span style="display:inline-block; transform: rotate(${vec.bearing}deg); color: #38bdf8; font-size: 14px;">➤</span>
            <span class="font-mono text-white">${vec.bearing.toFixed(1)}°</span>
            <span class="text-sky-300 text-[10px] bg-blue-950/80 px-1 py-0.5 rounded border border-blue-700/50">${vec.cardinal}</span>
          </div>
        `,
        iconSize: [110, 30],
        iconAnchor: [55, 15],
      });

      const labelMarker = L.marker([midLat, midLng], { icon: labelIcon });

      // Click on vector or label opens bearing details modal
      const handleClick = () => {
        propsRef.current.onSelectVector(vec);
      };

      polyline.on('click', handleClick);
      labelMarker.on('click', handleClick);
      startMarker.on('click', handleClick);
      endMarker.on('click', handleClick);

      layerGroup.addLayer(polyline);
      layerGroup.addLayer(startMarker);
      layerGroup.addLayer(endMarker);
      layerGroup.addLayer(labelMarker);
    });

    // If no explicit initialViewState was supplied with zoom/center, auto-fit to vectors once
    if (!initialViewState && !hasAppliedInitialViewRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      hasAppliedInitialViewRef.current = true;
    }
  }, [vectors, initialViewState]);

  return <div ref={mapContainerRef} className="w-full h-full relative z-0" />;
}
