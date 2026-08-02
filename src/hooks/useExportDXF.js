import { useCallback } from 'react';
import { dxfCreateText, dxfCreateCircle, dxfCreateInsert, dxfCreateSolid, dxfCreatePath, dxfCreateLines } from '../utils/dxf';
import { parsePathToRings, calculatePolygonCenter } from '../utils/geometry';

export function useExportDXF({ currentPolygons, currentAppliedGroups, lines, viewBox, fileInfo, decorationScale, regionLabels, currentChibanOverrides }) {
  const exportToDXF = useCallback(() => {
    const EXPORT_SCALE = 1000.0;
    const extMinX = viewBox.x * EXPORT_SCALE;
    const extMaxX = (viewBox.x + viewBox.w) * EXPORT_SCALE;
    const extMinY = -(viewBox.y + viewBox.h) * EXPORT_SCALE;
    const extMaxY = -viewBox.y * EXPORT_SCALE;
    
    const rawScale = (viewBox.w * EXPORT_SCALE) / 420.0;
    const scaleList = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
    let dimScale = scaleList.find(s => s >= rawScale);
    if (!dimScale) dimScale = rawScale > 0 ? rawScale : 1000.0;
    const ltScale = dimScale / 4.0;
    
    const cx = (extMinX + extMaxX) / 2.0;
    const cy = (extMinY + extMaxY) / 2.0;
    const limWidth = 420.0 * dimScale;
    const limHeight = 297.0 * dimScale;
    
    const limMinX = cx - limWidth / 2.0;
    const limMaxX = cx + limWidth / 2.0;
    const limMinY = cy - limHeight / 2.0;
    const limMaxY = cy + limHeight / 2.0;

    let dxf = "  0\r\nSECTION\r\n  2\r\nHEADER\r\n" +
      "  9\r\n$ACADVER\r\n  1\r\nAC1009\r\n" +
      "  9\r\n$ACADMAINTVER\r\n 70\r\n9\r\n" +
      "  9\r\n$DWGCODEPAGE\r\n  3\r\nANSI_932\r\n" +
      "  9\r\n$INSBASE\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 30\r\n0.0\r\n" +
      `  9\r\n$EXTMIN\r\n 10\r\n${extMinX.toFixed(4)}\r\n 20\r\n${extMinY.toFixed(4)}\r\n 30\r\n0.0\r\n` +
      `  9\r\n$EXTMAX\r\n 10\r\n${extMaxX.toFixed(4)}\r\n 20\r\n${extMaxY.toFixed(4)}\r\n 30\r\n0.0\r\n` +
      `  9\r\n$LIMMIN\r\n 10\r\n${limMinX.toFixed(4)}\r\n 20\r\n${limMinY.toFixed(4)}\r\n` +
      `  9\r\n$LIMMAX\r\n 10\r\n${limMaxX.toFixed(4)}\r\n 20\r\n${limMaxY.toFixed(4)}\r\n` +
      "  9\r\n$ORTHOMODE\r\n 70\r\n0\r\n" +
      "  9\r\n$REGENMODE\r\n 70\r\n1\r\n" +
      "  9\r\n$FILLMODE\r\n 70\r\n1\r\n" +
      "  9\r\n$QTEXTMODE\r\n 70\r\n0\r\n" +
      "  9\r\n$MIRRTEXT\r\n 70\r\n1\r\n" +
      `  9\r\n$LTSCALE\r\n 40\r\n${ltScale.toFixed(1)}\r\n` +
      "  9\r\n$TEXTSIZE\r\n 40\r\n10.0\r\n" +
      "  9\r\n$TRACEWID\r\n 40\r\n0.05\r\n" +
      "  9\r\n$TEXTSTYLE\r\n  7\r\nSTANDARD\r\n" +
      "  9\r\n$CLAYER\r\n  8\r\n0\r\n" +
      "  9\r\n$CELTYPE\r\n  6\r\nBYLAYER\r\n" +
      "  9\r\n$CECOLOR\r\n 62\r\n256\r\n" +
      "  9\r\n$CELTSCALE\r\n 40\r\n1.0\r\n" +
      `  9\r\n$DIMSCALE\r\n 40\r\n${dimScale.toFixed(1)}\r\n` +
      "  9\r\n$DIMSTYLE\r\n  2\r\nSTANDARD\r\n" +
      "  9\r\n$PEXTMIN\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 30\r\n0.0\r\n" +
      "  9\r\n$PEXTMAX\r\n 10\r\n420.0\r\n 20\r\n297.0\r\n 30\r\n0.0\r\n" +
      "  9\r\n$PLIMMIN\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n" +
      "  9\r\n$PLIMMAX\r\n 10\r\n420.0\r\n 20\r\n297.0\r\n" +
      "  9\r\n$MEASUREMENT\r\n 70\r\n1\r\n" +
      "  0\r\nENDSEC\r\n  0\r\nSECTION\r\n  2\r\nTABLES\r\n  0\r\nTABLE\r\n  2\r\nVPORT\r\n  70\r\n1\r\n  0\r\nVPORT\r\n  2\r\n*ACTIVE\r\n  70\r\n0\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 11\r\n1.0\r\n 21\r\n1.0\r\n 12\r\n50.0\r\n 22\r\n50.0\r\n 13\r\n0.0\r\n 23\r\n0.0\r\n 14\r\n0.5\r\n 24\r\n0.5\r\n 15\r\n0.5\r\n 25\r\n0.5\r\n 16\r\n0.0\r\n 26\r\n0.0\r\n 36\r\n1.0\r\n 17\r\n0.0\r\n 27\r\n0.0\r\n 37\r\n0.0\r\n 40\r\n100.0\r\n  0\r\nENDTAB\r\n  0\r\nTABLE\r\n  2\r\nLTYPE\r\n  70\r\n1\r\n  0\r\nLTYPE\r\n  2\r\nCONTINUOUS\r\n  70\r\n0\r\n  3\r\nSolid line\r\n 72\r\n65\r\n 73\r\n0\r\n 40\r\n0.0\r\n  0\r\nENDTAB\r\n  0\r\nTABLE\r\n  2\r\nLAYER\r\n  70\r\n10\r\n";
    
    const addLayer = (name, color) => { dxf += `  0\r\nLAYER\r\n  2\r\n${name}\r\n 70\r\n0\r\n 62\r\n${color}\r\n  6\r\nCONTINUOUS\r\n`; };
    addLayer("BASE_LINES", 8);
    addLayer("POLYGONS", 3);
    addLayer("POLYGONS_CUSTOM", 4);
    addLayer("CHIBAN_LABELS", 7);
    addLayer("REGION_LABELS", 7);
    addLayer("REGION_LABELS_BG", 255);
    addLayer("POLYGONS_STYLE", 4);
    addLayer("POLYGONS_STYLE_INNER", 4);
    addLayer("POLYGONS_STYLE_INNER2", 4);
    addLayer("DECORATIONS_HIGE", 1);
    addLayer("DECORATIONS_SHAPE", 5);
    addLayer("LABELS", 7);
    addLayer("LABELS_BG", 255);
    addLayer("ORIGIN_CROSS", 1);
    dxf += "  0\r\nENDTAB\r\n" +
           "  0\r\nTABLE\r\n  2\r\nSTYLE\r\n  70\r\n1\r\n  0\r\nSTYLE\r\n  2\r\nSTANDARD\r\n  70\r\n0\r\n 40\r\n0.0\r\n 41\r\n1.0\r\n 50\r\n0.0\r\n 71\r\n0\r\n 42\r\n0.2\r\n  3\r\ntxt\r\n  4\r\nbigfont\r\n  0\r\nENDTAB\r\n" +
           "  0\r\nTABLE\r\n  2\r\nVIEW\r\n  70\r\n0\r\n  0\r\nENDTAB\r\n" +
           "  0\r\nTABLE\r\n  2\r\nUCS\r\n  70\r\n0\r\n  0\r\nENDTAB\r\n" +
           "  0\r\nTABLE\r\n  2\r\nAPPID\r\n  70\r\n1\r\n  0\r\nAPPID\r\n  2\r\nACAD\r\n  70\r\n0\r\n  0\r\nENDTAB\r\n" +
           "  0\r\nTABLE\r\n  2\r\nDIMSTYLE\r\n  70\r\n0\r\n  0\r\nENDTAB\r\n" +
           "  0\r\nENDSEC\r\n";
    
    let blocksDxf = '  0\r\nBLOCK\r\n  8\r\n0\r\n  2\r\n*MODEL_SPACE\r\n  70\r\n0\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 30\r\n0.0\r\n  3\r\n*MODEL_SPACE\r\n  1\r\n\r\n  0\r\nENDBLK\r\n  8\r\n0\r\n' +
      '  0\r\nBLOCK\r\n  8\r\n0\r\n  2\r\n*PAPER_SPACE\r\n  70\r\n0\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 30\r\n0.0\r\n  3\r\n*PAPER_SPACE\r\n  1\r\n\r\n  0\r\nENDBLK\r\n  8\r\n0\r\n';
    let labelsEntitiesDxf = "";

    const addDecoBlock = (name, entities) => {
       blocksDxf += `  0\r\nBLOCK\r\n  8\r\n0\r\n  2\r\n${name}\r\n  70\r\n0\r\n  10\r\n0.0\r\n  20\r\n0.0\r\n  30\r\n0.0\r\n  3\r\n${name}\r\n  1\r\n\r\n`;
       blocksDxf += entities;
       blocksDxf += "  0\r\nENDBLK\r\n  8\r\n0\r\n";
    };

    addDecoBlock("DECO_HIGE", `  0\r\nLINE\r\n  8\r\n0\r\n 10\r\n0.0\r\n 20\r\n0.0\r\n 30\r\n0.0\r\n 11\r\n1.0\r\n 21\r\n0.0\r\n 31\r\n0.0\r\n`);
    addDecoBlock("DECO_TRIANGLE", dxfCreateLines([{x: 1.0, y: 0.0}, {x: -0.5, y: -0.866}, {x: -0.5, y: 0.866}], true, "0", 0));
    addDecoBlock("DECO_CROSS", `  0\r\nLINE\r\n  8\r\n0\r\n 10\r\n-1.0\r\n 20\r\n1.0\r\n 30\r\n0.0\r\n 11\r\n1.0\r\n 21\r\n-1.0\r\n 31\r\n0.0\r\n  0\r\nLINE\r\n  8\r\n0\r\n 10\r\n-1.0\r\n 20\r\n-1.0\r\n 30\r\n0.0\r\n 11\r\n1.0\r\n 21\r\n1.0\r\n 31\r\n0.0\r\n`);
    addDecoBlock("DECO_SOLID_CIRCLE", dxfCreateCircle(0, 0, 1.0, "0", 7));
    addDecoBlock("DECO_ANGLE_BRACKET", dxfCreateLines([{x:-0.8, y:0.4}, {x:-1.0, y:0.0}, {x:-0.8, y:-0.4}], false, "0", 0) + dxfCreateLines([{x:0.8, y:0.4}, {x:1.0, y:0.0}, {x:0.8, y:-0.4}], false, "0", 0));
    addDecoBlock("DECO_MEGANE", dxfCreateCircle(-1.5, 0, 0.25, "0", 5) + dxfCreateCircle(1.5, 0, 0.25, "0", 5) + `  0\r\nARC\r\n  8\r\n0\r\n 10\r\n0.0\r\n 20\r\n-1.3125\r\n 30\r\n0.0\r\n 40\r\n1.8125\r\n 50\r\n46.397\r\n 51\r\n133.603\r\n`);

    let polyEntitiesDxf = "";
    const drawnLabels = new Set();
    
    currentPolygons.forEach((poly, idx) => {
      polyEntitiesDxf += dxfCreatePath(poly.pathData, poly.isCustom ? "POLYGONS_CUSTOM" : "POLYGONS", poly.isCustom ? 4 : 3);
      if (poly.center) {
        const labelKey = `${poly.center.x}_${poly.center.y}_${poly.chiban}`;
        if (!drawnLabels.has(labelKey)) {
          drawnLabels.add(labelKey);
          
          const override = currentChibanOverrides[poly.id] || { dx: 0, dy: 0, scale: 1.0, visible: true };
          if (override.visible !== false) {
             const labelBlockName = `LABEL_BLOCK_${idx}`;
             
             const fSize = (viewBox.w / 150) * decorationScale * 0.72 * (override.scale ?? 1.0);
             const finalCx = poly.center.x + (override.dx || 0), finalCy = poly.center.y + (override.dy || 0);
             const insertCx = finalCx, insertCy = finalCy;
             
             let blockEntities = "";
             if (poly.chimoku) {
               const charW = fSize * 0.55, chibanW = poly.chiban.length * charW, circleR = fSize * 0.65, gap = fSize * 0.2, totalW = circleR * 2 + gap + chibanW;
               const startX = -totalW / 2, circleCx = startX + circleR, textStartX = startX + circleR * 2 + gap;
               const rectX = startX - fSize * 0.4, rectY = -fSize * 0.85, rectW = totalW + fSize * 0.8, rectH = fSize * 1.7;
               blockEntities += dxfCreateSolid(rectX, rectY, rectX, rectY + rectH, rectX + rectW, rectY, rectX + rectW, rectY + rectH, "LABELS_BG", 255);
               blockEntities += dxfCreateLines([{x: rectX, y: rectY}, {x: rectX+rectW, y: rectY}, {x: rectX+rectW, y: rectY+rectH}, {x: rectX, y: rectY+rectH}], true, "LABELS", poly.isCustom ? 4 : 7);
               blockEntities += dxfCreateCircle(circleCx, 0, circleR, "LABELS", poly.isCustom ? 4 : 7);
               blockEntities += dxfCreateText(poly.chimoku.charAt(0), circleCx, 0, fSize * 0.75, "LABELS", poly.isCustom ? 4 : 7);
               blockEntities += dxfCreateText(poly.chiban, textStartX + chibanW / 2, 0, fSize, "LABELS", poly.isCustom ? 4 : 7);
             } else {
               const charW = fSize * 0.8, textW = poly.chiban.length * charW, rectW = textW + fSize, rectH = fSize * 1.5, rectX = -rectW / 2, rectY = -rectH / 2;
               blockEntities += dxfCreateSolid(rectX, rectY, rectX, rectY + rectH, rectX + rectW, rectY, rectX + rectW, rectY + rectH, "LABELS_BG", 255);
               blockEntities += dxfCreateText(poly.chiban, 0, 0, fSize, "LABELS", poly.isCustom ? 4 : 7);
             }
             
             blocksDxf += `  0\r\nBLOCK\r\n  8\r\n0\r\n  2\r\n${labelBlockName}\r\n  70\r\n0\r\n  10\r\n0.0\r\n  20\r\n0.0\r\n  30\r\n0.0\r\n  3\r\n${labelBlockName}\r\n`;
             blocksDxf += blockEntities;
             blocksDxf += "  0\r\nENDBLK\r\n  8\r\n0\r\n";
             labelsEntitiesDxf += dxfCreateInsert(labelBlockName, insertCx, insertCy, 1.0, 0, "LABELS", 7);
          }
        }
      }
    });

    regionLabels.forEach((region, idx) => {
      if (!region.visible) return;
      const text = region.text;
      const fSize = (viewBox.w / 150) * decorationScale * 0.72 * 1.5 * region.scale;
      const rectW = text.length * fSize + fSize;
      const rectH = fSize * 1.5;
      
      let defaultOffsetY = 0;
      if (region.groupHasBoth) {
         defaultOffsetY = region.isOaza ? -(fSize * 1.6) / 2 : (fSize * 1.6) / 2;
      }
      
      const finalCx = region.cx;
      const finalCy = region.cy + defaultOffsetY;
      
      const rectX = -rectW / 2;
      const rectY = -rectH / 2;
      const regionBlockName = `REGION_LABEL_BLOCK_${idx}`;
      
      blocksDxf += `  0\r\nBLOCK\r\n  8\r\n0\r\n  2\r\n${regionBlockName}\r\n  70\r\n0\r\n  10\r\n0.0\r\n  20\r\n0.0\r\n  30\r\n0.0\r\n  3\r\n${regionBlockName}\r\n  1\r\n\r\n`;
      blocksDxf += dxfCreateSolid(rectX, rectY, rectX, rectY + rectH, rectX + rectW, rectY, rectX + rectW, rectY + rectH, "REGION_LABELS_BG", 255);
      blocksDxf += dxfCreateLines([{x: rectX, y: rectY}, {x: rectX+rectW, y: rectY}, {x: rectX+rectW, y: rectY+rectH}, {x: rectX, y: rectY+rectH}], true, "REGION_LABELS", 7);
      blocksDxf += dxfCreateText(text, 0, 0, fSize, "REGION_LABELS", 7); 
      blocksDxf += "  0\r\nENDBLK\r\n  8\r\n0\r\n";
      labelsEntitiesDxf += dxfCreateInsert(regionBlockName, finalCx, finalCy, 1.0, 0, "REGION_LABELS", 7);
    });

    dxf += "  0\r\nENDTAB\r\n  0\r\nENDSEC\r\n  0\r\nSECTION\r\n  2\r\nBLOCKS\r\n";
    dxf += blocksDxf;
    dxf += "  0\r\nENDSEC\r\n  0\r\nSECTION\r\n  2\r\nENTITIES\r\n";
    dxf += `  0\r\nLINE\r\n  8\r\nORIGIN_CROSS\r\n 62\r\n1\r\n 10\r\n-50.0000\r\n 20\r\n0.0000\r\n 30\r\n0.0\r\n 11\r\n50.0000\r\n 21\r\n0.0000\r\n 31\r\n0.0\r\n  0\r\nLINE\r\n  8\r\nORIGIN_CROSS\r\n 62\r\n1\r\n 10\r\n0.0000\r\n 20\r\n-50.0000\r\n 30\r\n0.0\r\n 11\r\n0.0000\r\n 21\r\n50.0000\r\n 31\r\n0.0\r\n`;

    lines.forEach(line => {
      dxf += dxfCreateLines(line, false, "BASE_LINES", 8);
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

    dxf += labelsEntitiesDxf + "  0\r\nENDSEC\r\n  0\r\nEOF\r\n";
    // Normalize all newlines to strictly CRLF for strict CAD compatibility
    const finalDxf = dxf.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    const blob = new Blob([finalDxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = (fileInfo?.name ? fileInfo.name.replace(".xml", "") : "export") + "_map.dxf";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [currentPolygons, currentAppliedGroups, lines, viewBox.w, fileInfo, decorationScale, regionLabels, currentChibanOverrides]);

  return { exportToDXF };
}
