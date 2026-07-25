const pc = require('polygon-clipping');
// poly 1: 0,0 to 100,100
const poly = [[[0,0], [100,0], [100,100], [0,100], [0,0]]];
// thin buffer around x=50
const splitter = [[[49, -10], [51, -10], [51, 110], [49, 110], [49, -10]]];
const diff = pc.difference(poly, splitter);
console.log(diff.length);
