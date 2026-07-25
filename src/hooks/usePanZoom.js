import { useState, useRef, useCallback, useMemo } from 'react';

export const usePanZoom = (mode) => {
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1000, h: 1000 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 }), mousePos = useRef({ x: 0, y: 0 }), svgRef = useRef(null);

  const fitToBoundingBox = useCallback((bbox) => {
    if (!bbox) return;
    let w = bbox.maxX - bbox.minX, h = bbox.maxY - bbox.minY;
    if (w === 0) w = 100; if (h === 0) h = 100;
    
    // X方向は10%のパディング
    // X方向は15%のパディング
    const padX = w * 0.15;
    // 上下パディング。横長の地形でテキストがはみ出さないよう余裕を持たせる
    const padTop = Math.max(h * 0.15, w * 0.05);
    const padBottom = Math.max(h * 0.3, w * 0.1); 
    
    const targetW = w + padX * 2;
    const targetH = h + padTop + padBottom;
    const centerX = bbox.minX + w / 2;
    const centerY = bbox.minY + h / 2 + (padBottom - padTop) / 2;

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
      dragStart.current = { x: e.clientX, y: e.clientY };
      mousePos.current = { x: e.clientX, y: e.clientY };
      setIsDragging(true);
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
