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
    handleApplyStyle, handleApplyMegane, handleApplyChimoku, handleRemoveFeatures, handleRemoveGroup, regionLabels
  } = useMapTools({
    currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides,
    selectedPolygons, setSelectedPolygons, selectedLineStyle, selectedDecoPattern, decorationScale, mode,
    commitChange, setError
  });

  const { exportToDXF } = useExportDXF({
    currentPolygons, currentAppliedGroups, lines: data.lines, viewBox, fileInfo: data.fileInfo, decorationScale, regionLabels, currentChibanOverrides
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
      if (p.isCustom) return;
      parsePathToRings(p.pathData).forEach(ring => {
        ring.forEach(pt => pts.push({ x: pt.x, y: pt.y }));
        for(let i=0; i<ring.length-1; i++) segments.push([{ x: ring[i].x, y: ring[i].y }, { x: ring[i+1].x, y: ring[i+1].y }]);
        if (ring.length > 0) segments.push([{ x: ring[ring.length-1].x, y: ring[ring.length-1].y }, { x: ring[0].x, y: ring[0].y }]);
      });
    });
    return { pts, segments };
  }, [currentPolygons]);

  const finishDrawing = useCallback(() => {
    if (drawingPts.length < 3) { setDrawingPts([]); return; }
    const isClockwise = signedArea(drawingPts) > 0;
    const ring = isClockwise ? drawingPts : [...drawingPts].reverse();
    const newPath = "M " + ring.map(p => `${p.x} ${p.y}`).join(" L ") + " Z";
    const actionId = Date.now().toString();
    const newPoly = {
      id: 'custom_' + actionId, chiban: '作図(面)', pathData: newPath, center: calculatePolygonCenter([ring]), curves: null, isCustom: true, splitGroupId: actionId
    };
    commitChange([...currentPolygons, newPoly], currentAppliedGroups);
    setDrawingPts([]); setMode('select'); setSelectedPolygons([newPoly.id]);
  }, [drawingPts, currentPolygons, currentAppliedGroups, commitChange, setMode, setSelectedPolygons]);

  const handleDecoMouseDown = useCallback((e, groupId, deco, dragMode) => {
    setActiveDeco({ type: 'deco', groupId, decoId: deco.id });
  }, []);

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

    if (activeDeco && isDragging) {
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
      }
    } else if (mode === 'draw' && drawingPts.length > 0) {
      const firstPt = drawingPts[0];
      const distToFirst = Math.sqrt((pt.x - firstPt.x)**2 + (pt.y - firstPt.y)**2);
      let closest = null, minDistSq = Infinity;
      let isVertexSnapped = false;
      snapData.pts.forEach(p => { const distSq = (p.x - pt.x)**2 + (p.y - pt.y)**2; if (distSq < minDistSq) { minDistSq = distSq; closest = p; isVertexSnapped = true; }});
      if (distToFirst < viewBox.w / 50 && (!closest || minDistSq > (distToFirst**2))) {
         setSnappedPt(firstPt); return;
      }
      if (!isVertexSnapped) {
        snapData.segments.forEach(seg => { const res = getClosestPointOnSegment(pt, seg[0], seg[1]); if (res.distSq < minDistSq) { minDistSq = res.distSq; closest = { x: res.x, y: res.y }; }});
      }
      setSnappedPt((closest && minDistSq < (viewBox.w / 80)**2) ? closest : null);
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
      setActiveDeco(null);
    }
  }, [activeDeco, dragRegionOverride, dragChibanOverride, currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides, commitChange]);

  const handleSvgClick = useCallback((e) => {
    if (wasDragged(e)) return;
    if (mode === 'draw') {
      const pt = getSvgPoint(e); if (!pt) return;
      if (drawingPts.length >= 3 && snappedPt && snappedPt.x === drawingPts[0].x && snappedPt.y === drawingPts[0].y) {
        finishDrawing();
      } else {
        setDrawingPts(prev => [...prev, snappedPt || pt]);
      }
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { setDrawingPts([]); setMode('select'); }
      if (e.key === 'Enter' && mode === 'draw') finishDrawing();
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
  const labelFontSize = (viewBox.w / 150) * decorationScale * 1.2;
  const strokeColor = showMap ? (mapType === 'seamlessphoto' ? "#ffff00" : mapType === 'std' ? "#dc2626" : "#ef4444") : "#2563eb";
  const baseLinePath = useMemo(() => data.lines.map(line => `M ${line[0].x} ${line[0].y} ` + line.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')).join(' '), [data.lines]);

  const renderRegionLabels = () => {
    if (!showLabels) return null;
    return regionLabels.map((region, idx) => {
      const textLines = [region.oaza ? `大字　${region.oaza}` : null, region.koaza ? `字　${region.koaza}` : null].filter(Boolean);
      if (textLines.length === 0) return null;

      const fSize = labelFontSize * 1.5 * region.scale, rectW = Math.max(...textLines.map(t => t.length)) * fSize + fSize, rectH = textLines.length * fSize * 1.2 + fSize * 0.4;
      const rectX = region.cx - rectW / 2, rectY = region.cy - rectH / 2, startY = region.cy - (textLines.length - 1) * (fSize * 1.2) / 2;
      const isActive = activeDeco?.type === 'region_label' && activeDeco?.id === region.key, isInteractive = mode === 'edit_deco';

      return (
        <g key={region.key} pointerEvents={isInteractive ? "auto" : "none"} className="select-none region-label-group" style={{ userSelect: 'none', cursor: isInteractive ? 'move' : 'default' }} onMouseDown={(e) => { if (isInteractive) { e.stopPropagation(); handleRegionLabelMouseDown(e, region.key, 'move', { x: region.cx, y: region.cy }); }}}>
          {isInteractive && <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="transparent" stroke="transparent" />}
          {textLines.map((text, i) => (
            <React.Fragment key={i}>
              <text x={region.cx} y={startY + i * (fSize * 1.2)} fontSize={fSize} fill="none" stroke={showMap && mapType === 'seamlessphoto' ? "rgba(0,0,0,0.8)" : "#ffffff"} strokeWidth={fSize * (showMap && mapType === 'seamlessphoto' ? 0.2 : 0.15)} strokeLinejoin="round" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{text}</text>
              <text x={region.cx} y={startY + i * (fSize * 1.2)} fontSize={fSize} fill={showMap && mapType === 'seamlessphoto' ? "#ffffff" : "#4f46e5"} fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none" opacity={0.9}>{text}</text>
            </React.Fragment>
          ))}
          {isActive && isInteractive && (
            <g>
              <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w/200} ${viewBox.w/200}`} pointerEvents="none" />
              <circle cx={rectX + rectW} cy={rectY + rectH} r={viewBox.w / 150} fill="#10b981" stroke="#ffffff" strokeWidth={viewBox.w / 500} cursor="nwse-resize" onMouseDown={(e) => { e.stopPropagation(); handleRegionLabelMouseDown(e, region.key, 'scale', { x: region.cx, y: region.cy }); }} />
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
          {isCustom && <path d={poly.pathData} fill="rgba(16, 185, 129, 0.05)" stroke="#10b981" strokeWidth={viewBox.w / 800} pointerEvents="none" fillRule="evenodd"/>}
          {!isCustom && (!poly.curves || poly.isModified) && <path d={poly.pathData} fill="none" stroke="#10b981" strokeWidth={viewBox.w / 1000} strokeDasharray={`${viewBox.w/200} ${viewBox.w/200}`} pointerEvents="none" fillRule="evenodd" opacity={0.8} />}
          {(isSelected || isHovered) && <path d={poly.pathData} pointerEvents="none" fill={isSelected ? "rgba(234, 179, 8, 0.4)" : "rgba(234, 179, 8, 0.2)"} stroke={isSelected ? "#ca8a04" : "rgba(234, 179, 8, 0.6)"} strokeWidth={viewBox.w / 800} fillRule="evenodd" />}
          
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
          <div className="absolute inset-0 w-full h-full">
            <svg ref={svgRef} className="w-full h-full outline-none touch-none bg-neutral-100" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} 
                 onMouseMove={panZoomHandlers.onMouseMove} onMouseUp={panZoomHandlers.onMouseUp} onMouseLeave={panZoomHandlers.onMouseLeave} onWheel={panZoomHandlers.onWheel}
                 onMouseDown={(e) => {
                   if (mode === 'select' || mode === 'edit_deco' || e.button === 1 || e.button === 2) { panZoomHandlers.onMouseDown(e); }
                 }}
                 onClick={handleSvgClick} onContextMenu={handleSvgContextMenu}>
              <defs>
                <pattern id="grid" width={viewBox.w/20} height={viewBox.w/20} patternUnits="userSpaceOnUse">
                  <path d={`M ${viewBox.w/20} 0 L 0 0 0 ${viewBox.w/20}`} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={viewBox.w/1000} />
                </pattern>
                {activeDeco && <filter id="glow"><feGaussianBlur stdDeviation={viewBox.w/300} result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>}
              </defs>
              <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#grid)" pointerEvents="none" />
              
              {showMap && mapTiles.map(tile => (
                <image key={tile.key} href={tile.url} x={tile.x} y={tile.y} width={tile.w} height={tile.h} preserveAspectRatio="none" className="opacity-80" crossOrigin="anonymous"/>
              ))}

              <path d={baseLinePath} fill="none" stroke={strokeColor} strokeWidth={viewBox.w / (showMap ? 800 : 1000)} strokeLinejoin="round" pointerEvents="none" opacity={showMap ? 0.7 : 0.8} />

              {renderRegionLabels()}
              {renderPolygons()}
              {currentAppliedGroups.map((group, i) => <LegendGroup key={group.id} group={group} scale={viewBox.w} mode={mode} activeDeco={activeDeco} onDecoMouseDown={handleDecoMouseDown} />)}
              {renderDrawingLayer()}
            </svg>

            {mode !== 'select' && mode !== 'edit_deco' && (
              <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white px-6 py-2.5 rounded-full shadow-lg z-20 font-medium text-sm flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-bottom-4 whitespace-nowrap">
                <Edit3 className="w-4 h-4" />
                <span>作図中 (分割/抽出)</span>
                <span className="opacity-80 ml-2 font-normal text-[10px] sm:text-xs bg-indigo-800/50 px-2 py-0.5 rounded hidden sm:inline">クリック: 追加 / Enter: 完了 / 右クリック: 戻る / ESC: 取消</span>
              </div>
            )}

            <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-auto z-10 w-[92px]">
              <div className="flex bg-white rounded-lg shadow-md border border-neutral-200 overflow-hidden">
                <button onClick={exportToDXF} className="flex-1 py-2.5 flex items-center justify-center hover:bg-neutral-50 text-neutral-700 transition-colors border-r border-neutral-200" title="DXFファイルとして保存"><Download className="w-5 h-5" /></button>
                <label className="flex-1 py-2.5 flex items-center justify-center hover:bg-neutral-50 text-neutral-700 transition-colors cursor-pointer" title="XMLを追加読込">
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
              selectedLineStyle={selectedLineStyle} setSelectedLineStyle={setSelectedLineStyle} selectedDecoPattern={selectedDecoPattern} setSelectedDecoPattern={setSelectedDecoPattern} decorationScale={decorationScale} setDecorationScale={setDecorationScale} />

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
