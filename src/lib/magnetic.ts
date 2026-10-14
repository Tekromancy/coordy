/**
 * World Magnetic Model (WMM) Declination Engine
 * Calculates magnetic declination (variation) between True North and Magnetic North.
 * Declination is positive East (+E) and negative West (-W).
 * True Bearing = Magnetic Bearing + Declination
 * Magnetic Bearing = True Bearing - Declination
 */

interface WMMCoeff {
  n: number;
  m: number;
  g: number;  // nT
  h: number;  // nT
  dg: number; // nT / year
  dh: number; // nT / year
}

const WMM_EPOCH = 2025.0;
const WMM_COEFFS: WMMCoeff[] = [
  // n=1
  { n: 1, m: 0, g: -29404.5, h: 0.0, dg: 6.7, dh: 0.0 },
  { n: 1, m: 1, g: -1450.7, h: 4652.9, dg: 7.7, dh: -25.1 },
  // n=2
  { n: 2, m: 0, g: -2500.0, h: 0.0, dg: -11.5, dh: 0.0 },
  { n: 2, m: 1, g: 2982.0, h: -2991.6, dg: -1.6, dh: -30.2 },
  { n: 2, m: 2, g: 1676.8, h: -734.8, dg: -6.9, dh: -23.9 },
  // n=3
  { n: 3, m: 0, g: 1363.9, h: 0.0, dg: 3.1, dh: 0.0 },
  { n: 3, m: 1, g: -2381.0, h: -82.2, dg: -3.1, dh: 5.7 },
  { n: 3, m: 2, g: 1236.4, h: 241.8, dg: 1.0, dh: -1.0 },
  { n: 3, m: 3, g: 525.7, h: -542.9, dg: -2.8, dh: 8.4 },
  // n=4
  { n: 4, m: 0, g: 903.1, h: 0.0, dg: -0.1, dh: 0.0 },
  { n: 4, m: 1, g: 809.4, h: 282.0, dg: 0.5, dh: -1.7 },
  { n: 4, m: 2, g: 86.2, h: -158.4, dg: -3.0, dh: 2.1 },
  { n: 4, m: 3, g: -309.4, h: 199.8, dg: 5.5, dh: 4.9 },
  { n: 4, m: 4, g: 47.9, h: -350.1, dg: -4.3, dh: -1.6 },
  // n=5
  { n: 5, m: 0, g: -234.4, h: 0.0, dg: -0.6, dh: 0.0 },
  { n: 5, m: 1, g: 363.1, h: 47.7, dg: 0.6, dh: 0.1 },
  { n: 5, m: 2, g: 187.8, h: 208.4, dg: 1.7, dh: 1.7 },
  { n: 5, m: 3, g: -140.7, h: -121.3, dg: -1.0, dh: -0.4 },
  { n: 5, m: 4, g: -151.2, h: 32.2, dg: -0.2, dh: 1.8 },
  { n: 5, m: 5, g: 13.7, h: 99.2, dg: 0.9, dh: 3.9 },
];

/**
 * Computes Schmidt quasi-normalized associated Legendre polynomials.
 */
function schmidtLegendre(nMax: number, cosTheta: number, sinTheta: number): number[][] {
  const P: number[][] = Array.from({ length: nMax + 1 }, () => Array(nMax + 1).fill(0));
  P[0][0] = 1;

  // Diagonal elements (m = n)
  for (let m = 1; m <= nMax; m++) {
    const factor = m === 1 ? Math.sqrt(2) : Math.sqrt((2 * m - 1) / (2 * m));
    P[m][m] = sinTheta * factor * P[m - 1][m - 1];
  }

  // m = 0 column
  P[1][0] = cosTheta;
  for (let n = 2; n <= nMax; n++) {
    P[n][0] = ((2 * n - 1) / n) * cosTheta * P[n - 1][0] - ((n - 1) / n) * P[n - 2][0];
  }

  // Off-diagonals (n > m)
  for (let m = 1; m <= nMax; m++) {
    for (let n = m + 1; n <= nMax; n++) {
      const K = Math.sqrt(((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3)));
      const factor = (2 * n - 1) / Math.sqrt(n * n - m * m);
      P[n][m] = factor * cosTheta * P[n - 1][m] - (factor * K) * P[n - 2][m];
    }
  }

  return P;
}

function calculatePotential(theta: number, lambda: number, dt: number): number {
  const P = schmidtLegendre(5, Math.cos(theta), Math.sin(theta));
  let sum = 0;
  for (const c of WMM_COEFFS) {
    const g = c.g + dt * c.dg;
    const h = c.h + dt * c.dh;
    sum += (g * Math.cos(c.m * lambda) + h * Math.sin(c.m * lambda)) * P[c.n][c.m];
  }
  return sum;
}

/**
 * Calculates Magnetic Declination in degrees for a given latitude, longitude, and optional date.
 * @param lat Latitude in degrees (-90 to +90)
 * @param lon Longitude in degrees (-180 to +180)
 * @param date Optional Date object (defaults to current date)
 * @returns Declination in degrees (+ is East, - is West)
 */
export function calculateMagneticDeclination(
  lat: number,
  lon: number,
  date: Date = new Date()
): number {
  const currentYear = date.getFullYear() + date.getMonth() / 12 + date.getDate() / 365.25;
  const dt = currentYear - WMM_EPOCH;

  const theta = ((90 - lat) * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const eps = 1e-6;

  const dV_dtheta = (calculatePotential(theta + eps, lambda, dt) - calculatePotential(theta - eps, lambda, dt)) / (2 * eps);
  const dV_dlambda = (calculatePotential(theta, lambda + eps, dt) - calculatePotential(theta, lambda - eps, dt)) / (2 * eps);

  // Surface field B = - grad V.
  // In spherical coordinates: North is -theta, East is +lambda.
  // X (North) = (1/r) dV/dtheta
  // Y (East) = - (1/(r sin theta)) dV/dlambda
  const sinTheta = Math.sin(theta);
  const X = dV_dtheta;
  const Y = Math.abs(sinTheta) > 1e-5 ? -dV_dlambda / sinTheta : 0;

  const declinationRad = Math.atan2(Y, X);
  return (declinationRad * 180) / Math.PI;
}

/**
 * Converts True Bearing to Magnetic Bearing
 */
export function trueToMagnetic(trueBearing: number, declinationDeg: number): number {
  return ((trueBearing - declinationDeg) % 360 + 360) % 360;
}

/**
 * Converts Magnetic Bearing to True Bearing
 */
export function magneticToTrue(magneticBearing: number, declinationDeg: number): number {
  return ((magneticBearing + declinationDeg) % 360 + 360) % 360;
}
