const turf = require('@turf/turf');

// 1. Create a 10x10 square polygon
const poly = turf.polygon([[[0,0], [10,0], [10,10], [0,10], [0,0]]]);

// 2. Create a line that splits it vertically down the middle (x=5)
const line = turf.lineString([[5, -1], [5, 11]]);

// 3. Buffer the line very slightly to create a very thin polygon
const bufferedLine = turf.buffer(line, 0.0001, { units: 'degrees' }); // or any unit

// 4. Subtract the buffered line from the polygon
const diff = turf.difference(turf.featureCollection([poly, bufferedLine]));

console.log(diff.geometry.type);
if (diff.geometry.type === 'MultiPolygon') {
  console.log("Successfully split into", diff.geometry.coordinates.length, "polygons!");
  console.log("Polygon 1 Area:", turf.area(turf.polygon(diff.geometry.coordinates[0])));
  console.log("Polygon 2 Area:", turf.area(turf.polygon(diff.geometry.coordinates[1])));
}
