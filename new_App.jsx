
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { UploadCloud, Maximize, AlertCircle, Loader2, Move, Globe, Layers, Download, Save, CloudDownload, Hash, Edit3, Undo, Redo, Home } from 'lucide-react';

import { DB_NAME, DB_VERSION, STORE_NAME, CS_ORIGINS, LINE_STYLES, DECO_PATTERNS } from './constants';
import { openDB, saveToDB, loadFromDB } from './utils/db';
import { lon2tile, lat2tile, tile2lon, tile2lat, parsePathToRings, multiPolyToPath, getBBox, isBBoxIntersect, getClosestPointOnSegment, isPointInside, getPointInsidePolygon, calculatePolygonCenter, makeThickLinePolygon, signedArea, intersectLinesT, getSegmentIntersection, removeSelfIntersections } from './utils/geometry';
import { dxfCreateText, dxfCreateCircle, dxfCreateInsert, dxfCreateSolid, dxfCreatePath } from './utils/dxf';
import { processRingData, offsetRingByEdges, samplePath, generateOffsetRings, generateDecorations, buildConnectedPath, extractExteriorPath, parseMojXml } from './utils/dataProcessing';
import { usePanZoom } from './hooks/usePanZoom';
import { useMapTiles } from './hooks/useMapTiles';
import { LegendGroup } from './components/LegendGroup';
import { Header } from './components/Header';
import { ToolPanel } from './components/ToolPanel';

import { useMapHistory } from './hooks/useMapHistory';
import { useMapData } from './hooks/useMapData';
import { useMapTools } from './hooks/useMapTools';
import { useExportDXF } from './hooks/useExportDXF';
import { StartScreen } from './components/StartScreen';


