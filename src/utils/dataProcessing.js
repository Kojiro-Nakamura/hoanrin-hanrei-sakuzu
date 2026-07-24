import { CS_ORIGINS } from '../constants';
import { parsePathToRings, multiPolyToPath, getBBox, isBBoxIntersect, getClosestPointOnSegment, isPointInside, getPointInsidePolygon, calculatePolygonCenter, makeThickLinePolygon, signedArea, intersectLinesT, getSegmentIntersection, removeSelfIntersections } from './geometry';

export const processRingData = (pathStr, ringsOverride = null) => {
  const rings = ringsOverride || parsePathToRings(pathStr);
  return rings.map(ring => {
    const cleanRing = [];
    for (let i = 0; i < ring.length; i++) {
      if (i > 0 && Math.abs(ring[i].x - ring[i-1].x) < 1e-5 && Math.abs(ring[i].y - ring[i-1].y) < 1e-5) continue;
      cleanRing.push(ring[i]);
    }
    const isClosed = cleanRing.length > 2 && Math.abs(cleanRing[0].x - cleanRing[cleanRing.length-1].x) < 1e-5 && Math.abs(cleanRing[0].y - cleanRing[cleanRing.length-1].y) < 1e-5;
    if (isClosed && cleanRing.length > 2) cleanRing.pop();
    let area = 0;
    if (cleanRing.length >= 3) {
      for (let i = 0; i < cleanRing.length; i++) {
        const p1 = cleanRing[i], p2 = cleanRing[(i + 1) % cleanRing.length];
        area += (p1.x * p2.y - p2.x * p1.y);
      }
    }
    return { cleanRing, area, isClosed, absArea: Math.abs(area) };
  });
};

export const offsetRingByEdges = (ring, offset, isClosed, isCW, normalSign) => {
  if (ring.length < 2) return [];
  const absOffset = Math.abs(offset), validEdges = [];
  for (let i = 0; i < ring.length - (isClosed ? 0 : 1); i++) {
    const p1 = ring[i], p2 = isClosed && i === ring.length - 1 ? ring[0] : ring[i+1];
    const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy);
    if (len > 1e-4) validEdges.push({ p1, p2, dx, dy, len });
  }
  let edges = validEdges;
  if (edges.length < 2) return [];

  const offsetLines = edges.map(edge => {
    const ux = edge.dx / edge.len, uy = edge.dy / edge.len;
    const nx = (isCW ? -uy : uy) * normalSign, ny = (isCW ? ux : -ux) * normalSign;
    return { 
      p1: { x: edge.p1.x + nx * offset, y: edge.p1.y + ny * offset }, 
      p2: { x: edge.p2.x + nx * offset, y: edge.p2.y + ny * offset }, 
      v: { x: ux, y: uy }, nx, ny, orgEdge: edge 
    };
  });

  const offsetPoints = [];
  if (!isClosed) offsetPoints.push(offsetLines[0].p1);

  for (let i = 0; i < offsetLines.length; i++) {
    const line1 = offsetLines[i], line2 = isClosed && i === offsetLines.length - 1 ? offsetLines[0] : offsetLines[i+1];
    if (!line2 && !isClosed) { offsetPoints.push(line1.p2); break; }

    const inter = intersectLinesT(line1.p1, line1.v, line2.p1, line2.v);
    if (inter) {
      const distP = Math.hypot(inter.x - line1.orgEdge.p2.x, inter.y - line1.orgEdge.p2.y);
      const dot = line1.v.x * line2.v.x + line1.v.y * line2.v.y;
      const isConvex = inter.t1 > line1.orgEdge.len + 1e-4;

      if (dot < -0.95) { offsetPoints.push(line1.p2); offsetPoints.push(line2.p1); } 
      else if (isConvex) {
         if (distP > absOffset * 3.0) { offsetPoints.push(line1.p2); offsetPoints.push(line2.p1); } 
         else offsetPoints.push(inter);
      } else {
         if (distP > absOffset * 5.0) { offsetPoints.push(line1.p2); offsetPoints.push(line2.p1); } 
         else offsetPoints.push(inter);
      }
    } else {
      offsetPoints.push(line1.p2);
      if (line2) offsetPoints.push(line2.p1);
    }
  }
  return removeSelfIntersections(offsetPoints, isClosed);
};

