import { useState, useEffect, useMemo } from 'react';
import proj4 from 'proj4';
import { CS_ORIGINS } from '../constants';
import { lon2tile, lat2tile, tile2lon, tile2lat } from '../utils/geometry';

export const useMapTiles = (viewBox, showMap, coordinateSystem, mapType, containerRef) => {
  const proj4Loaded = true;


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

      let renderMinX = viewBox.x;
      let renderMinY = viewBox.y;
      let renderMaxX = viewBox.x + viewBox.w;
      let renderMaxY = viewBox.y + viewBox.h;

      if (containerRef.current) {
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        if (cw > 0 && ch > 0) {
          const screenAspect = cw / ch;
          const viewAspect = viewBox.w / viewBox.h;
          if (screenAspect > viewAspect) {
            const visibleW = viewBox.h * screenAspect;
            const diff = (visibleW - viewBox.w) / 2;
            renderMinX -= diff;
            renderMaxX += diff;
          } else {
            const visibleH = viewBox.w / screenAspect;
            const diff = (visibleH - viewBox.h) / 2;
            renderMinY -= diff;
            renderMaxY += diff;
          }
        }
      }

      const [nw_lon, nw_lat] = window.proj4(projStr, 'WGS84', [renderMinX, -renderMinY]);
      const [se_lon, se_lat] = window.proj4(projStr, 'WGS84', [renderMaxX, -renderMaxY]);
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