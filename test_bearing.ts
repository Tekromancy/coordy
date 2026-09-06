import { calculateGeographicBearing, calculatePlanarBearing, parseCoordinate } from './src/lib/bearing';

function assertApprox(val: number, expected: number, eps = 0.5, msg = '') {
  if (Math.abs(val - expected) > eps) {
    throw new Error(`FAIL: ${msg} - expected ${expected}, got ${val}`);
  }
  console.log(`✓ ${msg}: ${val.toFixed(2)}° (expected ~${expected}°)`);
}

// 1. Due North (Planar)
const nPlanar = calculatePlanarBearing({ lat: 0, lon: 0 }, { lat: 10, lon: 0 });
assertApprox(nPlanar.bearing, 0, 0.01, 'Due North Planar');

// 2. Due East (Planar)
const ePlanar = calculatePlanarBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 10 });
assertApprox(ePlanar.bearing, 90, 0.01, 'Due East Planar');

// 3. Due South (Planar)
const sPlanar = calculatePlanarBearing({ lat: 0, lon: 0 }, { lat: -10, lon: 0 });
assertApprox(sPlanar.bearing, 180, 0.01, 'Due South Planar');

// 4. Due West (Planar)
const wPlanar = calculatePlanarBearing({ lat: 0, lon: 0 }, { lat: 0, lon: -10 });
assertApprox(wPlanar.bearing, 270, 0.01, 'Due West Planar');

// 5. Geographic: Austin to Dallas
// Austin (30.2672, -97.7431) to Dallas (32.7767, -96.7970) ~ 20.8°
const geo = calculateGeographicBearing(
  { lat: 30.2672, lon: -97.7431 },
  { lat: 32.7767, lon: -96.7970 }
);
assertApprox(geo.bearing, 20.8, 1.0, 'Austin to Dallas Geographic');

console.log('\nAll test assertions passed successfully!');
