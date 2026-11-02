// Ícones vetoriais desenhados em código (sem arquivos externos).
import React from "react";

type P = { name: string; size: number; color: string; accent?: string; progress?: number };

export const Icon: React.FC<P> = ({ name, size, color, accent = color, progress = 1 }) => {
  const s = size;
  const sw = Math.max(2, s * 0.06);
  const common = { fill: "none", stroke: color, strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const dash = (len: number) => ({ strokeDasharray: len, strokeDashoffset: len * (1 - progress) });
  let body: React.ReactNode;
  switch (name) {
    case "sun":
      body = (
        <g>
          <circle cx={50} cy={50} r={18} fill={accent} stroke="none" />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <line key={i} x1={50 + Math.cos(a) * 27} y1={50 + Math.sin(a) * 27} x2={50 + Math.cos(a) * 40} y2={50 + Math.sin(a) * 40} {...common} />;
          })}
        </g>
      );
      break;
    case "moon":
      body = <path d="M62 18 A34 34 0 1 0 82 66 A28 28 0 1 1 62 18 Z" fill={accent} stroke="none" />;
      break;
    case "planet":
      body = (
        <g>
          <circle cx={50} cy={50} r={22} fill={accent} stroke="none" />
          <ellipse cx={50} cy={52} rx={40} ry={11} {...common} transform="rotate(-18 50 50)" />
        </g>
      );
      break;
    case "heat":
      body = (
        <g {...common}>
          <path d="M30 80 Q22 62 34 50 Q46 38 36 20" style={dash(80)} />
          <path d="M52 80 Q44 62 56 50 Q68 38 58 20" style={dash(80)} />
          <path d="M74 80 Q66 62 78 50 Q90 38 80 20" style={dash(80)} />
        </g>
      );
      break;
    case "cold":
      body = (
        <g {...common}>
          {[0, 60, 120].map((r) => (
            <line key={r} x1={50} y1={14} x2={50} y2={86} transform={`rotate(${r} 50 50)`} />
          ))}
          <circle cx={50} cy={50} r={8} fill={accent} stroke="none" />
        </g>
      );
      break;
    case "arrow":
      body = <path d="M14 50 H80 M62 30 L84 50 L62 70" {...common} style={dash(130)} />;
      break;
    case "coin":
      body = (
        <g>
          <circle cx={50} cy={50} r={34} fill={accent} stroke="none" />
          <circle cx={50} cy={50} r={26} {...common} stroke={color} />
          <text x={50} y={62} textAnchor="middle" fontSize={34} fontWeight={800} fill={color}>
            $
          </text>
        </g>
      );
      break;
    case "chart":
      body = (
        <g {...common}>
          <path d="M16 84 H86 M16 84 V16" />
          <rect x={26} y={56} width={12} height={28} fill={accent} stroke="none" />
          <rect x={46} y={40} width={12} height={44} fill={accent} stroke="none" />
          <rect x={66} y={24} width={12} height={60} fill={accent} stroke="none" />
        </g>
      );
      break;
    case "person":
      body = (
        <g>
          <circle cx={50} cy={30} r={14} fill={accent} stroke="none" />
          <path d="M22 86 Q22 52 50 52 Q78 52 78 86 Z" fill={accent} stroke="none" />
        </g>
      );
      break;
    case "house":
      body = <path d="M16 50 L50 18 L84 50 V84 H16 Z M42 84 V62 H58 V84" {...common} fill={accent} fillOpacity={0.25} />;
      break;
    case "leaf":
      body = <path d="M20 80 Q20 24 82 18 Q78 80 20 80 Z M20 80 L58 42" {...common} fill={accent} fillOpacity={0.3} />;
      break;
    case "drop":
      body = <path d="M50 14 Q78 50 78 62 A28 28 0 0 1 22 62 Q22 50 50 14 Z" fill={accent} stroke="none" />;
      break;
    case "flame":
      body = <path d="M50 12 Q76 40 70 64 A20 22 0 0 1 30 64 Q26 46 42 34 Q44 50 52 52 Q60 36 50 12 Z" fill={accent} stroke="none" />;
      break;
    case "gear":
      body = (
        <g>
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={45} y={10} width={10} height={16} rx={3} fill={accent} transform={`rotate(${i * 45} 50 50)`} />
          ))}
          <circle cx={50} cy={50} r={26} fill={accent} />
          <circle cx={50} cy={50} r={10} fill={color} />
        </g>
      );
      break;
    case "idea":
      body = (
        <g>
          <path d="M50 14 A26 26 0 0 1 66 62 V72 H34 V62 A26 26 0 0 1 50 14 Z" fill={accent} stroke="none" />
          <path d="M38 80 H62 M42 88 H58" {...common} />
        </g>
      );
      break;
    case "check":
      body = <path d="M18 52 L40 74 L84 28" {...common} strokeWidth={sw * 1.6} style={dash(100)} />;
      break;
    case "warning":
      body = (
        <g>
          <path d="M50 12 L90 84 H10 Z" fill={accent} stroke="none" />
          <path d="M50 38 V60 M50 70 V72" stroke={color} strokeWidth={sw * 1.5} strokeLinecap="round" />
        </g>
      );
      break;
    case "clock":
      body = (
        <g {...common}>
          <circle cx={50} cy={50} r={34} fill={accent} fillOpacity={0.25} />
          <path d={`M50 50 L50 28 M50 50 L${50 + Math.cos(progress * Math.PI * 2 - Math.PI / 2) * 22} ${50 + Math.sin(progress * Math.PI * 2 - Math.PI / 2) * 22}`} />
        </g>
      );
      break;
    case "globe":
      body = (
        <g {...common}>
          <circle cx={50} cy={50} r={34} fill={accent} fillOpacity={0.25} />
          <ellipse cx={50} cy={50} rx={14} ry={34} />
          <path d="M16 50 H84 M22 32 H78 M22 68 H78" />
        </g>
      );
      break;
    case "pumpkin":
      body = (
        <g>
          <ellipse cx={34} cy={58} rx={18} ry={26} fill={accent} />
          <ellipse cx={66} cy={58} rx={18} ry={26} fill={accent} />
          <ellipse cx={50} cy={58} rx={20} ry={28} fill={accent} stroke={color} strokeWidth={sw * 0.6} />
          <path d="M50 30 Q52 18 60 14" stroke="#4d7c0f" strokeWidth={sw * 1.4} fill="none" strokeLinecap="round" />
          <path d="M38 52 L44 46 L48 54 Z M62 52 L56 46 L52 54 Z M36 66 Q50 76 64 66" fill="#1a0f00" stroke="#1a0f00" strokeWidth={sw * 0.5} />
        </g>
      );
      break;
    case "ghost":
      body = (
        <g>
          <path d="M22 86 V44 A28 28 0 0 1 78 44 V86 L68 78 L59 86 L50 78 L41 86 L32 78 Z" fill={accent} />
          <circle cx={40} cy={46} r={5} fill={color} />
          <circle cx={60} cy={46} r={5} fill={color} />
        </g>
      );
      break;
    case "candle":
      body = (
        <g>
          <rect x={38} y={40} width={24} height={46} rx={4} fill={accent} />
          <path d="M50 14 Q60 26 50 36 Q40 26 50 14 Z" fill="#ffb02e" />
        </g>
      );
      break;
    case "book":
      body = <path d="M14 24 Q32 18 50 26 Q68 18 86 24 V80 Q68 74 50 82 Q32 74 14 80 Z M50 26 V82" {...common} fill={accent} fillOpacity={0.25} />;
      break;
    case "star":
      body = <path d="M50 12 L60 38 L88 40 L66 58 L74 86 L50 70 L26 86 L34 58 L12 40 L40 38 Z" fill={accent} stroke="none" />;
      break;
    case "heart":
      body = <path d="M50 84 L18 52 A18 18 0 0 1 50 26 A18 18 0 0 1 82 52 Z" fill={accent} stroke="none" />;
      break;
    case "bolt":
      body = <path d="M56 10 L24 56 H46 L40 90 L76 42 H54 Z" fill={accent} stroke="none" />;
      break;
    case "rocket":
      body = (
        <g>
          <path d="M50 10 Q72 30 66 66 H34 Q28 30 50 10 Z" fill={accent} />
          <circle cx={50} cy={40} r={8} fill={color} />
          <path d="M34 66 L22 82 L38 76 M66 66 L78 82 L62 76" fill={accent} />
          <path d="M44 70 Q50 92 56 70" fill="#ff7a1a" />
        </g>
      );
      break;
    case "atom":
      body = (
        <g {...common}>
          <circle cx={50} cy={50} r={7} fill={accent} stroke="none" />
          {[0, 60, 120].map((r) => (
            <ellipse key={r} cx={50} cy={50} rx={38} ry={13} transform={`rotate(${r} 50 50)`} />
          ))}
        </g>
      );
      break;
    default:
      body = <circle cx={50} cy={50} r={30} fill={accent} />;
  }
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
      {body}
    </svg>
  );
};
