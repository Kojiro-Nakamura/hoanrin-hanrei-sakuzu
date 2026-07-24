import { useCallback, useMemo } from 'react';
import { extractExteriorPath, generateOffsetRings, generateDecorations } from '../utils/dataProcessing';
import { parsePathToRings } from '../utils/geometry';
import { DECO_PATTERNS } from '../constants';

export function useMapTools({
  currentPolygons,
  currentAppliedGroups,
  currentRegionOverrides,
  selectedPolygons,
  setSelectedPolygons,
  commitChange,
  decorationScale,
  setError
}) {

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

  const regionLabels = useMemo(() => {
    const regions = new Map();
    currentPolygons.forEach(p => {
       if (p.isCustom) return;
       const key = `${p.oaza || ''}_${p.koaza || ''}`;
       if (key === '_') return;
       if (!regions.has(key)) regions.set(key, { oaza: p.oaza, koaza: p.koaza, polys: [] });
       regions.get(key).polys.push(p);
    });
    
    const labels = [];
    regions.forEach((data, key) => {
       const override = currentRegionOverrides[key] || { dx: 0, dy: 0, scale: 1.0, visible: true };
       if (override.visible === false) return;
       let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
       data.polys.forEach(p => {
          parsePathToRings(p.pathData).forEach(ring => {
             ring.forEach(pt => { minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y); });
          });
       });
       labels.push({
          key, oaza: data.oaza, koaza: data.koaza,
          baseCx: (minX + maxX) / 2, baseCy: (minY + maxY) / 2,
          cx: (minX + maxX) / 2 + (override.dx || 0), cy: (minY + maxY) / 2 + (override.dy || 0),
          scale: override.scale || 1.0, visible: override.visible !== false
       });
    });
    return labels;
  }, [currentPolygons, currentRegionOverrides]);

  const handleRemoveFeatures = useCallback((idsToRemove) => {
    const toRemove = idsToRemove && idsToRemove.length ? idsToRemove : selectedPolygons;
    if (toRemove.length === 0) return;
    
    let newPolygons = currentPolygons.filter(p => !toRemove.includes(p.id));
    const restoredParents = [];
    toRemove.forEach(id => {
       const p = currentPolygons.find(x => x.id === id);
       if (p && p.parentPoly && !restoredParents.find(rp => rp.id === p.parentPoly.id)) {
          restoredParents.push(p.parentPoly);
       }
    });

    if (restoredParents.length > 0) {
       const parentIds = restoredParents.map(rp => rp.id);
       newPolygons = newPolygons.filter(p => !(p.parentPoly && parentIds.includes(p.parentPoly.id)));
       newPolygons.push(...restoredParents);
    }

    const newGroups = currentAppliedGroups.map(g => ({
       ...g,
       polygonIds: g.polygonIds.filter(id => !toRemove.includes(id))
    })).filter(g => g.polygonIds.length > 0);

    commitChange(newPolygons, newGroups);
    setSelectedPolygons([]);
  }, [selectedPolygons, currentPolygons, currentAppliedGroups, commitChange, setSelectedPolygons]);

  const handleRemoveGroup = (id) => commitChange(currentPolygons, currentAppliedGroups.filter(g => g.id !== id));

  return {
    handleApplyStyle,
    handleApplyMegane,
    handleApplyChimoku,
    handleRemoveFeatures,
    handleRemoveGroup,
    regionLabels
  };
}
