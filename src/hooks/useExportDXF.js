import { useCallback } from 'react';
import { dxfCreateText, dxfCreateCircle, dxfCreateInsert, dxfCreateSolid, dxfCreatePath, dxfCreateLines } from '../utils/dxf';
import { parsePathToRings, calculatePolygonCenter } from '../utils/geometry';

export function useExportDXF({ currentPolygons, currentAppliedGroups, lines, viewBox, fileInfo, decorationScale, regionLabels, currentChibanOverrides }) {
  const exportToDXF = useCallback(() => {
    let dxf = "  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  0\nENDSEC\n  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n  70\n7\n";
    
    const addLayer = (name, color) => { dxf += `  0\nLAYER\n  2\n${name}\n 70\n0\n 62\n${color}\n  6\nCONTINUOUS\n`; };
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
    dxf += "  0\nENDTAB\n";
    
    let blocksDxf = "";
    let labelsEntitiesDxf = "";

    const addDecoBlock = (name, entities) => {
       blocksDxf += `  0\nBLOCK\n  8\n0\n  2\n${name}\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\n${name}\n`;
       blocksDxf += entities;
       blocksDxf += "  0\nENDBLK\n";
    };

    addDecoBlock("DECO_HIGE", `  0\nLINE\n  8\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n 11\n1.0\n 21\n0.0\n 31\n0.0\n`);
    addDecoBlock("DECO_TRIANGLE", dxfCreateLines([{x: 1.0, y: 0.0}, {x: -0.5, y: -0.866}, {x: -0.5, y: 0.866}], true, "0", 0));
    addDecoBlock("DECO_CROSS", `  0\nLINE\n  8\n0\n 10\n-1.0\n 20\n1.0\n 30\n0.0\n 11\n1.0\n 21\n-1.0\n 31\n0.0\n  0\nLINE\n  8\n0\n 10\n-1.0\n 20\n-1.0\n 30\n0.0\n 11\n1.0\n 21\n1.0\n 31\n0.0\n`);
    addDecoBlock("DECO_SOLID_CIRCLE", dxfCreateCircle(0, 0, 1.0, "0", 7));
    addDecoBlock("DECO_ANGLE_BRACKET", dxfCreateLines([{x:-0.8, y:0.4}, {x:-1.0, y:0.0}, {x:-0.8, y:-0.4}], false, "0", 0) + dxfCreateLines([{x:0.8, y:0.4}, {x:1.0, y:0.0}, {x:0.8, y:-0.4}], false, "0", 0));
    addDecoBlock("DECO_MEGANE", dxfCreateCircle(-1.5, 0, 0.25, "0", 5) + dxfCreateCircle(1.5, 0, 0.25, "0", 5) + `  0\nARC\n  8\n0\n 10\n0.0\n 20\n-1.3125\n 30\n0.0\n 40\n1.8125\n 50\n46.397\n 51\n133.603\n`);

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
             
             const fSize = (viewBox.w / 150) * decorationScale * 1.2 * (override.scale ?? 1.0);
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
             
             blocksDxf += `  0\nBLOCK\n  8\n0\n  2\n${labelBlockName}\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\n${labelBlockName}\n`;
             blocksDxf += blockEntities;
             blocksDxf += "  0\nENDBLK\n";
             labelsEntitiesDxf += dxfCreateInsert(labelBlockName, insertCx, insertCy, 1.0, 0, "LABELS", 7);
          }
        }
      }
    });

    regionLabels.forEach((region, idx) => {
      if (!region.visible) return;
      const text = region.text;
      const fSize = (viewBox.w / 150) * decorationScale * 1.2 * 1.5 * region.scale;
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
      
      blocksDxf += `  0\nBLOCK\n  8\n0\n  2\n${regionBlockName}\n  70\n0\n  10\n0.0\n  20\n0.0\n  30\n0.0\n  3\n${regionBlockName}\n`;
      blocksDxf += dxfCreateSolid(rectX, rectY, rectX, rectY + rectH, rectX + rectW, rectY, rectX + rectW, rectY + rectH, "REGION_LABELS_BG", 255);
      blocksDxf += dxfCreateLines([{x: rectX, y: rectY}, {x: rectX+rectW, y: rectY}, {x: rectX+rectW, y: rectY+rectH}, {x: rectX, y: rectY+rectH}], true, "REGION_LABELS", 7);
      blocksDxf += dxfCreateText(text, 0, 0, fSize, "REGION_LABELS", 7); 
      blocksDxf += "  0\nENDBLK\n";
      labelsEntitiesDxf += dxfCreateInsert(regionBlockName, finalCx, finalCy, 1.0, 0, "REGION_LABELS", 7);
    });

    dxf += "  0\nENDTAB\n  0\nENDSEC\n  0\nSECTION\n  2\nBLOCKS\n";
    dxf += blocksDxf;
    dxf += "  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n";
    dxf += `  0\nLINE\n  8\nORIGIN_CROSS\n 62\n1\n 10\n-50.0000\n 20\n0.0000\n 30\n0.0\n 11\n50.0000\n 21\n0.0000\n 31\n0.0\n  0\nLINE\n  8\nORIGIN_CROSS\n 62\n1\n 10\n0.0000\n 20\n-50.0000\n 30\n0.0\n 11\n0.0000\n 21\n50.0000\n 31\n0.0\n`;

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

    dxf += labelsEntitiesDxf + "  0\nENDSEC\n  0\nEOF\n";
    const blob = new Blob([dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = (fileInfo?.name ? fileInfo.name.replace(".xml", "") : "export") + "_map.dxf";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [currentPolygons, currentAppliedGroups, lines, viewBox.w, fileInfo, decorationScale, regionLabels, currentChibanOverrides]);

  return { exportToDXF };
}
