const fs = require('fs');

function fixMojibake(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix useMapData.js
  content = content.replace(/setError\("XMLまた.KMLファイルを選択してください[^\)]*\);/, 'setError("XMLまたはKMLファイルを選択してください。");');
  content = content.replace(/setError\("読み込み失[^\)]*\);/, 'setError("読み込み失敗");');
  
  // Fix dataProcessing.js
  content = content.replace(/throw new Error\("KMLの解析に失敗しました[^\)]*\);/, 'throw new Error("KMLの解析に失敗しました。");');
  content = content.replace(/chiban: chiban \|\| "不.*",/, 'chiban: chiban || "不明",');
  content = content.replace(/throw new Error\("KMLにポリゴン[^\)]*\);/, 'throw new Error("KMLにポリゴンデータが見つかりませんでした。");');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

try {
  fixMojibake('src/hooks/useMapData.js');
  fixMojibake('src/utils/dataProcessing.js');
  console.log("Fixed successfully.");
} catch (e) {
  console.error(e);
}
