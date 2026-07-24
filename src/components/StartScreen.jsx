import React from 'react';
import { UploadCloud, CloudDownload } from 'lucide-react';
import { CS_ORIGINS } from '../constants';

export function StartScreen({
  loadFile,
  startFreehandDraw,
  hasSavedData,
  handleLoadSavedData
}) {
  return (
    <div 
      className="absolute inset-0 flex flex-col items-center justify-center p-8" 
      onDragOver={e => e.preventDefault()} 
      onDrop={e => { 
        e.preventDefault(); 
        if(e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
      }}
    >
      <label className="flex flex-col items-center justify-center w-full max-w-2xl h-96 border-2 border-indigo-300 border-dashed rounded-2xl cursor-pointer bg-white hover:bg-indigo-50 transition-colors shadow-sm">
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
          <UploadCloud className="w-16 h-16 text-indigo-400 mb-4" />
          <p className="mb-2 text-xl font-semibold text-neutral-700">XMLファイルをドラッグ＆ドロップ</p>
          <div className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm hover:bg-indigo-700">ファイルを選択</div>
        </div>
        <input 
          type="file" 
          multiple 
          className="hidden" 
          accept=".xml" 
          onChange={e => { 
            Array.from(e.target.files).forEach(f => loadFile(f)); 
            e.target.value = ''; 
          }} 
        />
      </label>

      <div className="mt-8 flex flex-col items-center">
        <p className="text-sm text-neutral-500 mb-2">または地理院地図からフリーハンドで作図を開始</p>
        <div className="flex items-center gap-2">
          <select id="sys-select" defaultValue="6" className="border border-neutral-300 rounded p-1.5 text-sm outline-none bg-white">
             {Object.keys(CS_ORIGINS).map(k => <option key={k} value={k}>第{k}系</option>)}
          </select>
          <button 
            onClick={() => startFreehandDraw(parseInt(document.getElementById('sys-select').value))} 
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
