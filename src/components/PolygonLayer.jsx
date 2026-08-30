import React from 'react';

export const PolygonLayer = ({
  currentPolygons,
  selectedPolygons,
  hoveredPolygon,
  showLabels,
  dragChibanOverride,
  currentChibanOverrides,
  viewBox,
  strokeColor,
  labelFontSize,
  selectedDeco,
  mode,
  mapType,
  showMap,
  setHoveredPolygon,
  handlePolygonClick,
  handleChibanLabelMouseDown,
}) => {
  const drawnLabels = new Set();
  return (
    <>
      {currentPolygons.map((poly) => {
        const isSelected = selectedPolygons.includes(poly.id);
        const isHovered = hoveredPolygon === poly.id;
        const isCustom = poly.isCustom;
        
        let drawLabel = false;
        if (showLabels && poly.center) {
          const labelKey = `${poly.center.x}_${poly.center.y}_${poly.chiban}`;
          if (!drawnLabels.has(labelKey)) {
            drawnLabels.add(labelKey);
            drawLabel = true;
          }
        }
        
        const override = (dragChibanOverride && dragChibanOverride.polyId === poly.id)
          ? dragChibanOverride
          : (currentChibanOverrides[poly.id] || { dx: 0, dy: 0, scale: 1.0, visible: true });
          
        if (override.visible === false) drawLabel = false;

        return (
          <g key={`poly-${poly.id}`}>
            {isCustom && <path d={poly.pathData} fill={poly.isClosed === false ? "none" : "rgba(16, 185, 129, 0.05)"} stroke="#10b981" strokeWidth={viewBox.w / 800} pointerEvents="none" fillRule="evenodd" />}
            {!isCustom && (!poly.curves || poly.isModified) && <path d={poly.pathData} fill="none" stroke={strokeColor} strokeWidth={viewBox.w / (showMap ? 800 : 1000)} pointerEvents="none" fillRule="evenodd" opacity={0.8} />}
            
            {/* Selection Highlight */}
            {(isSelected || isHovered) && (
              <path
                d={poly.pathData}
                pointerEvents="none"
                fill={poly.isClosed === false ? "none" : (isSelected ? "rgba(234, 179, 8, 0.4)" : "rgba(234, 179, 8, 0.2)")}
                stroke={isSelected ? "#ca8a04" : "rgba(234, 179, 8, 0.6)"}
                strokeWidth={isSelected ? viewBox.w / 300 : viewBox.w / 600}
                strokeLinecap="round"
                strokeLinejoin="round"
                fillRule="evenodd"
              />
            )}

            {drawLabel && (() => {
              const finalCx = poly.center.x + (override.dx || 0);
              const finalCy = poly.center.y + (override.dy || 0);
              const scaledFontSize = labelFontSize * (override.scale || 1.0);
              const isActive = selectedDeco?.type === 'chiban_label' && selectedDeco?.id === poly.id;
              const isInteractive = mode === 'edit_deco';

              return (
                <g
                  pointerEvents={isInteractive ? "auto" : "none"}
                  className="select-none chiban-label-group"
                  style={{ userSelect: 'none', cursor: isInteractive ? 'move' : 'default' }}
                  onMouseDown={(e) => {
                    if (isInteractive) {
                      e.stopPropagation();
                      handleChibanLabelMouseDown(e, poly.id, 'move', poly.center);
                    }
                  }}
                >
                  {poly.chimoku ? (() => {
                    const charW = scaledFontSize * 0.55;
                    const chibanW = poly.chiban.length * charW;
                    const circleR = scaledFontSize * 0.65;
                    const gap = scaledFontSize * 0.2;
                    const totalW = circleR * 2 + gap + chibanW;
                    const startX = finalCx - totalW / 2;
                    const circleCx = startX + circleR;
                    const textStartX = startX + circleR * 2 + gap;
                    const rectX = startX - scaledFontSize * 0.4;
                    const rectY = finalCy - scaledFontSize * 0.85;
                    const rectW = totalW + scaledFontSize * 0.8;
                    const rectH = scaledFontSize * 1.7;

                    return (
                      <>
                        <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="#ffffff" stroke={isCustom ? "#059669" : "#3f3f46"} strokeWidth={scaledFontSize * 0.08} />
                        <circle cx={circleCx} cy={finalCy} r={circleR} fill="none" stroke={isCustom ? "#059669" : "#3f3f46"} strokeWidth={scaledFontSize * 0.08} />
                        <text x={circleCx} y={finalCy} fontSize={scaledFontSize * 0.75} fill={isCustom ? "#059669" : "#3f3f46"} fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{poly.chimoku.charAt(0)}</text>
                        <text x={textStartX} y={finalCy} fontSize={scaledFontSize} fill={isCustom ? "#059669" : "#3f3f46"} fontWeight="bold" textAnchor="start" dominantBaseline="central" pointerEvents="none">{poly.chiban}</text>
                        {isActive && isInteractive && (
                          <>
                            <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w / 200} ${viewBox.w / 200}`} pointerEvents="none" />
                            <circle cx={rectX + rectW} cy={rectY} r={scaledFontSize * 0.3} fill="white" stroke="#ca8a04" strokeWidth={viewBox.w / 500} style={{ cursor: 'ne-resize' }} onMouseDown={(e) => { e.stopPropagation(); handleChibanLabelMouseDown(e, poly.id, 'scale', poly.center, (override.scale || 1.0)); }} pointerEvents="auto" />
                          </>
                        )}
                      </>
                    );
                  })() : (() => {
                    const charW = scaledFontSize * 0.8;
                    const textW = poly.chiban.length * charW;
                    const rectW = textW + scaledFontSize;
                    const rectH = scaledFontSize * 1.5;
                    const rectX = finalCx - rectW / 2;
                    const rectY = finalCy - rectH / 2;
                    return (
                      <>
                        {isInteractive && <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="transparent" stroke="transparent" />}
                        <text x={finalCx} y={finalCy} fontSize={scaledFontSize} fill="none" stroke={showMap && mapType === 'seamlessphoto' ? "rgba(0, 0, 0, 0.8)" : "#ffffff"} strokeWidth={scaledFontSize * (showMap && mapType === 'seamlessphoto' ? 0.2 : 0.15)} strokeLinejoin="round" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{poly.chiban}</text>
                        <text x={finalCx} y={finalCy} fontSize={scaledFontSize} fill={isCustom ? "#059669" : (showMap && mapType === 'seamlessphoto' ? "#ffffff" : "#3f3f46")} fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{poly.chiban}</text>
                        {isActive && isInteractive && (
                          <>
                            <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w / 200} ${viewBox.w / 200}`} pointerEvents="none" />
                            <circle cx={rectX + rectW} cy={rectY} r={scaledFontSize * 0.3} fill="white" stroke="#ca8a04" strokeWidth={viewBox.w / 500} style={{ cursor: 'ne-resize' }} onMouseDown={(e) => { e.stopPropagation(); handleChibanLabelMouseDown(e, poly.id, 'scale', poly.center, (override.scale || 1.0)); }} pointerEvents="auto" />
                          </>
                        )}
                      </>
                    );
                  })()}
                </g>
              );
            })()}
            <path
              d={poly.pathData}
              fill={poly.isClosed === false ? "none" : "transparent"}
              stroke={poly.isClosed === false ? "transparent" : "none"}
              strokeWidth={poly.isClosed === false ? viewBox.w / 50 : viewBox.w / 100}
              className={`${mode === 'select' ? 'cursor-pointer' : 'cursor-crosshair'} outline-none`}
              fillRule="evenodd"
              onMouseEnter={() => { if (mode === 'select') setHoveredPolygon(poly.id); }}
              onMouseLeave={() => setHoveredPolygon(null)}
              onClick={(e) => { if (mode === 'select') handlePolygonClick(e, poly.id); }}
              pointerEvents={mode === 'edit_deco' ? 'none' : 'auto'}
            />
          </g>
        );
      })}
    </>
  );
};
