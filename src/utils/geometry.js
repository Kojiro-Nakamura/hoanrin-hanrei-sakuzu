import pc from 'polygon-clipping';

export const lon2tile = (lon, zoom) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
export const lat2tile = (lat, zoom) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
export const tile2lon = (x, z) => (x / Math.pow(2, z) * 360 - 180);
export const tile2lat = (y, z) => {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
};

export const parsePathToRings = (pathStr) => {
  const rings = [];
  let currentRing = [];
  const tokens = pathStr.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === 'M' || token === 'L') {
      const x = parseFloat(tokens[i + 1]), y = parseFloat(tokens[i + 2]);
      if (!isNaN(x) && !isNaN(y)) currentRing.push({x, y});
      i += 3;
    } else if (token === 'Z' || token === 'z') {
      if (currentRing.length > 0) {
        const first = currentRing[0], last = currentRing[currentRing.length - 1];
        if (Math.abs(first.x - last.x) > 0.005 || Math.abs(first.y - last.y) > 0.005) currentRing.push({...first});
        rings.push(currentRing);
      }
      currentRing = [];
      i += 1;
    } else { i += 1; }
  }
  return rings;
};

export const getExteriorPathString = (pathStr) => {
  if (!pathStr.includes('Z')) return pathStr;
  const rings = parsePathToRings(pathStr);
  if (rings.length <= 1) return pathStr;
  
  let maxArea = -1;
  let extRing = null;
  rings.forEach(ring => {
    const area = Math.abs(signedArea(ring));
    if (area > maxArea) {
      maxArea = area;
      extRing = ring;
    }
  });
  
  if (!extRing) return pathStr;
  return 'M ' + extRing.map(p => `${p.x} ${p.y}`).join(' L ') + ' Z';
};

export const multiPolyToPath = (mp) => {
  let path = "";
  mp.forEach(polygon => {
    polygon.forEach(ring => {
      if (ring.length === 0) return;
      path += `M ${ring[0][0]} ${ring[0][1]} `;
      for (let i = 1; i < ring.length; i++) path += `L ${ring[i][0]} ${ring[i][1]} `;
      path += "Z ";
    });
  });
  return path;
};

export const getBBox = (ring) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  ring.forEach(pt => {
    if (Array.isArray(pt)) {
       minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0]);
       minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1]);
    } else {
       minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
       minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }
  });
  return { minX, minY, maxX, maxY };
};

export const isBBoxIntersect = (b1, b2) => !(b2.minX > b1.maxX || b2.maxX < b1.minX || b2.minY > b1.maxY || b2.maxY < b1.minY);

export const getClosestPointOnSegment = (p, v, w) => {
  const l2 = (w.x - v.x)**2 + (w.y - v.y)**2;
  if (l2 === 0) return { x: v.x, y: v.y, distSq: (p.x - v.x)**2 + (p.y - v.y)**2 };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = v.x + t * (w.x - v.x), projY = v.y + t * (w.y - v.y);
  return { x: projX, y: projY, distSq: (p.x - projX)**2 + (p.y - projY)**2 };
};

export const isPointInside = (pt, rings) => {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, yi = ring[i].y;
      const xj = ring[j].x, yj = ring[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
  }
  return inside;
};

export const getPointInsidePolygon = (rings, minX, minY, maxX, maxY) => {
  const steps = 20; 
  const stepX = (maxX - minX) / steps, stepY = (maxY - minY) / steps;
  let bestPt = null, maxDistSq = -1;

  for(let i = 1; i < steps; i++) {
     for(let j = 1; j < steps; j++) {
        const pt = { x: minX + i * stepX, y: minY + j * stepY };
        if (isPointInside(pt, rings)) {
           let minDistSq = Infinity;
           rings.forEach(ring => {
              for(let k = 0; k < ring.length; k++) {
                 const p1 = ring[k], p2 = ring[(k+1)%ring.length];
                 const res = getClosestPointOnSegment(pt, p1, p2);
                 if(res.distSq < minDistSq) minDistSq = res.distSq;
              }
           });
           if (minDistSq > maxDistSq) { maxDistSq = minDistSq; bestPt = pt; }
        }
     }
  }
  return bestPt || { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
};

export const calculatePolygonCenter = (rings) => {
  let totalArea = 0, totalCx = 0, totalCy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let pointCount = 0;

  rings.forEach(ring => {
    if (ring.length < 3) return;
    let area = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length; i++) {
      const p1 = ring[i], p2 = ring[(i + 1) % ring.length];
      const cross = p1.x * p2.y - p2.x * p1.y;
      area += cross; cx += (p1.x + p2.x) * cross; cy += (p1.y + p2.y) * cross;
      minX = Math.min(minX, p1.x); maxX = Math.max(maxX, p1.x);
      minY = Math.min(minY, p1.y); maxY = Math.max(maxY, p1.y);
      pointCount++;
    }
    area /= 2;
    if (area !== 0) {
      cx /= (6 * area); cy /= (6 * area);
      totalArea += area; totalCx += cx * area; totalCy += cy * area;
    }
  });

  let pt = { x: 0, y: 0 };
  if (Math.abs(totalArea) > 1e-5) pt = { x: totalCx / totalArea, y: totalCy / totalArea };
  else if (pointCount > 0) pt = { x: (minX + maxX)/2, y: (minY + maxY)/2 };

  if (rings.length > 0 && pointCount >= 3) {
    if (!isPointInside(pt, rings)) {
       const innerPt = getPointInsidePolygon(rings, minX, minY, maxX, maxY);
       if (innerPt) pt = innerPt;
    }
  }
  return pt;
};

