import React from 'react';

export const FreeTextLayer = ({
  currentFreeTexts,
  selectedDeco,
  dragDecoOverride,
  viewBox,
  mode,
  handleFreeTextMouseDown,
}) => {
  if (!currentFreeTexts) return null;

  return (
    <>
      {currentFreeTexts.map((ft) => {
        const isSelected = selectedDeco?.type === 'freetext' && selectedDeco.id === ft.id;
        const isDragging = dragDecoOverride?.type === 'freetext' && dragDecoOverride.id === ft.id;
        const cx = isDragging && dragDecoOverride.cx !== undefined ? dragDecoOverride.cx : ft.cx;
        const cy = isDragging && dragDecoOverride.cy !== undefined ? dragDecoOverride.cy : ft.cy;
        const scale = isDragging && dragDecoOverride.scale !== undefined ? dragDecoOverride.scale : (ft.scale || 1.0);

        const sw = viewBox.w / 1000;
        const fSize = (viewBox.w / 150) * scale * 0.72;

        if (ft.type === 'general') {
          const textStr = ft.text1 || '';
          let displayLen = 0;
          for (let i = 0; i < textStr.length; i++) displayLen += textStr.charCodeAt(i) > 255 ? 1.0 : 0.55;
          const boxWidth = Math.max(fSize * 2, displayLen * fSize + fSize * 0.5);
          const boxHeight = fSize * 1.5;
          return (
            <g
              key={ft.id}
              transform={`translate(${cx}, ${cy})`}
              style={{ cursor: mode === 'edit_deco' ? 'move' : 'default', pointerEvents: 'auto' }}
              onMouseDown={(e) => mode === 'edit_deco' && handleFreeTextMouseDown(e, ft, 'move')}
              onClick={(e) => e.stopPropagation()}
            >
              <rect x={-boxWidth / 2} y={-boxHeight / 2} width={boxWidth} height={boxHeight} fill="#ffffff" stroke={isSelected ? "#10b981" : "#3f3f46"} strokeWidth={sw} strokeDasharray={isSelected ? `${sw * 2} ${sw * 2}` : "none"} />
              <text x={0} y={fSize * 0.35} fill="#3f3f46" fontSize={fSize} fontWeight="bold" textAnchor="middle" pointerEvents="none">{ft.text1}</text>
              {isSelected && mode === 'edit_deco' && (
                <circle cx={boxWidth / 2} cy={-boxHeight / 2} r={fSize * 0.3} fill="white" stroke="#10b981" strokeWidth={sw} style={{ cursor: 'ne-resize' }} onMouseDown={(e) => { e.stopPropagation(); handleFreeTextMouseDown(e, ft, 'scale'); }} />
              )}
            </g>
          );
        } else if (ft.type === 'chiban') {
          const chimoku = ft.text1 || '';
          const chiban = ft.text2 || '';
          const charW = fSize * 0.55;
          const chibanW = chiban.length * charW;
          const circleR = fSize * 0.65;
          const gap = fSize * 0.2;
          const totalW = circleR * 2 + gap + chibanW;

          const startX = -totalW / 2;
          const circleCx = startX + circleR;
          const textStartX = startX + circleR * 2 + gap;
          const rectX = startX - fSize * 0.4;
          const rectY = -fSize * 0.85;
          const rectW = totalW + fSize * 0.8;
          const rectH = fSize * 1.7;

          return (
            <g
              key={ft.id}
              transform={`translate(${cx}, ${cy})`}
              style={{ cursor: mode === 'edit_deco' ? 'move' : 'default', pointerEvents: 'auto' }}
              onMouseDown={(e) => mode === 'edit_deco' && handleFreeTextMouseDown(e, ft, 'move')}
              onClick={(e) => e.stopPropagation()}
            >
              <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="#ffffff" stroke={isSelected ? "#10b981" : "#3f3f46"} strokeWidth={sw} strokeDasharray={isSelected ? `${sw * 2} ${sw * 2}` : "none"} />
              <circle cx={circleCx} cy={0} r={circleR} fill="none" stroke={isSelected ? "#10b981" : "#3f3f46"} strokeWidth={sw} strokeDasharray={isSelected ? `${sw * 2} ${sw * 2}` : "none"} />
              <text x={circleCx} y={fSize * 0.05} fontSize={fSize * 0.75} fill="#3f3f46" fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{chimoku ? chimoku.charAt(0) : ''}</text>
              <text x={textStartX} y={fSize * 0.05} fontSize={fSize} fill="#3f3f46" fontWeight="bold" textAnchor="start" dominantBaseline="central" pointerEvents="none">{chiban}</text>

              {isSelected && mode === 'edit_deco' && (
                <circle cx={rectX + rectW} cy={rectY} r={fSize * 0.3} fill="white" stroke="#10b981" strokeWidth={sw} style={{ cursor: 'ne-resize' }} onMouseDown={(e) => { e.stopPropagation(); handleFreeTextMouseDown(e, ft, 'scale'); }} />
              )}
            </g>
          );
        }
        return null;
      })}
    </>
  );
};
