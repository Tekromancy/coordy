import { MapVector } from '@/components/MapComponent';
import { calculateGeographicBearing, CalculationMode } from '@/lib/bearing';

export interface MapViewState {
  center: [number, number]; // [lat, lng]
  zoom: number;
}

export type CompactVector = [number, number, number, number];

export interface SharedMapPayload {
  v: CompactVector[];
  z?: number;
  c?: [number, number]; // [lat, lng]
  m?: CalculationMode;
  b?: string; // basemap ID
  l?: string[]; // vector labels
}

export function encodeMapStateToHash(
  vectors: MapVector[],
  viewState?: MapViewState,
  mode?: CalculationMode,
  basemap?: string
): string {
  const compact: CompactVector[] = vectors.map((v) => [
    Number(v.from[0].toFixed(5)),
    Number(v.from[1].toFixed(5)),
    Number(v.to[0].toFixed(5)),
    Number(v.to[1].toFixed(5)),
  ]);

  const payload: SharedMapPayload = { v: compact };

  if (viewState) {
    payload.z = Math.round(viewState.zoom * 10) / 10;
    payload.c = [
      Number(viewState.center[0].toFixed(5)),
      Number(viewState.center[1].toFixed(5)),
    ];
  }

  if (mode && mode !== 'geographic') {
    payload.m = mode;
  }

  if (basemap && basemap !== 'osm') {
    payload.b = basemap;
  }

  const hasLabels = vectors.some((v) => Boolean(v.label));
  if (hasLabels) {
    payload.l = vectors.map((v) => v.label || '');
  }

  try {
    const jsonStr = JSON.stringify(payload);
    if (typeof window !== 'undefined') {
      return btoa(jsonStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } else {
      return Buffer.from(jsonStr).toString('base64url');
    }
  } catch (e) {
    console.error('Failed to encode map state:', e);
    return '';
  }
}

export function decodeMapStateFromHash(hash: string): {
  vectors: MapVector[];
  viewState?: MapViewState;
  mode?: CalculationMode;
  basemap?: string;
} {
  if (!hash) return { vectors: [] };
  try {
    let base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const jsonStr =
      typeof window !== 'undefined'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf-8');
    const parsed = JSON.parse(jsonStr);

    let rawVectors: CompactVector[] = [];
    let viewState: MapViewState | undefined;
    let mode: CalculationMode | undefined;
    let basemap: string | undefined;
    let labels: string[] | undefined;

    // Backwards-compatible: either raw array of vectors or object with { v, z, c, m, b, l }
    if (Array.isArray(parsed)) {
      rawVectors = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.v)) {
        rawVectors = parsed.v;
      }
      if (typeof parsed.z === 'number' && Array.isArray(parsed.c) && parsed.c.length === 2) {
        viewState = {
          zoom: parsed.z,
          center: [parsed.c[0], parsed.c[1]],
        };
      }
      if (parsed.m === 'geographic' || parsed.m === 'rhumb' || parsed.m === 'planar') {
        mode = parsed.m;
      }
      if (typeof parsed.b === 'string') {
        basemap = parsed.b;
      }
      if (Array.isArray(parsed.l)) {
        labels = parsed.l;
      }
    }

    const vectors: MapVector[] = rawVectors.map((c, idx) => {
      const from: [number, number] = [c[0], c[1]];
      const to: [number, number] = [c[2], c[3]];
      const calc = calculateGeographicBearing(
        { lat: from[0], lon: from[1] },
        { lat: to[0], lon: to[1] }
      );

      return {
        id: `shared_${idx}_${Date.now()}`,
        label: labels && labels[idx] ? labels[idx] : undefined,
        from,
        to,
        bearing: calc.bearing,
        cardinal: calc.cardinal,
        distanceKm: calc.distanceKm || 0,
      };
    });

    return { vectors, viewState, mode, basemap };
  } catch (e) {
    console.error('Failed to decode map state from hash:', e);
    return { vectors: [] };
  }
}
