import React from 'react';
import { Paintbrush, MousePointerClick, Scissors, RefreshCw, Edit3, Trash2 } from 'lucide-react';
import { LINE_STYLES, DECO_PATTERNS } from '../constants';

export const ToolPanel = ({ mode, setMode, selectedPolygons, polygons, appliedGroups, onApplyStyle, onApplyMegane, onApplyChimoku, onRemoveFeature, onRemoveGroup, onClearSelection, selectedLineStyle, setSelectedLineStyle, selectedDecoPattern, setSelectedDecoPattern, decorationScale, setDecorationScale }) => (
  <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md w-[350px] rounded-xl shadow-lg border border-neutral-200 p-4 z-20 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
    
    <div className="flex items-center gap-2 border-b border-neutral-100 pb-2 shrink-0">
      <Paintbrush className="w-5 h-5 text-indigo-600" />
      <h3 className="font-bold text-neutral-800">保安林凡例・作図ツール</h3>
    </div>
    
    <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg shrink-0">
      <button onClick={() => setMode('select')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='select'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><MousePointerClick className="w-3 h-3"/> 選択</button>
      <button onClick={() => setMode('draw')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='draw'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><Scissors className="w-3 h-3"/> 作図</button>
      <button onClick={() => setMode('edit_deco')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='edit_deco'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><RefreshCw className="w-3 h-3"/> 装飾調整</button>
    </div>

    <div className="text-sm text-neutral-600 shrink-0">
      <p className={`flex items-center gap-1.5 p-2.5 rounded border ${mode === 'select' || mode === 'edit_deco' ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-blue-600 bg-blue-50 border-blue-100'}`}>
        {mode === 'select' ? <MousePointerClick className="w-4 h-4 shrink-0"/> : mode === 'edit_deco' ? <RefreshCw className="w-4 h-4 shrink-0"/> : <Edit3 className="w-4 h-4 shrink-0"/>}
        <span>
          {mode === 'select' ? '地図をクリックして筆を選択' : mode === 'edit_deco' ? '記号・文字をドラッグで移動' : '線を引いて分割、始点に戻ると面で抜取'}
          <br/><span className="text-[10px] opacity-80">{mode === 'select' ? '（複数選択できます）' : mode === 'edit_deco' ? '（緑のハンドルで回転・拡縮、Deleteで削除）' : '（同じ点クリック・Enterで完了、右クリックで戻る）'}</span>
        </span>
      </p>
      {selectedPolygons.length > 0 && mode === 'select' && (
        <button 
          onClick={onClearSelection} 
          className="mt-2 w-full py-1.5 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded shadow transition-colors text-xs flex items-center justify-center gap-1"
        >
          選択をすべて解除
        </button>
      )}
    </div>

    <div className="flex flex-col gap-3 shrink-0">
      
      <div className={`flex flex-col gap-2 bg-neutral-50 p-3 rounded-lg border border-neutral-100 shadow-inner transition-opacity ${selectedPolygons.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-[11px] font-bold text-neutral-600">地目の設定 (丸囲み)</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: '保安林', value: '保' }, { label: '山林', value: '山' }, { label: '道路', value: '道' },
            { label: '田', value: '田' }, { label: '畑', value: '畑' }, { label: '宅地', value: '宅' },
            { label: '原野', value: '原' }, { label: '雑種地', value: '雑' }, { label: '墓地', value: '墓' }
          ].map(item => (
            <button key={item.label} onClick={() => onApplyChimoku(item.value)} title={`「${item.value}」を設定`} className="h-7 px-2 flex items-center justify-center text-[11px] font-bold bg-white border border-neutral-300 rounded hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors shadow-sm">{item.label}</button>
          ))}
          <div className="flex items-center gap-1.5 ml-auto">
             <span className="text-[10px] text-neutral-500">その他:</span>
             <input type="text" maxLength={1} className="w-8 h-7 text-xs text-center border border-neutral-300 rounded outline-none focus:border-indigo-500 shadow-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value) { onApplyChimoku(e.target.value); e.target.value = ''; } }} />
             <button 
                onClick={() => onApplyChimoku(null)} 
                className={`h-7 px-2 text-[10px] font-bold bg-white border rounded transition-colors shadow-sm ${selectedPolygons.some(id => polygons.find(p => p.id === id)?.chimoku) ? 'text-neutral-800 border-neutral-400 hover:bg-neutral-200' : 'text-neutral-400 border-neutral-200 hover:bg-neutral-50'}`}
             >クリア</button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 bg-neutral-50 p-3 rounded-lg border border-neutral-100 shadow-inner">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-neutral-600">線の種類</label>
          <select value={selectedLineStyle} onChange={e => setSelectedLineStyle(e.target.value)} className="text-sm border border-neutral-300 rounded-md p-2 bg-white text-neutral-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm transition-shadow">
            {LINE_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 mt-2">
          <label className="text-[11px] font-bold text-neutral-600">装飾パターン</label>
          <select value={selectedDecoPattern} onChange={e => setSelectedDecoPattern(e.target.value)} className="text-sm border border-neutral-300 rounded-md p-2 bg-white text-neutral-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm transition-shadow">
            {DECO_PATTERNS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 mt-2" onWheel={(e) => { e.stopPropagation(); setDecorationScale(prev => { const p = isNaN(prev) ? 1.0 : prev; return Math.max(0.2, Math.min(2.5, Math.round((p + (e.deltaY > 0 ? -0.1 : 0.1)) * 10) / 10)); }); }}>
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-bold text-neutral-600">文字・記号のサイズ</label>
            <span className="text-[11px] text-neutral-600 font-bold">{Math.round((isNaN(decorationScale) ? 1.0 : decorationScale) * 100)}%</span>
          </div>
          <input type="range" min="0.2" max="2.5" step="0.1" value={isNaN(decorationScale) ? 1.0 : decorationScale} onChange={(e) => setDecorationScale(parseFloat(e.target.value) || 1.0)} className="w-full h-2 bg-neutral-200 rounded-lg cursor-pointer accent-indigo-600 outline-none" title="ホイールでもサイズを調整できます" />
        </div>

        <div className={`flex flex-col gap-1 mt-3 transition-opacity ${selectedPolygons.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <button onClick={() => onApplyStyle(selectedLineStyle, selectedDecoPattern)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]">
            <Paintbrush className="w-4 h-4" /> 選択中({selectedPolygons.length})に適用
          </button>

          <button onClick={onApplyMegane} className="mt-1 w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-sm">
            〇⌒〇 境界にメガネを配置
          </button>
        </div>
      </div>
    </div>

    {selectedPolygons.length > 0 && (
      <div className="text-sm text-neutral-600 shrink-0">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center bg-indigo-50 px-2 py-1.5 rounded border border-indigo-100">
             <span className="font-bold text-indigo-700">選択中: {selectedPolygons.length} 筆/要素</span>
             <button onClick={onClearSelection} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline">選択解除</button>
          </div>
          <div className="text-xs text-neutral-500 bg-neutral-50 p-2 rounded border border-neutral-100 max-h-32 overflow-y-auto flex flex-col gap-1">
            {polygons.filter(p => selectedPolygons.includes(p.id)).map(p => (
              <div key={p.id} className="flex justify-between items-center bg-white p-1.5 rounded border border-neutral-200 shadow-sm">
                <span className="font-medium text-neutral-700">{p.chiban}</span>
                {(p.isCustom || p.parentPoly) && (
                  <button onClick={() => onRemoveFeature([p.id])} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title={p.isCustom ? "完全に消去します" : "分割/くり抜きを取り消して元の面に戻します"}><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {appliedGroups.length > 0 && (
      <div className="pt-3 border-t border-neutral-200 flex flex-col gap-2 shrink-0">
        <p className="text-xs font-bold text-neutral-500">適用済みの装飾 ({appliedGroups.length})</p>
        <div className="flex flex-col gap-2">
          {appliedGroups.map(group => {
            let name = "";
            if (group.lineStyleId) {
               if (group.decoPatternId === 'megane') name = 'メガネ (境界結合)';
               else {
                  const lName = LINE_STYLES.find(l => l.id === group.lineStyleId)?.name || '';
                  const dName = DECO_PATTERNS.find(d => d.id === group.decoPatternId)?.name || 'なし';
                  name = lName + ' + ' + dName;
               }
            } else name = '旧スタイル設定'; 
            
            return (
              <div key={group.id} className="flex flex-col gap-1 text-xs bg-white p-2.5 rounded-lg border border-neutral-200 shadow-sm relative group">
                 <div className="flex items-center gap-2 mb-1 pr-6">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></div>
                    <span className="font-bold text-neutral-700 truncate">{name}</span>
                 </div>
                 <div className="text-neutral-500 leading-relaxed line-clamp-2" title={group.chibanList}>{group.polygonIds.length}筆等: {group.chibanList}</div>
                 <button onClick={() => onRemoveGroup(group.id)} className="absolute top-2 right-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors" title="削除"><Trash2 className="w-4 h-4" /></button>
              </div>
            )
          })}
        </div>
      </div>
    )}
  </div>
);