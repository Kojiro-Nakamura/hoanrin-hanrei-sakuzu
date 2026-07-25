import { useState, useCallback, useEffect } from 'react';
import { saveToDB, loadFromDB } from '../utils/db';
import { parseMojXml, parseKml } from '../utils/dataProcessing';

export function useMapData({
  currentPolygons,
  currentAppliedGroups,
  currentRegionOverrides,
  currentChibanOverrides,
  historyLength,
  commitChange,
  fitToBoundingBox,
  setHistory,
  setHistoryIndex,
  setSelectedPolygons,
  setDrawingPts,
  setShowMap,
  setMode,
  setShowResetConfirm
}) {
  const [data, setData] = useState({ lines: [], polygons: [], boundingBox: null, coordinateSystem: null, fileInfo: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dbMessage, setDbMessage] = useState(null);
  const [hasSavedData, setHasSavedData] = useState(false);

  const loadFile = useCallback((file, isAppend = false) => {
    const isXml = file.name.toLowerCase().endsWith('.xml');
    const isKml = file.name.toLowerCase().endsWith('.kml');
    if (!isXml && !isKml) return setError("XMLまたはKMLファイルを選択してください。");
    setLoading(true); setError(null);
    
    const reader = new FileReader();
    reader.onload = (e) => setTimeout(() => {
      try { 
         const buf = e.target.result;
         const uint8 = new Uint8Array(buf);
         const headStr = new TextDecoder('ascii').decode(uint8.slice(0, 200));
         let encoding = 'Shift_JIS';
         if (headStr.toLowerCase().includes('utf-8')) encoding = 'utf-8';
         const text = new TextDecoder(encoding).decode(uint8);
         
         const fileId = Math.random().toString(36).substring(2, 8);
         let defaultSys = "auto";
         if (isAppend && data?.coordinateSystem) {
           defaultSys = data.coordinateSystem;
         }
         // Note: For future SIMA support, we'll read sysSelect here if needed
         const parsed = isKml ? parseKml(text, fileId, defaultSys) : parseMojXml(text, fileId); 
         
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
    reader.readAsArrayBuffer(file);
  }, [currentPolygons, currentAppliedGroups, commitChange, fitToBoundingBox, setHistory, setHistoryIndex]);

  const startFreehandDraw = useCallback((sysNum) => {
    setData({
      lines: [], boundingBox: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
      coordinateSystem: sysNum, fileInfo: { name: `フリーハンド作図 (第${sysNum}系)`, size: '-' }
    });
    setHistory([{ polygons: [], appliedGroups: [], regionOverrides: {}, chibanOverrides: {} }]);
    setHistoryIndex(0); 
    setMode('draw'); 
    setShowMap(true);
    setTimeout(() => fitToBoundingBox({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 }), 50);
  }, [fitToBoundingBox, setHistory, setHistoryIndex, setMode, setShowMap]);

  const confirmReset = useCallback(() => {
    setData({ lines: [], polygons: [], boundingBox: null, coordinateSystem: null, fileInfo: null });
    setHistory([]); setHistoryIndex(-1); setSelectedPolygons([]); setDrawingPts([]);
    if (setShowResetConfirm) setShowResetConfirm(false); 
    setShowMap(false);
  }, [setHistory, setHistoryIndex, setSelectedPolygons, setDrawingPts, setShowResetConfirm, setShowMap]);

  useEffect(() => {
    if (data.boundingBox && historyLength > 0) {
      saveToDB({
        lines: data.lines, polygons: currentPolygons, appliedGroups: currentAppliedGroups,
        regionOverrides: currentRegionOverrides, chibanOverrides: currentChibanOverrides,
        boundingBox: data.boundingBox, coordinateSystem: data.coordinateSystem, fileInfo: data.fileInfo
      }).catch(e => console.error("Auto-save failed", e));
    }
  }, [data, currentPolygons, currentAppliedGroups, currentRegionOverrides, currentChibanOverrides, historyLength]);

  useEffect(() => {
    loadFromDB().then(dbData => {
      if (dbData && dbData.boundingBox) {
        setHasSavedData(true);
      }
    }).catch(e => console.error("Check DB failed", e));
  }, []);

  const handleLoadSavedData = async () => {
    try {
      const dbData = await loadFromDB();
      if (dbData && dbData.boundingBox) {
        setData({ lines: dbData.lines || [], boundingBox: dbData.boundingBox || null, coordinateSystem: dbData.coordinateSystem || null, fileInfo: dbData.fileInfo || null });
        setHistory([{ 
          polygons: dbData.polygons || [], appliedGroups: dbData.appliedGroups || [],
          regionOverrides: dbData.regionOverrides || {}, chibanOverrides: dbData.chibanOverrides || {}
        }]);
        setHistoryIndex(0);
        setTimeout(() => fitToBoundingBox(dbData.boundingBox), 50);
      }
    } catch(e) {
      setError('復元に失敗しました。');
    }
  };

  return {
    data, setData,
    loading, setLoading,
    error, setError,
    dbMessage, setDbMessage,
    hasSavedData, setHasSavedData,
    loadFile,
    startFreehandDraw,
    confirmReset,
    handleLoadSavedData
  };
}
