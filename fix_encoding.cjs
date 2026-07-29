const fs = require('fs');
const files = ['src/App.jsx', 'src/hooks/useExportDXF.js', 'src/hooks/useMapTools.js'];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/decorationScale \* 1\.2/g, 'decorationScale * 0.72');
  fs.writeFileSync(f, content, 'utf8');
});