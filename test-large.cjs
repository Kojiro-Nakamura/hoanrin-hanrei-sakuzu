const turf = require('@turf/turf');
const poly = turf.polygon([[[0,0], [30000,0], [30000,30000], [0,30000], [0,0]]]);
const line = turf.lineString([[15000, -100], [15000, 30100]]);
try {
  const bufferedLine = turf.buffer(line, 0.001, { units: 'degrees' });
  const diff = turf.difference(turf.featureCollection([poly, bufferedLine]));
  console.log(diff ? diff.geometry.type : 'null');
  if (diff && diff.geometry.type === 'MultiPolygon') {
    console.log(diff.geometry.coordinates.length);
  }
} catch (e) {
  console.error("Error:", e.message);
}
