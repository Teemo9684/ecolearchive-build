/**
 * Inline SVG school emblem — no external requests, always renders offline.
 * No portrait is used: the project has no authentic photo of Sheikh Larbi Tebessi.
 */
export function SchoolEmblem({ className }: { className?: string }) {
  const star = Array.from({ length: 8 }, (_, i) => i * 45);
  const dots = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="شعار المدرسة الابتدائية العربي التبسي" className={className}>
      <defs>
        <linearGradient id="school-sidebar-em-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--gold, #c9a55d)" />
          <stop offset="0.5" stopColor="color-mix(in oklab, var(--gold, #c9a55d) 55%, white)" />
          <stop offset="1" stopColor="color-mix(in oklab, var(--gold, #c9a55d) 80%, black)" />
        </linearGradient>
        <radialGradient id="school-sidebar-em-navy" cx="0.5" cy="0.4" r="0.65">
          <stop offset="0" stopColor="color-mix(in oklab, var(--sidebar, #10243e) 70%, var(--primary, #173a56))" />
          <stop offset="1" stopColor="color-mix(in oklab, var(--sidebar, #10243e) 80%, black)" />
        </radialGradient>
        <path id="school-sidebar-em-top" d="M 30 100 A 70 70 0 0 1 170 100" />
        <path id="school-sidebar-em-bottom" d="M 34 100 A 66 66 0 0 0 166 100" />
        <clipPath id="school-sidebar-em-clip"><circle cx="100" cy="100" r="96" /></clipPath>
      </defs>
      <circle cx="100" cy="100" r="97" fill="url(#school-sidebar-em-navy)" />
      <circle cx="100" cy="100" r="95" fill="none" stroke="url(#school-sidebar-em-gold)" strokeWidth="3" />
      <circle cx="100" cy="100" r="88" fill="none" stroke="url(#school-sidebar-em-gold)" strokeWidth="0.8" opacity="0.7" />
      <circle cx="100" cy="100" r="55" fill="none" stroke="url(#school-sidebar-em-gold)" strokeWidth="1.6" />
      {dots.map((a) => (
        <circle key={a} cx="100" cy="8.5" r="1.1" fill="var(--gold, #c9a55d)" transform={`rotate(${a} 100 100)`} opacity="0.8" />
      ))}
      <text fontFamily="Cairo, 'Traditional Arabic', Tahoma, sans-serif" fontSize="13" fontWeight="700" fill="url(#school-sidebar-em-gold)">
        <textPath href="#school-sidebar-em-top" startOffset="50%" textAnchor="middle">المدرسة الابتدائية العربي التبسي</textPath>
      </text>
      <text fontFamily="Cairo, 'Traditional Arabic', Tahoma, sans-serif" fontSize="10" fontWeight="600" fill="url(#school-sidebar-em-gold)" dominantBaseline="hanging">
        <textPath href="#school-sidebar-em-bottom" startOffset="50%" textAnchor="middle">خنشلة — الجزائر</textPath>
      </text>
      <g fill="var(--gold, #c9a55d)">
        <path d="M 23 104 l 4 -4 l 4 4 l -4 4 z" />
        <path d="M 169 104 l 4 -4 l 4 4 l -4 4 z" />
      </g>
      {/* Eight-pointed star (rub el hizb) */}
      <g fill="none" stroke="url(#school-sidebar-em-gold)" strokeWidth="1.2" opacity="0.55">
        <rect x="64" y="64" width="72" height="72" />
        <rect x="64" y="64" width="72" height="72" transform="rotate(45 100 100)" />
      </g>
      {star.map((a) => (
        <circle key={a} cx="100" cy="47" r="1.6" fill="var(--gold, #c9a55d)" transform={`rotate(${a + 22.5} 100 100)`} />
      ))}
      {/* Historic lamp / torch of knowledge */}
      <g fill="url(#school-sidebar-em-gold)">
        <path d="M100 66 c -5 6 -6 10 -2.5 14 c -1 -4 1 -6 2.5 -8 c 1.5 2 3.5 4 2.5 8 c 3.5 -4 2.5 -8 -2.5 -14 z" />
        <rect x="96" y="81" width="8" height="3" rx="1" />
        <path d="M95 85 h10 l -2 9 h-6 z" />
      </g>
      {/* Open book */}
      <g>
        <path d="M100 104 C 88 97 76 97 66 101 L 66 130 C 76 126 88 126 100 133 Z" fill="url(#school-sidebar-em-gold)" />
        <path d="M100 104 C 112 97 124 97 134 101 L 134 130 C 124 126 112 126 100 133 Z" fill="url(#school-sidebar-em-gold)" />
        <g stroke="url(#school-sidebar-em-navy)" strokeWidth="1" opacity="0.75">
          <path d="M72 108 C 80 105 88 106 95 109" fill="none" />
          <path d="M72 114 C 80 111 88 112 95 115" fill="none" />
          <path d="M72 120 C 80 117 88 118 95 121" fill="none" />
          <path d="M105 109 C 112 106 120 105 128 108" fill="none" />
          <path d="M105 115 C 112 112 120 111 128 114" fill="none" />
          <path d="M105 121 C 112 118 120 117 128 120" fill="none" />
        </g>
        <path d="M100 104 V 133" stroke="url(#school-sidebar-em-navy)" strokeWidth="1.2" />
      </g>
      <g clipPath="url(#school-sidebar-em-clip)">
        <rect className="emblem-shine" x="-60" y="-20" width="40" height="240" fill="white" opacity="0.18" transform="rotate(20 100 100)" />
      </g>
    </svg>
  );
}