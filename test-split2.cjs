const pc = require('polygon-clipping');
const poly = { pathData: "M 0 0 L 100 0 L 100 100 L 0 100 Z", id: "custom_1" };
const thickness = 0.5;
const splitLinePts = [{x: 50, y: -10}, {x: 50, y: 110}];
const splitterBoxes = [];
for (let i = 0; i < splitLinePts.length - 1; i++) {
  const p1 = splitLinePts[i];
  const p2 = splitLinePts[i+1];
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) continue;
  const nx = -dy / len * thickness;
  const ny = dx / len * thickness;
  const ex = dx / len * thickness;
  const ey = dy / len * thickness;

  splitterBoxes.push([[
    [p1.x - ex + nx, p1.y - ey + ny],
    [p2.x + ex + nx, p2.y + ey + ny],
    [p2.x + ex - nx, p2.y + ey - ny],
    [p1.x - ex - nx, p1.y - ey - ny],
    [p1.x - ex + nx, p1.y - ey + ny]
  ]]);
}
const rings = [[ {x:0,y:0}, {x:100,y:0}, {x:100,y:100}, {x:0,y:100}, {x:0,y:0} ]];
const polyCoords = rings.map(ring => ring.map(p => [p.x, p.y]));
const diff = pc.difference([polyCoords], ...splitterBoxes);
diff.forEach(geom => {
  let pathData = "";
  geom.forEach(ring => {
    const mappedRing = ring.map(coord => ({ x: coord[0], y: coord[1] }));
    pathData += "M " + mappedRing.map(p => `${p.x} ${p.y}`).join(" L ") + " Z ";
  });
  console.log(pathData);
});
