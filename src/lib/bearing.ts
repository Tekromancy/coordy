/**
 * Coordinate and Bearing calculation utilities
 * Supports:
 * - Great-Circle (Orthodrome / Geographic) Initial, Final, and True Reverse Bearings
 * - Rhumb Line (Loxodrome / Constant Compass Heading)
 * - 2D Planar Cartesian Bearings (compass.py)
 * - Slerp Great-Circle Arc Interpolation
 * - Forward Destination Point Projection
 * - World Magnetic Model Magnetic Bearing Integration
 */

import { parseCoordinateString } from './coordinates';
import { calculateMagneticDeclination, trueToMagnetic } from './magnetic';

export interface Coordinate {
  lat: number;
  lon: number;
  raw?: string;
}

export type CalculationMode = 'geographic' | 'rhumb' | 'planar';

export interface BearingResult {
  mode: CalculationMode;
  bearing: number; // 0 to 360 degrees (initial heading)
  finalBearing?: number; // 0 to 360 degrees (arrival heading at B)
  backBearing: number; // 0 to 360 degrees (true reverse bearing B -> A)
  cardinal: string; // e.g. "NNE", "SSW"
  cardinalName: string; // e.g. "North-Northeast"
  distanceKm?: number;
  distanceMiles?: number;
  distanceNauticalMiles?: number;
  distanceMeters?: number;
  distanceFeet?: number;
  dx?: number;
  dy?: number;
  magneticBearing?: number;
  magneticBackBearing?: number;
  magneticDeclination?: number; // at starting point
}

export const CARDINAL_POINTS: { code: string; name: string; min: number; max: number }[] = [
  { code: 'N', name: 'North', min: 348.75, max: 11.25 },
  { code: 'NNE', name: 'North-Northeast', min: 11.25, max: 33.75 },
  { code: 'NE', name: 'Northeast', min: 33.75, max: 56.25 },
  { code: 'ENE', name: 'East-Northeast', min: 56.25, max: 78.75 },
  { code: 'E', name: 'East', min: 78.75, max: 101.25 },
  { code: 'ESE', name: 'East-Southeast', min: 101.25, max: 123.75 },
  { code: 'SE', name: 'Southeast', min: 123.75, max: 146.25 },
  { code: 'SSE', name: 'South-Southeast', min: 146.25, max: 168.75 },
  { code: 'S', name: 'South', min: 168.75, max: 191.25 },
  { code: 'SSW', name: 'South-Southwest', min: 191.25, max: 213.75 },
  { code: 'SW', name: 'Southwest', min: 213.75, max: 236.25 },
  { code: 'WSW', name: 'West-Southwest', min: 236.25, max: 258.75 },
  { code: 'W', name: 'West', min: 258.75, max: 281.25 },
  { code: 'WNW', name: 'West-Northwest', min: 281.25, max: 303.75 },
  { code: 'NW', name: 'Northwest', min: 303.75, max: 326.25 },
  { code: 'NNW', name: 'North-Northwest', min: 326.25, max: 348.75 },
];

export function getCardinalDirection(deg: number): { code: string; name: string } {
  const normalized = ((deg % 360) + 360) % 360;
  for (const p of CARDINAL_POINTS) {
    if (p.min > p.max) {
      if (normalized >= p.min || normalized < p.max) {
        return { code: p.code, name: p.name };
      }
    } else {
      if (normalized >= p.min && normalized < p.max) {
        return { code: p.code, name: p.name };
      }
    }
  }
  return { code: 'N', name: 'North' };
}

/**
 * Parses user coordinate strings in DD, DMS, DM, Plus Codes, or floats.
 */
export function parseCoordinate(str: string): Coordinate | null {
  const parsed = parseCoordinateString(str);
  if (!parsed) return null;
  return { lat: parsed.lat, lon: parsed.lon, raw: parsed.raw };
}

const toRadians = (deg: number) => (deg * Math.PI) / 180;
const toDegrees = (rad: number) => (rad * 180) / Math.PI;
const EARTH_RADIUS_KM = 6371.0088; // IUGG mean Earth radius

/**
 * Great-circle initial and final compass bearing between two geographic coordinates
 */
