const fs = require('fs');

function fixMojibake(filePath) {
  let lines = fs.readFileSync(filePath, 'utf8').split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('setError') && lines[i].includes('!isXml && !isKml')) {
      lines[i] = '    if (!isXml && !isKml) return setError("XMLまたはKMLファイルを選択してください。");';
    }
    if (lines[i].includes('reader.onerror')) {
      lines[i] = '    reader.onerror = () => { setError("読み込み失敗"); setLoading(false); };';
    }
    if (lines[i].includes('throw new Error') && lines[i].includes('KML') && lines[i].includes('parsererror')) {
      lines[i] = '  if (xmlDoc.getElementsByTagName("parsererror").length > 0) throw new Error("KMLの解析に失敗しました。");';
    }
    if (lines[i].includes('chiban:') && lines[i].includes('||')) {
      lines[i] = '          chiban: chiban || "不明",';
    }
    if (lines[i].includes('throw new Error') && lines[i].includes('KML') && lines[i].includes('length === 0')) {
      lines[i] = '  if (polyList.length === 0 || finalMinX === Infinity) throw new Error("KMLにポリゴンデータが見つかりませんでした。");';
    }
  }
  
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

try {
  fixMojibake('src/hooks/useMapData.js');
  fixMojibake('src/utils/dataProcessing.js');
  console.log("Fixed successfully.");
} catch (e) {
  console.error(e);
}
