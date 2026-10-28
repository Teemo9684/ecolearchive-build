/** Fully vector, offline historical medallion. No raster or remote images.
 * The portrait is a stylized scholarly silhouette, not a claimed photographic likeness.
 */
export function HistoricalVectorEmblem({className}:{className?:string}) {
  return <svg viewBox="0 0 240 240" className={className} role="img" aria-label="شعار تراثي للمدرسة الابتدائية العربي التبسي">
    <defs>
      <radialGradient id="hve-navy" cx="43%" cy="31%" r="83%">
        <stop stopColor="#244a79"/><stop offset=".55" stopColor="#102d52"/><stop offset="1" stopColor="#07172d"/>
      </radialGradient>
      <linearGradient id="hve-gold" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#fff3be"/><stop offset=".22" stopColor="#d8b66c"/><stop offset=".52" stopColor="#99703c"/><stop offset=".72" stopColor="#f6df9e"/><stop offset="1" stopColor="#a3743a"/>
      </linearGradient>
      <linearGradient id="hve-face" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#f1d29a"/><stop offset=".48" stopColor="#c69b69"/><stop offset="1" stopColor="#8a603d"/>
      </linearGradient>
      <clipPath id="hve-inner"><circle cx="120" cy="120" r="83"/></clipPath>
    </defs>
    <circle cx="120" cy="120" r="116" fill="#08162d" stroke="url(#hve-gold)" strokeWidth="5"/>
    <circle cx="120" cy="120" r="109" fill="url(#hve-navy)" stroke="#e6c680" strokeWidth="1.6"/>
    <circle cx="120" cy="120" r="97" fill="none" stroke="#c9a15b" strokeWidth="1" strokeDasharray="2 5"/>
    {Array.from({length:24},(_,i)=><circle key={i} cx="120" cy="20" r="1.8" fill="#e8cb86" transform={`rotate(${i*15} 120 120)`}/>)}
    <g clipPath="url(#hve-inner)">
      <circle cx="120" cy="118" r="85" fill="#112b4a"/>
      <path d="M31 182 Q75 164 93 163 L147 163 Q181 172 213 189 L213 232 L29 232Z" fill="#1b314c" stroke="#c5a46b" strokeWidth="3"/>
      <path d="M61 214 Q75 175 104 165 L136 165 Q166 182 183 214" fill="#a77b48" stroke="#eed39c" strokeWidth="3"/>
      <path d="M96 160 L120 205 L144 160 Q137 151 129 149 L110 149Z" fill="#eee2c6"/>
      <path d="M99 158 Q110 176 120 205 Q126 173 142 159" fill="none" stroke="#8e683c" strokeWidth="4"/>
      {/* Simplified turban and scholarly robe: entirely paths. */}
      <path d="M81 95 Q83 54 116 51 Q152 48 160 92 L152 111 L87 112Z" fill="#d9c092" stroke="#f3ddaa" strokeWidth="3"/>
      <path d="M80 93 Q106 73 157 90 Q161 101 155 105 Q111 92 82 110Z" fill="#f0e3c7" stroke="#a67741" strokeWidth="4"/>
      <path d="M90 83 Q118 64 149 80" fill="none" stroke="#977040" strokeWidth="3"/>
      <path d="M92 106 Q88 121 94 144 Q99 161 120 163 Q141 161 148 143 Q154 119 146 105Z" fill="url(#hve-face)" stroke="#68482e" strokeWidth="3"/>
      <path d="M93 124 Q101 141 101 153 Q111 176 121 178 Q140 165 143 145 Q147 131 147 122 Q138 143 124 144 L114 141 Q105 145 93 124Z" fill="#57412f" stroke="#b9935b" strokeWidth="2"/>
      <path d="M104 123 Q111 119 116 124 M128 123 Q134 119 139 124" fill="none" stroke="#422f23" strokeWidth="3" strokeLinecap="round"/>
      <path d="M119 127 L117 139 L125 140" fill="none" stroke="#8b5a35" strokeWidth="2" strokeLinecap="round"/>
      <path d="M110 148 Q120 153 131 147" fill="none" stroke="#d2a46e" strokeWidth="2" strokeLinecap="round"/>
      <path d="M91 143 Q94 169 114 184 M149 143 Q145 168 129 184" fill="none" stroke="#d0aa6a" strokeWidth="3"/>
      <path d="M81 185 Q101 190 120 201 Q140 190 160 185" fill="none" stroke="#f6da94" strokeWidth="3"/>
    </g>
    {/* Gold open-book motif overlays the bottom rim. */}
    <g transform="translate(0 8)" stroke="#f5da96" strokeWidth="2" strokeLinejoin="round">
      <path d="M72 182 Q96 175 120 187 Q144 175 168 182 L168 204 Q143 198 120 210 Q97 198 72 204Z" fill="#a27a43"/>
      <path d="M79 185 Q99 180 120 193 Q141 180 161 185 L161 198 Q140 193 120 205 Q100 193 79 198Z" fill="#e9cf93"/>
      <path d="M120 193 L120 207" stroke="#6c4d2c"/>
    </g>
    <circle cx="120" cy="120" r="115" fill="none" stroke="#fff0bd" opacity=".55" strokeWidth="1"/>
  </svg>;
}
