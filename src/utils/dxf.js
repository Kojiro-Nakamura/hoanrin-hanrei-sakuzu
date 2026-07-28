export const dxfCreateText = (text, x, y, height, layer="0", color=7) => {
  const escapedText = String(text).split('').map(c => {
    const code = c.charCodeAt(0);
    return code > 127 ? '\\U+' + code.toString(16).toUpperCase().padStart(4, '0') : c;
  }).join('');
  return `  0\nTEXT\n  8\n${layer}\n 62\n${color}\n 10\n${x.toFixed(4)}\n 20\n${(-y).toFixed(4)}\n 30\n0.0\n 40\n${height.toFixed(4)}\n  1\n${escapedText}\n 72\n1\n 11\n${x.toFixed(4)}\n 21\n${(-y).toFixed(4)}\n 31\n0.0\n 73\n2\n`; 
};
export const dxfCreateCircle = (cx, cy, r, layer="0", color=7) => `  0\nCIRCLE\n  8\n${layer}\n 62\n${color}\n 10\n${cx.toFixed(4)}\n 20\n${(-cy).toFixed(4)}\n 30\n0.0\n 40\n${r.toFixed(4)}\n`;
export const dxfCreateInsert = (blockName, cx, cy, scale, angleDeg, layer="0", color=7) => `  0\nINSERT\n  2\n${blockName}\n  8\n${layer}\n 62\n${color}\n 10\n${cx.toFixed(4)}\n 20\n${(-cy).toFixed(4)}\n 30\n0.0\n 41\n${scale.toFixed(4)}\n 42\n${scale.toFixed(4)}\n 43\n1.0\n 50\n${(-angleDeg).toFixed(4)}\n`;
export const dxfCreateSolid = (x1, y1, x2, y2, x3, y3, x4, y4, layer="0", color=7) => `  0\nSOLID\n  8\n${layer}\n 62\n${color}\n 10\n${x1.toFixed(4)}\n 20\n${(-y1).toFixed(4)}\n 30\n0.0\n 11\n${x2.toFixed(4)}\n 21\n${(-y2).toFixed(4)}\n 31\n0.0\n 12\n${x3.toFixed(4)}\n 22\n${(-y3).toFixed(4)}\n 32\n0.0\n 13\n${x4.toFixed(4)}\n 23\n${(-y4).toFixed(4)}\n 33\n0.0\n`;
export const dxfCreateLines = (pts, closed, layer, color) => {
  let res = "";
  if (pts.length < 2) return res;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i+1];
    res += `  0\nLINE\n  8\n${layer}\n 62\n${color}\n 10\n${p1.x.toFixed(4)}\n 20\n${(-p1.y).toFixed(4)}\n 30\n0.0\n 11\n${p2.x.toFixed(4)}\n 21\n${(-p2.y).toFixed(4)}\n 31\n0.0\n`;
  }
  if (closed) {
    const p1 = pts[pts.length - 1], p2 = pts[0];
    res += `  0\nLINE\n  8\n${layer}\n 62\n${color}\n 10\n${p1.x.toFixed(4)}\n 20\n${(-p1.y).toFixed(4)}\n 30\n0.0\n 11\n${p2.x.toFixed(4)}\n 21\n${(-p2.y).toFixed(4)}\n 31\n0.0\n`;
  }
  return res;
};

export const dxfCreatePath = (pathStr, layer, color, cx = 0, cy = 0, angleDeg = 0) => {
  if (!pathStr) return "";
  let res = "";
  const rad = angleDeg * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const transform = (x, y) => ({ x: x * cos - y * sin + cx, y: x * sin + y * cos + cy });
  const tokens = pathStr.trim().split(/\s+/);
  let polylines = [], currentPolyline = null, i = 0;
  
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === 'M' || token === 'm') {
      if (currentPolyline && currentPolyline.pts.length > 0) polylines.push(currentPolyline);
      currentPolyline = { pts: [], closed: false };
      const rawX = parseFloat(tokens[i + 1]), rawY = parseFloat(tokens[i + 2]);
      if (!isNaN(rawX) && !isNaN(rawY)) currentPolyline.pts.push(transform(rawX, rawY));
      i += 3;
    } else if (token === 'L' || token === 'l') {
      const rawX = parseFloat(tokens[i + 1]), rawY = parseFloat(tokens[i + 2]);
      if (!isNaN(rawX) && !isNaN(rawY)) { if (currentPolyline) currentPolyline.pts.push(transform(rawX, rawY)); }
      i += 3;
    } else if (token === 'Z' || token === 'z') {
      if (currentPolyline) currentPolyline.closed = true;
      i += 1;
    } else { i += 1; }
  }
  if (currentPolyline && currentPolyline.pts.length > 0) polylines.push(currentPolyline);

  polylines.forEach(poly => {
    res += dxfCreateLines(poly.pts, poly.closed, layer, color);
  });
  return res;
};