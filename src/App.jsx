import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { UploadCloud, Maximize, AlertCircle, Loader2, Move, Globe, Layers, Download, Save, CloudDownload, Hash, Edit3, Undo, Redo, Home } from 'lucide-react';

import { DB_NAME, DB_VERSION, STORE_NAME, CS_ORIGINS, LINE_STYLES, DECO_PATTERNS } from './constants';
import { openDB, saveToDB, loadFromDB } from './utils/db';
import { lon2tile, lat2tile, tile2lon, tile2lat, parsePathToRings, multiPolyToPath, getBBox, isBBoxIntersect, getClosestPointOnSegment, isPointInside, isPointInPath, getPointInsidePolygon, calculatePolygonCenter, makeThickLinePolygon, signedArea, intersectLinesT, getSegmentIntersection, removeSelfIntersections, splitPolygons, punchHoleInPolygons, getExteriorPathString } from './utils/geometry';
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
  const lastDrawRef = useRef(0);

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
  const [screenMagnification, setScreenMagnification] = useState(1.0);
  const [selectedLineStyle, setSelectedLineStyle] = useState('single');
  const [selectedDecoPattern, setSelectedDecoPattern] = useState('none');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const [dragRegionOverride, setDragRegionOverride] = useState(null);
  const [dragChibanOverride, setDragChibanOverride] = useState(null);
  const [dragDecoOverride, setDragDecoOverride] = useState(null);

  const [activeDeco, setActiveDeco] = useState(null); 
  const [selectedDecoId, setSelectedDecoId] = useState(null); 

  const { viewBox, svgRef, isDragging, handlers: panZoomHandlers, fitToBoundingBox, wasDragged } = usePanZoom(mode);

  const {
    history, historyIndex, currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides,
    commitChange, handleUndo, handleRedo, setHistory, setHistoryIndex
  } = useMapHistory({ mode, setMode, setSelectedPolygons, setDrawingPts });

  const {
    data, loading, error, dbMessage, setDbMessage, hasSavedData, setError, loadFile, startFreehandDraw, confirmReset, handleLoadSavedData
  } = useMapData({
    currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides, historyLength: history.length,
    commitChange, fitToBoundingBox, setHistory, setHistoryIndex, setSelectedPolygons, setDrawingPts, setShowMap, setMode, setShowResetConfirm
  });

  const mapTiles = useMapTiles(viewBox, showMap, data?.coordinateSystem || null, mapType, containerRef);

  const {
    handleApplyStyle, handleApplyMegane, handleApplyChimoku, handleRemoveFeatures, handleRemoveGroup, handleUpdateCustomPolygon, regionLabels
  } = useMapTools({
    currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides,
    selectedPolygons, setSelectedPolygons, selectedLineStyle, selectedDecoPattern, decorationScale, mode,
    commitChange, setError
  });

  const { exportToDXF } = useExportDXF({
    currentPolygons, currentAppliedGroups, lines: data.lines, viewBox, fileInfo: data.fileInfo, decorationScale, regionLabels, currentChibanOverrides
  });

  const exportToJSON = useCallback(() => {
    const projectData = {
      lines: data.lines, polygons: currentPolygons, appliedGroups: currentAppliedGroups,
      regionOverrides: currentRegionOverrides, chibanOverrides: currentChibanOverrides,
      boundingBox: data.boundingBox, coordinateSystem: data.coordinateSystem, fileInfo: data.fileInfo
    };
    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sakuzu_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides]);

  const getSvgPoint = useCallback((e) => {
    if (!svgRef.current) return null;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
  }, []);

  const snapData = useMemo(() => {
    const pts = [], segments = [];
    currentPolygons.forEach(p => {
      if (p.isCustom) return;
      parsePathToRings(p.pathData).forEach(ring => {
        ring.forEach(pt => pts.push({ x: pt.x, y: pt.y }));
        for(let i=0; i<ring.length-1; i++) segments.push([{ x: ring[i].x, y: ring[i].y }, { x: ring[i+1].x, y: ring[i+1].y }]);
        if (ring.length > 0) segments.push([{ x: ring[ring.length-1].x, y: ring[ring.length-1].y }, { x: ring[0].x, y: ring[0].y }]);
      });
    });
    if (data?.lines) {
      data.lines.forEach(line => {
        line.forEach(pt => pts.push({ x: pt.x, y: pt.y }));
        for(let i=0; i<line.length-1; i++) segments.push([{ x: line[i].x, y: line[i].y }, { x: line[i+1].x, y: line[i+1].y }]);
      });
    }
    return { pts, segments };
  }, [currentPolygons, data?.lines]);

  const finishDrawing = useCallback((forceClose = true) => {
    // If closing, need 3 points. If open line, need 2 points.
    if (forceClose && drawingPts.length < 3) { setDrawingPts([]); return; }
    if (!forceClose && drawingPts.length < 2) { setDrawingPts([]); return; }

    let newPath = "";
    let center = { x: 0, y: 0 };
    if (forceClose) {
      const isClockwise = signedArea(drawingPts) > 0;
      const ring = isClockwise ? drawingPts : [...drawingPts].reverse();
      newPath = "M " + ring.map(p => `${p.x} ${p.y}`).join(" L ") + " Z";
      center = calculatePolygonCenter([ring]);
    } else {
      newPath = "M " + drawingPts.map(p => `${p.x} ${p.y}`).join(" L ");
      const mid = Math.floor(drawingPts.length / 2);
      center = { x: drawingPts[mid].x, y: drawingPts[mid].y };
    }

    const actionId = Date.now().toString();
    const newPoly = {
      id: 'custom_' + actionId, chiban: forceClose ? 'XXX-X' : '', pathData: newPath, center, curves: null, isCustom: true, isClosed: forceClose, splitGroupId: actionId
    };
    
    let nextPolygons = [...currentPolygons];
    const newSelectedIds = [];
    
    let nextAppliedGroups = [...currentAppliedGroups];

    if (!forceClose) {
      // split polygons (both custom and XML)
      const targetPolys = nextPolygons.filter(p => p.isClosed !== false);
      const thickness = (viewBox && viewBox.w) ? viewBox.w / 100000 : 0.0001;
      const splitResults = splitPolygons(targetPolys, drawingPts, thickness);
      
      if (splitResults.length > 0) {
        splitResults.forEach(res => {
          // Remove original
          nextPolygons = nextPolygons.filter(p => p.id !== res.originalId);
          // Add split parts
          nextPolygons.push(...res.newPolys);
          newSelectedIds.push(...res.newPolys.map(p => p.id));
          
          let cx = 0, cy = 0, dx = 0, dy = 0, totalLen = 0;
          for(let i=0; i<drawingPts.length-1; i++) totalLen += Math.hypot(drawingPts[i+1].x - drawingPts[i].x, drawingPts[i+1].y - drawingPts[i].y);
          let targetLen = totalLen / 2, currentLen = 0;
          for(let i=0; i<drawingPts.length-1; i++) {
             const p1 = drawingPts[i], p2 = drawingPts[i+1], segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
             if (currentLen + segLen >= targetLen) {
                const ratio = segLen > 0 ? (targetLen - currentLen) / segLen : 0;
                cx = p1.x + (p2.x - p1.x) * ratio; cy = p1.y + (p2.y - p1.y) * ratio;
                dx = p2.x - p1.x; dy = p2.y - p1.y; break;
             }
             currentLen += segLen;
          }
          if (dx === 0 && dy === 0 && drawingPts.length > 0) { cx = drawingPts[0].x; cy = drawingPts[0].y; dx = 1; dy = 0; }
          let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
          if (angleDeg > 90 || angleDeg <= -90) angleDeg += 180;
          
          nextAppliedGroups.push({
            id: 'grp_' + Date.now() + Math.random().toString(36).substr(2, 5),
            polygonIds: res.newPolys.map(p => p.id),
            chibanList: res.newPolys.map(p => p.chiban).filter(Boolean).join(', '),
            lineStyleId: 'none', decoPatternId: 'megane', pathData: "", innerPathData: null, innerPathData2: null,
            decorations: [{ id: `dec_${Date.now()}_0`, type: 'megane', cx, cy, angle: angleDeg, scale: decorationScale * 1.2 }]
          });
        });
        // Since we split successfully, don't add the line itself
        commitChange(nextPolygons, nextAppliedGroups);
        lastDrawRef.current = Date.now();
        setDrawingPts([]);
        setSnappedPt(null);
        return;
      }
    } else {
      // Punch hole in underlying polygons
      const targetPolys = nextPolygons.filter(p => p.isClosed !== false);
      const punchResults = punchHoleInPolygons(targetPolys, drawingPts);
      if (punchResults.length > 0) {
        newPoly.chiban = punchResults[0].newPoly.chiban;
        newPoly.chimoku = punchResults[0].newPoly.chimoku;
        punchResults.forEach(res => {
          // Remove original
          nextPolygons = nextPolygons.filter(p => p.id !== res.originalId);
          // Add punched polygon
          nextPolygons.push(res.newPoly);

          const p1 = drawingPts[0], p2 = drawingPts[1];
          const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
          const dx = p2.x - p1.x, dy = p2.y - p1.y;
          let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
          if (angleDeg > 90 || angleDeg <= -90) angleDeg += 180;

          nextAppliedGroups.push({
            id: 'grp_' + Date.now() + Math.random().toString(36).substr(2, 5),
            polygonIds: [res.newPoly.id, newPoly.id],
            chibanList: [res.newPoly.chiban, newPoly.chiban].filter((v, i, a) => v && a.indexOf(v) === i).join(', '),
            lineStyleId: 'none', decoPatternId: 'megane', pathData: "", innerPathData: null, innerPathData2: null,
            decorations: [{ id: `dec_${Date.now()}_0`, type: 'megane', cx, cy, angle: angleDeg, scale: decorationScale * 1.2 }]
          });
        });
      }
    }

    // Default: just add the newly drawn poly/line
    nextPolygons.push(newPoly);
    commitChange(nextPolygons, nextAppliedGroups);
    lastDrawRef.current = Date.now();
    setDrawingPts([]);
    setSnappedPt(null);
  }, [drawingPts, currentPolygons, currentAppliedGroups, commitChange, setMode, setSelectedPolygons, viewBox, decorationScale]);

  const handleDecoMouseDown = useCallback((e, groupId, deco, dragMode) => {
    const pt = getSvgPoint(e);
    if (!pt) return;
    setActiveDeco({ 
      type: 'deco', groupId, decoId: deco.id, dragMode, 
      startCx: deco.cx, startCy: deco.cy, startAngle: deco.angle || 0,
      startMouseX: pt.x, startMouseY: pt.y 
    });
    setSelectedDecoId(deco.id);
  }, [getSvgPoint]);

  const handleRegionLabelMouseDown = useCallback((e, regionKey, dragMode, center) => {
    setActiveDeco({ type: 'region_label', id: regionKey, dragMode, startCx: center.x, startCy: center.y });
  }, []);

  const handleChibanLabelMouseDown = useCallback((e, polyId, dragMode, center) => {
    setActiveDeco({ type: 'chiban_label', id: polyId, dragMode, startCx: center.x, startCy: center.y });
  }, []);

  const handleSvgMouseMove = useCallback((e) => {
    const pt = getSvgPoint(e);
    if (!pt) return;
    setMouseSvgPt(pt);

    if (activeDeco) {
      const dx = pt.x - activeDeco.startCx, dy = pt.y - activeDeco.startCy;
      if (activeDeco.type === 'region_label') {
        if (activeDeco.dragMode === 'move') {
          setDragRegionOverride({ regionKey: activeDeco.id, dx, dy });
        } else if (activeDeco.dragMode === 'scale') {
          const dist = Math.sqrt(dx*dx + dy*dy);
          const scale = Math.max(0.2, 1.0 + (dx + dy) / 200);
          setDragRegionOverride({ regionKey: activeDeco.id, scale });
        }
      } else if (activeDeco.type === 'chiban_label') {
        if (activeDeco.dragMode === 'move') {
          setDragChibanOverride({ polyId: activeDeco.id, dx, dy });
        } else if (activeDeco.dragMode === 'scale') {
          const scale = Math.max(0.2, 1.0 + (dx + dy) / 200);
          setDragChibanOverride({ polyId: activeDeco.id, scale });
        }
      } else if (activeDeco.type === 'deco') {
        if (activeDeco.dragMode === 'move') {
          setDragDecoOverride({
            groupId: activeDeco.groupId,
            decoId: activeDeco.decoId,
            cx: activeDeco.startCx + (pt.x - activeDeco.startMouseX),
            cy: activeDeco.startCy + (pt.y - activeDeco.startMouseY)
          });
        } else if (activeDeco.dragMode === 'rotate') {
          const rx = pt.x - activeDeco.startCx;
          const ry = pt.y - activeDeco.startCy;
          let newAngle = Math.atan2(ry, rx) * 180 / Math.PI;
          setDragDecoOverride({
            groupId: activeDeco.groupId, decoId: activeDeco.decoId, angle: newAngle
          });
        }
      }
    } else if (mode === 'draw') {
      if (Date.now() - lastDrawRef.current < 500) {
        setSnappedPt(null);
        return;
      }
      
      const snapRadius = viewBox.w / 60;
      const snapRadiusSq = snapRadius * snapRadius;
      
      const firstPt = drawingPts.length > 0 ? drawingPts[0] : null;
      const distToFirstSq = firstPt ? (pt.x - firstPt.x)**2 + (pt.y - firstPt.y)**2 : Infinity;
      
      const candidatePts = [];

      // 1. Existing Vertices
      snapData.pts.forEach(p => {
        const distSq = (p.x - pt.x)**2 + (p.y - pt.y)**2;
        if (distSq < snapRadiusSq) candidatePts.push({ x: p.x, y: p.y, distSq, type: 'vertex' });
      });

      // 2. Filter Segments and Compute Intersections
      const nearbySegments = snapData.segments.filter(seg => {
        const minX = Math.min(seg[0].x, seg[1].x) - snapRadius;
        const maxX = Math.max(seg[0].x, seg[1].x) + snapRadius;
        const minY = Math.min(seg[0].y, seg[1].y) - snapRadius;
        const maxY = Math.max(seg[0].y, seg[1].y) + snapRadius;
        return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
      });

      for (let i = 0; i < nearbySegments.length; i++) {
        for (let j = i + 1; j < nearbySegments.length; j++) {
          const inter = getSegmentIntersection(nearbySegments[i][0], nearbySegments[i][1], nearbySegments[j][0], nearbySegments[j][1]);
          if (inter && inter.onSegment1 && inter.onSegment2) {
            const distSq = (inter.x - pt.x)**2 + (inter.y - pt.y)**2;
            if (distSq < snapRadiusSq) candidatePts.push({ x: inter.x, y: inter.y, distSq, type: 'intersection' });
          }
        }
      }

      if (firstPt && distToFirstSq < snapRadiusSq) {
        setSnappedPt({ ...firstPt, type: 'start' });
      } else if (candidatePts.length > 0) {
        candidatePts.sort((a, b) => a.distSq - b.distSq);
        setSnappedPt(candidatePts[0]);
      } else {
        // 3. Edges
        let closestEdgePt = null, minEdgeDistSq = snapRadiusSq;
        nearbySegments.forEach(seg => {
          const res = getClosestPointOnSegment(pt, seg[0], seg[1]);
          if (res.distSq < minEdgeDistSq) {
            minEdgeDistSq = res.distSq;
            closestEdgePt = { x: res.x, y: res.y, type: 'edge' };
          }
        });
        setSnappedPt(closestEdgePt);
      }
    } else {
      setSnappedPt(null);
    }
  }, [mode, isDragging, activeDeco, getSvgPoint, snapData, drawingPts, viewBox.w]);

  const handleSvgMouseUp = useCallback((e) => {
    if (activeDeco) {
      if (dragRegionOverride) {
        commitChange(currentPolygons, currentAppliedGroups, { ...currentRegionOverrides, [dragRegionOverride.regionKey]: dragRegionOverride });
        setDragRegionOverride(null);
      }
      if (dragChibanOverride) {
        commitChange(currentPolygons, currentAppliedGroups, currentRegionOverrides, { ...currentChibanOverrides, [dragChibanOverride.polyId]: dragChibanOverride });
        setDragChibanOverride(null);
      }
      if (dragDecoOverride) {
        const nextGroups = currentAppliedGroups.map(g => {
          if (g.id !== dragDecoOverride.groupId) return g;
          return {
            ...g,
            decorations: g.decorations.map(d => {
              if (d.id !== dragDecoOverride.decoId) return d;
              return {
                ...d,
                cx: dragDecoOverride.cx !== undefined ? dragDecoOverride.cx : d.cx,
                cy: dragDecoOverride.cy !== undefined ? dragDecoOverride.cy : d.cy,
                angle: dragDecoOverride.angle !== undefined ? dragDecoOverride.angle : d.angle
              };
            })
          };
        });
        commitChange(currentPolygons, nextGroups);
        setDragDecoOverride(null);
      }
      setActiveDeco(null);
    }
  }, [activeDeco, dragRegionOverride, dragChibanOverride, dragDecoOverride, currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides, commitChange]);

  const handleSvgClick = useCallback((e) => {
    if (wasDragged(e)) return;
    setSelectedDecoId(null);
    if (mode === 'draw') {
      const pt = getSvgPoint(e); if (!pt) return;
      if (drawingPts.length >= 3 && snappedPt && snappedPt.type === 'start') {
        finishDrawing(true);
      } else {
        setDrawingPts(prev => [...prev, snappedPt || pt]);
      }
    } else if (mode === 'select' && currentPolygons.length > 0) {
      const pt = getSvgPoint(e);
      if (!pt) return;
      let clickedId = null;
      for (let i = currentPolygons.length - 1; i >= 0; i--) {
        const poly = currentPolygons[i];
        if (poly.pathData && isPointInPath(pt, poly.pathData)) {
          clickedId = poly.id;
          break;
        }
      }
      if (clickedId) {
        setSelectedPolygons(prev => prev.includes(clickedId) ? prev.filter(id => id !== clickedId) : [...prev, clickedId]);
      } else {
        setSelectedPolygons([]);
      }
    }
  }, [mode, wasDragged, snappedPt, getSvgPoint, drawingPts, finishDrawing, currentPolygons, setSelectedPolygons]);

  const handleSvgContextMenu = useCallback((e) => { e.preventDefault(); e.stopPropagation(); if (mode === 'draw') setDrawingPts(prev => prev.length > 0 ? prev.slice(0, -1) : []); }, [mode]);

  const handlePolygonClick = (e, id) => {
    e.stopPropagation();
    if (wasDragged(e)) return;
    setSelectedPolygons(prev => prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]);
  };

  useEffect(() => { 
    setDrawingPts([]); setSnappedPt(null); setSelectedPolygons([]);
    if (mode !== 'edit_deco') {
      setActiveDeco(null);
      setSelectedDecoId(null);
    }
  }, [mode]);

  useEffect(() => {
    if (error && error.includes("境界線が見つかりませんでした")) {
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPolygons, mode, drawingPts, historyIndex]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      
      if (e.key === 'Escape') { setDrawingPts([]); setMode('select'); }
      if (e.key === 'Enter' && mode === 'draw') finishDrawing(false);
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); handleRedo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (mode === 'edit_deco' && activeDeco) {
          if (activeDeco.type === 'region_label') commitChange(currentPolygons, currentAppliedGroups, { ...currentRegionOverrides, [activeDeco.id]: { visible: false } });
          else if (activeDeco.type === 'chiban_label') commitChange(currentPolygons, currentAppliedGroups, currentRegionOverrides, { ...currentChibanOverrides, [activeDeco.id]: { visible: false } });
          setActiveDeco(null);
        } else if (selectedPolygons.length > 0) {
          handleRemoveFeatures();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, finishDrawing, handleUndo, handleRedo, activeDeco, currentAppliedGroups, selectedPolygons, handleRemoveFeatures, currentRegionOverrides, currentChibanOverrides, currentPolygons, commitChange]);

  const hasData = data.lines.length > 0 || history.length > 0;
  const labelFontSize = (viewBox.w / 150) * screenMagnification * 0.72;
  const strokeColor = showMap ? (mapType === 'seamlessphoto' ? "#ffff00" : mapType === 'std' ? "#dc2626" : "#ef4444") : "#2563eb";
  const baseLinePath = useMemo(() => data.lines.map(line => `M ${line[0].x} ${line[0].y} ` + line.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')).join(' '), [data.lines]);

  const renderRegionLabels = () => {
    if (!showLabels) return null;
    return regionLabels.map((region, idx) => {
      const text = region.text;
      const override = (dragRegionOverride && dragRegionOverride.regionKey === region.key) ? dragRegionOverride : {};
      const currentScale = override.scale !== undefined ? override.scale : region.scale;
      const fSize = labelFontSize * 1.5 * currentScale;
      const rectW = text.length * fSize + fSize;
      const rectH = fSize * 1.5;
      
      let defaultOffsetY = 0;
      if (region.groupHasBoth) {
         defaultOffsetY = region.isOaza ? -(fSize * 1.6) / 2 : (fSize * 1.6) / 2;
      }
      
      const finalCx = override.dx !== undefined ? region.baseCx + override.dx : region.cx;
      const finalCy = (override.dy !== undefined ? region.baseCy + override.dy : region.cy) + defaultOffsetY;
      
      const rectX = finalCx - rectW / 2;
      const rectY = finalCy - rectH / 2;
      
      const isActive = activeDeco?.type === 'region_label' && activeDeco?.id === region.key, isInteractive = mode === 'edit_deco';

      return (
        <g key={region.key} pointerEvents={isInteractive ? "auto" : "none"} className="select-none region-label-group" style={{ userSelect: 'none', cursor: isInteractive ? 'move' : 'default' }} onMouseDown={(e) => { if (isInteractive) { e.stopPropagation(); handleRegionLabelMouseDown(e, region.key, 'move', { x: region.baseCx, y: region.baseCy + defaultOffsetY }); }}}>
          <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="#ffffff" stroke="#3f3f46" strokeWidth={fSize * 0.08} />
          <text x={finalCx} y={finalCy} fontSize={fSize} fill="#3f3f46" fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{text}</text>
          
          {isActive && isInteractive && (
            <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w/200} ${viewBox.w/200}`} pointerEvents="none" />
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
          {isCustom && <path d={poly.pathData} fill={poly.isClosed === false ? "none" : "rgba(16, 185, 129, 0.05)"} stroke="#10b981" strokeWidth={viewBox.w / 800} pointerEvents="none" fillRule="evenodd"/>}
          {!isCustom && (!poly.curves || poly.isModified) && <path d={poly.pathData} fill="none" stroke={strokeColor} strokeWidth={viewBox.w / (showMap ? 800 : 1000)} pointerEvents="none" fillRule="evenodd" opacity={0.8} />}
          {/* Selection Highlight */}
          {(isSelected || isHovered) && (
            <path 
              d={poly.pathData} 
              pointerEvents="none" 
              fill={poly.isClosed === false ? "none" : (isSelected ? "rgba(234, 179, 8, 0.4)" : "rgba(234, 179, 8, 0.2)")} 
              stroke={isSelected ? "#ca8a04" : "rgba(234, 179, 8, 0.6)"} 
              strokeWidth={isSelected ? viewBox.w / 300 : viewBox.w / 600} 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              fillRule="evenodd" 
            />
          )}
          
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
                       <text x={circleCx} y={finalCy} fontSize={scaledFontSize*0.75} fill={isCustom ? "#059669" : "#3f3f46"} fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{poly.chimoku.charAt(0)}</text>
                       <text x={textStartX} y={finalCy} fontSize={scaledFontSize} fill={isCustom ? "#059669" : "#3f3f46"} fontWeight="bold" textAnchor="start" dominantBaseline="central" pointerEvents="none">{poly.chiban}</text>
                       {isActive && isInteractive && (
                         <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w/200} ${viewBox.w/200}`} pointerEvents="none" />
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
                         <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w/200} ${viewBox.w/200}`} pointerEvents="none" />
                       )}
                     </>
                   );
                 })()}
               </g>
             );
          })()}
          <path 
            d={poly.pathData} 
            fill={poly.isClosed === false ? "none" : "transparent"} 
            stroke={poly.isClosed === false ? "transparent" : "none"} 
            strokeWidth={poly.isClosed === false ? viewBox.w / 50 : viewBox.w / 100} 
            className={`${mode === 'select' ? 'cursor-pointer' : 'cursor-crosshair'} outline-none`} 
            fillRule="evenodd" 
            onMouseEnter={() => { if(mode === 'select') setHoveredPolygon(poly.id); }} 
            onMouseLeave={() => setHoveredPolygon(null)} 
            onClick={(e) => { if(mode === 'select') handlePolygonClick(e, poly.id); }} 
            pointerEvents={mode === 'edit_deco' ? 'none' : 'auto'} 
          />
        </g>
      );
    });
  };

  const renderDrawingLayer = () => {
    if (mode !== 'draw' || !mouseSvgPt) return null;
    const isClosing = drawingPts.length >= 3 && snappedPt && snappedPt.type === 'start';
    return (
      <g>
        {drawingPts.length > 0 && <path d={`M ${drawingPts[0].x} ${drawingPts[0].y} ` + drawingPts.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${snappedPt ? snappedPt.x : mouseSvgPt.x} ${snappedPt ? snappedPt.y : mouseSvgPt.y} ` + (isClosing ? 'Z' : '')} fill={isClosing ? "rgba(16, 185, 129, 0.2)" : "none"} stroke="#10b981" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w / 200} ${viewBox.w / 200}`} pointerEvents="none" />}
        {drawingPts.map((pt, i) => <circle key={`dpt-${i}`} cx={pt.x} cy={pt.y} r={viewBox.w / 400} fill="#10b981" pointerEvents="none" />)}
        {snappedPt && (
          <g pointerEvents="none">
            {snappedPt.type === 'start' && <circle cx={snappedPt.x} cy={snappedPt.y} r={viewBox.w / 150} fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" strokeWidth={viewBox.w/300} />}
            {snappedPt.type === 'vertex' && <circle cx={snappedPt.x} cy={snappedPt.y} r={viewBox.w / 250} fill="rgba(59, 130, 246, 0.3)" stroke="#3b82f6" strokeWidth={viewBox.w/400} />}
            {snappedPt.type === 'intersection' && <rect x={snappedPt.x - viewBox.w/300} y={snappedPt.y - viewBox.w/300} width={viewBox.w/150} height={viewBox.w/150} fill="rgba(168, 85, 247, 0.3)" stroke="#a855f7" strokeWidth={viewBox.w/400} transform={`rotate(45, ${snappedPt.x}, ${snappedPt.y})`} />}
            {snappedPt.type === 'edge' && <circle cx={snappedPt.x} cy={snappedPt.y} r={viewBox.w / 400} fill="rgba(234, 179, 8, 0.5)" stroke="#ca8a04" strokeWidth={viewBox.w/500} />}
            {!snappedPt.type && <circle cx={snappedPt.x} cy={snappedPt.y} r={viewBox.w / 200} fill="none" stroke="#ef4444" strokeWidth={viewBox.w/300} />}
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="flex flex-col h-full absolute inset-0 w-full bg-neutral-100 text-neutral-800 font-sans overflow-hidden">
      <Header fileInfo={data.fileInfo} coordinateSystem={data.coordinateSystem} onReset={() => setShowResetConfirm(true)} onExportDXF={exportToDXF} onExportJSON={exportToJSON} onLoadFile={loadFile} onUndo={handleUndo} onRedo={handleRedo} canUndo={historyIndex > 0} canRedo={historyIndex < history.length - 1} />

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-neutral-200 p-6 max-w-sm w-full flex flex-col gap-4">
            <h3 className="text-lg font-bold text-neutral-800 flex items-center gap-2"><Home className="w-5 h-5 text-indigo-600"/>全てのリセット</h3>
            <p className="text-sm text-neutral-600">現在の作業データは全て破棄・リセットされます。よろしいですか？</p>
            <div className="flex gap-2 justify-end mt-2">
              <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-neutral-600 bg-neutral-100 hover:bg-neutral-200">キャンセル</button>
              <button onClick={confirmReset} className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700">リセット</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex flex-col items-center justify-center z-50">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <p className="text-lg font-bold text-neutral-800">データを読み込み中...</p>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-50 text-red-600 px-6 py-3 rounded-lg shadow-lg border border-red-200 flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top-4">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-4 hover:bg-red-100 p-1 rounded-md transition-colors">×</button>
          </div>
        )}

        {dbMessage && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-emerald-50 text-emerald-700 px-6 py-3 rounded-lg shadow-lg border border-emerald-200 flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top-4">
            <Save className="w-5 h-5" />
            <span className="font-medium">{dbMessage}</span>
          </div>
        )}

        {!hasData && !loading && (
          <StartScreen 
            loadFile={loadFile} 
            startFreehandDraw={startFreehandDraw} 
            hasSavedData={hasSavedData} 
            handleLoadSavedData={handleLoadSavedData} 
          />
        )}

        {hasData && (
          <div className="absolute inset-0 w-full h-full select-none">
            <svg ref={svgRef} className="w-full h-full outline-none touch-none bg-neutral-100 overflow-visible select-none" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} 
                 onMouseMove={(e) => { panZoomHandlers.onMouseMove(e); handleSvgMouseMove(e); }} 
                 onMouseUp={(e) => { panZoomHandlers.onMouseUp(e); handleSvgMouseUp(e); }} 
                 onMouseLeave={panZoomHandlers.onMouseLeave} onWheel={panZoomHandlers.onWheel}
                 onMouseDown={panZoomHandlers.onMouseDown}
                 onClick={handleSvgClick}
                 onDoubleClick={(e) => { e.preventDefault(); if (mode === 'draw') { e.stopPropagation(); finishDrawing(false); } }}
                 onContextMenu={handleSvgContextMenu}>
              <defs>
                <pattern id="grid" width={viewBox.w/20} height={viewBox.w/20} patternUnits="userSpaceOnUse">
                  <path d={`M ${viewBox.w/20} 0 L 0 0 0 ${viewBox.w/20}`} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={viewBox.w/1000} />
                </pattern>
                {activeDeco && <filter id="glow"><feGaussianBlur stdDeviation={viewBox.w/300} result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>}
              </defs>
              <rect x={viewBox.x - viewBox.w} y={viewBox.y - viewBox.h} width={viewBox.w * 3} height={viewBox.h * 3} fill="url(#grid)" pointerEvents="none" />
              
              {showMap && mapTiles.map(tile => (
                <image key={tile.key} href={tile.url} x={tile.x} y={tile.y} width={tile.w} height={tile.h} preserveAspectRatio="none" className="opacity-80" crossOrigin="anonymous"/>
              ))}

              <path d={baseLinePath} fill="none" stroke={strokeColor} strokeWidth={viewBox.w / (showMap ? 800 : 1000)} strokeLinejoin="round" pointerEvents="none" opacity={showMap ? 0.7 : 0.8} />

              {renderRegionLabels()}
              {renderPolygons()}
              {currentAppliedGroups.map((group, i) => (
                <LegendGroup 
                  key={group.id} 
                  group={group} 
                  scale={viewBox.w} 
                  mode={mode} 
                  activeDeco={activeDeco} 
                  selectedDecoId={selectedDecoId}
                  onDecoMouseDown={handleDecoMouseDown} 
                  dragDecoOverride={dragDecoOverride} 
                />
              ))}
              {renderDrawingLayer()}
            </svg>

            {mode !== 'select' && mode !== 'edit_deco' && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/90 border border-indigo-200 text-indigo-700 px-4 py-1.5 rounded-full shadow z-20 font-bold text-[10px] sm:text-xs flex items-center gap-1.5 pointer-events-none backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 whitespace-nowrap">
                <Edit3 className="w-3.5 h-3.5" />
                <span>クリック: 追加 / Enter,ダブルクリック: 完了 / 右クリック: 戻る / ESC: 取消</span>
              </div>
            )}

            <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-auto z-10">
              <div className="flex items-center gap-2">
                <button onClick={() => fitToBoundingBox(data.boundingBox)} className="p-2.5 rounded-lg shadow-md hover:bg-neutral-50 text-neutral-700 transition-colors border border-neutral-200 bg-white" title="全体を表示"><Maximize className="w-5 h-5" /></button>
                <button onClick={() => setShowLabels(!showLabels)} className={`p-2.5 rounded-lg shadow-md transition-colors border border-neutral-200 ${showLabels ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-neutral-700'}`} title="地番の表示切替"><Hash className="w-5 h-5" /></button>
                <button onClick={() => setShowMap(!showMap)} disabled={!data.coordinateSystem} className={`p-2.5 rounded-lg shadow-md transition-colors border border-neutral-200 ${showMap ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-neutral-700'} ${!data.coordinateSystem && 'opacity-50'}`} title="地理院地図"><Globe className="w-5 h-5" /></button>
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
              </div>
</div>

            <ToolPanel 
              mode={mode} setMode={setMode} selectedPolygons={selectedPolygons} polygons={currentPolygons} appliedGroups={currentAppliedGroups} 
              onApplyStyle={handleApplyStyle} onApplyMegane={handleApplyMegane} onApplyChimoku={handleApplyChimoku}
              onRemoveFeature={handleRemoveFeatures} onRemoveGroup={handleRemoveGroup} onUpdateCustomPolygon={handleUpdateCustomPolygon} onClearSelection={() => setSelectedPolygons([])} 
              selectedLineStyle={selectedLineStyle} setSelectedLineStyle={setSelectedLineStyle} selectedDecoPattern={selectedDecoPattern} setSelectedDecoPattern={setSelectedDecoPattern} decorationScale={decorationScale} setDecorationScale={setDecorationScale} screenMagnification={screenMagnification} setScreenMagnification={setScreenMagnification} />

            <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1 pointer-events-none z-10">
              {showMap && <div className="bg-white/80 backdrop-blur px-2 py-1 rounded shadow-sm text-[10px] text-neutral-600 pointer-events-auto"><a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer" className="hover:underline">出典：国土地理院</a></div>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

