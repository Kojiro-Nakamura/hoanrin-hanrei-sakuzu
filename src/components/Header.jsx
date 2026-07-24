import React from 'react';
import { Map as MapIcon, Home } from 'lucide-react';

export const Header = ({ fileInfo, coordinateSystem, onReset }) => (
  <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-neutral-200 shadow-sm z-10 shrink-0">
    <div className="flex items-center gap-2 text-indigo-700"><MapIcon className="w-6 h-6" /><h1 className="text-lg font-bold tracking-tight">法務省地図XML 凡例作図ツール</h1></div>
    {fileInfo && (
      <div className="flex items-center gap-4">
        {coordinateSystem && <span className="text-xs font-semibold px-2 py-1 bg-indigo-100 text-indigo-800 rounded">第{coordinateSystem}系</span>}
        <div className="text-sm text-neutral-500 font-medium px-3 py-1 bg-neutral-100 rounded-full">{fileInfo.name} ({fileInfo.size})</div>
        <button onClick={onReset} className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-100 rounded-md transition-colors text-sm font-bold shadow-sm" title="作業をすべて破棄して最初の画面に戻る">
          <Home className="w-4 h-4"/> 最初に戻る
        </button>
      </div>
    )}
  </header>
);

