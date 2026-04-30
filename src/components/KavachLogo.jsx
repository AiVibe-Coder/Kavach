// Kavach Shield Logo — SVG, used across the app
// The "V" in Kavach is the shield's centrepiece

export function KavachShield({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="kg" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#9b8bff"/>
          <stop offset="100%" stopColor="#4ecdc4"/>
        </linearGradient>
        <filter id="ks">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#7c6af7" floodOpacity="0.5"/>
        </filter>
      </defs>
      {/* Shield body */}
      <path
        d="M14,18 L28,7 L50,2 L72,7 L86,18 L91,35 L88,55 L70,78 L50,95 L30,78 L12,55 L9,35 Z"
        fill="url(#kg)"
        filter="url(#ks)"
      />
      {/* Inner shield highlight */}
      <path
        d="M14,18 L28,7 L50,2 L72,7 L86,18 L91,35 L88,55 L70,78 L50,95 L30,78 L12,55 L9,35 Z"
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="2"
      />
      {/* Bold white V — the logo mark */}
      <polyline
        points="27,24 50,67 73,24"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.95"
      />
    </svg>
  )
}

// Full wordmark: shield + "Ka V ach" with styled V
export function KavachWordmark({ logoSize = 36, titleSize = 20, showHindi = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <KavachShield size={logoSize} />
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontSize: titleSize, fontWeight: 800, letterSpacing: '-0.5px', display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span>Ka</span>
          <span style={{
            color: '#F5A623',
            fontWeight: 900,
            fontSize: titleSize * 1.15,
            textShadow: '0 0 10px rgba(245,166,35,0.6)'
          }}>V</span>
          <span>ach</span>
        </div>
        {showHindi && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: 1.5 }}>
            कवच
          </div>
        )}
      </div>
    </div>
  )
}