export function calculateGeographicBearing(p1: Coordinate, p2: Coordinate): BearingResult {
  const phi1 = toRadians(p1.lat);
  const phi2 = toRadians(p2.lat);
  const deltaLambda = toRadians(p2.lon - p1.lon);

  // Initial bearing from p1 to p2
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const bearing = (toDegrees(Math.atan2(y, x)) + 360) % 360;

  // True reverse initial bearing from p2 to p1
  const yRev = Math.sin(-deltaLambda) * Math.cos(phi1);
  const xRev =
    Math.cos(phi2) * Math.sin(phi1) -
    Math.sin(phi2) * Math.cos(phi1) * Math.cos(-deltaLambda);
  const backBearing = (toDegrees(Math.atan2(yRev, xRev)) + 360) % 360;

  // Final bearing arriving at p2
  const finalBearing = (backBearing + 180) % 360;

  // Haversine distance
  const deltaPhi = toRadians(p2.lat - p1.lat);
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanceKm = EARTH_RADIUS_KM * c;
  const distanceMiles = distanceKm * 0.62137119;
  const distanceNauticalMiles = distanceKm / 1.852;
  const distanceMeters = distanceKm * 1000;
  const distanceFeet = distanceMeters * 3.28084;

  const cardinal = getCardinalDirection(bearing);

  // Magnetic declination at p1
  let magneticBearing: number | undefined;
  let magneticBackBearing: number | undefined;
  let magneticDeclination: number | undefined;

  try {
    magneticDeclination = calculateMagneticDeclination(p1.lat, p1.lon);
    magneticBearing = trueToMagnetic(bearing, magneticDeclination);
    const declinationP2 = calculateMagneticDeclination(p2.lat, p2.lon);
    magneticBackBearing = trueToMagnetic(backBearing, declinationP2);
  } catch {
    // Fallback if magnetic calculation fails
  }

  return {
    mode: 'geographic',
    bearing,
    finalBearing,
    backBearing,
    cardinal: cardinal.code,
    cardinalName: cardinal.name,
    distanceKm,
    distanceMiles,
    distanceNauticalMiles,
    distanceMeters,
    distanceFeet,
    magneticBearing,
    magneticBackBearing,
    magneticDeclination,
  };
}

/**
 * Rhumb line (Loxodrome) constant compass heading and distance
 */
export function calculateRhumbBearing(p1: Coordinate, p2: Coordinate): BearingResult {
  const phi1 = toRadians(p1.lat);
  const phi2 = toRadians(p2.lat);
  let deltaLambda = toRadians(p2.lon - p1.lon);

  // If deltaLambda > 180°, take the shortest path across the antimeridian
  if (Math.abs(deltaLambda) > Math.PI) {
    deltaLambda = deltaLambda > 0 ? -(2 * Math.PI - deltaLambda) : 2 * Math.PI + deltaLambda;
  }

  const deltaPhi = phi2 - phi1;
  const deltaPsi = Math.log(
    Math.tan(Math.PI / 4 + phi2 / 2) / Math.tan(Math.PI / 4 + phi1 / 2)
  );

  const q = Math.abs(deltaPsi) > 1e-12 ? deltaPhi / deltaPsi : Math.cos(phi1);
  const bearing = (toDegrees(Math.atan2(deltaLambda, deltaPsi)) + 360) % 360;
  const backBearing = (bearing + 180) % 360;

  const angularDist = Math.sqrt(deltaPhi * deltaPhi + q * q * deltaLambda * deltaLambda);
  const distanceKm = angularDist * EARTH_RADIUS_KM;
  const distanceMiles = distanceKm * 0.62137119;
  const distanceNauticalMiles = distanceKm / 1.852;
  const distanceMeters = distanceKm * 1000;
  const distanceFeet = distanceMeters * 3.28084;

  const cardinal = getCardinalDirection(bearing);

  let magneticBearing: number | undefined;
  let magneticBackBearing: number | undefined;
  let magneticDeclination: number | undefined;

  try {
    magneticDeclination = calculateMagneticDeclination(p1.lat, p1.lon);
    magneticBearing = trueToMagnetic(bearing, magneticDeclination);
    const declinationP2 = calculateMagneticDeclination(p2.lat, p2.lon);
    magneticBackBearing = trueToMagnetic(backBearing, declinationP2);
  } catch {
    // Fallback
  }

  return {
    mode: 'rhumb',
    bearing,
    finalBearing: bearing, // Rhumb line heading is constant
    backBearing,
    cardinal: cardinal.code,
    cardinalName: cardinal.name,
    distanceKm,
    distanceMiles,
    distanceNauticalMiles,
    distanceMeters,
    distanceFeet,
    magneticBearing,
    magneticBackBearing,
    magneticDeclination,
  };
}

/**
 * Planar 2D Cartesian Bearing (compass.py)
 */
export function calculatePlanarBearing(p1: Coordinate, p2: Coordinate): BearingResult {
  const dx = p2.lon - p1.lon;
  const dy = p2.lat - p1.lat;

  const rad = Math.atan2(dx, dy);
  const bearing = ((toDegrees(rad) % 360) + 360) % 360;
  const backBearing = (bearing + 180) % 360;
  const magnitude = Math.sqrt(dx * dx + dy * dy);

  const cardinal = getCardinalDirection(bearing);

  return {
    mode: 'planar',
    bearing,
    finalBearing: bearing,
    backBearing,
    cardinal: cardinal.code,
    cardinalName: cardinal.name,
    distanceMeters: magnitude,
    dx,
    dy,
  };
}

/**
 * Forward Destination Point Projection:
 * Given a starting point, initial bearing (deg), and distance (km), computes the target coordinate.
 */
