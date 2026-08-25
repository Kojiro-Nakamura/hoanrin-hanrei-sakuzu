import { useState, useCallback } from 'react';

export function useMapHistory({ mode, setMode, setSelectedPolygons, setDrawingPts }) {
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const currentPolygons = history[historyIndex]?.polygons || [];
  const currentAppliedGroups = history[historyIndex]?.appliedGroups || [];
  const currentRegionOverrides = history[historyIndex]?.regionOverrides || {};
  const currentChibanOverrides = history[historyIndex]?.chibanOverrides || {};
  const currentFreeTexts = history[historyIndex]?.freeTexts || [];

  const commitChange = useCallback((newPolygons, newAppliedGroups, newRegionOverrides = null, newChibanOverrides = null, newFreeTexts = null) => {
    setHistoryIndex(prevIndex => {
      setHistory(prevHistory => {
        const nextHistory = prevHistory.slice(0, prevIndex + 1);
        const prevOverrides = nextHistory[nextHistory.length - 1]?.regionOverrides || {};
        const prevChibanOverrides = nextHistory[nextHistory.length - 1]?.chibanOverrides || {};
        const prevFreeTexts = nextHistory[nextHistory.length - 1]?.freeTexts || [];
        nextHistory.push({ 
          polygons: newPolygons, appliedGroups: newAppliedGroups,
          regionOverrides: newRegionOverrides || prevOverrides, chibanOverrides: newChibanOverrides || prevChibanOverrides,
          freeTexts: newFreeTexts || prevFreeTexts
        });
        return nextHistory;
      });
      return prevIndex + 1;
    });
  }, []);

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
  }, [historyIndex, history, mode, setSelectedPolygons, setDrawingPts, setMode]);

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
  }, [historyIndex, history, mode, setSelectedPolygons, setDrawingPts, setMode]);

  return {
    history, setHistory,
    historyIndex, setHistoryIndex,
    currentPolygons,
    currentAppliedGroups,
    currentRegionOverrides,
    currentChibanOverrides,
    commitChange,
    handleUndo,
    handleRedo
  };
}
