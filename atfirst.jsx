import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { UploadCloud, Maximize, AlertCircle, Loader2, Map as MapIcon, Move, Globe, Layers, Paintbrush, MousePointerClick, Trash2, Hash, Edit3, Undo, Redo, Download, Scissors, RefreshCw, Save, CloudDownload, Home, Link } from 'lucide-react';

// ============================================================================
// Constants & Configuration
// ============================================================================
const DB_NAME = 'HoanrinAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';

const CS_ORIGINS = {
  1: [33, 129.5], 2: [33, 131], 3: [36, 132 + 10/60], 4: [33, 133.5], 5: [36, 134 + 20/60],
  6: [36, 136], 7: [36, 137 + 10/60], 8: [36, 138.5], 9: [36, 139 + 50/60], 10: [40, 139 + 50/60],
  11: [44, 140.25], 12: [44, 142.25], 13: [44, 144.25], 14: [26, 142], 15: [26, 127.5],
  16: [26, 124], 17: [26, 131], 18: [20, 136], 19: [26, 154]
};

const LINE_STYLES = [
  { id: 'single', name: '単線' },
  { id: 'double', name: '二重線' },
  { id: 'double_dashed', name: '二重線 (内側が破線)' },
  { id: 'single_inner', name: '単線＋内側二点鎖線' },
  { id: 'double_inner', name: '二重線＋内側二点鎖線' },
  { id: 'dashed', name: '破線 (択伐区域など)' },
  { id: 'dashdot', name: '一点鎖線 (間伐区域など)' },
  { id: 'dotted', name: '点線 (字界など)' },
  { id: 'none', name: '線なし (記号のみ配置)' }
];

const DECO_PATTERNS = [
  { id: 'none', name: 'なにもなし', pattern: null },
  { id: 'hige', name: 'ヒゲのみ', pattern: 'hige' },
  { id: 'cross', name: '× (バツ)', pattern: 'cross' },
  { id: 'triangle', name: '△ (三角)', pattern: 'triangle' },
  { id: 'circle', name: '〇 (丸)', pattern: 'circle' },
  { id: 'circle_triangle', name: '〇・△ 交互', pattern: 'circle_triangle' },
  { id: 'hige_circle', name: 'ヒゲ・〇 交互', pattern: 'hige_circle_alt' },
  { id: 'hige_triangle', name: 'ヒゲ・△ 交互', pattern: 'hige_triangle_alt' },
  { id: 'hige_circle_triangle', name: 'ヒゲ・△・〇 交互', pattern: 'hige_circle_triangle_alt' },
  { id: 'solid_circle', name: '● (線上黒丸)', pattern: 'solid_circle' },
  { id: 'angle_bracket', name: '＜・＞ (県界)', pattern: 'angle_bracket' }
];