export function calculateDestinationPoint(
  start: Coordinate,
  bearingDeg: number,
  distanceKm: number,
  mode: CalculationMode = 'geographic'
): Coordinate {
  if (mode === 'planar') {
    const rad = toRadians(bearingDeg);
    const dx = distanceKm * Math.sin(rad);
    const dy = distanceKm * Math.cos(rad);
    return {
      lat: start.lat + dy,
      lon: start.lon + dx,
    };
  }

  const phi1 = toRadians(start.lat);
  const lambda1 = toRadians(start.lon);
  const theta = toRadians(bearingDeg);
  const delta = distanceKm / EARTH_RADIUS_KM;

  if (mode === 'geographic') {
    const phi2 = Math.asin(
      Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
    );
    const lambda2 =
      lambda1 +
      Math.atan2(
        Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
        Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
      );

    const latDeg = toDegrees(phi2);
    const lonDeg = ((toDegrees(lambda2) + 540) % 360) - 180;
    return { lat: latDeg, lon: lonDeg };
  } else {
    // Rhumb destination
    const phi2 = phi1 + delta * Math.cos(theta);
    const deltaPsi = Math.log(
      Math.tan(Math.PI / 4 + phi2 / 2) / Math.tan(Math.PI / 4 + phi1 / 2)
    );
    const q = Math.abs(deltaPsi) > 1e-12 ? (phi2 - phi1) / deltaPsi : Math.cos(phi1);
    const deltaLambda = (delta * Math.sin(theta)) / q;
    const lambda2 = lambda1 + deltaLambda;

    const latDeg = toDegrees(phi2);
    const lonDeg = ((toDegrees(lambda2) + 540) % 360) - 180;
    return { lat: latDeg, lon: lonDeg };
  }
}

/**
 * Spherical Linear Interpolation (Slerp) along Great-Circle Arc.
 * Returns an array of [lat, lon] coordinates representing intermediate waypoints.
 */
export function interpolateGreatCircle(
  p1: [number, number],
  p2: [number, number],
  numSegments = 32
): [number, number][] {
  const lat1 = toRadians(p1[0]);
  const lon1 = toRadians(p1[1]);
  const lat2 = toRadians(p2[0]);
  const lon2 = toRadians(p2[1]);

  // Convert to 3D Cartesian vectors on unit sphere
  const v1 = [
    Math.cos(lat1) * Math.cos(lon1),
    Math.cos(lat1) * Math.sin(lon1),
    Math.sin(lat1),
  ];
  const v2 = [
    Math.cos(lat2) * Math.cos(lon2),
    Math.cos(lat2) * Math.sin(lon2),
    Math.sin(lat2),
  ];

  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const clampedDot = Math.max(-1, Math.min(1, dot));
  const omega = Math.acos(clampedDot);

  // If points are virtually identical or antipodal
  if (Math.abs(omega) < 1e-6) {
    return [p1, p2];
  }

  const sinOmega = Math.sin(omega);
  const points: [number, number][] = [];

  for (let i = 0; i <= numSegments; i++) {
    const f = i / numSegments;
    const s1 = Math.sin((1 - f) * omega) / sinOmega;
    const s2 = Math.sin(f * omega) / sinOmega;

    const x = s1 * v1[0] + s2 * v2[0];
    const y = s1 * v1[1] + s2 * v2[1];
    const z = s1 * v1[2] + s2 * v2[2];

    const lat = toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lon = toDegrees(Math.atan2(y, x));

    points.push([lat, lon]);
  }

  return points;
}

/**
 * Smart Distance Formatter
 */
export function formatDistance(
  meters: number,
  unit: 'metric' | 'imperial' | 'nautical' | 'auto' = 'auto'
): string {
  if (isNaN(meters) || meters < 0) return '0 m';

  if (unit === 'auto') {
    if (meters < 1000) {
      return `${meters.toFixed(0)} m`;
    }
    const km = meters / 1000;
    return km >= 100 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
  }

  if (unit === 'metric') {
    if (meters < 1000) return `${meters.toFixed(0)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  }

  if (unit === 'imperial') {
    const feet = meters * 3.28084;
    if (feet < 5280) return `${feet.toFixed(0)} ft`;
    const miles = feet / 5280;
    return `${miles.toFixed(2)} mi`;
  }

  if (unit === 'nautical') {
    const nm = meters / 1852;
    return `${nm.toFixed(2)} nm`;
  }

  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Checks if input resembles a what3words 3-word address:
 * e.g., "///filled.count.soap", "filled.count.soap", or "filled count soap"
 */
export function isWhat3WordsFormat(str: string): boolean {
  if (!str) return false;
  const cleaned = str.trim().replace(/^[\/\s]+/, '');
  const parts = cleaned.split(/[\s.]+/).filter(Boolean);
  return parts.length === 3 && parts.every((word) => /^[a-zA-Z\u00C0-\u024F]+$/.test(word));
}
