import sys

with open('src/utils/dataProcessing.js', 'r', encoding='utf-8') as f:
    code = f.read()

correct_func = """export const extractExteriorPath = (targetPolygons) => {
  if (targetPolygons.length === 0) return "";
  if (targetPolygons.length === 1) return getExteriorPathString(targetPolygons[0].pathData);
  
  if (window.polygonClipping) {
    try {
      const polys = targetPolygons.map(p => {
        const rings = parsePathToRings(p.pathData).map(r => r.map(pt => [pt.x, pt.y]));
        rings.forEach(r => {
          if (r.length > 0) {
            const first = r[0], last = r[r.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) r.push([first[0], first[1]]);
          }
        });
        return [rings];
      });
      const unionResult = window.polygonClipping.union(...polys);
      if (unionResult && unionResult.length > 0) {
        const getPolyArea = (ring) => {
          let sum = 0;
          for (let i = 0; i < ring.length - 1; i++) sum += (ring[i+1][0] - ring[i][0]) * (ring[i+1][1] + ring[i][1]);
          return Math.abs(sum / 2);
        };
        const exteriorOnly = unionResult.map(poly => {
          let maxArea = -1, extRing = poly[0];
          poly.forEach(ring => {
            const a = getPolyArea(ring);
            if (a > maxArea) { maxArea = a; extRing = ring; }
          });
          return [extRing];
        });
        return multiPolyToPath(exteriorOnly);
      }
    } catch (e) { console.warn("Polygon union failed", e); }
  }

  const edgeCountMap = new Map(), edgePointsMap = new Map();
  const formatPt = (pt) => `${Math.round(pt.x * 1000)},${Math.round(pt.y * 1000)}`;
  
  targetPolygons.forEach(p => {
    if (!p.curves) {
      const rings = parsePathToRings(p.pathData);
      rings.forEach(ring => {
        for (let i = 0; i < ring.length - 1; i++) {
          const str1 = formatPt(ring[i]), str2 = formatPt(ring[i + 1]), key = str1 < str2 ? `${str1}_${str2}` : `${str2}_${str1}`;
          edgeCountMap.set(key, (edgeCountMap.get(key) || 0) + 1);
          if (!edgePointsMap.has(key)) edgePointsMap.set(key, [ring[i], ring[i + 1]]);
        }
      });
    } else {
      p.curves.forEach(cid => {
        const key = cid;
        edgeCountMap.set(key, (edgeCountMap.get(key) || 0) + 1);
      });
    }
  });

  let exteriorPath = "";
  targetPolygons.forEach(p => {
    if (!p.curves) {
      const rings = parsePathToRings(p.pathData);
      rings.forEach(ring => {
        const extRing = [];
        for (let i = 0; i < ring.length - 1; i++) {
          const str1 = formatPt(ring[i]), str2 = formatPt(ring[i + 1]), key = str1 < str2 ? `${str1}_${str2}` : `${str2}_${str1}`;
          if (edgeCountMap.get(key) === 1) {
            if (extRing.length === 0 || extRing[extRing.length - 1].x !== ring[i].x || extRing[extRing.length - 1].y !== ring[i].y) {
              extRing.push(ring[i]);
            }
            extRing.push(ring[i + 1]);
          }
        }
        if (extRing.length > 0) exteriorPath += "M " + extRing.map(pt => `${pt.x} ${pt.y}`).join(" L ") + " Z ";
      });
    }
  });
  return exteriorPath;
};"""

start_idx = code.find('export const extractExteriorPath = (targetPolygons) => {')
end_idx = code.find('export const parseMojXml = (xmlText) => {')

if start_idx != -1 and end_idx != -1:
    new_code = code[:start_idx] + correct_func + '\n\n' + code[end_idx:]
    with open('src/utils/dataProcessing.js', 'w', encoding='utf-8') as f:
        f.write(new_code)
    print('Fixed successfully')
else:
    print('Could not find boundaries')