export default function App() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (window.polygonClipping) return;
    const script = document.createElement('script'); 
    script.src = 'https://unpkg.com/polygon-clipping@0.15.3/dist/polygon-clipping.umd.js';
    document.head.appendChild(script);
  }, []);

  const [mode, setMode] = useState('select');
  const [drawingPts, setDrawingPts] = useState([]);
  const [mouseSvgPt, setMouseSvgPt] = useState(null);
  const [snappedPt, setSnappedPt] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [mapType, setMapType] = useState('seamlessphoto');
  const [selectedPolygons, setSelectedPolygons] = useState([]);
  const [hoveredPolygon, setHoveredPolygon] = useState(null);
  const [decorationScale, setDecorationScale] = useState(1.0);
  const [selectedLineStyle, setSelectedLineStyle] = useState('single');
  const [selectedDecoPattern, setSelectedDecoPattern] = useState('none');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const [dragRegionOverride, setDragRegionOverride] = useState(null);
  const [dragChibanOverride, setDragChibanOverride] = useState(null);

  const [activeDeco, setActiveDeco] = useState(null); 
  const activeDecoRef = useRef(null); 
  const draggingState = useRef(null); 

  const { viewBox, svgRef, isDragging, handlers: panZoomHandlers, fitToBoundingBox, wasDragged } = usePanZoom(mode);

  const mapTiles = useMapTiles(viewBox, showMap, null, mapType, containerRef); // wait, coordinate system needs to be from data

  const {
    history, historyIndex, currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides,
    commitChange, handleUndo, handleRedo, setHistory, setHistoryIndex
  } = useMapHistory({ mode, setMode, setSelectedPolygons, setDrawingPts });

  const {
    data, loading, error, hasSavedData, setError, loadFile, startFreehandDraw, confirmReset, handleLoadSavedData
  } = useMapData({
    currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides, historyLength: history.length,
    commitChange, fitToBoundingBox, setHistory, setHistoryIndex, setSelectedPolygons, setDrawingPts, setShowMap, setMode, setShowResetConfirm
  });

  const {
    handleApplyStyle, handleApplyMegane, handleApplyChimoku, handleRemoveGroup
  } = useMapTools({
    currentPolygons, currentAppliedGroups, selectedPolygons, setSelectedPolygons, commitChange, decorationScale, setError
  });

  // Rebind mapTiles coordinateSystem
  const currentCoordinateSystem = data.coordinateSystem;
  // This needs to happen dynamically since hooks can't be called conditionally, we rely on the implementation in useMapTiles which accepts null.
  
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

  const { exportToDXF } = useExportDXF({
    currentPolygons, currentAppliedGroups, lines: data.lines, viewBox, fileInfo: data.fileInfo, decorationScale, regionLabels: regionLabels, currentChibanOverrides
  });

  const getSvgPoint = useCallback((e) => {
    if (!svgRef.current) return null;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
  }, []);
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
  const finishDrawing = useCallback((forcePolygon = false) => {
    if (drawingPts.length < 2) { setDrawingPts([]); return; }
    const isPoly = forcePolygon === true || (drawingPts.length >= 3 && drawingPts[0].x === drawingPts[drawingPts.length-1].x && drawingPts[0].y === drawingPts[drawingPts.length-1].y);
    if (isPoly && drawingPts.length < 3) { setDrawingPts([]); return; }
    if (!window.polygonClipping) { setError('繝昴Μ繧ｴ繝ｳ貍皮ｮ励Δ繧ｸ繝･繝ｼ繝ｫ繧定ｪｭ縺ｿ霎ｼ縺ｿ荳ｭ縺ｧ縺吶よ焚遘貞ｾ後↓繧ゅ≧荳蠎ｦ縺願ｩｦ縺励￥縺縺輔＞縲'); return; }

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

  useEffect(() => { 
    setDrawingPts([]); setSnappedPt(null); 
    if (mode !== 'edit_deco') setActiveDeco(null);
  }, [mode]);

  useEffect(() => {
    if (error && error.includes("境界線が見つかりませんでした")) {
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPolygons, mode, drawingPts, historyIndex]);

  const hasData = data.lines.length > 0 || history.length > 0;
  const labelFontSize = (viewBox.w / 150) * decorationScale * 1.2;
  const strokeColor = showMap ? (mapType === 'seamlessphoto' ? "#ffff00" : mapType === 'std' ? "#dc2626" : "#ef4444") : "#2563eb";
  const baseLinePath = useMemo(() => data.lines.map(line => `M ${line[0].x} ${line[0].y} ` + line.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')).join(' '), [data.lines]);

  // --- SVG Render Helpers ---
  const renderRegionLabels = () => {
    if (!showLabels) return null;
    return regionLabels.map((region, idx) => {
          const textLines = [region.oaza ? `大字　${region.oaza}` : null, region.koaza ? `字　${region.koaza}` : null].filter(Boolean);
      if (textLines.length === 0) return null;

      const fSize = labelFontSize * 1.5 * region.scale, rectW = Math.max(...textLines.map(t => t.length)) * fSize + fSize, rectH = textLines.length * fSize * 1.2 + fSize * 0.4;
      const rectX = region.cx - rectW / 2, rectY = region.cy - rectH / 2, startY = region.cy - (textLines.length - 1) * (fSize * 1.2) / 2;
      const isActive = activeDeco?.type === 'region_label' && activeDeco?.id === region.key, isInteractive = mode === 'edit_deco';


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

      <main className="flex-1 relative min-h-0" ref={containerRef}>
        {!hasData && !loading && (
          <StartScreen 
            loadFile={loadFile} 
            startFreehandDraw={startFreehandDraw} 
            hasSavedData={hasSavedData} 
            handleLoadSavedData={handleLoadSavedData} 
          />
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
                <button onClick={handleUndo} disabled={historyIndex <= 0} className={`flex-1 py-2.5 flex items-center justify-center ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-neutral-50'} text-neutral-700 transition-colors border-r border-neutral-200`} title="元に戻す (Ctrl+Z)"><Undo className="w-5 h-5" /></button>
                <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className={`flex-1 py-2.5 flex items-center justify-center ${historyIndex >= history.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-neutral-50'} text-neutral-700 transition-colors`} title="やり直す (Ctrl+Y)"><Redo className="w-5 h-5" /></button>
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
              selectedLineStyle={selectedLineStyle} setSelectedLineStyle={setSelectedLineStyle} selectedDecoPattern={selectedDecoPattern} setSelectedDecoPattern={setSelectedDecoPattern} decorationScale={decorationScale} setDecorationScale={setDecorationScale}
             decorationScale={decorationScale} setDecorationScale={setDecorationScale} />

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

}
