export const dxfCreateText = (text, x, y, height, layer="0", color=7) => {
  const escapedText = String(text).split('').map(c => {
    const code = c.charCodeAt(0);
    return code > 127 ? '\\U+' + code.toString(16).toUpperCase().padStart(4, '0') : c;
  }).join('');
  return `  0\r\nTEXT\r\n  8\r\n${layer}\r\n 62\r\n${color}\r\n 10\r\n${x.toFixed(4)}\r\n 20\r\n${(-y).toFixed(4)}\r\n 30\r\n0.0\r\n 40\r\n${height.toFixed(4)}\r\n  1\r\n${escapedText}\r\n 72\r\n1\r\n 11\r\n${x.toFixed(4)}\r\n 21\r\n${(-y).toFixed(4)}\r\n 31\r\n0.0\r\n 73\r\n2\r\n`; 
};
export const dxfCreateCircle = (cx, cy, r, layer="0", color=7) => `  0\r\nCIRCLE\r\n  8\r\n${layer}\r\n 62\r\n${color}\r\n 10\r\n${cx.toFixed(4)}\r\n 20\r\n${(-cy).toFixed(4)}\r\n 30\r\n0.0\r\n 40\r\n${r.toFixed(4)}\r\n`;
export const dxfCreateInsert = (blockName, cx, cy, scale, angleDeg, layer="0", color=7) => `  0\r\nINSERT\r\n  2\r\n${blockName}\r\n  8\r\n${layer}\r\n 62\r\n${color}\r\n 10\r\n${cx.toFixed(4)}\r\n 20\r\n${(-cy).toFixed(4)}\r\n 30\r\n0.0\r\n 41\r\n${scale.toFixed(4)}\r\n 42\r\n${scale.toFixed(4)}\r\n 43\r\n1.0\r\n 50\r\n${(-angleDeg).toFixed(4)}\r\n`;
export const dxfCreateSolid = (x1, y1, x2, y2, x3, y3, x4, y4, layer="0", color=7) => `  0\r\nSOLID\r\n  8\r\n${layer}\r\n 62\r\n${color}\r\n 10\r\n${x1.toFixed(4)}\r\n 20\r\n${(-y1).toFixed(4)}\r\n 30\r\n0.0\r\n 11\r\n${x2.toFixed(4)}\r\n 21\r\n${(-y2).toFixed(4)}\r\n 31\r\n0.0\r\n 12\r\n${x3.toFixed(4)}\r\n 22\r\n${(-y3).toFixed(4)}\r\n 32\r\n0.0\r\n 13\r\n${x4.toFixed(4)}\r\n 23\r\n${(-y4).toFixed(4)}\r\n 33\r\n0.0\r\n`;
export const dxfCreateLines = (pts, closed, layer, color) => {
  let res = "";
  if (pts.length < 2) return res;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i+1];
    res += `  0\r\nLINE\r\n  8\r\n${layer}\r\n 62\r\n${color}\r\n 10\r\n${p1.x.toFixed(4)}\r\n 20\r\n${(-p1.y).toFixed(4)}\r\n 30\r\n0.0\r\n 11\r\n${p2.x.toFixed(4)}\r\n 21\r\n${(-p2.y).toFixed(4)}\r\n 31\r\n0.0\r\n`;
  }
  if (closed) {
    const p1 = pts[pts.length - 1], p2 = pts[0];
    res += `  0\r\nLINE\r\n  8\r\n${layer}\r\n 62\r\n${color}\r\n 10\r\n${p1.x.toFixed(4)}\r\n 20\r\n${(-p1.y).toFixed(4)}\r\n 30\r\n0.0\r\n 11\r\n${p2.x.toFixed(4)}\r\n 21\r\n${(-p2.y).toFixed(4)}\r\n 31\r\n0.0\r\n`;
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