export const samplePath = (cleanRing, interval, isClosed, isCW, normalSign) => {
  const distances = [0];
  let totalLen = 0;
  for (let i = 0; i < cleanRing.length - 1; i++) {
    totalLen += Math.hypot(cleanRing[i+1].x - cleanRing[i].x, cleanRing[i+1].y - cleanRing[i].y);
    distances.push(totalLen);
  }
  if (isClosed && cleanRing.length > 1) {
    totalLen += Math.hypot(cleanRing[0].x - cleanRing[cleanRing.length-1].x, cleanRing[0].y - cleanRing[cleanRing.length-1].y);
    distances.push(totalLen);
  }
  if (totalLen === 0) return [];

  const getPtAndVector = (d) => {
    d = (d % totalLen + totalLen) % totalLen;
    let idx = 0;
    for (let i = 0; i < distances.length - 1; i++) { if (d >= distances[i] && d <= distances[i+1]) { idx = i; break; } }
    const segLen = distances[idx+1] - distances[idx], p1 = cleanRing[idx], p2 = isClosed && idx === cleanRing.length - 1 ? cleanRing[0] : cleanRing[idx+1];
    let vx = p2.x - p1.x, vy = p2.y - p1.y;
    const vlen = Math.hypot(vx, vy) || 1e-5;
    
    if (segLen === 0) return { x: p1.x, y: p1.y, vx: vx/vlen, vy: vy/vlen };
    const ratio = (d - distances[idx]) / segLen;
    return { x: p1.x + vx * ratio, y: p1.y + vy * ratio, vx: vx/vlen, vy: vy/vlen };
  };

  const validPoints = [];
  for (let d = interval / 2; d < totalLen; d += interval) {
    const { x: baseX, y: baseY, vx: ux, vy: uy } = getPtAndVector(d);
    const nx = (isCW ? -uy : uy) * normalSign, ny = (isCW ? ux : -ux) * normalSign;
    validPoints.push({ baseX, baseY, ux, uy, nx, ny, scale: 1.0 });
  }
  return validPoints;
};

export const generateOffsetRings = (pathStr, offset, ringsOverride = null) => {
  const ringData = processRingData(pathStr, ringsOverride);
  if (ringData.length === 0) return "";
  let offsetPath = "";
  const maxAreaRing = ringData.reduce((prev, curr) => (curr.absArea > prev.absArea ? curr : prev), ringData[0]);
  const mainSign = Math.sign(maxAreaRing.area) || 1;

  ringData.forEach(data => {
    const { cleanRing, area, isClosed } = data;
    if (cleanRing.length < 2) return;

    const isHole = area !== 0 && Math.sign(area) !== mainSign;
    const isCW = area !== 0 ? area > 0 : true;
    const normalSign = isHole ? -1 : 1;

    let offsetPoints = offsetRingByEdges(cleanRing, offset, isClosed, isCW, normalSign);
    
    if (isClosed && offsetPoints.length >= 3) {
       const offArea = signedArea(offsetPoints);
       if (Math.sign(area) !== 0 && Math.sign(offArea) !== 0 && Math.sign(area) !== Math.sign(offArea)) offsetPoints = [];
    }
    
    if (offsetPoints && offsetPoints.length > 0) {
      offsetPath += `M ${offsetPoints[0].x} ${offsetPoints[0].y} `;
      for (let i = 1; i < offsetPoints.length; i++) offsetPath += `L ${offsetPoints[i].x} ${offsetPoints[i].y} `;
      if (isClosed) offsetPath += "Z ";
    }
  });
  return offsetPath;
};