// ============================================================================
// IndexedDB Utilities
// ============================================================================
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveToDB = async (data) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data, 'current_state');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const loadFromDB = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('current_state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// ============================================================================
// Geometry & GIS Utilities
// ============================================================================
const lon2tile = (lon, zoom) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
const lat2tile = (lat, zoom) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
const tile2lon = (x, z) => (x / Math.pow(2, z) * 360 - 180);
const tile2lat = (y, z) => {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
};

const parsePathToRings = (pathStr) => {
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
  if (currentRing.length > 0) rings.push(currentRing);
  return rings;
};

const multiPolyToPath = (mp) => {
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

const getBBox = (ring) => {
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

const isBBoxIntersect = (b1, b2) => !(b2.minX > b1.maxX || b2.maxX < b1.minX || b2.minY > b1.maxY || b2.maxY < b1.minY);

const getClosestPointOnSegment = (p, v, w) => {
  const l2 = (w.x - v.x)**2 + (w.y - v.y)**2;
  if (l2 === 0) return { x: v.x, y: v.y, distSq: (p.x - v.x)**2 + (p.y - v.y)**2 };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = v.x + t * (w.x - v.x), projY = v.y + t * (w.y - v.y);
  return { x: projX, y: projY, distSq: (p.x - projX)**2 + (p.y - projY)**2 };
};

const isPointInside = (pt, rings) => {
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

const getPointInsidePolygon = (rings, minX, minY, maxX, maxY) => {
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

const calculatePolygonCenter = (rings) => {
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

const makeThickLinePolygon = (pts, width) => {
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

const signedArea = (pts) => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area / 2;
};

const intersectLinesT = (p1, v1, p2, v2) => {
  const det = v1.x * v2.y - v1.y * v2.x;
  if (Math.abs(det) < 1e-8) return null; 
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const t1 = (dx * v2.y - dy * v2.x) / det, t2 = (dx * v1.y - dy * v1.x) / det;
  return { x: p1.x + t1 * v1.x, y: p1.y + t1 * v1.y, t1, t2 };
};

const getSegmentIntersection = (p1, p2, p3, p4) => {
  const det = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(det) < 1e-8) return null; 
  const dx = p3.x - p1.x, dy = p3.y - p1.y;
  const t1 = (dx * (p4.y - p3.y) - dy * (p4.x - p3.x)) / det;
  const t2 = (dx * (p2.y - p1.y) - dy * (p2.x - p1.x)) / det;
  return { x: p1.x + t1 * (p2.x - p1.x), y: p1.y + t1 * (p2.y - p1.y), onSegment1: t1 >= -1e-5 && t1 <= 1 + 1e-5, onSegment2: t2 >= -1e-5 && t2 <= 1 + 1e-5 };
};

const removeSelfIntersections = (pts, isClosed) => {
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

// ============================================================================
// DXF Export Helpers (Pure Functions)
// ============================================================================
const dxfCreateText = (text, x, y, height, layer="0", color=7) => {
  const escapedText = String(text).split('').map(c => {
    const code = c.charCodeAt(0);
    return code > 127 ? '\\U+' + code.toString(16).toUpperCase().padStart(4, '0') : c;
  }).join('');
  return `  0\nTEXT\n  8\n${layer}\n 62\n${color}\n 10\n${x.toFixed(4)}\n 20\n${(-y).toFixed(4)}\n 30\n0.0\n 40\n${height.toFixed(4)}\n  1\n${escapedText}\n 72\n1\n 11\n${x.toFixed(4)}\n 21\n${(-y).toFixed(4)}\n 31\n0.0\n 73\n2\n`; 
};
const dxfCreateCircle = (cx, cy, r, layer="0", color=7) => `  0\nCIRCLE\n  8\n${layer}\n 62\n${color}\n 10\n${cx.toFixed(4)}\n 20\n${(-cy).toFixed(4)}\n 30\n0.0\n 40\n${r.toFixed(4)}\n`;
const dxfCreateInsert = (blockName, cx, cy, scale, angleDeg, layer="0", color=7) => `  0\nINSERT\n  2\n${blockName}\n  8\n${layer}\n 62\n${color}\n 10\n${cx.toFixed(4)}\n 20\n${(-cy).toFixed(4)}\n 30\n0.0\n 41\n${scale.toFixed(4)}\n 42\n${scale.toFixed(4)}\n 43\n1.0\n 50\n${(-angleDeg).toFixed(4)}\n`;
const dxfCreateSolid = (x1, y1, x2, y2, x3, y3, x4, y4, layer="0", color=7) => `  0\nSOLID\n  8\n${layer}\n 62\n${color}\n 10\n${x1.toFixed(4)}\n 20\n${(-y1).toFixed(4)}\n 30\n0.0\n 11\n${x2.toFixed(4)}\n 21\n${(-y2).toFixed(4)}\n 31\n0.0\n 12\n${x3.toFixed(4)}\n 22\n${(-y3).toFixed(4)}\n 32\n0.0\n 13\n${x4.toFixed(4)}\n 23\n${(-y4).toFixed(4)}\n 33\n0.0\n`;
const dxfCreatePath = (pathStr, layer, color, cx = 0, cy = 0, angleDeg = 0) => {
  if (!pathStr) return "";
  let res = "";
  const rad = angleDeg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const transform = (x, y) => ({ x: x * cos - y * sin + cx, y: x * sin + y * cos + cy });
  const tokens = pathStr.trim().split(/\s+/);
  let polylines = [], currentPolyline = null, i = 0;
  
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === 'M' || token === 'm') {
      if (currentPolyline && currentPolyline.pts.length > 0) polylines.push(currentPolyline);
      currentPolyline = { pts: [], closed: false };
      const rawX = parseFloat(tokens[i + 1]), rawY = parseFloat(tokens[i + 2]);
      if (!isNaN(rawX) && !isNaN(rawY)) currentPolyline.pts.push(transform(rawX, rawY));
      i += 3;
    } else if (token === 'L' || token === 'l') {
      const rawX = parseFloat(tokens[i + 1]), rawY = parseFloat(tokens[i + 2]);
      if (!isNaN(rawX) && !isNaN(rawY)) { if (currentPolyline) currentPolyline.pts.push(transform(rawX, rawY)); }
      i += 3;
    } else if (token === 'Z' || token === 'z') {
      if (currentPolyline) currentPolyline.closed = true;
      i += 1;
    } else { i += 1; }
  }
  if (currentPolyline && currentPolyline.pts.length > 0) polylines.push(currentPolyline);

  polylines.forEach(poly => {
    if (poly.pts.length < 2) return;
    res += `  0\nLWPOLYLINE\n  8\n${layer}\n 62\n${color}\n100\nAcDbEntity\n100\nAcDbPolyline\n 90\n${poly.pts.length}\n 70\n${poly.closed ? 1 : 0}\n`;
    poly.pts.forEach(pt => { res += ` 10\n${pt.x.toFixed(4)}\n 20\n${(-pt.y).toFixed(4)}\n`; });
  });
  return res;
};

// ============================================================================
// Data Processing (XML Parse, Decorations)
// ============================================================================
const processRingData = (pathStr, ringsOverride = null) => {
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

const offsetRingByEdges = (ring, offset, isClosed, isCW, normalSign) => {
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

const samplePath = (cleanRing, interval, isClosed, isCW, normalSign) => {
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

const generateOffsetRings = (pathStr, offset, ringsOverride = null) => {
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

const generateDecorations = (pathStr, interval, size, tickLength, pattern, shapeOffset = 1.5, higeOffset = 0) => {
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

const buildConnectedPath = (segmentsList) => {
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

const extractExteriorPath = (targetPolygons) => {
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

const parseMojXml = (xmlText, fileId = "") => {
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

// ============================================================================
// Custom Hooks
// ============================================================================
const usePanZoom = (mode) => {
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1000, h: 1000 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 }), mousePos = useRef({ x: 0, y: 0 }), svgRef = useRef(null);

  const fitToBoundingBox = useCallback((bbox) => {
    if (!bbox) return;
    let w = bbox.maxX - bbox.minX, h = bbox.maxY - bbox.minY;
    if (w === 0) w = 100; if (h === 0) h = 100;
    
    const padX = w * 0.1, padY = h * 0.1;
    const targetW = w + padX * 2, targetH = h + padY * 2;
    const centerX = bbox.minX + w / 2, centerY = bbox.minY + h / 2;

    const rect = svgRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      const screenAspect = rect.width / rect.height, targetAspect = targetW / targetH;
      let finalW = targetW, finalH = targetH;
      if (screenAspect > targetAspect) finalW = targetH * screenAspect;
      else finalH = targetW / screenAspect;
      setViewBox({ x: centerX - finalW / 2, y: centerY - finalH / 2, w: finalW, h: finalH });
    } else {
      setViewBox({ x: centerX - targetW / 2, y: centerY - targetH / 2, w: targetW, h: targetH });
    }
  }, []);

  const handlers = useMemo(() => ({
    onWheel: (e) => {
      e.preventDefault();
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const rx = (e.clientX - rect.left) / rect.width, ry = (e.clientY - rect.top) / rect.height;
      const scale = e.deltaY > 0 ? 1.2 : 0.8;
      setViewBox(v => {
        const nw = v.w * scale, nh = v.h * scale;
        if (nw < 10 || nw > 1000000) return v;
        return { x: v.x + (v.w - nw) * rx, y: v.y + (v.h - nh) * ry, w: nw, h: nh };
      });
    },
    onMouseDown: (e) => {
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      mousePos.current = { x: e.clientX, y: e.clientY };
    },
    onMouseMove: (e) => {
      if (!isDragging || !svgRef.current) return;
      const dx = e.clientX - mousePos.current.x, dy = e.clientY - mousePos.current.y;
      const rect = svgRef.current.getBoundingClientRect();
      setViewBox(v => ({ ...v, x: v.x - dx * (v.w / rect.width), y: v.y - dy * (v.h / rect.height) }));
      mousePos.current = { x: e.clientX, y: e.clientY };
    },
    onMouseUp: () => setIsDragging(false),
    onMouseLeave: () => setIsDragging(false)
  }), [isDragging]);

  return { viewBox, svgRef, isDragging, handlers, fitToBoundingBox, 
    wasDragged: (e) => Math.abs(e.clientX - dragStart.current.x) > 10 || Math.abs(e.clientY - dragStart.current.y) > 10
  };
};

const useMapTiles = (viewBox, showMap, coordinateSystem, mapType, containerRef) => {
  const [proj4Loaded, setProj4Loaded] = useState(false);
  useEffect(() => {
    if (window.proj4) return setProj4Loaded(true);
    const script = document.createElement('script'); script.src = 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.js';
    script.onload = () => setProj4Loaded(true); document.head.appendChild(script);
  }, []);

  return useMemo(() => {
    if (!showMap || !coordinateSystem || !proj4Loaded || !window.proj4) return [];
    const origin = CS_ORIGINS[coordinateSystem];
    if (!origin) return [];
    const projStr = `+proj=tmerc +lat_0=${origin[0]} +lon_0=${origin[1]} +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
    try {
      const cx = viewBox.x + viewBox.w / 2, cy = viewBox.y + viewBox.h / 2;
      const [, c_lat] = window.proj4(projStr, 'WGS84', [cx, -cy]);
      const clientW = containerRef.current?.clientWidth || 800;
      let z = Math.log2((40075016 * Math.cos(c_lat * Math.PI / 180)) / (256 * (viewBox.w / clientW)));
      let renderZ = Math.max(2, Math.min(18, Math.round(z)));

      const [nw_lon, nw_lat] = window.proj4(projStr, 'WGS84', [viewBox.x, -viewBox.y]);
      const [se_lon, se_lat] = window.proj4(projStr, 'WGS84', [viewBox.x + viewBox.w, -(viewBox.y + viewBox.h)]);
      let xMin = lon2tile(Math.min(nw_lon, se_lon), renderZ), xMax = lon2tile(Math.max(nw_lon, se_lon), renderZ);
      let yMin = lat2tile(Math.max(nw_lat, se_lat), renderZ), yMax = lat2tile(Math.min(nw_lat, se_lat), renderZ);

      if ((xMax - xMin + 1) * (yMax - yMin + 1) > 40) { 
        renderZ -= 1;
        xMin = lon2tile(Math.min(nw_lon, se_lon), renderZ); xMax = lon2tile(Math.max(nw_lon, se_lon), renderZ);
        yMin = lat2tile(Math.max(nw_lat, se_lat), renderZ); yMax = lat2tile(Math.min(nw_lat, se_lat), renderZ);
      }

      const tiles = [], ext = mapType === 'seamlessphoto' ? 'jpg' : 'png';
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          const [e1, n1] = window.proj4('WGS84', projStr, [tile2lon(x, renderZ), tile2lat(y, renderZ)]);
          const [e2, n2] = window.proj4('WGS84', projStr, [tile2lon(x + 1, renderZ), tile2lat(y + 1, renderZ)]);
          const bw = Math.abs(e2 - e1), bh = Math.abs(-n2 - -n1);
          tiles.push({ key: `${renderZ}-${x}-${y}-${mapType}`, url: `https://cyberjapandata.gsi.go.jp/xyz/${mapType}/${renderZ}/${x}/${y}.${ext}`, x: Math.min(e1, e2) - bw * 0.005, y: Math.min(-n1, -n2) - bh * 0.005, w: bw * 1.01, h: bh * 1.01 });
        }
      }
      return tiles;
    } catch (e) { return []; }
  }, [viewBox, showMap, coordinateSystem, proj4Loaded, mapType, containerRef]);
};

// ============================================================================
// UI Components
// ============================================================================
const LegendGroup = ({ group, scale, mode, activeDeco, onDecoMouseDown }) => {
  const sw = scale / 1000; 
  const maxShapeSw = 0.2, maxHigeSw = 0.3;
  const lineSw = sw * 1.2, shapeSw = Math.min(sw * 1.2, maxShapeSw), higeSw = Math.min(sw * 1.5, maxHigeSw);
  const { lineStyleId, styleId, pathData, innerPathData, innerPathData2, decorations, higePath, shapePath } = group;

  const effectiveLineStyle = lineStyleId || styleId;

  const renderBaseLine = () => {
    if (effectiveLineStyle === 'none') return null; 
    
    switch(effectiveLineStyle) {
      case 'double': 
      case 'style1': 
        if (!innerPathData) {
          return (
            <g pointerEvents="none">
              <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={sw * 3} strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathData} fill="none" stroke="#ffffff" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        }
        return (
          <g pointerEvents="none">
            <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
            <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      case 'double_dashed': 
        return (
          <g pointerEvents="none">
             <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
             {innerPathData && <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeDasharray={`${sw * 4} ${sw * 3}`} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        );
      case 'single_inner':
        return (
          <g pointerEvents="none">
            <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
            {innerPathData && <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw * 0.8} strokeDasharray={`${sw * 4} ${sw * 2} ${sw * 1} ${sw * 2} ${sw * 1} ${sw * 2}`} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        );
      case 'double_inner':
        if (!innerPathData2) {
          return (
            <g pointerEvents="none">
              <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={sw * 3} strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathData} fill="none" stroke="#ffffff" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
              {innerPathData && <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw * 0.8} strokeDasharray={`${sw * 4} ${sw * 2} ${sw * 1} ${sw * 2} ${sw * 1} ${sw * 2}`} strokeLinecap="round" strokeLinejoin="round" />}
            </g>
          );
        }
        return (
          <g pointerEvents="none">
            <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
            {innerPathData && <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" /> }
            {innerPathData2 && <path d={innerPathData2} fill="none" stroke="#dc2626" strokeWidth={lineSw * 0.8} strokeDasharray={`${sw * 4} ${sw * 2} ${sw * 1} ${sw * 2} ${sw * 1} ${sw * 2}`} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        );
      case 'dashed': 
      case 'style2':
        return <path d={pathData} fill="none" pointerEvents="none" stroke="#2563eb" strokeWidth={lineSw} strokeDasharray={`${sw * 4} ${sw * 4}`} strokeLinecap="round" strokeLinejoin="round" />;
      case 'dashdot': 
      case 'style3':
        return <path d={pathData} fill="none" pointerEvents="none" stroke="#16a34a" strokeWidth={lineSw} strokeDasharray={`${sw * 6} ${sw * 2} ${sw} ${sw * 2}`} strokeLinecap="round" strokeLinejoin="round" />;
      case 'yellow_thick': 
      case 'style4':
        return <path d={pathData} fill="none" pointerEvents="none" stroke="#eab308" strokeWidth={sw * 2.5} strokeOpacity={0.8} strokeLinecap="round" strokeLinejoin="round" />;
      case 'dotted': 
      case 'style5':
        return <path d={pathData} fill="none" pointerEvents="none" stroke="#9333ea" strokeWidth={lineSw} strokeDasharray={`0 ${sw * 3}`} strokeLinecap="round" strokeLinejoin="round" />;
      case 'single':
      default: 
        if (styleId && !lineStyleId) {
            return <path d={pathData} fill="none" stroke="#2563eb" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />;
        }
        return <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />;
    }
  };

  return (
    <g>
      {renderBaseLine()}
      
      {decorations && decorations.map(d => {
        const isActive = activeDeco?.type === 'deco' && activeDeco?.groupId === group.id && activeDeco?.decoId === d.id;
        const isInteractive = mode === 'edit_deco';
        
        let pathStr = "";
        if (d.type === 'hige') { pathStr = `M 0 0 L ${d.hLen} 0`; }
        else if (d.type === 'circle') {
          pathStr = `M ${d.r} 0 `;
          for (let k = 1; k < 16; k++) pathStr += `L ${d.r * Math.cos((k / 16) * Math.PI * 2)} ${d.r * Math.sin((k / 16) * Math.PI * 2)} `;
          pathStr += "Z";
        } 
        else if (d.type === 'triangle') pathStr = `M ${d.r} 0 L ${-d.r*0.5} ${-d.r*0.866} L ${-d.r*0.5} ${d.r*0.866} Z`;
        else if (d.type === 'cross') pathStr = `M ${-d.r} ${-d.r} L ${d.r} ${d.r} M ${-d.r} ${d.r} L ${d.r} ${-d.r}`;
        else if (d.type === 'solid_circle') {
          pathStr = `M ${d.r} 0 `;
          for (let k = 1; k < 16; k++) pathStr += `L ${d.r * Math.cos((k / 16) * Math.PI * 2)} ${d.r * Math.sin((k / 16) * Math.PI * 2)} `;
          pathStr += "Z";
        }
        else if (d.type === 'angle_bracket') {
          pathStr = `M ${-d.r*0.8} ${d.r*0.4} L ${-d.r} 0 L ${-d.r*0.8} ${-d.r*0.4} M ${d.r*0.8} ${d.r*0.4} L ${d.r} 0 L ${d.r*0.8} ${-d.r*0.4}`;
          pathStr += ` M ${d.r * 0.1} 0 A ${d.r * 0.1} ${d.r * 0.1} 0 1 1 ${d.r * 0.1} -0.001`; 
        }
        else if (d.type === 'megane') {
          const circleR = d.scale * 0.25, distFromCenter = d.scale * 1.5;
          const leftCx = -distFromCenter, rightCx = distFromCenter;
          const rx = distFromCenter - circleR, ry = rx * 0.4;
          pathStr = `M ${leftCx} ${circleR} A ${circleR} ${circleR} 0 1 1 ${leftCx} ${-circleR} A ${circleR} ${circleR} 0 1 1 ${leftCx} ${circleR} M ${rightCx} ${circleR} A ${circleR} ${circleR} 0 1 1 ${rightCx} ${-circleR} A ${circleR} ${circleR} 0 1 1 ${rightCx} ${circleR} M ${leftCx + circleR} 0 A ${rx} ${ry} 0 0 1 ${rightCx - circleR} 0`;
        }
        
        return (
          <g key={d.id} className="deco-group" transform={`translate(${d.cx}, ${d.cy}) rotate(${d.angle})`}
             onMouseDown={(e) => { if (isInteractive) { e.stopPropagation(); onDecoMouseDown(e, group.id, d, 'move'); } }}
             style={{ cursor: isInteractive ? 'move' : 'default', pointerEvents: isInteractive ? 'auto' : 'none' }}>
            {isInteractive && <path d={pathStr} fill="transparent" stroke="transparent" strokeWidth={sw * 20} />}
            <path d={pathStr} fill={d.type === 'solid_circle' ? "#3f3f46" : "none"} stroke={d.type==='hige'?"#dc2626":d.type==='solid_circle'?"#3f3f46":"#2563eb"} strokeWidth={d.type==='hige'?higeSw:shapeSw} strokeLinecap="round" strokeLinejoin="round" />
            {isActive && isInteractive && (
              <g>
                 <path d={pathStr} fill="none" stroke="#ca8a04" strokeWidth={sw * 3.5} opacity="0.4" pointerEvents="none" />
                 <line x1={d.r || d.hLen || d.scale*2.5} y1={0} x2={(d.r || d.hLen || d.scale*2.5) + scale/60} y2={0} stroke="#10b981" strokeWidth={sw*1.5} strokeDasharray={`${sw*2} ${sw*2}`} pointerEvents="none" />
                 <circle cx={(d.r || d.hLen || d.scale*2.5) + scale/60} cy={0} r={scale/150} fill="#10b981" stroke="#ffffff" strokeWidth={sw*0.5} cursor="crosshair" className="rotate-handle" onMouseDown={(e) => { e.stopPropagation(); onDecoMouseDown(e, group.id, d, 'rotate'); }} />
              </g>
            )}
          </g>
        )
      })}
      
      {!decorations && higePath && <path d={higePath} fill="none" stroke="#dc2626" strokeWidth={higeSw} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
      {!decorations && shapePath && <path d={shapePath} fill="none" stroke="#2563eb" strokeWidth={shapeSw} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
    </g>
  )
};

const Header = ({ fileInfo, coordinateSystem, onReset }) => (
  <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-neutral-200 shadow-sm z-10 shrink-0">
    <div className="flex items-center gap-2 text-indigo-700"><MapIcon className="w-6 h-6" /><h1 className="text-lg font-bold tracking-tight">法務省地図XML 凡例作図ツール</h1></div>
    {fileInfo && (
      <div className="flex items-center gap-4">
        {coordinateSystem && <span className="text-xs font-semibold px-2 py-1 bg-indigo-100 text-indigo-800 rounded">第{coordinateSystem}系</span>}
        <div className="text-sm text-neutral-500 font-medium px-3 py-1 bg-neutral-100 rounded-full">{fileInfo.name} ({fileInfo.size})</div>
        <button onClick={onReset} className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-100 rounded-md transition-colors text-sm font-bold shadow-sm" title="作業をすべて破棄して最初の画面に戻る">
          <Home className="w-4 h-4"/> 最初に戻る
        </button>
      </div>
    )}
  </header>
);

const ToolPanel = ({ mode, setMode, selectedPolygons, polygons, appliedGroups, onApplyStyle, onApplyMegane, onApplyChimoku, onRemoveFeature, onRemoveGroup, onClearSelection, selectedLineStyle, setSelectedLineStyle, selectedDecoPattern, setSelectedDecoPattern }) => (
  <div className="absolute top-20 right-4 bg-white/95 backdrop-blur-md w-[350px] rounded-xl shadow-lg border border-neutral-200 p-4 z-20 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
    
    <div className="flex items-center gap-2 border-b border-neutral-100 pb-2 shrink-0">
      <Paintbrush className="w-5 h-5 text-indigo-600" />
      <h3 className="font-bold text-neutral-800">保安林凡例・作図ツール</h3>
    </div>
    
    <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg shrink-0">
      <button onClick={() => setMode('select')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='select'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><MousePointerClick className="w-3 h-3"/> 選択</button>
      <button onClick={() => setMode('draw')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='draw'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><Scissors className="w-3 h-3"/> 作図</button>
      <button onClick={() => setMode('edit_deco')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='edit_deco'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><RefreshCw className="w-3 h-3"/> 装飾調整</button>
    </div>

    <div className="text-sm text-neutral-600 shrink-0">
      <p className={`flex items-center gap-1.5 p-2.5 rounded border ${mode === 'select' || mode === 'edit_deco' ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-blue-600 bg-blue-50 border-blue-100'}`}>
        {mode === 'select' ? <MousePointerClick className="w-4 h-4 shrink-0"/> : mode === 'edit_deco' ? <RefreshCw className="w-4 h-4 shrink-0"/> : <Edit3 className="w-4 h-4 shrink-0"/>}
        <span>
          {mode === 'select' ? '地図をクリックして筆を選択' : mode === 'edit_deco' ? '記号・文字をドラッグで移動' : '線を引いて分割、始点に戻ると面で抜取'}
          <br/><span className="text-[10px] opacity-80">{mode === 'select' ? '（複数選択できます）' : mode === 'edit_deco' ? '（緑のハンドルで回転・拡縮、Deleteで削除）' : '（同じ点クリック・Enterで完了、右クリックで戻る）'}</span>
        </span>
      </p>
    </div>

    <div className={`flex flex-col gap-3 shrink-0 transition-opacity ${selectedPolygons.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
      
      <div className="flex flex-col gap-2 bg-neutral-50 p-3 rounded-lg border border-neutral-100 shadow-inner">
        <p className="text-[11px] font-bold text-neutral-600">地目の設定 (丸囲み)</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: '保安林', value: '保' }, { label: '山林', value: '山' }, { label: '道路', value: '道' },
            { label: '田', value: '田' }, { label: '畑', value: '畑' }, { label: '宅地', value: '宅' },
            { label: '原野', value: '原' }, { label: '雑種地', value: '雑' }, { label: '墓地', value: '墓' }
          ].map(item => (
            <button key={item.label} onClick={() => onApplyChimoku(item.value)} title={`「${item.value}」を設定`} className="h-7 px-2 flex items-center justify-center text-[11px] font-bold bg-white border border-neutral-300 rounded hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors shadow-sm">{item.label}</button>
          ))}
          <div className="flex items-center gap-1.5 ml-auto">
             <span className="text-[10px] text-neutral-500">その他:</span>
             <input type="text" maxLength={1} className="w-8 h-7 text-xs text-center border border-neutral-300 rounded outline-none focus:border-indigo-500 shadow-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value) { onApplyChimoku(e.target.value); e.target.value = ''; } }} />
             <button 
                onClick={() => onApplyChimoku(null)} 
                className={`h-7 px-2 text-[10px] font-bold bg-white border rounded transition-colors shadow-sm ${selectedPolygons.some(id => polygons.find(p => p.id === id)?.chimoku) ? 'text-neutral-800 border-neutral-400 hover:bg-neutral-200' : 'text-neutral-400 border-neutral-200 hover:bg-neutral-50'}`}
             >クリア</button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 bg-neutral-50 p-3 rounded-lg border border-neutral-100 shadow-inner">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-neutral-600">線の種類</label>
          <select value={selectedLineStyle} onChange={e => setSelectedLineStyle(e.target.value)} className="text-sm border border-neutral-300 rounded-md p-2 bg-white text-neutral-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm transition-shadow">
            {LINE_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 mt-2">
          <label className="text-[11px] font-bold text-neutral-600">装飾パターン</label>
          <select value={selectedDecoPattern} onChange={e => setSelectedDecoPattern(e.target.value)} className="text-sm border border-neutral-300 rounded-md p-2 bg-white text-neutral-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm transition-shadow">
            {DECO_PATTERNS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <button onClick={() => onApplyStyle(selectedLineStyle, selectedDecoPattern)} className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]">
          <Paintbrush className="w-4 h-4" /> 選択中({selectedPolygons.length})に適用
        </button>

        <button onClick={onApplyMegane} className="mt-1 w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-sm">
          〇⌒〇 境界にメガネを配置
        </button>
      </div>
    </div>

    {selectedPolygons.length > 0 && (
      <div className="text-sm text-neutral-600 shrink-0">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center bg-indigo-50 px-2 py-1.5 rounded border border-indigo-100">
             <span className="font-bold text-indigo-700">選択中: {selectedPolygons.length} 筆/要素</span>
             <button onClick={onClearSelection} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline">選択解除</button>
          </div>
          <div className="text-xs text-neutral-500 bg-neutral-50 p-2 rounded border border-neutral-100 max-h-32 overflow-y-auto flex flex-col gap-1">
            {polygons.filter(p => selectedPolygons.includes(p.id)).map(p => (
              <div key={p.id} className="flex justify-between items-center bg-white p-1.5 rounded border border-neutral-200 shadow-sm">
                <span className="font-medium text-neutral-700">{p.chiban}</span>
                {(p.isCustom || p.parentPoly) && (
                  <button onClick={() => onRemoveFeature([p.id])} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title={p.isCustom ? "完全に消去します" : "分割/くり抜きを取り消して元の面に戻します"}><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {appliedGroups.length > 0 && (
      <div className="pt-3 border-t border-neutral-200 flex flex-col gap-2 shrink-0">
        <p className="text-xs font-bold text-neutral-500">適用済みの装飾 ({appliedGroups.length})</p>
        <div className="flex flex-col gap-2">
          {appliedGroups.map(group => {
            let name = "";
            if (group.lineStyleId) {
               if (group.decoPatternId === 'megane') name = `メガネ (境界結合)`;
               else {
                  const lName = LINE_STYLES.find(l => l.id === group.lineStyleId)?.name || '';
                  const dName = DECO_PATTERNS.find(d => d.id === group.decoPatternId)?.name || 'なし';
                  name = `${lName} + ${dName}`;
               }
            } else name = '旧スタイル設定'; 
            
            return (
              <div key={group.id} className="flex flex-col gap-1 text-xs bg-white p-2.5 rounded-lg border border-neutral-200 shadow-sm relative group">
                 <div className="flex items-center gap-2 mb-1 pr-6">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></div>
                    <span className="font-bold text-neutral-700 truncate">{name}</span>
                 </div>
                 <div className="text-neutral-500 leading-relaxed line-clamp-2" title={group.chibanList}>{group.polygonIds.length}筆等: {group.chibanList}</div>
                 <button onClick={() => onRemoveGroup(group.id)} className="absolute top-2 right-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors" title="削除"><Trash2 className="w-4 h-4" /></button>
              </div>
            )
          })}
        </div>
      </div>
    )}
  </div>
);

// ============================================================================
// Main Application
// ============================================================================
export default function App() {
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (window.polygonClipping) return;
    const script = document.createElement('script'); 
    script.src = 'https://unpkg.com/polygon-clipping@0.15.3/dist/polygon-clipping.umd.js';
    document.head.appendChild(script);
  }, []);

  const [data, setData] = useState({ lines: [], polygons: [], boundingBox: null, coordinateSystem: null, fileInfo: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dbMessage, setDbMessage] = useState(null);
  
  const [mode, setMode] = useState('select');
  const [drawingPts, setDrawingPts] = useState([]);
  const [mouseSvgPt, setMouseSvgPt] = useState(null);
  const [snappedPt, setSnappedPt] = useState(null);
  
  const { viewBox, svgRef, isDragging, handlers: panZoomHandlers, fitToBoundingBox, wasDragged } = usePanZoom(mode);
  
  const [showMap, setShowMap] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [mapType, setMapType] = useState('seamlessphoto');
  const mapTiles = useMapTiles(viewBox, showMap, data.coordinateSystem, mapType, containerRef);

  const [selectedPolygons, setSelectedPolygons] = useState([]);
  const [hoveredPolygon, setHoveredPolygon] = useState(null);
  const [decorationScale, setDecorationScale] = useState(1.0);

  const [selectedLineStyle, setSelectedLineStyle] = useState('single');
  const [selectedDecoPattern, setSelectedDecoPattern] = useState('none');

  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const currentPolygons = history[historyIndex]?.polygons || [];
  const currentAppliedGroups = history[historyIndex]?.appliedGroups || [];
  const currentRegionOverrides = history[historyIndex]?.regionOverrides || {};
  const currentChibanOverrides = history[historyIndex]?.chibanOverrides || {};

  const [dragRegionOverride, setDragRegionOverride] = useState(null);
  const [dragChibanOverride, setDragChibanOverride] = useState(null);

  const regionLabels = useMemo(() => {
    const groups = {};
    currentPolygons.forEach(p => {
      if (!p.oaza && !p.koaza) return;
      const key = `${p.oaza || ''}_${p.koaza || ''}`;
      if (!groups[key]) groups[key] = { key, oaza: p.oaza, koaza: p.koaza, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, count: 0 };
      if (p.center) {
         groups[key].minX = Math.min(groups[key].minX, p.center.x);
         groups[key].minY = Math.min(groups[key].minY, p.center.y);
         groups[key].maxX = Math.max(groups[key].maxX, p.center.x);
         groups[key].maxY = Math.max(groups[key].maxY, p.center.y);
         groups[key].count++;
      }
    });
    return Object.values(groups).filter(g => g.count > 0).map(g => {
      const override = (dragRegionOverride && dragRegionOverride.key === g.key) 
        ? dragRegionOverride 
        : (currentRegionOverrides[g.key] || { dx: 0, dy: 0, scale: 1.0, visible: true });

      return {
        ...g,
        baseCx: (g.minX + g.maxX) / 2, baseCy: (g.minY + g.maxY) / 2,
        cx: (g.minX + g.maxX) / 2 + (override.dx || 0), cy: (g.minY + g.maxY) / 2 + (override.dy || 0),
        scale: override.scale || 1.0, visible: override.visible !== false
      };
    });
  }, [currentPolygons, currentRegionOverrides, dragRegionOverride]);

  const [activeDeco, setActiveDeco] = useState(null); 
  const activeDecoRef = useRef(null); 
  const draggingState = useRef(null); 

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const commitChange = useCallback((newPolygons, newAppliedGroups, newRegionOverrides = null, newChibanOverrides = null) => {
    setHistoryIndex(prevIndex => {
      setHistory(prevHistory => {
        const nextHistory = prevHistory.slice(0, prevIndex + 1);
        const prevOverrides = nextHistory[nextHistory.length - 1]?.regionOverrides || {};
        const prevChibanOverrides = nextHistory[nextHistory.length - 1]?.chibanOverrides || {};
        nextHistory.push({ 
          polygons: newPolygons, appliedGroups: newAppliedGroups,
          regionOverrides: newRegionOverrides || prevOverrides, chibanOverrides: newChibanOverrides || prevChibanOverrides
        });
        return nextHistory;
      });
      return prevIndex + 1;
    });
  }, []);

  const loadFile = useCallback((file, isAppend = false) => {
    if (!file.name.toLowerCase().endsWith('.xml')) return setError("XMLファイルを選択してください。");
    setLoading(true); setError(null);
    
    const reader = new FileReader();
    reader.onload = (e) => setTimeout(() => {
      try { 
         const fileId = Math.random().toString(36).substring(2, 8);
         const parsed = parseMojXml(e.target.result, fileId); 
         
         if (isAppend) {
            setData(prev => {
                const newLines = [...prev.lines, ...parsed.lines];
                let newBBox = prev.boundingBox;
                if (parsed.boundingBox) {
                    newBBox = {
                        minX: Math.min(prev.boundingBox?.minX ?? Infinity, parsed.boundingBox.minX),
                        minY: Math.min(prev.boundingBox?.minY ?? Infinity, parsed.boundingBox.minY),
                        maxX: Math.max(prev.boundingBox?.maxX ?? -Infinity, parsed.boundingBox.maxX),
                        maxY: Math.max(prev.boundingBox?.maxY ?? -Infinity, parsed.boundingBox.maxY),
                    };
                }
                return { ...prev, lines: newLines, boundingBox: newBBox };
            });
            commitChange([...currentPolygons, ...parsed.polygons], currentAppliedGroups);
         } else {
            setData({
                lines: parsed.lines, boundingBox: parsed.boundingBox,
                coordinateSystem: parsed.coordinateSystem,
                fileInfo: { name: file.name, size: (file.size / 1024).toFixed(1) + ' KB' }
            });
            setHistory([{ polygons: parsed.polygons, appliedGroups: [], regionOverrides: {}, chibanOverrides: {} }]);
            setHistoryIndex(0);
            if (parsed.coordinateSystem) setTimeout(() => fitToBoundingBox(parsed.boundingBox), 50);
         }
      } 
      catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setLoading(false); }
    }, 50);
    reader.onerror = () => { setError("読み込み失敗"); setLoading(false); };
    reader.readAsText(file);
  }, [currentPolygons, currentAppliedGroups, commitChange, fitToBoundingBox]);

  const startFreehandDraw = (sysNum) => {
    setData({
      lines: [], boundingBox: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
      coordinateSystem: sysNum, fileInfo: { name: `フリーハンド作図 (第${sysNum}系)`, size: '-' }
    });
    setHistory([{ polygons: [], appliedGroups: [], regionOverrides: {}, chibanOverrides: {} }]);
    setHistoryIndex(0); setMode('draw'); setShowMap(true);
  };

  const confirmReset = () => {
    setData({ lines: [], polygons: [], boundingBox: null, coordinateSystem: null, fileInfo: null });
    setHistory([]); setHistoryIndex(-1); setSelectedPolygons([]); setDrawingPts([]);
    setShowResetConfirm(false); setShowMap(false);
  };

  const saveToIndexedDB = async () => {
    try {
      await saveToDB({
        lines: data.lines, polygons: currentPolygons, appliedGroups: currentAppliedGroups,
        regionOverrides: currentRegionOverrides, chibanOverrides: currentChibanOverrides,
        boundingBox: data.boundingBox, coordinateSystem: data.coordinateSystem, fileInfo: data.fileInfo
      });
      setDbMessage('作業状態をローカルに保存しました。'); setTimeout(() => setDbMessage(null), 3000);
    } catch (e) { setError('保存に失敗しました。'); }
  };

  const loadFromIndexedDB = async () => {
    try {
      const dbData = await loadFromDB();
      if (dbData) {
        setData({ lines: dbData.lines || [], boundingBox: dbData.boundingBox || null, coordinateSystem: dbData.coordinateSystem || null, fileInfo: dbData.fileInfo || null });
        setHistory([{ 
          polygons: dbData.polygons || [], appliedGroups: dbData.appliedGroups || [],
          regionOverrides: dbData.regionOverrides || {}, chibanOverrides: dbData.chibanOverrides || {}
        }]);
        setHistoryIndex(0); setSelectedPolygons([]); setDrawingPts([]);
        setDbMessage('保存されたデータを復元しました。'); setTimeout(() => setDbMessage(null), 3000);
        if (dbData.boundingBox) setTimeout(() => fitToBoundingBox(dbData.boundingBox), 50);
      } else setError('保存されたデータがありません。');
    } catch (e) { setError('復元に失敗しました。'); }
  };

  const snapData = useMemo(() => {
    const pts = [], segments = [];
    currentPolygons.forEach(p => {
      parsePathToRings(p.pathData).forEach(ring => {
        for(let i=0; i<ring.length; i++) {
          pts.push(ring[i]);
          if(i < ring.length - 1) segments.push([ring[i], ring[i+1]]);
        }
      });
    });
    return { pts, segments };
  }, [currentPolygons]);

  const getSvgPoint = useCallback((e) => {
    if (!svgRef.current) return null;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
  }, []);
  
  useEffect(() => { 
    setDrawingPts([]); setSnappedPt(null); 
    if (mode !== 'edit_deco') setActiveDeco(null);
  }, [mode]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const currentState = history[historyIndex], targetState = history[historyIndex - 1];
      const changedIds = new Set();
      const currentPolyMap = new Map(currentState.polygons.map(p => [p.id, p.pathData]));
      
      targetState.polygons.forEach(p => { if (!currentPolyMap.has(p.id) || currentPolyMap.get(p.id) !== p.pathData) changedIds.add(p.id); });
      currentState.polygons.forEach(p => { if (!targetState.polygons.some(tp => tp.id === p.id) && p.parentPoly) changedIds.add(p.parentPoly.id); });

      const currentGrpMap = new Map(currentState.appliedGroups.map(g => [g.id, g]));
      const targetGrpMap = new Map(targetState.appliedGroups.map(g => [g.id, g]));
      currentState.appliedGroups.forEach(g => { if (!targetGrpMap.has(g.id)) g.polygonIds.forEach(id => changedIds.add(id)); });
      targetState.appliedGroups.forEach(g => { if (!currentGrpMap.has(g.id)) g.polygonIds.forEach(id => changedIds.add(id)); });

      const validIds = Array.from(changedIds).filter(id => targetState.polygons.some(p => p.id === id));
      setHistoryIndex(historyIndex - 1);
      if (mode === 'draw') { setSelectedPolygons([]); setDrawingPts([]); } 
      else { setSelectedPolygons(validIds); if (mode !== 'edit_deco') setMode('select'); }
    }
  }, [historyIndex, history, mode]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const currentState = history[historyIndex], targetState = history[historyIndex + 1];
      const changedIds = new Set();
      const currentPolyMap = new Map(currentState.polygons.map(p => [p.id, p.pathData]));
      
      targetState.polygons.forEach(p => { if (!currentPolyMap.has(p.id) || currentPolyMap.get(p.id) !== p.pathData) changedIds.add(p.id); });
      const currentGrpMap = new Map(currentState.appliedGroups.map(g => [g.id, g]));
      const targetGrpMap = new Map(targetState.appliedGroups.map(g => [g.id, g]));
      currentState.appliedGroups.forEach(g => { if (!targetGrpMap.has(g.id)) g.polygonIds.forEach(id => changedIds.add(id)); });
      targetState.appliedGroups.forEach(g => { if (!currentGrpMap.has(g.id)) g.polygonIds.forEach(id => changedIds.add(id)); });

      const validIds = Array.from(changedIds).filter(id => targetState.polygons.some(p => p.id === id));
      setHistoryIndex(historyIndex + 1);
      if (mode === 'draw') { setSelectedPolygons([]); setDrawingPts([]); } 
      else { setSelectedPolygons(validIds); if (mode !== 'edit_deco') setMode('select'); }
    }
  }, [historyIndex, history.length, history, mode]);

  const finishDrawing = useCallback((forcePolygon = false) => {
    if (drawingPts.length < 2) { setDrawingPts([]); return; }
    const isPoly = forcePolygon === true || (drawingPts.length >= 3 && drawingPts[0].x === drawingPts[drawingPts.length-1].x && drawingPts[0].y === drawingPts[drawingPts.length-1].y);
    if (isPoly && drawingPts.length < 3) { setDrawingPts([]); return; }
    if (!window.polygonClipping) { setError('ポリゴン演算モジュールを読み込み中です。数秒後にもう一度お試しください。'); return; }

    const actionId = 'action_' + Date.now(); 
    let cutPolyB, cutBBox;

    if (isPoly) {
      const ring = drawingPts.map(p => [p.x, p.y]);
      if (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1]) ring.push([drawingPts[0].x, drawingPts[0].y]);
      cutPolyB = [[ring]]; cutBBox = getBBox(ring);
    } else {
      const ring = makeThickLinePolygon(drawingPts, 1e-5); 
      if (!ring) { setDrawingPts([]); return; }
      cutPolyB = [[ring]]; cutBBox = getBBox(ring);
    }

    let newPolygons = [];
    currentPolygons.forEach(p => {
      const rings = parsePathToRings(p.pathData).map(r => r.map(pt => [pt.x, pt.y]));
      if (rings.length === 0 || rings[0].length === 0) { newPolygons.push(p); return; }
      
      const pBBox = getBBox(rings[0]);
      if (!isBBoxIntersect(pBBox, cutBBox)) { newPolygons.push(p); return; }

      try {
        const intersectResult = window.polygonClipping.intersection([rings], cutPolyB);
        if (intersectResult.length === 0) { newPolygons.push(p); return; }
        const diffResult = window.polygonClipping.difference([rings], cutPolyB);
        
        if (diffResult.length === 0) {
        } else if (!isPoly) {
          if (diffResult.length > 1) {
            diffResult.forEach((polygon, idx) => {
              const newPath = multiPolyToPath([polygon]), newRings = parsePathToRings(newPath);
              newPolygons.push({ ...p, id: `${p.id}_split_${actionId}_${idx}`, pathData: newPath, center: calculatePolygonCenter(newRings), curves: null, isModified: true, parentPoly: p, splitGroupId: actionId });
            });
          } else newPolygons.push(p);
        } else {
          const newPath = multiPolyToPath(diffResult), newRings = parsePathToRings(newPath);
          newPolygons.push({ ...p, pathData: newPath, center: calculatePolygonCenter(newRings), curves: null, isModified: true, parentPoly: p, splitGroupId: actionId });
        }
      } catch (e) { newPolygons.push(p); }
    });

    if (isPoly) {
      const newPath = multiPolyToPath(cutPolyB), newRings = parsePathToRings(newPath);
      newPolygons.push({ id: 'custom_' + actionId, chiban: '作図(面)', pathData: newPath, center: calculatePolygonCenter(newRings), curves: null, isCustom: true, splitGroupId: actionId });
    }
    commitChange(newPolygons, currentAppliedGroups);
    setDrawingPts([]); setSelectedPolygons([]); 
  }, [drawingPts, currentPolygons, currentAppliedGroups, commitChange]);

  const handleRemoveFeatures = useCallback((targetIds) => {
    if (!targetIds || targetIds.length === 0) return;
    let newPolygons = [...currentPolygons];
    const restoredPolys = new Map(), removedGroupIds = new Set(); 
    let isChanged = false;

    targetIds.forEach(id => {
      const p = currentPolygons.find(poly => poly.id === id);
      if (p) {
        if (p.splitGroupId) {
          isChanged = true;
          currentPolygons.filter(poly => poly.splitGroupId === p.splitGroupId).forEach(sib => {
            removedGroupIds.add(sib.id);
            if (sib.parentPoly) restoredPolys.set(sib.parentPoly.id, sib.parentPoly);
          });
          newPolygons = newPolygons.filter(poly => poly.splitGroupId !== p.splitGroupId);
        } else if (p.isCustom) {
          newPolygons = newPolygons.filter(poly => poly.id !== id);
          removedGroupIds.add(id); isChanged = true;
        } else if (p.parentPoly) {
          isChanged = true;
          restoredPolys.set(p.parentPoly.id, p.parentPoly);
          removedGroupIds.add(p.id);
          newPolygons = newPolygons.filter(poly => poly.id !== p.id);
        }
      }
    });

    if (isChanged) {
      restoredPolys.forEach(poly => newPolygons.push(poly));
      const newAppliedGroups = currentAppliedGroups.filter(g => !g.polygonIds.some(id => removedGroupIds.has(id)));
      commitChange(newPolygons, newAppliedGroups);
      setSelectedPolygons(prev => prev.filter(id => !targetIds.includes(id) && !removedGroupIds.has(id)));
    }
  }, [currentPolygons, currentAppliedGroups, commitChange]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); handleRedo(); return; }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (mode === 'edit_deco' && activeDeco) {
          e.preventDefault();
          if (activeDeco.type === 'region_label') {
            const newOverrides = { ...currentRegionOverrides, [activeDeco.id]: { ...(currentRegionOverrides[activeDeco.id] || { dx: 0, dy: 0, scale: 1.0 }), visible: false } };
            commitChange(currentPolygons, currentAppliedGroups, newOverrides); setActiveDeco(null); return;
          } else if (activeDeco.type === 'chiban_label') {
            const newOverrides = { ...currentChibanOverrides, [activeDeco.id]: { ...(currentChibanOverrides[activeDeco.id] || { dx: 0, dy: 0, scale: 1.0 }), visible: false } };
            commitChange(currentPolygons, currentAppliedGroups, currentRegionOverrides, newOverrides); setActiveDeco(null); return;
          } else if (activeDeco.type === 'deco') {
            const newGroups = currentAppliedGroups.map(g => {
              if (g.id === activeDeco.groupId && g.decorations) return { ...g, decorations: g.decorations.filter(d => d.id !== activeDeco.decoId) };
              return g;
            }).filter(g => !g.decorations || g.decorations.length > 0); 
            commitChange(currentPolygons, newGroups); setActiveDeco(null); return;
          }
        } else if (mode === 'select' && selectedPolygons.length > 0) {
          e.preventDefault(); handleRemoveFeatures(selectedPolygons); return;
        }
      }

      if (mode === 'select' || mode === 'edit_deco') return;
      if (e.key === 'Escape') setDrawingPts([]); else if (e.key === 'Enter') finishDrawing(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, finishDrawing, handleUndo, handleRedo, activeDeco, currentAppliedGroups, selectedPolygons, handleRemoveFeatures, currentRegionOverrides, currentChibanOverrides, currentPolygons, commitChange]);

  const handleDecoMouseDown = useCallback((e, groupId, deco, dragMode) => {
    setActiveDeco({ type: 'deco', groupId, decoId: deco.id });
    const pt = getSvgPoint(e); if (!pt) return;
    activeDecoRef.current = e.currentTarget.closest('.deco-group');
    draggingState.current = { type: 'deco', cx: deco.cx, cy: deco.cy, angle: deco.angle, startX: pt.x, startY: pt.y, origCx: deco.cx, origCy: deco.cy, origAngle: deco.angle, mode: dragMode, deco: deco, groupId: groupId };
  }, [getSvgPoint]);

  const handleRegionLabelMouseDown = useCallback((e, regionKey, dragMode, region) => {
    setActiveDeco({ type: 'region_label', id: regionKey });
    const pt = getSvgPoint(e); if (!pt) return;
    draggingState.current = { type: 'region_label', key: regionKey, startX: pt.x, startY: pt.y, origDx: currentRegionOverrides[regionKey]?.dx || 0, origDy: currentRegionOverrides[regionKey]?.dy || 0, origScale: currentRegionOverrides[regionKey]?.scale || 1.0, baseCx: region.baseCx, baseCy: region.baseCy, mode: dragMode };
  }, [getSvgPoint, currentRegionOverrides]);

  const handleChibanLabelMouseDown = useCallback((e, polyId, dragMode, center) => {
    setActiveDeco({ type: 'chiban_label', id: polyId });
    const pt = getSvgPoint(e); if (!pt) return;
    draggingState.current = { type: 'chiban_label', polyId: polyId, startX: pt.x, startY: pt.y, origDx: currentChibanOverrides[polyId]?.dx || 0, origDy: currentChibanOverrides[polyId]?.dy || 0, origScale: currentChibanOverrides[polyId]?.scale || 1.0, baseCx: center.x, baseCy: center.y, mode: dragMode };
  }, [getSvgPoint, currentChibanOverrides]);

  const handleSvgMouseMove = useCallback((e) => {
    panZoomHandlers.onMouseMove(e);
    const pt = getSvgPoint(e); if (!pt) return;

    if (mode === 'edit_deco' && draggingState.current) {
      const state = draggingState.current;
      if (state.type === 'region_label' || state.type === 'chiban_label') {
        let newDx = state.origDx, newDy = state.origDy, newScale = state.origScale;
        if (state.mode === 'move') { newDx += (pt.x - state.startX); newDy += (pt.y - state.startY); } 
        else if (state.mode === 'scale') {
          const origCx = state.baseCx + state.origDx, origCy = state.baseCy + state.origDy;
          const distStart = Math.hypot(state.startX - origCx, state.startY - origCy), distCurrent = Math.hypot(pt.x - origCx, pt.y - origCy);
          if (distStart > 1e-5) newScale = Math.max(0.2, Math.min(state.origScale * (distCurrent / distStart), 5.0));
        }
        if (state.type === 'region_label') setDragRegionOverride({ key: state.key, dx: newDx, dy: newDy, scale: newScale, visible: true });
        else setDragChibanOverride({ polyId: state.polyId, dx: newDx, dy: newDy, scale: newScale, visible: true });
        return;
      } else if (state.type === 'deco' && activeDecoRef.current) {
        if (state.mode === 'move') { state.cx = state.origCx + (pt.x - state.startX); state.cy = state.origCy + (pt.y - state.startY); } 
        else if (state.mode === 'rotate') state.angle = Math.atan2(pt.y - state.origCy, pt.x - state.origCx) * 180 / Math.PI;
        activeDecoRef.current.setAttribute('transform', `translate(${state.cx}, ${state.cy}) rotate(${state.angle})`);
        return;
      }
    }

    if (mode !== 'select' && mode !== 'edit_deco') {
      setMouseSvgPt(pt);
      let closest = null, minDistSq = Math.pow(viewBox.w * 0.015, 2), isVertexSnapped = false;
      
      snapData.pts.forEach(p => { const distSq = (p.x - pt.x)**2 + (p.y - pt.y)**2; if (distSq < minDistSq) { minDistSq = distSq; closest = p; isVertexSnapped = true; }});
      drawingPts.forEach(p => { const distSq = (p.x - pt.x)**2 + (p.y - pt.y)**2; if (distSq < minDistSq) { minDistSq = distSq; closest = p; isVertexSnapped = true; }});
      
      if (!isVertexSnapped) {
        snapData.segments.forEach(seg => { const res = getClosestPointOnSegment(pt, seg[0], seg[1]); if (res.distSq < minDistSq) { minDistSq = res.distSq; closest = { x: res.x, y: res.y }; }});
        for (let i = 0; i < drawingPts.length - 1; i++) { const res = getClosestPointOnSegment(pt, drawingPts[i], drawingPts[i+1]); if (res.distSq < minDistSq) { minDistSq = res.distSq; closest = { x: res.x, y: res.y }; }}
      }
      if (mode === 'draw' && drawingPts.length >= 3) {
        const p = drawingPts[0], distSq = (p.x - pt.x)**2 + (p.y - pt.y)**2;
        if (distSq < Math.pow(viewBox.w * 0.02, 2) && distSq < minDistSq * 1.5) closest = p;
      }
      setSnappedPt(closest);
    }
  }, [mode, panZoomHandlers, getSvgPoint, snapData, drawingPts, viewBox.w]);

  const handleSvgMouseUp = useCallback((e) => {
    panZoomHandlers.onMouseUp(e);
    if (mode === 'edit_deco' && draggingState.current) {
      const state = draggingState.current;
      if (state.type === 'region_label') {
        if (dragRegionOverride) {
          commitChange(currentPolygons, currentAppliedGroups, { ...currentRegionOverrides, [dragRegionOverride.key]: { dx: dragRegionOverride.dx, dy: dragRegionOverride.dy, scale: dragRegionOverride.scale } }, currentChibanOverrides);
          setDragRegionOverride(null);
        }
        draggingState.current = null;
      } else if (state.type === 'chiban_label') {
        if (dragChibanOverride) {
          commitChange(currentPolygons, currentAppliedGroups, currentRegionOverrides, { ...currentChibanOverrides, [dragChibanOverride.polyId]: { dx: dragChibanOverride.dx, dy: dragChibanOverride.dy, scale: dragChibanOverride.scale, visible: true } });
          setDragChibanOverride(null);
        }
        draggingState.current = null;
      } else if (state.type === 'deco') {
        if (state.cx !== state.origCx || state.cy !== state.origCy || state.angle !== state.origAngle) {
          const newGroups = currentAppliedGroups.map(g => {
            if (g.id === state.groupId) return { ...g, decorations: g.decorations.map(d => d.id === state.deco.id ? { ...d, cx: state.cx, cy: state.cy, angle: state.angle } : d) };
            return g;
          });
          commitChange(currentPolygons, newGroups);
        }
        draggingState.current = null; activeDecoRef.current = null;
      }
    }
  }, [mode, currentAppliedGroups, currentPolygons, currentRegionOverrides, dragRegionOverride, currentChibanOverrides, dragChibanOverride, commitChange, panZoomHandlers]);

  const handleSvgClick = useCallback((e) => {
    if (wasDragged(e)) return;
    if (mode === 'select' || mode === 'edit_deco') {
      if (['svg', 'rect', 'image'].includes(e.target.tagName)) {
        if (mode === 'select') setSelectedPolygons([]);
        if (mode === 'edit_deco') setActiveDeco(null); 
      }
      return;
    }
    const pt = snappedPt || getSvgPoint(e); if (!pt) return;
    if (mode === 'draw') {
      if (drawingPts.length >= 3 && pt.x === drawingPts[0].x && pt.y === drawingPts[0].y) { finishDrawing(true); return; }
      if (drawingPts.length >= 2) {
        const lastPt = drawingPts[drawingPts.length - 1];
        if (Math.abs(pt.x - lastPt.x) < 1e-5 && Math.abs(pt.y - lastPt.y) < 1e-5) { finishDrawing(false); return; }
      }
      setDrawingPts(prev => [...prev, pt]);
    }
  }, [mode, wasDragged, snappedPt, getSvgPoint, drawingPts, finishDrawing]);

  const handleSvgContextMenu = useCallback((e) => { e.preventDefault(); e.stopPropagation(); if (mode === 'draw') setDrawingPts(prev => prev.length > 0 ? prev.slice(0, -1) : []); }, [mode]);

  const handlePolygonClick = (e, id) => { e.stopPropagation(); if (wasDragged(e)) return; setSelectedPolygons(prev => prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]); };

  const handleApplyStyle = (lineStyleId, decoPatternId) => {
    if (selectedPolygons.length === 0) return;
    const targetPolygons = currentPolygons.filter(p => selectedPolygons.includes(p.id));
    const exteriorPath = extractExteriorPath(targetPolygons), chibanList = targetPolygons.map(p => p.chiban).join(', ');
    const patternInfo = DECO_PATTERNS.find(p => p.id === decoPatternId), pattern = patternInfo ? patternInfo.pattern : null;
    
    const effScale = decorationScale * 1.2;
    let interval = 5.0 * effScale, size = 0.8 * effScale, higeLength = 1.5 * effScale;

    if (pattern === 'circle') size = 0.7 * effScale;
    else if (pattern === 'triangle') size = 0.9 * effScale;
    else if (pattern === 'circle_triangle') size = 0.8 * effScale;
    else if (pattern === 'cross') size = 0.7 * effScale;
    else if (pattern === 'hige_circle_alt') { interval = 4.0 * effScale; size = 0.7 * effScale; }
    else if (pattern === 'hige_triangle_alt') { interval = 4.0 * effScale; size = 0.9 * effScale; }
    else if (pattern === 'hige_circle_triangle_alt') { interval = 4.0 * effScale; size = 0.8 * effScale; }
    else if (pattern === 'angle_bracket') interval = 7.0 * effScale; 

    let innerPathData = null, innerPathData2 = null, D = 1.2 * effScale, basePathForDeco = exteriorPath;

    if (lineStyleId === 'single_inner' || lineStyleId === 'double_dashed' || lineStyleId === 'double') {
      innerPathData = generateOffsetRings(exteriorPath, D);
      if (innerPathData) basePathForDeco = innerPathData;
    } else if (lineStyleId === 'double_inner') {
      innerPathData = generateOffsetRings(exteriorPath, D); innerPathData2 = generateOffsetRings(exteriorPath, D * 2); 
      if (innerPathData2) basePathForDeco = innerPathData2; else if (innerPathData) basePathForDeco = innerPathData;
    }

    let decorations = null;
    if (pattern) {
      const shapeOffset = 1.0 * effScale, targetPathForDeco = pattern === 'solid_circle' ? exteriorPath : basePathForDeco;
      decorations = generateDecorations(targetPathForDeco, interval, size, higeLength, pattern, shapeOffset, 0);
    }

    const newAppliedGroups = [...currentAppliedGroups, { id: 'grp_' + Date.now(), polygonIds: [...selectedPolygons], chibanList, lineStyleId, decoPatternId, pathData: exteriorPath, innerPathData, innerPathData2, decorations }];
    commitChange(currentPolygons, newAppliedGroups); setSelectedPolygons([]); 
  };

  const handleApplyMegane = useCallback(() => {
    if (selectedPolygons.length < 2) return;
    const targetPolygons = currentPolygons.filter(p => selectedPolygons.includes(p.id));
    const edgeMap = new Map();
    const formatPt = (pt) => `${Math.round(pt.x * 1000)},${Math.round(pt.y * 1000)}`;
    
    targetPolygons.forEach(p => {
      parsePathToRings(p.pathData).forEach(ring => {
        for (let i = 0; i < ring.length - 1; i++) {
          const str1 = formatPt(ring[i]), str2 = formatPt(ring[i + 1]), key = str1 < str2 ? `${str1}_${str2}` : `${str2}_${str1}`;
          if (!edgeMap.has(key)) edgeMap.set(key, { pts: [ring[i], ring[i + 1]], polys: new Set() });
          edgeMap.get(key).polys.add(p.id);
        }
      });
    });

    const pairEdges = new Map();
    edgeMap.forEach((data) => {
      if (data.polys.size >= 2) {
        const polyArr = Array.from(data.polys).sort();
        for (let i = 0; i < polyArr.length - 1; i++) {
          for (let j = i + 1; j < polyArr.length; j++) {
             const pairKey = `${polyArr[i]}_${polyArr[j]}`;
             if (!pairEdges.has(pairKey)) pairEdges.set(pairKey, []);
             pairEdges.get(pairKey).push(data.pts);
          }
        }
      }
    });

    if (pairEdges.size === 0) { setError("選択された図形間に明確な共有境界線が見つかりませんでした。"); return; }

    const newDecorations = []; let meganeCount = 0;
    pairEdges.forEach((segments) => {
       let connectedLines = [], currentSegments = [...segments], eps = 0.005;
       while(currentSegments.length > 0) {
          let line = [...currentSegments.shift()], added = true;
          while(added && currentSegments.length > 0) {
             added = false; let head = line[0], tail = line[line.length - 1];
             for(let i=0; i<currentSegments.length; i++) {
                let seg = currentSegments[i], sHead = seg[0], sTail = seg[seg.length - 1];
                if (Math.abs(tail.x - sHead.x) < eps && Math.abs(tail.y - sHead.y) < eps) { line.push(sTail); currentSegments.splice(i, 1); added = true; break; }
                else if (Math.abs(tail.x - sTail.x) < eps && Math.abs(tail.y - sTail.y) < eps) { line.push(sHead); currentSegments.splice(i, 1); added = true; break; }
                else if (Math.abs(head.x - sTail.x) < eps && Math.abs(head.y - sTail.y) < eps) { line.unshift(sHead); currentSegments.splice(i, 1); added = true; break; }
                else if (Math.abs(head.x - sHead.x) < eps && Math.abs(head.y - sHead.y) < eps) { line.unshift(sTail); currentSegments.splice(i, 1); added = true; break; }
             }
          }
          connectedLines.push(line);
       }

       let bestLine = null, maxTotalLen = -1;
       connectedLines.forEach(line => {
          let len = 0;
          for(let i=0; i<line.length-1; i++) len += Math.hypot(line[i+1].x - line[i].x, line[i+1].y - line[i].y);
          if (len > maxTotalLen) { maxTotalLen = len; bestLine = line; }
       });

       if (bestLine && maxTotalLen > 0) {
          let targetLen = maxTotalLen / 2, currentLen = 0, cx = 0, cy = 0, dx = 0, dy = 0;
          for(let i=0; i<bestLine.length-1; i++) {
             const p1 = bestLine[i], p2 = bestLine[i+1], segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
             if (currentLen + segLen >= targetLen) {
                const ratio = (targetLen - currentLen) / segLen;
                cx = p1.x + (p2.x - p1.x) * ratio; cy = p1.y + (p2.y - p1.y) * ratio;
                dx = p2.x - p1.x; dy = p2.y - p1.y; break;
             }
             currentLen += segLen;
          }
          if (dx === 0 && dy === 0) {
             const p1 = bestLine[0], p2 = bestLine[bestLine.length-1];
             cx = (p1.x + p2.x) / 2; cy = (p1.y + p2.y) / 2; dx = p2.x - p1.x; dy = p2.y - p1.y;
          }
          let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
          if (angleDeg > 90 || angleDeg <= -90) angleDeg += 180;
          newDecorations.push({ id: `dec_${Date.now()}_${meganeCount++}`, type: 'megane', cx, cy, angle: angleDeg, scale: decorationScale * 1.2 });
       }
    });

    if (newDecorations.length === 0) { setError("選択された図形間に明確な共有境界線が見つかりませんでした。"); return; }
    commitChange(currentPolygons, [...currentAppliedGroups, { id: 'grp_' + Date.now(), polygonIds: [...selectedPolygons], chibanList: targetPolygons.map(p => p.chiban).join(', '), lineStyleId: 'none', decoPatternId: 'megane', pathData: "", innerPathData: null, innerPathData2: null, decorations: newDecorations }]);
    setSelectedPolygons([]); 
  }, [selectedPolygons, currentPolygons, currentAppliedGroups, commitChange, decorationScale]);

  const handleApplyChimoku = useCallback((chimoku) => {
    if (selectedPolygons.length === 0) return;
    const newPolygons = currentPolygons.map(p => selectedPolygons.includes(p.id) ? { ...p, chimoku } : p);
    commitChange(newPolygons, currentAppliedGroups); setSelectedPolygons([]);
  }, [selectedPolygons, currentPolygons, currentAppliedGroups, commitChange]);

  const handleRemoveGroup = (id) => commitChange(currentPolygons, currentAppliedGroups.filter(g => g.id !== id));

  const exportToDXF = useCallback(() => {
    let dxf = "  0\nSECTION\n  2\nHEADER\n  9\n$DWGCODEPAGE\n  1\nANSI_932\n  0\nENDSEC\n  0\nSECTION\n  2\nBLOCKS\n";

    dxf += "  0\nBLOCK\n  8\n0\n  2\nDECO_HIGE\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\nDECO_HIGE\n  0\nLINE\n  8\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n 11\n1.0\n 21\n0.0\n 31\n0.0\n  0\nENDBLK\n";
    dxf += "  0\nBLOCK\n  8\n0\n  2\nDECO_TRIANGLE\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\nDECO_TRIANGLE\n  0\nLWPOLYLINE\n  8\n0\n100\nAcDbEntity\n100\nAcDbPolyline\n 90\n3\n 70\n1\n 10\n1.0\n 20\n0.0\n 10\n-0.5\n 20\n0.866\n 10\n-0.5\n 20\n-0.866\n  0\nENDBLK\n";
    dxf += "  0\nBLOCK\n  8\n0\n  2\nDECO_CROSS\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\nDECO_CROSS\n  0\nLINE\n  8\n0\n 10\n-1.0\n 20\n1.0\n 30\n0.0\n 11\n1.0\n 21\n-1.0\n 31\n0.0\n  0\nLINE\n  8\n0\n 10\n-1.0\n 20\n-1.0\n 30\n0.0\n 11\n1.0\n 21\n1.0\n 31\n0.0\n  0\nENDBLK\n";
    dxf += "  0\nBLOCK\n  8\n0\n  2\nDECO_SOLID_CIRCLE\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\nDECO_SOLID_CIRCLE\n";
    for (let k = 0; k < 16; k++) dxf += dxfCreateSolid(0, 0, Math.cos((k/16)*Math.PI*2), Math.sin((k/16)*Math.PI*2), Math.cos(((k+1)/16)*Math.PI*2), Math.sin(((k+1)/16)*Math.PI*2), Math.cos(((k+1)/16)*Math.PI*2), Math.sin(((k+1)/16)*Math.PI*2), "0", 7);
    dxf += "  0\nENDBLK\n";
    dxf += "  0\nBLOCK\n  8\n0\n  2\nDECO_ANGLE_BRACKET\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\nDECO_ANGLE_BRACKET\n  0\nLWPOLYLINE\n  8\n0\n100\nAcDbEntity\n100\nAcDbPolyline\n 90\n3\n 70\n0\n 10\n-0.8\n 20\n-0.4\n 10\n-1.0\n 20\n0.0\n 10\n-0.8\n 20\n0.4\n  0\nLWPOLYLINE\n  8\n0\n100\nAcDbEntity\n100\nAcDbPolyline\n 90\n3\n 70\n0\n 10\n0.8\n 20\n-0.4\n 10\n1.0\n 20\n0.0\n 10\n0.8\n 20\n0.4\n  0\nCIRCLE\n  8\n0\n 62\n7\n 10\n0.0\n 20\n0.0\n 30\n0.0\n 40\n0.1\n  0\nENDBLK\n";
    dxf += "  0\nBLOCK\n  8\n0\n  2\nDECO_MEGANE\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\nDECO_MEGANE\n  0\nCIRCLE\n  8\n0\n 10\n-1.5\n 20\n0.0\n 30\n0.0\n 40\n0.25\n  0\nCIRCLE\n  8\n0\n 10\n1.5\n 20\n0.0\n 30\n0.0\n 40\n0.25\n  0\nARC\n  8\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n 40\n1.25\n 50\n0.0\n 51\n180.0\n  0\nENDBLK\n";

    let polyEntitiesDxf = "", labelsEntitiesDxf = ""; 
    const drawnLabelsDXF = new Set();

    currentPolygons.forEach((poly, idx) => {
      const safeId = poly.id.replace(/[^a-zA-Z0-9_]/g, '_'), blockName = `FUDE_BLOCK_${safeId}_${idx}`;
      dxf += `  0\nBLOCK\n  8\n0\n  2\n${blockName}\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\n${blockName}\n${dxfCreatePath(poly.pathData, "POLYGONS", 4)}  0\nENDBLK\n`;
      polyEntitiesDxf += dxfCreateInsert(blockName, 0, 0, 1.0, 0, "POLYGONS", 4);

      if(poly.center) {
        const labelKey = `${poly.center.x}_${poly.center.y}_${poly.chiban}`;
        if (!drawnLabelsDXF.has(labelKey)) {
          drawnLabelsDXF.add(labelKey);
          const override = currentChibanOverrides[poly.id] || { dx: 0, dy: 0, scale: 1.0, visible: true };
          if (override.visible) {
             const insertCx = poly.center.x + (override.dx || 0), insertCy = poly.center.y + (override.dy || 0);
             const fontSize = (viewBox.w / 150) * decorationScale * 1.2 * (override.scale || 1.0);
             const labelBlockName = `LABEL_BLOCK_${safeId}_${idx}`;
             
             dxf += `  0\nBLOCK\n  8\n0\n  2\n${labelBlockName}\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\n${labelBlockName}\n`;
             if (poly.chimoku) {
                const circleR = fontSize * 0.65, gap = fontSize * 0.2, chibanW = poly.chiban.length * (fontSize * 0.6), totalW = circleR * 2 + gap + chibanW;
                const startX = -totalW / 2, rectX = startX - fontSize * 0.4, rectY = -fontSize * 0.85, rectW = totalW + fontSize * 0.8, rectH = fontSize * 1.7;
                dxf += dxfCreateSolid(rectX, rectY, rectX, rectY + rectH, rectX + rectW, rectY, rectX + rectW, rectY + rectH, "LABELS_BG", 255);
                dxf += `  0\nLWPOLYLINE\n  8\nLABELS\n 62\n7\n100\nAcDbEntity\n100\nAcDbPolyline\n 90\n4\n 70\n1\n 10\n${rectX.toFixed(4)}\n 20\n${(-rectY).toFixed(4)}\n 10\n${(rectX+rectW).toFixed(4)}\n 20\n${(-rectY).toFixed(4)}\n 10\n${(rectX+rectW).toFixed(4)}\n 20\n${(-(rectY+rectH)).toFixed(4)}\n 10\n${rectX.toFixed(4)}\n 20\n${(-(rectY+rectH)).toFixed(4)}\n`;
                dxf += dxfCreateCircle(startX + circleR, 0, circleR, "LABELS", 7) + dxfCreateText(poly.chimoku, startX + circleR, 0, fontSize*0.8, "LABELS", 7) + dxfCreateText(poly.chiban, startX + circleR * 2 + gap + chibanW / 2, 0, fontSize, "LABELS", 7);
             } else {
                const rectW = poly.chiban.length * (fontSize * 0.8) + fontSize, rectH = fontSize * 1.5, rectX = -rectW / 2, rectY = -rectH / 2;
                dxf += dxfCreateSolid(rectX, rectY, rectX, rectY + rectH, rectX + rectW, rectY, rectX + rectW, rectY + rectH, "LABELS_BG", 255) + dxfCreateText(poly.chiban, 0, 0, fontSize, "LABELS", 7);
             }
             dxf += "  0\nENDBLK\n";
             labelsEntitiesDxf += dxfCreateInsert(labelBlockName, insertCx, insertCy, 1.0, 0, "LABELS", 7);
          }
        }
      }
    });

    regionLabels.forEach((region, idx) => {
      if (!region.visible) return;
      const textLines = [region.oaza ? `大字　${region.oaza}` : null, region.koaza ? `字　${region.koaza}` : null].filter(Boolean);
      if (textLines.length === 0) return;
      const fSize = (viewBox.w / 150) * decorationScale * 1.2 * 1.5 * region.scale;
      const rectW = Math.max(...textLines.map(t => t.length)) * fSize + fSize, rectH = textLines.length * fSize * 1.2 + fSize * 0.4;
      const rectX = -rectW / 2, rectY = -rectH / 2, regionBlockName = `REGION_LABEL_BLOCK_${idx}`;
      
      dxf += `  0\nBLOCK\n  8\n0\n  2\n${regionBlockName}\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\n${regionBlockName}\n`;
      dxf += dxfCreateSolid(rectX, rectY, rectX, rectY + rectH, rectX + rectW, rectY, rectX + rectW, rectY + rectH, "REGION_LABELS_BG", 255);
      dxf += `  0\nLWPOLYLINE\n  8\nREGION_LABELS\n 62\n7\n100\nAcDbEntity\n100\nAcDbPolyline\n 90\n4\n 70\n1\n 10\n${rectX.toFixed(4)}\n 20\n${(-rectY).toFixed(4)}\n 10\n${(rectX+rectW).toFixed(4)}\n 20\n${(-rectY).toFixed(4)}\n 10\n${(rectX+rectW).toFixed(4)}\n 20\n${(-(rectY+rectH)).toFixed(4)}\n 10\n${rectX.toFixed(4)}\n 20\n${(-(rectY+rectH)).toFixed(4)}\n`;
      textLines.forEach((line, i) => { dxf += dxfCreateText(line, -(line.length * fSize) / 2, -(textLines.length - 1) * (fSize * 1.2) / 2 + i * fSize * 1.2, fSize, "REGION_LABELS", 7); });
      dxf += "  0\nENDBLK\n";
      labelsEntitiesDxf += dxfCreateInsert(regionBlockName, region.cx, region.cy, 1.0, 0, "REGION_LABELS", 7);
    });

    dxf += "  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n";
    dxf += `  0\nLINE\n  8\nORIGIN_CROSS\n 62\n1\n 10\n-50.0000\n 20\n0.0000\n 30\n0.0\n 11\n50.0000\n 21\n0.0000\n 31\n0.0\n  0\nLINE\n  8\nORIGIN_CROSS\n 62\n1\n 10\n0.0000\n 20\n-50.0000\n 30\n0.0\n 11\n0.0000\n 21\n50.0000\n 31\n0.0\n`;

    data.lines.forEach(line => {
      if (line.length < 2) return;
      dxf += `  0\nLWPOLYLINE\n  8\nBASE_LINES\n 62\n8\n100\nAcDbEntity\n100\nAcDbPolyline\n 90\n${line.length}\n 70\n0\n`;
      line.forEach(pt => { dxf += ` 10\n${pt.x.toFixed(4)}\n 20\n${(-pt.y).toFixed(4)}\n`; });
    });

    dxf += polyEntitiesDxf;

    currentAppliedGroups.forEach(group => {
      let lineColor = 4; 
      const effLineStyle = group.lineStyleId || group.styleId;
      if (['single', 'double', 'single_inner', 'double_inner', 'double_dashed', 'style1'].includes(effLineStyle)) lineColor = 1; 
      else if (['yellow_thick', 'style4'].includes(effLineStyle)) lineColor = 2; 
      else if (['dashdot', 'style3'].includes(effLineStyle)) lineColor = 3; 
      else if (['dashed', 'style2'].includes(effLineStyle)) lineColor = 5; 
      else if (['dotted', 'style5'].includes(effLineStyle)) lineColor = 6; 
      
      if (effLineStyle !== 'none') dxf += dxfCreatePath(group.pathData, "POLYGONS_STYLE", lineColor);
      if (group.innerPathData) dxf += dxfCreatePath(group.innerPathData, "POLYGONS_STYLE_INNER", lineColor);
      if (group.innerPathData2) dxf += dxfCreatePath(group.innerPathData2, "POLYGONS_STYLE_INNER2", lineColor);

      if (group.decorations) {
        group.decorations.forEach(d => {
          if (d.type === 'circle') dxf += dxfCreateCircle(d.cx, d.cy, d.r, "DECORATIONS_SHAPE", 5);
          else if (d.type === 'hige') dxf += dxfCreateInsert("DECO_HIGE", d.cx, d.cy, d.hLen, d.angle, "DECORATIONS_HIGE", 1);
          else if (d.type === 'triangle') dxf += dxfCreateInsert("DECO_TRIANGLE", d.cx, d.cy, d.r, d.angle, "DECORATIONS_SHAPE", 5);
          else if (d.type === 'cross') dxf += dxfCreateInsert("DECO_CROSS", d.cx, d.cy, d.r, d.angle, "DECORATIONS_SHAPE", 5);
          else if (d.type === 'solid_circle') dxf += dxfCreateInsert("DECO_SOLID_CIRCLE", d.cx, d.cy, d.r, d.angle, "DECORATIONS_SHAPE", 7);
          else if (d.type === 'angle_bracket') dxf += dxfCreateInsert("DECO_ANGLE_BRACKET", d.cx, d.cy, d.r, d.angle, "DECORATIONS_SHAPE", 7);
          else if (d.type === 'megane') dxf += dxfCreateInsert("DECO_MEGANE", d.cx, d.cy, d.scale, d.angle, "DECORATIONS_SHAPE", 5);
        });
      } else {
        if (group.higePath) dxf += dxfCreatePath(group.higePath, "DECORATIONS_HIGE", 1); 
        if (group.shapePath) dxf += dxfCreatePath(group.shapePath, "DECORATIONS_SHAPE", 5); 
      }
    });

    dxf += labelsEntitiesDxf + "  0\nENDSEC\n  0\nEOF\n";
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = (data.fileInfo?.name ? data.fileInfo.name.replace(".xml", "") : "export") + "_map.dxf";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [currentPolygons, currentAppliedGroups, data.lines, viewBox.w, data.fileInfo, decorationScale, regionLabels, currentChibanOverrides]);

  const hasData = data.lines.length > 0 || history.length > 0;
  const labelFontSize = (viewBox.w / 150) * decorationScale * 1.2;
  const strokeColor = showMap ? (mapType === 'seamlessphoto' ? "#ffff00" : mapType === 'std' ? "#dc2626" : "#ef4444") : "#2563eb";
  const baseLinePath = useMemo(() => data.lines.map(line => `M ${line[0].x} ${line[0].y} ` + line.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')).join(' '), [data.lines]);

  // --- SVG Render Helpers ---
  const renderRegionLabels = () => {
    if (!showLabels) return null;
    return regionLabels.map((region, idx) => {
      if (!region.visible) return null;
      const textLines = [region.oaza ? `大字　${region.oaza}` : null, region.koaza ? `字　${region.koaza}` : null].filter(Boolean);
      if (textLines.length === 0) return null;

      const fSize = labelFontSize * 1.5 * region.scale, rectW = Math.max(...textLines.map(t => t.length)) * fSize + fSize, rectH = textLines.length * fSize * 1.2 + fSize * 0.4;
      const rectX = region.cx - rectW / 2, rectY = region.cy - rectH / 2, startY = region.cy - (textLines.length - 1) * (fSize * 1.2) / 2;
      const isActive = activeDeco?.type === 'region_label' && activeDeco?.id === region.key, isInteractive = mode === 'edit_deco';

      return (
        <g key={`region-${region.key}`} pointerEvents={isInteractive ? "auto" : "none"} className="select-none region-label-group" style={{ userSelect: 'none', cursor: isInteractive ? 'move' : 'default' }} onMouseDown={(e) => { if (isInteractive) { e.stopPropagation(); handleRegionLabelMouseDown(e, region.key, 'move', region); }}}>
          <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="#ffffff" stroke="#18181b" strokeWidth={labelFontSize * 0.1 * region.scale} />
          {textLines.map((line, i) => <text key={i} x={region.cx} y={startY + i * fSize * 1.2} fontSize={fSize} fill="#18181b" fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{line}</text>)}
          {isActive && isInteractive && (
            <g>
              <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w/200} ${viewBox.w/200}`} pointerEvents="none" />
              <circle cx={rectX + rectW} cy={rectY + rectH} r={viewBox.w / 150} fill="#10b981" stroke="#ffffff" strokeWidth={viewBox.w / 500} cursor="nwse-resize" onMouseDown={(e) => { e.stopPropagation(); handleRegionLabelMouseDown(e, region.key, 'scale', region); }} />
            </g>
          )}
        </g>
      );
    });
  };

  const renderPolygons = () => {
    const drawnLabels = new Set();
    return currentPolygons.map(poly => {
      const isSelected = selectedPolygons.includes(poly.id), isHovered = hoveredPolygon === poly.id, isCustom = poly.isCustom;
      let drawLabel = false;
      if (showLabels && poly.center) {
        const labelKey = `${poly.center.x}_${poly.center.y}_${poly.chiban}`;
        if (!drawnLabels.has(labelKey)) { drawnLabels.add(labelKey); drawLabel = true; }
      }
      const override = (dragChibanOverride && dragChibanOverride.polyId === poly.id) ? dragChibanOverride : (currentChibanOverrides[poly.id] || { dx: 0, dy: 0, scale: 1.0, visible: true });
      if (override.visible === false) drawLabel = false;

      return (
        <g key={`poly-${poly.id}`}>
          {isCustom && <path d={poly.pathData} fill="rgba(16, 185, 129, 0.05)" stroke="#10b981" strokeWidth={viewBox.w / 400} pointerEvents="none" fillRule="evenodd"/>}
          {!isCustom && (!poly.curves || poly.isModified) && <path d={poly.pathData} fill="none" stroke="#10b981" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w/150} ${viewBox.w/150}`} pointerEvents="none" fillRule="evenodd" opacity={0.8} />}
          {(isSelected || isHovered) && <path d={poly.pathData} pointerEvents="none" fill={isSelected ? "rgba(234, 179, 8, 0.4)" : "rgba(234, 179, 8, 0.2)"} stroke={isSelected ? "#ca8a04" : "rgba(234, 179, 8, 0.6)"} strokeWidth={viewBox.w / 500} fillRule="evenodd" />}
          
          {drawLabel && (() => {
             const finalCx = poly.center.x + (override.dx || 0), finalCy = poly.center.y + (override.dy || 0), scaledFontSize = labelFontSize * (override.scale || 1.0);
             const isActive = activeDeco?.type === 'chiban_label' && activeDeco?.id === poly.id, isInteractive = mode === 'edit_deco';

             return (
               <g pointerEvents={isInteractive ? "auto" : "none"} className="select-none chiban-label-group" style={{ userSelect: 'none', cursor: isInteractive ? 'move' : 'default' }} onMouseDown={(e) => { if (isInteractive) { e.stopPropagation(); handleChibanLabelMouseDown(e, poly.id, 'move', poly.center); }}}>
                 {poly.chimoku ? (() => {
                   const charW = scaledFontSize * 0.55, chibanW = poly.chiban.length * charW, circleR = scaledFontSize * 0.65, gap = scaledFontSize * 0.2, totalW = circleR * 2 + gap + chibanW;
                   const startX = finalCx - totalW / 2, circleCx = startX + circleR, textStartX = startX + circleR * 2 + gap;
                   const rectX = startX - scaledFontSize * 0.4, rectY = finalCy - scaledFontSize * 0.85, rectW = totalW + scaledFontSize * 0.8, rectH = scaledFontSize * 1.7;

                   return (
                     <>
                       <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="#ffffff" stroke={isCustom ? "#059669" : "#3f3f46"} strokeWidth={scaledFontSize * 0.08} />
                       <circle cx={circleCx} cy={finalCy} r={circleR} fill="none" stroke={isCustom ? "#059669" : "#3f3f46"} strokeWidth={scaledFontSize * 0.08} />
                       <text x={circleCx} y={finalCy} fontSize={scaledFontSize*0.75} fill={isCustom ? "#059669" : "#3f3f46"} fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{poly.chimoku}</text>
                       <text x={textStartX} y={finalCy} fontSize={scaledFontSize} fill={isCustom ? "#059669" : "#3f3f46"} fontWeight="bold" textAnchor="start" dominantBaseline="central" pointerEvents="none">{poly.chiban}</text>
                       {isActive && isInteractive && (
                         <g>
                           <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w/200} ${viewBox.w/200}`} pointerEvents="none" />
                           <circle cx={rectX + rectW} cy={rectY + rectH} r={viewBox.w / 150} fill="#10b981" stroke="#ffffff" strokeWidth={viewBox.w / 500} cursor="nwse-resize" onMouseDown={(e) => { e.stopPropagation(); handleChibanLabelMouseDown(e, poly.id, 'scale', poly.center); }} />
                         </g>
                       )}
                     </>
                   );
                 })() : (() => {
                   const charW = scaledFontSize * 0.8, textW = poly.chiban.length * charW, rectW = textW + scaledFontSize, rectH = scaledFontSize * 1.5, rectX = finalCx - rectW / 2, rectY = finalCy - rectH / 2;
                   return (
                     <>
                       {isInteractive && <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="transparent" stroke="transparent" />}
                       <text x={finalCx} y={finalCy} fontSize={scaledFontSize} fill="none" stroke={showMap && mapType === 'seamlessphoto' ? "rgba(0, 0, 0, 0.8)" : "#ffffff"} strokeWidth={scaledFontSize * (showMap && mapType === 'seamlessphoto' ? 0.2 : 0.15)} strokeLinejoin="round" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{poly.chiban}</text>
                       <text x={finalCx} y={finalCy} fontSize={scaledFontSize} fill={isCustom ? "#059669" : (showMap && mapType === 'seamlessphoto' ? "#ffffff" : "#3f3f46")} fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{poly.chiban}</text>
                       {isActive && isInteractive && (
                         <g>
                           <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w/200} ${viewBox.w/200}`} pointerEvents="none" />
                           <circle cx={rectX + rectW} cy={rectY + rectH} r={viewBox.w / 150} fill="#10b981" stroke="#ffffff" strokeWidth={viewBox.w / 500} cursor="nwse-resize" onMouseDown={(e) => { e.stopPropagation(); handleChibanLabelMouseDown(e, poly.id, 'scale', poly.center); }} />
                         </g>
                       )}
                     </>
                   );
                 })()}
               </g>
             );
          })()}
          <path d={poly.pathData} fill="transparent" stroke="none" strokeWidth={viewBox.w / 100} className={`${mode === 'select' ? 'cursor-pointer' : 'cursor-crosshair'} outline-none`} fillRule="evenodd" onMouseEnter={() => { if(mode === 'select') setHoveredPolygon(poly.id); }} onMouseLeave={() => setHoveredPolygon(null)} onClick={(e) => { if(mode === 'select') handlePolygonClick(e, poly.id); }} pointerEvents={mode === 'edit_deco' ? 'none' : 'auto'} />
        </g>
      );
    });
  };

  const renderDrawingLayer = () => {
    if (mode !== 'draw' || drawingPts.length === 0 || !mouseSvgPt) return null;
    const isClosing = drawingPts.length >= 3 && snappedPt && snappedPt.x === drawingPts[0].x && snappedPt.y === drawingPts[0].y;
    return (
      <g>
        <path d={`M ${drawingPts[0].x} ${drawingPts[0].y} ` + drawingPts.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${snappedPt ? snappedPt.x : mouseSvgPt.x} ${snappedPt ? snappedPt.y : mouseSvgPt.y} ` + (isClosing ? 'Z' : '')} fill={isClosing ? "rgba(16, 185, 129, 0.2)" : "none"} stroke="#10b981" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w / 200} ${viewBox.w / 200}`} pointerEvents="none" />
        {drawingPts.map((pt, i) => <circle key={`dpt-${i}`} cx={pt.x} cy={pt.y} r={viewBox.w / 400} fill="#10b981" pointerEvents="none" />)}
        {snappedPt && <circle cx={snappedPt.x} cy={snappedPt.y} r={viewBox.w / 200} fill="none" stroke="#ef4444" strokeWidth={viewBox.w/300} pointerEvents="none" />}
      </g>
    );
  };

  return (
    <div className="flex flex-col h-full absolute inset-0 w-full bg-neutral-100 text-neutral-800 font-sans overflow-hidden">
      <Header fileInfo={data.fileInfo} coordinateSystem={data.coordinateSystem} onReset={() => setShowResetConfirm(true)} />

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 p-6 max-w-sm w-full flex flex-col gap-4">
            <h3 className="text-lg font-bold text-neutral-800 flex items-center gap-2"><Home className="w-5 h-5 text-indigo-600"/>作業のリセット</h3>
            <p className="text-sm text-neutral-600">現在の作業データはすべて破棄され、最初の画面に戻ります。よろしいですか？</p>
            <div className="flex gap-2 justify-end mt-2">
              <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-neutral-600 bg-neutral-100 hover:bg-neutral-200">キャンセル</button>
              <button onClick={confirmReset} className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700">リセットして戻る</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 bg-red-100 text-red-800 rounded-lg shadow-lg border border-red-200 animate-in fade-in slide-in-from-top-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="ml-4 text-red-600 font-bold">&times;</button>
        </div>
      )}

      {dbMessage && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 bg-green-100 text-green-800 rounded-lg shadow-lg border border-green-200 animate-in fade-in slide-in-from-top-4">
          <p className="text-sm font-medium">{dbMessage}</p>
          <button onClick={() => setDbMessage(null)} className="ml-4 text-green-600 font-bold">&times;</button>
        </div>
      )}

      <main className="flex-1 relative" ref={containerRef}>
        {!hasData && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if(e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]) }}>
            <label className="flex flex-col items-center justify-center w-full max-w-2xl h-96 border-2 border-indigo-300 border-dashed rounded-2xl cursor-pointer bg-white hover:bg-indigo-50 transition-colors shadow-sm">
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                <UploadCloud className="w-16 h-16 text-indigo-400 mb-4" />
                <p className="mb-2 text-xl font-semibold text-neutral-700">XMLファイルをドラッグ＆ドロップ</p>
                <div className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm hover:bg-indigo-700">ファイルを選択</div>
              </div>
              <input type="file" multiple className="hidden" accept=".xml" onChange={e => { Array.from(e.target.files).forEach(f => loadFile(f)); e.target.value = ''; }} />
            </label>

            <div className="mt-8 flex flex-col items-center">
              <p className="text-sm text-neutral-500 mb-2">または地理院地図からフリーハンドで作図を開始</p>
              <div className="flex items-center gap-2">
                <select id="sys-select" defaultValue="6" className="border border-neutral-300 rounded p-1.5 text-sm outline-none bg-white">
                   {Object.keys(CS_ORIGINS).map(k => <option key={k} value={k}>第{k}系</option>)}
                </select>
                <button onClick={() => startFreehandDraw(parseInt(document.getElementById('sys-select').value))} className="px-4 py-1.5 bg-neutral-600 text-white rounded text-sm font-bold shadow-sm hover:bg-neutral-700 transition-colors">新規作図開始</button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-20">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <p className="text-lg font-medium text-neutral-700">XMLを解析中...</p>
          </div>
        )}
        
        {hasData && (
          <div className="w-full h-full relative overflow-hidden">
            <svg
              ref={svgRef}
              className={`w-full h-full outline-none select-none ${mode === 'select' ? (isDragging ? 'cursor-grabbing' : 'cursor-default') : mode === 'edit_deco' ? 'cursor-default' : (isDragging ? 'cursor-grabbing' : 'cursor-crosshair')} ${showMap ? 'bg-[#f0ede5]' : 'bg-transparent'}`}
              style={{ touchAction: 'none' }}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              onWheel={panZoomHandlers.onWheel} onMouseDown={panZoomHandlers.onMouseDown} onMouseMove={handleSvgMouseMove} onMouseUp={handleSvgMouseUp} onMouseLeave={panZoomHandlers.onMouseLeave} onClick={handleSvgClick} onContextMenu={handleSvgContextMenu}
            >
              {showMap && mapTiles.map(tile => <image key={tile.key} href={tile.url} x={tile.x} y={tile.y} width={tile.w} height={tile.h} preserveAspectRatio="none" opacity={mapType === 'seamlessphoto' ? 1 : 0.8} />)}
              {!showMap && (
                <>
                  <defs><pattern id="grid" width={viewBox.w / 20} height={viewBox.h / 20} patternUnits="userSpaceOnUse"><path d={`M ${viewBox.w / 20} 0 L 0 0 0 ${viewBox.h / 20}`} fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth={viewBox.w / 2000} /></pattern></defs>
                  <rect width="100%" height="100%" x={viewBox.x} y={viewBox.y} fill="url(#grid)" />
                </>
              )}

              <path d={baseLinePath} fill="none" stroke={strokeColor} strokeWidth={viewBox.w / 800} strokeLinecap="round" strokeLinejoin="round" opacity={showMap && mapType === 'seamlessphoto' ? 1.0 : (showMap ? 0.7 : 0.4)} pointerEvents="none" />

              {renderRegionLabels()}
              {renderPolygons()}
              {currentAppliedGroups.map(group => <LegendGroup key={group.id} group={group} scale={viewBox.w} mode={mode} activeDeco={activeDeco} onDecoMouseDown={handleDecoMouseDown} />)}
              {renderDrawingLayer()}
            </svg>

            {mode !== 'select' && mode !== 'edit_deco' && (
              <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-6 py-2.5 rounded-full shadow-lg z-20 font-medium text-sm flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-bottom-4 whitespace-nowrap">
                <Edit3 className="w-4 h-4" />
                <span>作図中 (分割/抜取)</span>
                <span className="opacity-80 ml-2 font-normal text-[10px] sm:text-xs bg-indigo-800/50 px-2 py-0.5 rounded hidden sm:inline">クリック: 追加 / Enter: 完了 / 右クリック: 戻る / ESC: 取消</span>
              </div>
            )}

            <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-auto z-10 w-[92px]">
              <div className="flex bg-white rounded-lg shadow-md border border-neutral-200 overflow-hidden">
                <button onClick={exportToDXF} className="flex-1 py-2.5 flex items-center justify-center hover:bg-neutral-50 text-neutral-700 transition-colors border-r border-neutral-200" title="DXFファイルとして保存"><Download className="w-5 h-5" /></button>
                <label className="flex-1 py-2.5 flex items-center justify-center hover:bg-neutral-50 text-neutral-700 transition-colors cursor-pointer" title="XMLを追加読み込み">
                  <UploadCloud className="w-5 h-5" /><input type="file" multiple className="hidden" accept=".xml" onChange={e => { Array.from(e.target.files).forEach(f => loadFile(f, true)); e.target.value = ''; }} />
                </label>
              </div>

              <div className="flex bg-white rounded-lg shadow-md border border-neutral-200 overflow-hidden">
                <button onClick={saveToIndexedDB} className="flex-1 py-2.5 flex items-center justify-center hover:bg-neutral-50 text-neutral-700 transition-colors border-r border-neutral-200" title="ブラウザ内に作業状態を保存"><Save className="w-5 h-5" /></button>
                <button onClick={loadFromIndexedDB} className="flex-1 py-2.5 flex items-center justify-center hover:bg-neutral-50 text-neutral-700 transition-colors" title="保存した状態を復元"><CloudDownload className="w-5 h-5" /></button>
              </div>

              <div className="flex bg-white rounded-lg shadow-md border border-neutral-200 overflow-hidden">
                <button onClick={handleUndo} disabled={historyIndex <= 0} className={`flex-1 py-2.5 flex items-center justify-center ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-neutral-50'} text-neutral-700 transition-colors border-r border-neutral-200`} title="元に戻す (Ctrl+Z)"><Undo className="w-5 h-5" /></button>
                <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className={`flex-1 py-2.5 flex items-center justify-center ${historyIndex >= history.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-neutral-50'} text-neutral-700 transition-colors`} title="やり直す (Ctrl+Y)"><Redo className="w-5 h-5" /></button>
              </div>

              <div 
                className="bg-white/90 backdrop-blur-md p-2 rounded-lg shadow-md border border-neutral-200 flex flex-col items-center gap-2"
                onWheel={(e) => { e.stopPropagation(); setDecorationScale(prev => Math.max(0.2, Math.min(2.5, Math.round((prev + (e.deltaY > 0 ? -0.1 : 0.1)) * 10) / 10))); }}
              >
                 <p className="text-[10px] font-bold text-neutral-500 text-center leading-tight">サイズ<br/>調整</p>
                 <input type="range" min="0.2" max="2.5" step="0.1" value={decorationScale} onChange={(e) => setDecorationScale(parseFloat(e.target.value))} style={{ WebkitAppearance: 'slider-vertical', width: '20px', height: '100px' }} orient="vertical" className="bg-neutral-200 rounded-lg cursor-pointer accent-indigo-600" title="ホイールでサイズを調整できます" />
                 <span className="text-[10px] text-neutral-600 font-bold">{Math.round(decorationScale * 100)}%</span>
              </div>
            </div>

            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <button onClick={() => setShowLabels(!showLabels)} className={`p-2.5 rounded-lg shadow-md transition-colors border border-neutral-200 ${showLabels ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-neutral-700'}`} title="地番の表示切替"><Hash className="w-5 h-5" /></button>
              {showMap && (
                <div className="bg-white px-3 py-2 rounded-lg shadow-md border border-neutral-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-neutral-500" />
                  <select value={mapType} onChange={e => setMapType(e.target.value)} className="bg-transparent text-sm font-medium text-neutral-700 outline-none cursor-pointer">
                    <option value="pale">淡色地図（見やすい）</option>
                    <option value="std">標準地図</option>
                    <option value="seamlessphoto">航空写真</option>
                  </select>
                </div>
              )}
              <button onClick={() => setShowMap(!showMap)} disabled={!data.coordinateSystem} className={`p-2.5 rounded-lg shadow-md transition-colors border border-neutral-200 ${showMap ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-neutral-700'} ${!data.coordinateSystem && 'opacity-50'}`} title="地理院地図"><Globe className="w-5 h-5" /></button>
              <button onClick={() => fitToBoundingBox(data.boundingBox)} className="p-2.5 rounded-lg shadow-md hover:bg-neutral-50 text-neutral-700 transition-colors border border-neutral-200 bg-white" title="全体を表示"><Maximize className="w-5 h-5" /></button>
            </div>

            <ToolPanel 
              mode={mode} setMode={setMode} selectedPolygons={selectedPolygons} polygons={currentPolygons} appliedGroups={currentAppliedGroups} 
              onApplyStyle={handleApplyStyle} onApplyMegane={handleApplyMegane} onApplyChimoku={handleApplyChimoku}
              onRemoveFeature={handleRemoveFeatures} onRemoveGroup={handleRemoveGroup} onClearSelection={() => setSelectedPolygons([])} 
              selectedLineStyle={selectedLineStyle} setSelectedLineStyle={setSelectedLineStyle} selectedDecoPattern={selectedDecoPattern} setSelectedDecoPattern={setSelectedDecoPattern}
            />

            <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1 pointer-events-none z-10">
              <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm border border-neutral-200 text-xs text-neutral-500 flex items-center gap-2"><Move className="w-4 h-4" /><span>ドラッグ: 移動 / ホイール: 拡縮</span></div>
              {showMap && <div className="bg-white/80 backdrop-blur px-2 py-1 rounded shadow-sm text-[10px] text-neutral-600 pointer-events-auto"><a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer" className="hover:underline">出典：国土地理院</a></div>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}