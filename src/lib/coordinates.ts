/**
 * Comprehensive coordinate parsing and validation utilities
 * Supports:
 * - Decimal Degrees (DD): "30.2672, -97.7431", "30.2672° N, 97.7431° W", "-30.2672 -97.7431"
 * - Degrees, Minutes, Seconds (DMS): "30° 16' 1.9\" N, 97° 44' 35.2\" W", "30d 16m 1.9s N 97d 44m 35.2s W"
 * - Degrees, Decimal Minutes (DM): "30° 16.032' N, 97° 44.586' W"
 * - Open Location Code (Plus Codes): "86247784+Vp"
 * - Raw 2D Cartesian coordinates for planar calculations
 */

export interface ParsedCoordinate {
  lat: number;
  lon: number;
  format: 'DD' | 'DMS' | 'DM' | 'PLUS_CODE' | 'CARTESIAN';
  raw: string;
}

export interface CoordinateValidationResult {
  valid: boolean;
  error?: string;
  coord?: ParsedCoordinate;
}

// Open Location Code (Plus Code) character set and parameters
const OLC_ALPHABET = '23456789CFGHJMPQRVWX';
const OLC_CODE_REGEX = /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,8}$/i;

/**
 * Decodes an Open Location Code (Plus Code) to [latitude, longitude] center.
 */
export function decodePlusCode(code: string): { lat: number; lon: number } | null {
  const cleanCode = code.trim().toUpperCase().replace(/0+$/, ''); // Remove padding zeros if present
  if (!cleanCode.includes('+')) return null;

  const parts = cleanCode.split('+');
  if (parts.length !== 2) return null;
  const prefix = parts[0];
  const suffix = parts[1];
  const fullSeq = (prefix + suffix).replace(/0/g, '');

  if (fullSeq.length < 2) return null;
  for (let i = 0; i < fullSeq.length; i++) {
    if (!OLC_ALPHABET.includes(fullSeq[i])) return null;
  }

  let south = -90;
  let west = -180;
  let latResolution = 20;
  let lonResolution = 20;

  // Process up to 10 standard base-20 pair characters (5 pairs)
  const pairCount = Math.min(Math.floor(fullSeq.length / 2), 5);
  for (let i = 0; i < pairCount; i++) {
    const latChar = fullSeq[i * 2];
    const lonChar = fullSeq[i * 2 + 1];
    const latVal = OLC_ALPHABET.indexOf(latChar);
    const lonVal = OLC_ALPHABET.indexOf(lonChar);

    south += latVal * latResolution;
    west += lonVal * lonResolution;

    latResolution /= 20;
    lonResolution /= 20;
  }

  // Handle grid refinement if length > 10 characters (4x5 subgrid per char)
  if (fullSeq.length > 10) {
    const extraChars = fullSeq.slice(10);
    for (let i = 0; i < extraChars.length; i++) {
      const idx = OLC_ALPHABET.indexOf(extraChars[i]);
      const row = Math.floor(idx / 4);
      const col = idx % 4;

      latResolution /= 5;
      lonResolution /= 4;

      south += row * latResolution;
      west += col * lonResolution;
    }
  }

  // Center coordinate of the bounding box
  const centerLat = south + latResolution / 2;
  const centerLon = west + lonResolution / 2;

  return {
    lat: Math.max(-90, Math.min(90, centerLat)),
    lon: Math.max(-180, Math.min(180, centerLon)),
  };
}

/**
 * Parses DMS (Degrees Minutes Seconds) or DM (Degrees Decimal Minutes)
 * e.g. "30° 16' 1.9\" N" or "97d 44m 35.2s W" or "30:16:1.9 N"
 */