export const makeThickLinePolygon = (pts, width) => {
  if (pts.length < 2) return null;
  const top = [], bottom = [], cleanPts = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && pts[i].x === pts[i-1].x && pts[i].y === pts[i-1].y) continue;
    cleanPts.push(pts[i]);
  }
  if (cleanPts.length < 2) return null;

  for (let i = 0; i < cleanPts.length; i++) {
    const curr = cleanPts[i], prev = i === 0 ? null : cleanPts[i-1], next = i === cleanPts.length - 1 ? null : cleanPts[i+1];
    if (!prev || !next) {
      let dx, dy;
      if (!prev) { dx = next.x - curr.x; dy = next.y - curr.y; }
      else { dx = curr.x - prev.x; dy = curr.y - prev.y; }
      const len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      top.push([curr.x + nx * width, curr.y + ny * width]);
      bottom.push([curr.x - nx * width, curr.y - ny * width]);
    } else {
      const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
      const len1 = Math.hypot(dx1, dy1) || 1, u1x = dx1 / len1, u1y = dy1 / len1;
      const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
      const len2 = Math.hypot(dx2, dy2) || 1, u2x = dx2 / len2, u2y = dy2 / len2;
      const nx = -u1y + -u2y, ny = u1x + u2x, nLenSq = nx*nx + ny*ny;
      let offX, offY;
      if (nLenSq < 1e-6) { offX = -u1y * width; offY = u1x * width; }
      else {
         offX = nx * 2 * width / nLenSq; offY = ny * 2 * width / nLenSq;
         if (offX*offX + offY*offY > (width*5)**2) {
           const nl = Math.sqrt(nLenSq);
           offX = (nx/nl)*width; offY = (ny/nl)*width;
         }
      }
      top.push([curr.x + offX, curr.y + offY]);
      bottom.push([curr.x - offX, curr.y - offY]);
    }
  }
  const ring = [...top, ...bottom.reverse()];
  ring.push([...ring[0]]);
  return ring;
};

export const signedArea = (pts) => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area / 2;
};

export const intersectLinesT = (p1, v1, p2, v2) => {
  const det = v1.x * v2.y - v1.y * v2.x;
  if (Math.abs(det) < 1e-8) return null; 
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const t1 = (dx * v2.y - dy * v2.x) / det, t2 = (dx * v1.y - dy * v1.x) / det;
  return { x: p1.x + t1 * v1.x, y: p1.y + t1 * v1.y, t1, t2 };
};

export const getSegmentIntersection = (p1, p2, p3, p4) => {
  const det = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(det) < 1e-8) return null; 
  const dx = p3.x - p1.x, dy = p3.y - p1.y;
  const t1 = (dx * (p4.y - p3.y) - dy * (p4.x - p3.x)) / det;
  const t2 = (dx * (p2.y - p1.y) - dy * (p2.x - p1.x)) / det;
  return { x: p1.x + t1 * (p2.x - p1.x), y: p1.y + t1 * (p2.y - p1.y), onSegment1: t1 >= -1e-5 && t1 <= 1 + 1e-5, onSegment2: t2 >= -1e-5 && t2 <= 1 + 1e-5 };
};