export const generateDecorations = (pathStr, interval, size, tickLength, pattern, shapeOffset = 1.5, higeOffset = 0) => {
  const ringData = processRingData(pathStr);
  const decorations = [];
  if (ringData.length === 0) return decorations;
  const maxAreaRing = ringData.reduce((prev, curr) => (curr.absArea > prev.absArea ? curr : prev), ringData[0]);
  const mainSign = Math.sign(maxAreaRing.area) || 1;

  ringData.forEach(data => {
    const { cleanRing, area, isClosed } = data;
    if (cleanRing.length < 2) return;

    const isHole = area !== 0 && Math.sign(area) !== mainSign;
    const isCW = area !== 0 ? area > 0 : true;
    const normalSign = isHole ? -1 : 1;

    const points = samplePath(cleanRing, interval, isClosed, isCW, normalSign);
    
    points.forEach((pt, index) => {
      const { baseX, baseY, nx, ny, scale } = pt;
      let drawHige = false, drawShape = null;
      
      if (pattern === 'hige') drawHige = true;
      else if (pattern === 'circle') drawShape = 'circle';
      else if (pattern === 'triangle') drawShape = 'triangle';
      else if (pattern === 'circle_triangle') drawShape = index % 2 === 0 ? 'circle' : 'triangle';
      else if (pattern === 'cross') drawShape = 'cross';
      else if (pattern === 'hige_circle_alt') { if (index % 2 === 0) drawHige = true; else drawShape = 'circle'; }
      else if (pattern === 'hige_triangle_alt') { if (index % 2 === 0) drawHige = true; else drawShape = 'triangle'; }
      else if (pattern === 'hige_circle_triangle_alt') {
        if (index % 2 === 0) drawHige = true; else drawShape = (index % 4 === 1) ? 'circle' : 'triangle';
      }
      else if (pattern === 'solid_circle') drawShape = 'solid_circle';
      else if (pattern === 'angle_bracket') drawShape = 'angle_bracket';

      const angle = Math.atan2(ny, nx) * 180 / Math.PI;

      if (drawHige) {
        const hLen = tickLength * scale, startX = baseX + nx * higeOffset * scale, startY = baseY + ny * higeOffset * scale;
        decorations.push({ id: `dec_${Date.now()}_${Math.random()}`, type: 'hige', cx: startX, cy: startY, angle, hLen, scale });
      }
      
      if (drawShape) {
        let r = 0, offset = shapeOffset * scale;
        if (drawShape === 'circle') r = size * 0.6 * scale;
        else if (drawShape === 'triangle') r = size * 0.8 * scale;
        else if (drawShape === 'cross') r = size * 0.7 * scale;
        else if (drawShape === 'solid_circle') { r = size * 0.45 * scale; offset = 0; }
        else if (drawShape === 'angle_bracket') { r = size * 1.5 * scale; offset = 0; }

        const cx = baseX + nx * offset, cy = baseY + ny * offset;
        let shapeAngle = angle;
        if (drawShape === 'angle_bracket') shapeAngle -= 90;

        decorations.push({ id: `dec_${Date.now()}_${Math.random()}`, type: drawShape, cx, cy, angle: shapeAngle, r, scale });
      }
    });
  });
  return decorations;
};

export const buildConnectedPath = (segmentsList) => {
  let path = "";
  const segments = segmentsList.map(seg => [...seg]); 
  const eps = 0.005; 
  while (segments.length > 0) {
    let ring = segments.shift(), added = true;
    while (added && segments.length > 0) {
      added = false;
      let head = ring[0], tail = ring[ring.length - 1];
      for (let i = 0; i < segments.length; i++) {
        let seg = segments[i], sHead = seg[0], sTail = seg[seg.length - 1];
        if (Math.abs(tail.x - sHead.x) < eps && Math.abs(tail.y - sHead.y) < eps) { ring.push(...seg.slice(1)); segments.splice(i, 1); added = true; break; } 
        else if (Math.abs(tail.x - sTail.x) < eps && Math.abs(tail.y - sTail.y) < eps) { ring.push(...[...seg].reverse().slice(1)); segments.splice(i, 1); added = true; break; } 
        else if (Math.abs(head.x - sTail.x) < eps && Math.abs(head.y - sTail.y) < eps) { ring.unshift(...seg.slice(0, -1)); segments.splice(i, 1); added = true; break; } 
        else if (Math.abs(head.x - sHead.x) < eps && Math.abs(head.y - sHead.y) < eps) { ring.unshift(...[...seg].reverse().slice(0, -1)); segments.splice(i, 1); added = true; break; }
      }
    }
    if (ring.length > 0) {
      path += `M ${ring[0].x} ${ring[0].y} ` + ring.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
      if (Math.abs(ring[0].x - ring[ring.length - 1].x) < eps && Math.abs(ring[0].y - ring[ring.length - 1].y) < eps) path += " Z "; 
      else path += " ";
    }
  }
  return path;
};

