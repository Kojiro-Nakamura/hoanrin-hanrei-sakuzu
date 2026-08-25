import React from 'react';
import { LINE_STYLES, DECO_PATTERNS } from '../constants';

export const LegendGroup = ({ group, scale, mode, activeDeco, selectedDeco, onDecoMouseDown, dragDecoOverride, isHovered }) => {
  const sw = scale / 1000; 
  const maxShapeSw = 0.2, maxHigeSw = 0.3;
  const lineSw = sw * 1.2, shapeSw = Math.min(sw * 1.2, maxShapeSw), higeSw = Math.min(sw * 1.5, maxHigeSw);
  const { lineStyleId, styleId, pathData, innerPathData, innerPathData2, decorations, higePath, shapePath } = group;

  const effectiveLineStyle = lineStyleId || styleId;

  const renderBaseLine = () => {
    if (effectiveLineStyle === 'none') return null; 
    
    switch(effectiveLineStyle) {
      case 'double': 
      case 'style1': 
        if (!innerPathData) {
          return (
            <g pointerEvents="none">
              <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={sw * 3} strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathData} fill="none" stroke="#ffffff" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        }
        return (
          <g pointerEvents="none">
            <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
            <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      case 'double_dashed': 
        return (
          <g pointerEvents="none">
             <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
             {innerPathData && <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeDasharray={`${sw * 4} ${sw * 3}`} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        );
      case 'single_inner':
        return (
          <g pointerEvents="none">
            <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
            {innerPathData && <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw * 0.8} strokeDasharray={`${sw * 4} ${sw * 2} ${sw * 1} ${sw * 2} ${sw * 1} ${sw * 2}`} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        );
      case 'double_inner':
        if (!innerPathData2) {
          return (
            <g pointerEvents="none">
              <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={sw * 3} strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathData} fill="none" stroke="#ffffff" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
              {innerPathData && <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw * 0.8} strokeDasharray={`${sw * 4} ${sw * 2} ${sw * 1} ${sw * 2} ${sw * 1} ${sw * 2}`} strokeLinecap="round" strokeLinejoin="round" />}
            </g>
          );
        }
        return (
          <g pointerEvents="none">
            <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" />
            {innerPathData && <path d={innerPathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" /> }
            {innerPathData2 && <path d={innerPathData2} fill="none" stroke="#dc2626" strokeWidth={lineSw * 0.8} strokeDasharray={`${sw * 4} ${sw * 2} ${sw * 1} ${sw * 2} ${sw * 1} ${sw * 2}`} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        );
      case 'dashed': 
      case 'style2':
        return <path d={pathData} fill="none" pointerEvents="none" stroke="#2563eb" strokeWidth={lineSw} strokeDasharray={`${sw * 4} ${sw * 4}`} strokeLinecap="round" strokeLinejoin="round" />;
      case 'dashdot': 
      case 'style3':
        return <path d={pathData} fill="none" pointerEvents="none" stroke="#16a34a" strokeWidth={lineSw} strokeDasharray={`${sw * 6} ${sw * 2} ${sw} ${sw * 2}`} strokeLinecap="round" strokeLinejoin="round" />;
      case 'yellow_thick': 
      case 'style4':
        return <path d={pathData} fill="none" pointerEvents="none" stroke="#eab308" strokeWidth={sw * 2.5} strokeOpacity={0.8} strokeLinecap="round" strokeLinejoin="round" />;
      case 'dotted': 
      case 'style5':
        return <path d={pathData} fill="none" pointerEvents="none" stroke="#9333ea" strokeWidth={lineSw} strokeDasharray={`0 ${sw * 3}`} strokeLinecap="round" strokeLinejoin="round" />;
      case 'single':
      default: 
        if (styleId && !lineStyleId) {
            return <path d={pathData} fill="none" stroke="#2563eb" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />;
        }
        return <path d={pathData} fill="none" stroke="#dc2626" strokeWidth={lineSw} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />;
    }
  };

  return (
    <g>
      {isHovered && (
        <g pointerEvents="none" opacity="0.4">
           <path d={pathData} fill="none" stroke="#facc15" strokeWidth={sw * 15} strokeLinecap="round" strokeLinejoin="round" />
           {innerPathData && <path d={innerPathData} fill="none" stroke="#facc15" strokeWidth={sw * 15} strokeLinecap="round" strokeLinejoin="round" />}
           {innerPathData2 && <path d={innerPathData2} fill="none" stroke="#facc15" strokeWidth={sw * 15} strokeLinecap="round" strokeLinejoin="round" />}
        </g>
      )}
      {renderBaseLine()}
      
      {decorations && decorations.map(d => {
        const isActive = selectedDeco?.type === 'deco' && selectedDeco?.groupId === group.id && selectedDeco?.decoId === d.id;
        const isInteractive = mode === 'edit_deco';
        
        const isDragOverride = dragDecoOverride && dragDecoOverride.groupId === group.id && dragDecoOverride.decoId === d.id;
        const currentCx = isDragOverride && dragDecoOverride.cx !== undefined ? dragDecoOverride.cx : d.cx;
        const currentCy = isDragOverride && dragDecoOverride.cy !== undefined ? dragDecoOverride.cy : d.cy;
        const currentAngle = isDragOverride && dragDecoOverride.angle !== undefined ? dragDecoOverride.angle : d.angle;

        let pathStr = "";
        if (d.type === 'hige') { pathStr = `M 0 0 L ${d.hLen} 0`; }
        else if (d.type === 'circle') {
          pathStr = `M ${d.r} 0 `;
          for (let k = 1; k < 16; k++) pathStr += `L ${d.r * Math.cos((k / 16) * Math.PI * 2)} ${d.r * Math.sin((k / 16) * Math.PI * 2)} `;
          pathStr += "Z";
        } 
        else if (d.type === 'triangle') pathStr = `M ${d.r} 0 L ${-d.r*0.5} ${-d.r*0.866} L ${-d.r*0.5} ${d.r*0.866} Z`;
        else if (d.type === 'cross') pathStr = `M ${-d.r} ${-d.r} L ${d.r} ${d.r} M ${-d.r} ${d.r} L ${d.r} ${-d.r}`;
        else if (d.type === 'solid_circle') {
          pathStr = `M ${d.r} 0 `;
          for (let k = 1; k < 16; k++) pathStr += `L ${d.r * Math.cos((k / 16) * Math.PI * 2)} ${d.r * Math.sin((k / 16) * Math.PI * 2)} `;
          pathStr += "Z";
        }
        else if (d.type === 'angle_bracket') {
          pathStr = `M ${-d.r*0.8} ${d.r*0.4} L ${-d.r} 0 L ${-d.r*0.8} ${-d.r*0.4} M ${d.r*0.8} ${d.r*0.4} L ${d.r} 0 L ${d.r*0.8} ${-d.r*0.4}`;
          pathStr += ` M ${d.r * 0.1} 0 A ${d.r * 0.1} ${d.r * 0.1} 0 1 1 ${d.r * 0.1} -0.001`; 
        }
        else if (d.type === 'megane') {
          const circleR = d.scale * 0.25, distFromCenter = d.scale * 1.5;
          const leftCx = -distFromCenter, rightCx = distFromCenter;
          const rx = distFromCenter - circleR, ry = rx * 0.4;
          pathStr = `M ${leftCx} ${circleR} A ${circleR} ${circleR} 0 1 1 ${leftCx} ${-circleR} A ${circleR} ${circleR} 0 1 1 ${leftCx} ${circleR} M ${rightCx} ${circleR} A ${circleR} ${circleR} 0 1 1 ${rightCx} ${-circleR} A ${circleR} ${circleR} 0 1 1 ${rightCx} ${circleR} M ${leftCx + circleR} 0 A ${rx} ${ry} 0 0 1 ${rightCx - circleR} 0`;
        }
        
        return (
          <g key={d.id} className="deco-group" transform={`translate(${currentCx}, ${currentCy}) rotate(${currentAngle})`}
             onMouseDown={(e) => { if (isInteractive) { e.stopPropagation(); onDecoMouseDown(e, group.id, d, 'move'); } }}
             style={{ cursor: isInteractive ? 'move' : 'default', pointerEvents: isInteractive ? 'auto' : 'none' }}>
            {isInteractive && <path d={pathStr} fill="transparent" stroke="transparent" strokeWidth={sw * 20} />}
            {isHovered && <path d={pathStr} fill="none" stroke="#facc15" strokeWidth={sw * 15} opacity="0.4" pointerEvents="none" strokeLinecap="round" strokeLinejoin="round" />}
            <path d={pathStr} fill={d.type === 'solid_circle' ? "#3f3f46" : "none"} stroke={d.type==='hige'?"#dc2626":d.type==='solid_circle'?"#3f3f46":d.type==='triangle'?"#10b981":"#2563eb"} strokeWidth={d.type==='hige'?higeSw:shapeSw} strokeLinecap="round" strokeLinejoin="round" />
            {isActive && isInteractive && (
              <path d={pathStr} fill="none" stroke="#ca8a04" strokeWidth={sw * 3.5} opacity="0.4" pointerEvents="none" />
            )}
            {isInteractive && selectedDeco?.decoId === d.id && (
              <g>
                 <line x1={d.r || d.hLen || d.scale*2.5} y1={0} x2={(d.r || d.hLen || d.scale*2.5) + scale/60} y2={0} stroke="#10b981" strokeWidth={sw*1.5} strokeDasharray={`${sw*2} ${sw*2}`} pointerEvents="none" />
                 <circle cx={(d.r || d.hLen || d.scale*2.5) + scale/60} cy={0} r={scale/150} fill="#10b981" stroke="#ffffff" strokeWidth={sw*0.5} cursor="crosshair" className="rotate-handle" onMouseDown={(e) => { e.stopPropagation(); onDecoMouseDown(e, group.id, d, 'rotate'); }} />
              </g>
            )}
          </g>
        )
      })}
      
      {!decorations && higePath && (
        <>
          {isHovered && <path d={higePath} fill="none" stroke="#facc15" strokeWidth={sw * 15} opacity="0.4" pointerEvents="none" strokeLinecap="round" strokeLinejoin="round" />}
          <path d={higePath} fill="none" stroke="#dc2626" strokeWidth={higeSw} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
        </>
      )}
      {!decorations && shapePath && (
        <>
          {isHovered && <path d={shapePath} fill="none" stroke="#facc15" strokeWidth={sw * 15} opacity="0.4" pointerEvents="none" strokeLinecap="round" strokeLinejoin="round" />}
          <path d={shapePath} fill="none" stroke="#2563eb" strokeWidth={shapeSw} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
        </>
      )}
    </g>
  )
};

