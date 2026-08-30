import React from 'react';

export const RegionLabelLayer = ({
  regionLabels,
  showLabels,
  dragRegionOverride,
  labelFontSize,
  selectedDeco,
  mode,
  viewBox,
  handleRegionLabelMouseDown,
}) => {
  if (!showLabels) return null;
  return (
    <>
      {regionLabels.map((region) => {
        const text = region.text;
        const override = (dragRegionOverride && dragRegionOverride.regionKey === region.key) ? dragRegionOverride : {};
        const currentScale = override.scale !== undefined ? override.scale : region.scale;
        const fSize = labelFontSize * 1.5 * currentScale;
        const rectW = text.length * fSize + fSize;
        const rectH = fSize * 1.5;

        let defaultOffsetY = 0;
        if (region.groupHasBoth) {
          defaultOffsetY = region.isOaza ? -(fSize * 1.6) / 2 : (fSize * 1.6) / 2;
        }

        const finalCx = override.dx !== undefined ? region.baseCx + override.dx : region.cx;
        const finalCy = (override.dy !== undefined ? region.baseCy + override.dy : region.cy) + defaultOffsetY;

        const rectX = finalCx - rectW / 2;
        const rectY = finalCy - rectH / 2;

        const isActive = selectedDeco?.type === 'region_label' && selectedDeco?.id === region.key;
        const isInteractive = mode === 'edit_deco';

        return (
          <g
            key={region.key}
            pointerEvents={isInteractive ? "auto" : "none"}
            className="select-none region-label-group"
            style={{ userSelect: 'none', cursor: isInteractive ? 'move' : 'default' }}
            onMouseDown={(e) => {
              if (isInteractive) {
                e.stopPropagation();
                handleRegionLabelMouseDown(e, region.key, 'move', { x: region.baseCx, y: region.baseCy + defaultOffsetY });
              }
            }}
            onClick={(e) => {
              if (isInteractive) e.stopPropagation();
            }}
          >
            <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="#ffffff" stroke="#3f3f46" strokeWidth={fSize * 0.08} />
            <text x={finalCx} y={finalCy} fontSize={fSize} fill="#3f3f46" fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{text}</text>

            {isActive && isInteractive && (
              <>
                <rect x={rectX} y={rectY} width={rectW} height={rectH} fill="none" stroke="#ca8a04" strokeWidth={viewBox.w / 500} strokeDasharray={`${viewBox.w / 200} ${viewBox.w / 200}`} pointerEvents="none" />
                <circle cx={rectX + rectW} cy={rectY} r={fSize * 0.3} fill="white" stroke="#ca8a04" strokeWidth={viewBox.w / 500} style={{ cursor: 'ne-resize' }} onMouseDown={(e) => { e.stopPropagation(); handleRegionLabelMouseDown(e, region.key, 'scale', { x: region.baseCx, y: region.baseCy + defaultOffsetY }, currentScale); }} pointerEvents="auto" />
              </>
            )}
          </g>
        );
      })}
    </>
  );
};