export const removeSelfIntersections = (pts, isClosed) => {
  if (pts.length < 4 || !isClosed) return pts;
  let result = [...pts], hasIntersection = true, maxIters = 20; 
  
  while (hasIntersection && maxIters > 0) {
    hasIntersection = false; maxIters--;
    for (let i = 0; i < result.length - 3; i++) {
      for (let j = i + 2; j < result.length - 1; j++) {
        if (i === 0 && j === result.length - 2) continue;
        const p1 = result[i], p2 = result[i+1], p3 = result[j], p4 = result[j+1];
        const inter = getSegmentIntersection(p1, p2, p3, p4);
        if (inter && inter.onSegment1 && inter.onSegment2) {
          const loop1 = [...result.slice(0, i + 1), {x: inter.x, y: inter.y}, ...result.slice(j + 1)];
          const loop2 = [{x: inter.x, y: inter.y}, ...result.slice(i + 1, j + 1)];
          result = Math.abs(signedArea(loop1)) > Math.abs(signedArea(loop2)) ? loop1 : loop2;
          hasIntersection = true; break;
        }
      }
      if (hasIntersection) break;
    }
  }
  return result;
};

export const splitPolygons = (targetPolygons, splitLinePts, thickness = 0.05) => {
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

  if (splitterBoxes.length === 0) return [];
  const splitResults = [];
  
  targetPolygons.forEach(poly => {
    if (!poly.pathData || poly.isClosed === false) return;
    const rings = parsePathToRings(poly.pathData);
    if (rings.length === 0) return;
    
    const polyCoords = rings.map(ring => ring.map(p => [p.x, p.y]));
    
    try {
      const diff = pc.difference([polyCoords], ...splitterBoxes);
      if (diff.length > 1) {
        const newPolys = [];
        diff.forEach((geom, idx) => {
          let pathData = "";
          const allRings = [];
          geom.forEach(ring => {
            const mappedRing = ring.map(coord => ({ x: Number(coord[0].toFixed(3)), y: Number(coord[1].toFixed(3)) }));
            if (mappedRing.length > 1) {
              const first = mappedRing[0], last = mappedRing[mappedRing.length - 1];
              if (Math.abs(first.x - last.x) < 0.005 && Math.abs(first.y - last.y) < 0.005) {
                mappedRing.pop();
              }
            }
            if (mappedRing.length > 0) {
              pathData += "M " + mappedRing.map(p => `${p.x} ${p.y}`).join(" L ") + " Z ";
              allRings.push(mappedRing);
            }
          });
          if (pathData.trim() !== "") {
            newPolys.push({
              ...poly,
              id: poly.id + '_split_' + idx + '_' + Date.now().toString(),
              pathData: pathData.trim(),
              center: calculatePolygonCenter(allRings),
              isModified: true
            });
          }
        });
        splitResults.push({ originalId: poly.id, newPolys });
      }
    } catch (e) {
      console.warn("Polygon splitting failed for poly", poly.id, e);
    }
  });

  return splitResults;
};

export const punchHoleInPolygons = (targetPolygons, holePts) => {
  if (holePts.length < 3) return [];
  const ring = holePts.map(p => [p.x, p.y]);
  const first = ring[0], last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  
  const cutPolyB = [[ring]];
  
  const getBBox = (pts) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(p => {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
    return { minX, minY, maxX, maxY };
  };
  
  const isBBoxIntersect = (b1, b2) => !(b2.minX > b1.maxX || b2.maxX < b1.minX || b2.minY > b1.maxY || b2.maxY < b1.minY);
  const cutBBox = getBBox(ring);
  const punchResults = [];

  targetPolygons.forEach(poly => {
    if (!poly.pathData || poly.isClosed === false) return;
    const rings = parsePathToRings(poly.pathData).map(r => r.map(pt => [pt.x, pt.y]));
    if (rings.length === 0 || rings[0].length === 0) return;
    
    const pBBox = getBBox(rings[0]);
    if (!isBBoxIntersect(pBBox, cutBBox)) return;

    try {
      if (pc.intersection([rings], cutPolyB).length === 0) return;
      const diffResult = pc.difference([rings], cutPolyB);
      
      if (diffResult.length > 0) {
        let pathData = "";
        const allRings = [];
        diffResult.forEach(geom => {
          geom.forEach(ring => {
            const mappedRing = ring.map(coord => ({ x: Number(coord[0].toFixed(3)), y: Number(coord[1].toFixed(3)) }));
            if (mappedRing.length > 1) {
              const f = mappedRing[0], l = mappedRing[mappedRing.length - 1];
              if (Math.abs(f.x - l.x) < 0.005 && Math.abs(f.y - l.y) < 0.005) mappedRing.pop();
            }
            if (mappedRing.length > 0) {
              pathData += "M " + mappedRing.map(p => `${p.x} ${p.y}`).join(" L ") + " Z ";
              allRings.push(mappedRing);
            }
          });
        });
        if (pathData.trim() !== "") {
          punchResults.push({ originalId: poly.id, newPoly: { ...poly, pathData: pathData.trim(), center: calculatePolygonCenter(allRings), isModified: true } });
        }
      }
    } catch (e) {
      console.warn("Polygon difference failed", e);
    }
  });

  return punchResults;
};