export const extractExteriorPath = (targetPolygons) => {
  if (targetPolygons.length === 0) return "";
  if (targetPolygons.length === 1) return targetPolygons[0].pathData;
  
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
      if (unionResult && unionResult.length > 0) return multiPolyToPath(unionResult);
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
      return;
    }
    p.curves.forEach(c => {
      for (let i = 0; i < c.pts.length - 1; i++) {
        const str1 = formatPt(c.pts[i]), str2 = formatPt(c.pts[i + 1]), key = str1 < str2 ? `${str1}_${str2}` : `${str2}_${str1}`;
        edgeCountMap.set(key, (edgeCountMap.get(key) || 0) + 1);
        if (!edgePointsMap.has(key)) edgePointsMap.set(key, [c.pts[i], c.pts[i + 1]]);
      }
    });
  });

  const exteriorSegments = [];
  edgeCountMap.forEach((count, key) => { if (count === 1) exteriorSegments.push(edgePointsMap.get(key)); });
  return exteriorSegments.length > 0 ? buildConnectedPath(exteriorSegments) : targetPolygons.map(p => p.pathData).join(' ');
};

export const parseMojXml = (xmlText, fileId = "") => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  if (xmlDoc.getElementsByTagName("parsererror").length > 0) throw new Error("XMLの解析に失敗しました。");

  const prefix = fileId ? `${fileId}_` : '';
  let sysNum = null;
  const sysMatch = xmlDoc.getElementsByTagName("座標系")[0]?.textContent.match(/(\d+)系/);
  if (sysMatch) sysNum = parseInt(sysMatch[1], 10);

  const oaza = xmlDoc.getElementsByTagName("大字名")[0]?.textContent || "";
  const koaza = xmlDoc.getElementsByTagName("小字名")[0]?.textContent || "";

  const parsedLines = [], polyList = [];
  const allElements = xmlDoc.getElementsByTagName("*");
  const posListElements = Array.from(allElements).filter(el => el.localName === "posList" || el.nodeName.endsWith(":posList"));

  if (posListElements.length > 0) {
    posListElements.forEach(el => {
      const coords = el.textContent.trim().split(/\s+/).map(Number);
      const points = [];
      for (let j = 0; j < coords.length; j += 2) {
        if (isNaN(coords[j]) || isNaN(coords[j+1])) continue;
        points.push({ x: coords[j+1], y: -coords[j] });
      }
      if (points.length > 1) parsedLines.push(points);
    });
  } else {
    const pointMap = new Map(), curveMap = new Map(), surfaceMap = new Map();
    const zukaiSurfaceIds = new Set(), excludeCurveIds = new Set();
    
    Array.from(xmlDoc.getElementsByTagName("図郭")).forEach(el => {
      const idref = el.getElementsByTagName("形状")[0]?.getAttribute("idref");
      if (idref) zukaiSurfaceIds.add(idref);
    });
    Array.from(xmlDoc.getElementsByTagName("図郭線")).forEach(el => {
      const idref = el.getElementsByTagName("形状")[0]?.getAttribute("idref");
      if (idref) excludeCurveIds.add(idref);
    });
    Array.from(xmlDoc.getElementsByTagName("仮図郭線")).forEach(el => {
      const idref = el.getElementsByTagName("形状")[0]?.getAttribute("idref");
      if (idref) excludeCurveIds.add(idref);
    });

    Array.from(allElements).forEach(el => {
      if (el.localName === "GM_Point" || el.nodeName?.endsWith(":GM_Point")) {
        const id = el.getAttribute("id");
        if (!id) return;
        let xVal = null, yVal = null;
        const children = el.getElementsByTagName("*");
        for (let j = 0; j < children.length; j++) {
          if (children[j].localName === "X") xVal = parseFloat(children[j].textContent);
          if (children[j].localName === "Y") yVal = parseFloat(children[j].textContent);
        }
        if (xVal !== null && yVal !== null && !isNaN(xVal) && !isNaN(yVal)) pointMap.set(id, { x: xVal, y: yVal });
      }
    });
    
    Array.from(allElements).forEach(el => {
      if (el.localName === "GM_Curve" || el.nodeName?.endsWith(":GM_Curve")) {
        const linePoints = Array.from(el.querySelectorAll('[idref]')).map(ref => pointMap.get(ref.getAttribute('idref'))).filter(Boolean).map(pt => ({ x: pt.y, y: -pt.x }));
        if (linePoints.length > 1) curveMap.set(el.getAttribute("id"), linePoints);
      }
    });

    Array.from(allElements).forEach(el => {
      if (el.localName === "GM_Surface" || el.nodeName?.endsWith("Surface") || el.localName === "Surface") {
        const id = el.getAttribute("id");
        if (id) {
          const cids = Array.from(el.querySelectorAll('[idref]')).map(r => r.getAttribute('idref')).filter(cid => curveMap.has(cid));
          surfaceMap.set(id, cids);
          if (zukaiSurfaceIds.has(id)) cids.forEach(cid => excludeCurveIds.add(cid));
        }
      }
    });

    Array.from(xmlDoc.getElementsByTagName("筆")).forEach(el => {
      const originalId = el.getAttribute("id");
      const surfaceId = el.getElementsByTagName("形状")[0]?.getAttribute("idref");
      if (!originalId || !surfaceId || !surfaceMap.has(surfaceId)) return;
      const fudeId = prefix + originalId;
      const chiban = el.getElementsByTagName("地番")[0]?.textContent || "不明";
      
      if (chiban.includes("地区外")) {
        surfaceMap.get(surfaceId).forEach(cid => excludeCurveIds.add(cid));
        return;
      }

      const curvesData = [], segmentsList = [];
      surfaceMap.get(surfaceId).forEach(cid => {
        const pts = curveMap.get(cid);
        if (pts && pts.length > 0) { curvesData.push({ id: cid, pts }); segmentsList.push(pts); }
      });
      
      const pathData = buildConnectedPath(segmentsList);
      const rings = parsePathToRings(pathData);
      
      polyList.push({ id: fudeId, chiban, pathData, curves: curvesData, center: calculatePolygonCenter(rings), oaza, koaza });
    });

    curveMap.forEach((linePoints, id) => {
      if (!excludeCurveIds.has(id)) parsedLines.push(linePoints);
    });
  }

  let finalMinX = Infinity, finalMinY = Infinity, finalMaxX = -Infinity, finalMaxY = -Infinity;
  parsedLines.forEach(line => {
    line.forEach(pt => {
      finalMinX = Math.min(finalMinX, pt.x); finalMaxX = Math.max(finalMaxX, pt.x);
      finalMinY = Math.min(finalMinY, pt.y); finalMaxY = Math.max(finalMaxY, pt.y);
    });
  });

  if (parsedLines.length === 0 || finalMinX === Infinity) throw new Error("地図の座標データが見つかりませんでした。");
  return { lines: parsedLines, polygons: polyList, boundingBox: { minX: finalMinX, minY: finalMinY, maxX: finalMaxX, maxY: finalMaxY }, coordinateSystem: sysNum };
};