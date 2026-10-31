export function Landscape() {
  return <svg className="landscape" viewBox="0 0 570 240" preserveAspectRatio="xMaxYMax meet" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="mountain" x1="350" y1="60" x2="350" y2="240" gradientUnits="userSpaceOnUse"><stop stopColor="#93c6e1"/><stop offset="1" stopColor="#c4e1e9"/></linearGradient>
      <linearGradient id="hill" x1="390" y1="130" x2="390" y2="260" gradientUnits="userSpaceOnUse"><stop stopColor="#399da0"/><stop offset="1" stopColor="#087f87"/></linearGradient>
      <linearGradient id="front" x1="390" y1="175" x2="390" y2="260" gradientUnits="userSpaceOnUse"><stop stopColor="#147c88"/><stop offset="1" stopColor="#075965"/></linearGradient>
    </defs>
    <circle cx="408" cy="58" r="29" fill="#fff3c6"/>
    <path d="M63 65h52a13 13 0 0 0-1-26 18 18 0 0 0-33-6 16 16 0 0 0-18 32ZM402 102h81a12 12 0 0 0 0-24 21 21 0 0 0-38-9 18 18 0 0 0-27 8 13 13 0 0 0-16 25Z" fill="white" opacity=".8"/>
    <path d="M144 235 288 62l53 65 65-86 157 194Z" fill="url(#mountain)"/>
    <path d="m288 62-32 40 23-8 14 11 10-4 18 17ZM406 41l-37 48 24-9 15 12 13-9 15 2Z" fill="#fff" opacity=".9"/>
    <path d="M79 240c77-100 161-103 244-67 99 44 119-65 247-37v104Z" fill="#85bfb0"/>
    <path d="M165 240c68-109 159-124 240-83 69 36 116 16 165 6v77Z" fill="url(#hill)"/>
    <path d="M315 240c62-78 162-58 255-28v28Z" fill="url(#front)"/>
    <path d="M365 154c-63 32-15 38 5 45 18 6-29 18-60 41h56c22-12 46-22 42-31-4-13-77-21-43-55" fill="#e9d9b6"/>
    <g fill="#176f72"><path d="m223 105-19 37h11l-19 32h20v30h12v-30h21l-19-32h11Z"/><path d="m492 87-21 43h12l-22 37h24v28h14v-28h23l-21-37h11Z"/></g>
    <g fill="#075e66"><path d="m538 121-16 30h8l-18 30h19v27h11v-27h20l-18-30h9Z"/><path d="m181 155-13 25h8l-13 22h14v21h8v-21h15l-14-22h8Z"/></g>
    <g transform="translate(344 123)"><path d="m2 30-5 15m11-15 6 14" stroke="#174665" strokeWidth="5" strokeLinecap="round"/><rect x="-4" y="10" width="18" height="24" rx="7" fill="#ef9b56"/><rect x="-10" y="13" width="10" height="19" rx="4" fill="#174665"/><circle cx="6" cy="4" r="8" fill="#d7a06e"/><path d="M-5 0h24M0-5h12l2 6H-2Z" stroke="#174665" strokeWidth="3" strokeLinecap="round"/><path d="m12 17 9 6 5-9" stroke="#d7a06e" strokeWidth="4" strokeLinecap="round"/><path d="m27 13-2 34" stroke="#174665" strokeWidth="2"/></g>
    <g stroke="#86b5c8" strokeWidth="2" strokeLinecap="round"><path d="m338 40 5-3 5 3M360 55l4-3 4 3"/></g>
    <circle cx="450" cy="214" r="3" fill="#efc46c"/><circle cx="468" cy="222" r="2" fill="#efc46c"/><circle cx="431" cy="230" r="2" fill="#efc46c"/>
  </svg>;
}
