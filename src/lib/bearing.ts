/**
 * Coordinate and Bearing calculation utilities
 */

export interface Coordinate {
  lat: number;
  lon: number;
  raw?: string;
}

export type CalculationMode = 'geographic' | 'planar';

export interface BearingResult {
  mode: CalculationMode;
  bearing: number; // 0 to 360 degrees
  backBearing: number; // 0 to 360 degrees
  cardinal: string; // e.g. "NNE", "SSW"
  cardinalName: string; // e.g. "North-Northeast"
  distanceKm?: number;
  distanceMiles?: number;
  distanceMeters?: number;
  dx?: number;
  dy?: number;
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
 * Parses user input like:
 * "30.395560, -97.752488"
 * "30.395560 -97.752488"
 */
export function parseCoordinate(str: string): Coordinate | null {
  if (!str) return null;
  const trimmed = str.trim();

  // Try standard comma or space separated numbers
  const commaSeparated = trimmed.split(/[\s,]+/);
  if (commaSeparated.length === 2) {
    const p0 = parseFloat(commaSeparated[0]);
    const p1 = parseFloat(commaSeparated[1]);
    if (!isNaN(p0) && !isNaN(p1)) {
      return { lat: p0, lon: p1, raw: str };
    }
  }

  // Fallback: match any two floating point numbers (supports negatives)
  const regexMatches = trimmed.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (regexMatches && regexMatches.length >= 2) {
    const lat = parseFloat(regexMatches[0]);
    const lon = parseFloat(regexMatches[1]);
    if (!isNaN(lat) && !isNaN(lon)) {
      return { lat, lon, raw: str };
    }
  }

  return null;
}

const toRadians = (deg: number) => (deg * Math.PI) / 180;
const toDegrees = (rad: number) => (rad * 180) / Math.PI;

/**
 * Great-circle initial compass bearing between two geographic coordinates
 * Formula:
 * θ = atan2(sin(Δλ) * cos(φ2), cos(φ1) * sin(φ2) - sin(φ1) * cos(φ2) * cos(Δλ))
 */
export function calculateGeographicBearing(p1: Coordinate, p2: Coordinate): BearingResult {
  const phi1 = toRadians(p1.lat);
  const phi2 = toRadians(p2.lat);
  const deltaLambda = toRadians(p2.lon - p1.lon);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const bearing = (toDegrees(Math.atan2(y, x)) + 360) % 360;
  const backBearing = (bearing + 180) % 360;

  // Haversine distance
  const R = 6371; // Earth radius in km
  const deltaPhi = toRadians(p2.lat - p1.lat);
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;
  const distanceMiles = distanceKm * 0.621371;
  const distanceMeters = distanceKm * 1000;

  const cardinal = getCardinalDirection(bearing);

  return {
    mode: 'geographic',
    bearing,
    backBearing,
    cardinal: cardinal.code,
    cardinalName: cardinal.name,
    distanceKm,
    distanceMiles,
    distanceMeters,
  };
}

/**
 * Planar 2D Cartesian Bearing (as implemented in compass.py)
 * dx = x2 - x1 (East-West)
 * dy = y2 - y1 (North-South)
 * bearing = atan2(dx, dy) normalized to 0-360 deg
 */
export function calculatePlanarBearing(p1: Coordinate, p2: Coordinate): BearingResult {
  // In compass.py: coordinate is [x, y] where index 0 is East-West, index 1 is North-South
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
    backBearing,
    cardinal: cardinal.code,
    cardinalName: cardinal.name,
    distanceMeters: magnitude,
    dx,
    dy,
  };
}

/**
 * Checks if input resembles a what3words 3-word address:
 * e.g., "///filled.count.soap", "filled.count.soap", or "filled count soap"
 */
export function isWhat3WordsFormat(str: string): boolean {
  if (!str) return false;
  const cleaned = str.trim().replace(/^[\/\s]+/, '');
  const parts = cleaned.split(/[\s.]+/).filter(Boolean);
  // Exactly 3 non-empty words consisting of unicode word letters and no numbers
  return parts.length === 3 && parts.every((word) => /^[a-zA-Z\u00C0-\u024F]+$/.test(word));
}