function parseDmsComponent(str: string): { value: number; isDms: boolean; isDm: boolean } | null {
  const trimmed = str.trim();
  if (!trimmed) return null;

  // Match optional sign or cardinal prefix/suffix
  const cardinalMatch = trimmed.match(/[NSEW]/i);
  const cardinal = cardinalMatch ? cardinalMatch[0].toUpperCase() : null;
  const signMultiplier = cardinal === 'S' || cardinal === 'W' ? -1 : 1;

  // Remove cardinal letters and degree/min/sec symbols to extract numbers
  const cleaned = trimmed
    .replace(/[NSEWnsew]/g, ' ')
    .replace(/[°dDº]/g, ' ')
    .replace(/['′mM]/g, ' ')
    .replace(/["″sS]/g, ' ')
    .replace(/:/g, ' ')
    .trim();

  const numbers = cleaned.split(/\s+/).filter(Boolean).map(Number);
  if (numbers.some(isNaN) || numbers.length === 0) return null;

  if (numbers.length === 3) {
    // Degrees, Minutes, Seconds
    const [deg, min, sec] = numbers;
    const absDeg = Math.abs(deg);
    const decimal = absDeg + min / 60 + sec / 3600;
    const finalSign = (deg < 0 || signMultiplier < 0) ? -1 : 1;
    return { value: finalSign * decimal, isDms: true, isDm: false };
  } else if (numbers.length === 2) {
    // Degrees, Decimal Minutes
    const [deg, min] = numbers;
    const absDeg = Math.abs(deg);
    const decimal = absDeg + min / 60;
    const finalSign = (deg < 0 || signMultiplier < 0) ? -1 : 1;
    return { value: finalSign * decimal, isDms: false, isDm: true };
  } else if (numbers.length === 1 && cardinal) {
    // Single number with cardinal suffix/prefix like "30.2672 N"
    const deg = numbers[0];
    return { value: signMultiplier * Math.abs(deg), isDms: false, isDm: false };
  }

  return null;
}

/**
 * Main parse function for coordinates
 */
export function parseCoordinateString(input: string): ParsedCoordinate | null {
  if (!input) return null;
  const str = input.trim();

  // 1. Check for Open Location Code (Plus Code)
  if (OLC_CODE_REGEX.test(str.replace(/\s+/g, ''))) {
    const decoded = decodePlusCode(str.replace(/\s+/g, ''));
    if (decoded) {
      return {
        lat: decoded.lat,
        lon: decoded.lon,
        format: 'PLUS_CODE',
        raw: str,
      };
    }
  }

  // 2. Try splitting on comma or semicolon if present
  let parts: string[] = [];
  if (str.includes(',')) {
    parts = str.split(',').map((s) => s.trim());
  } else if (str.includes(';')) {
    parts = str.split(';').map((s) => s.trim());
  } else {
    // Check if separated by spaces while containing DMS symbols or cardinals
    // e.g. "30°16'1.9\"N 97°44'35.2\"W" or "30.2672N 97.7431W"
    const cardinalSplit = str.match(/([0-9.]+[°d\s'":NSEWnsew]+[NSns])[\s,]+([0-9.]+[°d\s'":NSEWnsew]+[EWew])/);
    if (cardinalSplit) {
      parts = [cardinalSplit[1].trim(), cardinalSplit[2].trim()];
    } else {
      // Split on whitespace
      const tokens = str.split(/\s+/).filter(Boolean);
      if (tokens.length === 2) {
        parts = tokens;
      }
    }
  }

  if (parts.length === 2) {
    // Try parsing as DMS / DM / Cardinal
    const p1 = parseDmsComponent(parts[0]);
    const p2 = parseDmsComponent(parts[1]);

    if (p1 && p2) {
      // Check if user entered [Lon, Lat] with East/West first
      const p1IsLon = /[EW]/i.test(parts[0]);
      const p2IsLat = /[NS]/i.test(parts[1]);

      let lat = p1.value;
      let lon = p2.value;

      if (p1IsLon && p2IsLat) {
        lat = p2.value;
        lon = p1.value;
      }

      const format: 'DD' | 'DMS' | 'DM' = p1.isDms || p2.isDms ? 'DMS' : p1.isDm || p2.isDm ? 'DM' : 'DD';
      return { lat, lon, format, raw: str };
    }

    // Try standard decimal floats
    const n1 = parseFloat(parts[0]);
    const n2 = parseFloat(parts[1]);
    if (!isNaN(n1) && !isNaN(n2)) {
      return { lat: n1, lon: n2, format: 'DD', raw: str };
    }
  }

  // 3. Fallback: match any two floating point numbers (supports negatives)
  const regexMatches = str.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (regexMatches && regexMatches.length >= 2) {
    const lat = parseFloat(regexMatches[0]);
    const lon = parseFloat(regexMatches[1]);
    if (!isNaN(lat) && !isNaN(lon)) {
      return { lat, lon, format: 'DD', raw: str };
    }
  }

  return null;
}

/**
 * Validates a coordinate for geographic bounds
 */
export function validateGeographicBounds(lat: number, lon: number): { valid: boolean; error?: string } {
  if (isNaN(lat) || isNaN(lon)) {
    return { valid: false, error: 'Coordinate contains non-numeric values.' };
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, error: `Latitude ${lat}° is out of valid range [-90°, +90°].` };
  }
  if (lon < -180 || lon > 180) {
    return { valid: false, error: `Longitude ${lon}° is out of valid range [-180°, +180°].` };
  }
  return { valid: true };
}

/**
 * Format a coordinate into human-readable strings
 */
export function formatCoordinateString(
  lat: number,
  lon: number,
  format: 'DD' | 'DMS' | 'DM' = 'DD',
  precision = 5
): string {
  if (format === 'DD') {
    return `${lat.toFixed(precision)}, ${lon.toFixed(precision)}`;
  }

  const toDms = (val: number, posChar: string, negChar: string) => {
    const char = val >= 0 ? posChar : negChar;
    const abs = Math.abs(val);
    const d = Math.floor(abs);
    const mFloat = (abs - d) * 60;
    const m = Math.floor(mFloat);
    const s = ((mFloat - m) * 60).toFixed(1);
    return `${d}° ${m}' ${s}" ${char}`;
  };

  const toDm = (val: number, posChar: string, negChar: string) => {
    const char = val >= 0 ? posChar : negChar;
    const abs = Math.abs(val);
    const d = Math.floor(abs);
    const m = ((abs - d) * 60).toFixed(3);
    return `${d}° ${m}' ${char}`;
  };

  if (format === 'DMS') {
    return `${toDms(lat, 'N', 'S')}, ${toDms(lon, 'E', 'W')}`;
  }

  return `${toDm(lat, 'N', 'S')}, ${toDm(lon, 'E', 'W')}`;
}
