import React from 'react';
import { Paintbrush, MousePointerClick, Scissors, RefreshCw, Edit3, Trash2, Type } from 'lucide-react';
import { LINE_STYLES, DECO_PATTERNS } from '../constants';

export const ToolPanel = ({ mode, setMode, selectedPolygons, polygons, appliedGroups, onApplyStyle, onApplyMegane, onApplyChimoku, onRemoveFeature, onRemoveGroup, onUpdateCustomPolygon, onClearSelection, selectedLineStyle, setSelectedLineStyle, selectedDecoPattern, setSelectedDecoPattern, decorationScale, setDecorationScale, screenMagnification, setScreenMagnification, activeDeco, onDeleteActiveDeco, showLabels, setShowLabels, onHoverGroup, freeTextType, setFreeTextType, freeText1, setFreeText1, freeText2, setFreeText2}) => (
  <div className="absolute top-4 right-4 bottom-4 bg-white/95 backdrop-blur-md w-[280px] rounded-xl shadow-lg border border-neutral-200 p-3 z-20 flex flex-col gap-2.5 overflow-y-auto">
    
    <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg shrink-0">
      <button onClick={() => setMode('select')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='select'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><MousePointerClick className="w-3 h-3"/> 選択</button>
      <button onClick={() => setMode('draw')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='draw'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><Scissors className="w-3 h-3"/> 作図</button>
      <button onClick={() => setMode('edit_deco')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='edit_deco'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><RefreshCw className="w-3 h-3"/> 装飾調整</button>
      <button onClick={() => setMode('add_text')} className={`flex-1 py-1.5 text-[10px] sm:text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-all ${mode==='add_text'?'bg-white shadow text-indigo-700':'text-neutral-500 hover:bg-neutral-200'}`}><Type className="w-3 h-3"/> 文字追加</button>
    </div>

    <div className="flex flex-col gap-2 shrink-0">
      {mode === 'edit_deco' && (
        <div className="flex flex-col gap-1.5 bg-neutral-50 p-2 rounded-lg border border-neutral-100 shadow-inner mb-1">
          <p className="text-[11px] font-bold text-neutral-600">装飾オブジェクトの調整</p>
          <p className="text-[10px] text-neutral-500 mb-1 leading-tight">地図上の記号や文字をドラッグして位置・角度を調整できます。</p>
          {activeDeco ? (
            <button onClick={onDeleteActiveDeco} className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold text-xs py-2 px-3 rounded transition-colors flex items-center justify-center gap-1 shadow-sm">
              <Trash2 className="w-3 h-3" /> 選択中オブジェクトを削除
            </button>
          ) : (
            <div className="text-[10px] text-neutral-400 text-center py-2 bg-white rounded border border-neutral-200">オブジェクトが選択されていません</div>
          )}
        </div>
      )}
      
      
      {mode === 'add_text' && (
        <div className="flex flex-col gap-2 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100 shadow-inner mb-1">
          <p className="text-[11px] font-bold text-indigo-800">フリーテキスト追加</p>
          <div className="flex gap-2 text-[10px] sm:text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={freeTextType === 'general'} onChange={() => setFreeTextType('general')} className="w-3 h-3" />
              <span>字・一般</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={freeTextType === 'chiban'} onChange={() => setFreeTextType('chiban')} className="w-3 h-3" />
              <span>地目＋地番</span>
            </label>
          </div>
          
          {freeTextType === 'general' ? (
            <input type="text" value={freeText1} onChange={e => setFreeText1(e.target.value)} placeholder="例: 字〇〇、〇〇町" className="w-full text-xs p-1.5 border border-indigo-200 rounded outline-none focus:border-indigo-500" />
          ) : (
            <div className="flex gap-1">
              <input type="text" value={freeText1} onChange={e => setFreeText1(e.target.value)} placeholder="地目(保)" className="w-1/3 text-xs p-1.5 border border-indigo-200 rounded outline-none focus:border-indigo-500" maxLength={1} />
              <input type="text" value={freeText2} onChange={e => setFreeText2(e.target.value)} placeholder="地番(123-4)" className="w-2/3 text-xs p-1.5 border border-indigo-200 rounded outline-none focus:border-indigo-500" />
            </div>
          )}
          <p className="text-[10px] text-indigo-600 leading-tight">👆 内容を入力し、マップ上の配置したい場所をクリックしてください。</p>
        </div>
      )}

      <div className={`flex flex-col gap-1.5 bg-neutral-50 p-2 rounded-lg border border-neutral-100 shadow-inner transition-opacity ${selectedPolygons.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-[11px] font-bold text-neutral-600">地目の設定 (丸囲み)</p>
        <div className="flex flex-wrap gap-1">
          {[
            { label: '保安林', value: '保' }, { label: '山林', value: '山' }, { label: '道路', value: '道' },
            { label: '田', value: '田' }, { label: '畑', value: '畑' }, { label: '宅地', value: '宅' },
            { label: '原野', value: '原' }, { label: '雑種地', value: '雑' }, { label: '墓地', value: '墓' }
          ].map(item => (
            <button key={item.label} onClick={() => onApplyChimoku(item.value)} title={`「${item.value}」を設定`} className="h-6 px-1.5 flex items-center justify-center text-[10px] font-bold bg-white border border-neutral-300 rounded hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 transition-colors shadow-sm">{item.label}</button>
          ))}
          <div className="flex items-center gap-1 ml-auto">
             <input type="text" maxLength={1} placeholder="他" className="w-10 h-6 text-xs text-center border border-neutral-300 rounded outline-none focus:border-indigo-500 shadow-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value) { onApplyChimoku(e.target.value); e.target.value = ''; } }} />
             <button 
                onClick={() => onApplyChimoku(null)} 
                className={`h-6 px-1.5 text-[10px] font-bold bg-white border rounded transition-colors shadow-sm ${selectedPolygons.some(id => polygons.find(p => p.id === id)?.chimoku) ? 'text-neutral-800 border-neutral-400 hover:bg-neutral-200' : 'text-neutral-400 border-neutral-200 hover:bg-neutral-50'}`}
             >クリア</button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 bg-neutral-50 p-2 rounded-lg border border-neutral-100 shadow-inner">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-neutral-600">線の種類</label>
          <select value={selectedLineStyle} onChange={e => setSelectedLineStyle(e.target.value)} className="text-xs border border-neutral-300 rounded-md py-1 px-1.5 bg-white text-neutral-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm transition-shadow">
            {LINE_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 mt-1">
          <label className="text-[11px] font-bold text-neutral-600">装飾パターン</label>
          <select value={selectedDecoPattern} onChange={e => setSelectedDecoPattern(e.target.value)} className="text-xs border border-neutral-300 rounded-md py-1 px-1.5 bg-white text-neutral-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-sm transition-shadow">
            {DECO_PATTERNS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 mt-1" onWheel={(e) => { e.stopPropagation(); setDecorationScale(prev => { const p = isNaN(prev) ? 1.0 : prev; return Math.max(0.2, Math.min(2.5, Math.round((p + (e.deltaY > 0 ? -0.1 : 0.1)) * 10) / 10)); }); }}>
          <div className="flex justify-between items-center">
            <label className="text-[11px] font-bold text-neutral-600">文字・記号のサイズ (DXF)</label>
            <span className="text-[11px] text-neutral-600 font-bold">{Math.round((isNaN(decorationScale) ? 1.0 : decorationScale) * 100)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setDecorationScale(p => Math.max(0.2, Math.round(((isNaN(p) ? 1.0 : p) - 0.1) * 10) / 10))} className="w-5 h-5 flex items-center justify-center bg-white border border-neutral-300 rounded text-neutral-600 hover:bg-neutral-100 hover:border-neutral-400 transition-colors shadow-sm shrink-0 font-bold leading-none">-</button>
            <input type="range" min="0.2" max="2.5" step="0.1" value={isNaN(decorationScale) ? 1.0 : decorationScale} onChange={(e) => setDecorationScale(parseFloat(e.target.value) || 1.0)} className="w-full h-2 bg-neutral-200 rounded-lg cursor-pointer accent-indigo-600 outline-none" title="ホイールでもサイズを調整できます" />
            <button onClick={() => setDecorationScale(p => Math.min(2.5, Math.round(((isNaN(p) ? 1.0 : p) + 0.1) * 10) / 10))} className="w-5 h-5 flex items-center justify-center bg-white border border-neutral-300 rounded text-neutral-600 hover:bg-neutral-100 hover:border-neutral-400 transition-colors shadow-sm shrink-0 font-bold leading-none">+</button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mt-2 border border-blue-200 bg-blue-50/50 p-2 rounded-lg" onWheel={(e) => { e.stopPropagation(); if(showLabels){ setScreenMagnification(prev => { const p = isNaN(prev) ? 1.0 : prev; return Math.max(0.5, Math.min(1.5, Math.round((p + (e.deltaY > 0 ? -0.1 : 0.1)) * 10) / 10)); }); }}}>
          <div className="flex justify-between items-center mb-0.5">
            <label className="flex items-center gap-1.5 cursor-pointer" title="画面上で地番や文字ラベルを表示するか切り替えます（DXFには影響しません）">
              <input type="checkbox" checked={showLabels} onChange={() => setShowLabels(!showLabels)} className="w-3.5 h-3.5 accent-blue-600" />
              <span className="text-[11px] font-bold text-blue-700">画面上のラベルを表示</span>
            </label>
            <span className={`text-[11px] text-blue-700 font-bold transition-opacity ${!showLabels ? 'opacity-30' : ''}`}>{Math.round((isNaN(screenMagnification) ? 1.0 : screenMagnification) * 100)}%</span>
          </div>
          <div className={`flex items-center gap-1.5 transition-opacity ${!showLabels ? 'opacity-30 pointer-events-none' : ''}`}>
            <button onClick={() => setScreenMagnification(p => Math.max(0.5, Math.round(((isNaN(p) ? 1.0 : p) - 0.1) * 10) / 10))} className="w-5 h-5 flex items-center justify-center bg-white border border-blue-300 rounded text-blue-600 hover:bg-blue-50 transition-colors shadow-sm shrink-0 font-bold leading-none">-</button>
            <input type="range" min="0.5" max="1.5" step="0.1" value={isNaN(screenMagnification) ? 1.0 : screenMagnification} onChange={(e) => setScreenMagnification(parseFloat(e.target.value) || 1.0)} className="w-full h-2 bg-blue-200 rounded-lg cursor-pointer accent-blue-600 outline-none" title="画面上での文字の見やすさを調整します" />
            <button onClick={() => setScreenMagnification(p => Math.min(1.5, Math.round(((isNaN(p) ? 1.0 : p) + 0.1) * 10) / 10))} className="w-5 h-5 flex items-center justify-center bg-white border border-blue-300 rounded text-blue-600 hover:bg-blue-50 transition-colors shadow-sm shrink-0 font-bold leading-none">+</button>
          </div>
        </div>

        <div className={`flex flex-col gap-1 mt-1.5 transition-opacity ${selectedPolygons.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <button onClick={() => onApplyStyle(selectedLineStyle, selectedDecoPattern)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]">
            <Paintbrush className="w-4 h-4" /> 選択中({selectedPolygons.length})に適用
          </button>

          <button 
            onClick={onApplyMegane} 
            disabled={selectedPolygons.length < 2}
            className={`w-full font-bold text-sm py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-sm ${selectedPolygons.length < 2 ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed' : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700'}`}>
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
                {p.isCustom ? (
                  <div className="flex items-center gap-1.5">
                    <input type="text" value={p.chiban || ''} onChange={e => onUpdateCustomPolygon(p.id, { chiban: e.target.value })} className="w-24 px-1 py-0.5 text-xs border border-neutral-300 rounded focus:outline-none focus:border-indigo-500 font-medium text-neutral-700" placeholder="地番" />
                    <input type="text" maxLength={1} value={p.chimoku || ''} onChange={e => onUpdateCustomPolygon(p.id, { chimoku: e.target.value })} className="w-8 px-1 py-0.5 text-xs text-center border border-neutral-300 rounded focus:outline-none focus:border-indigo-500 font-medium text-neutral-700" placeholder="地目" title="地目を入力すると枠が付きます" />
                  </div>
                ) : (
                  <span className="font-medium text-neutral-700">{p.chiban}</span>
                )}
                {(p.isCustom || p.parentPoly) && (
                  <button onClick={() => onRemoveFeature([p.id])} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors shrink-0 ml-1" title={p.isCustom ? "完全に消去します" : "分割/くり抜きを取り消して元の面に戻します"}><Trash2 className="w-3.5 h-3.5" /></button>
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
          {[...appliedGroups].reverse().map(group => {
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
              <div key={group.id} className="flex flex-col gap-1 text-xs bg-white p-2.5 rounded-lg border border-neutral-200 shadow-sm relative group hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all" onMouseEnter={() => onHoverGroup && onHoverGroup(group.id)} onMouseLeave={() => onHoverGroup && onHoverGroup(null)}>
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