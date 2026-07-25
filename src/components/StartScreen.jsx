import React from 'react';
import { UploadCloud, CloudDownload, ExternalLink } from 'lucide-react';
import { CS_ORIGINS } from '../constants';

export function StartScreen({
  loadFile,
  startFreehandDraw,
  hasSavedData,
  handleLoadSavedData
}) {
  return (
    <div 
      className="absolute inset-0 flex flex-col items-center justify-center p-8 overflow-y-auto" 
      onDragOver={e => e.preventDefault()} 
      onDrop={e => { 
        e.preventDefault(); 
        if(e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
      }}
    >
      <label className="flex flex-col items-center justify-center w-full max-w-2xl h-96 border-2 border-indigo-300 border-dashed rounded-2xl cursor-pointer bg-white hover:bg-indigo-50 transition-colors shadow-sm">
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
          <UploadCloud className="w-16 h-16 text-indigo-400 mb-4" />
          <p className="mb-2 text-xl font-semibold text-neutral-700">地図XML・KML・作業状況ファイルをドラッグ＆ドロップ</p>
          <div className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm hover:bg-indigo-700">ファイルを選択</div>
        </div>
        <input 
          type="file" 
          multiple 
          className="hidden" 
          accept=".xml,.kml,.json" 
          onChange={e => { 
            Array.from(e.target.files).forEach(f => loadFile(f)); 
            e.target.value = ''; 
          }} 
        />
      </label>

      <div className="mt-6 flex flex-col sm:flex-row items-center gap-4 text-sm font-bold">
        <a href="https://front.geospatial.jp/moj-chizu-xml-readme/moj-chizu-xml-download/" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1">
          <ExternalLink className="w-4 h-4" /> 法務省登記所備付地図データのダウンロード
        </a>
        <span className="hidden sm:inline text-neutral-300">|</span>
        <a href="https://front.geospatial.jp/usermanager/signup" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1">
          <ExternalLink className="w-4 h-4" /> G空間情報センター新規ユーザー登録
        </a>
      </div>

      <div className="mt-8 flex flex-col items-center">
        <p className="text-sm font-bold text-neutral-700 mb-2">基準座標系 (新規作図用)</p>
        <div className="flex items-center gap-2">
          <select id="sys-select" defaultValue="6" className="border border-neutral-300 rounded p-1.5 text-sm outline-none bg-white">
             {Object.keys(CS_ORIGINS).map(k => <option key={k} value={k}>第{k}系</option>)}
          </select>
          <button 
            onClick={() => {
              const val = document.getElementById('sys-select').value;
              startFreehandDraw(parseInt(val, 10));
            }} 
            className="px-4 py-1.5 bg-neutral-600 text-white rounded text-sm font-bold shadow-sm hover:bg-neutral-700 transition-colors"
          >
            新規作図開始
          </button>
        </div>
      </div>

      {hasSavedData && (
        <div className="mt-8 flex flex-col items-center border-t border-neutral-200 pt-8 w-full max-w-lg">
          <p className="text-sm text-neutral-500 mb-3">前回ブラウザに保存された作業の続きから始める</p>
          <button 
            onClick={handleLoadSavedData} 
            className="px-6 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold shadow-sm hover:bg-indigo-100 transition-colors flex items-center gap-2"
          >
            <CloudDownload className="w-5 h-5" /> 前回の作業内容を復元する
          </button>
        </div>
      )}
    </div>
  );
}
