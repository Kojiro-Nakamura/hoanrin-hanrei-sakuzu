import React from 'react';
import { Map as MapIcon, Home, Download, UploadCloud } from 'lucide-react';

export const Header = ({ fileInfo, coordinateSystem, onReset, onExportDXF, onExportJSON, onLoadFile }) => (
  <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-neutral-200 shadow-sm z-10 shrink-0">
    <div className="flex items-center gap-2 text-indigo-700"><MapIcon className="w-6 h-6" /><h1 className="text-lg font-bold tracking-tight">法務省地図XML 凡例作図ツール</h1></div>
    {fileInfo && (
      <div className="flex items-center gap-4">
        {coordinateSystem && <span className="text-xs font-semibold px-2 py-1 bg-indigo-100 text-indigo-800 rounded">第{coordinateSystem}系</span>}
        <div className="text-sm text-neutral-500 font-medium px-3 py-1 bg-neutral-100 rounded-full">{fileInfo.name} ({fileInfo.size})</div>
        <button onClick={onExportJSON} className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-md transition-colors text-sm font-bold shadow-sm" title="作業状況をJSONファイルとして保存">
          <Download className="w-4 h-4" /> 作業状況保存
        </button>
        <button onClick={onExportDXF} className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-md transition-colors text-sm font-bold shadow-sm" title="DXFファイルとして保存">
          <Download className="w-4 h-4" /> DXF保存
        </button>
        <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-md transition-colors text-sm font-bold shadow-sm cursor-pointer" title="XML/KML/作業状況ファイル追加読込">
          <UploadCloud className="w-4 h-4" /> 追加読込
          <input type="file" multiple className="hidden" accept=".xml,.kml,.json" onChange={e => { Array.from(e.target.files).forEach(f => onLoadFile(f, true)); e.target.value = ''; }} />
        </label>
        <button onClick={onReset} className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-100 rounded-md transition-colors text-sm font-bold shadow-sm" title="作業をすべて破棄してリセットする">
          <Home className="w-4 h-4"/> リセット
        </button>
      </div>
    )}
  </header>
);
