<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })

const ICONS: Record<string, string> = {
  logo: `<g fill="currentColor" stroke="none"><circle cx="18" cy="18" r="8"/><circle cx="50" cy="18" r="8"/><circle cx="82" cy="18" r="8"/><circle cx="18" cy="50" r="8"/><circle cx="82" cy="50" r="8"/><circle cx="18" cy="82" r="8"/><circle cx="50" cy="82" r="8"/><circle cx="82" cy="82" r="8"/></g><circle class="a-node" cx="50" cy="50" r="16" fill="var(--brand, #2f6bff)" stroke="none"/>`,
  menu: '<path class="a-nudge-x" d="M4 7h16"/><path d="M4 12h16"/><path class="a-nudge-x" d="M4 17h10"/>',
  mic: '<rect class="a-head" x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/><path d="M8.5 21h7"/>',
  upload: `<path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/><g class="a-up"><path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/></g>`,
  export: `<path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/><g class="a-down"><path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/></g>`,
  search: `<g class="a-wig"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></g>`,
  sidebar: `<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path class="a-slide" d="M9.5 4.5v15"/>`,
  newchat: `<path d="M12 4.5H7.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3V12"/><g class="a-scrib"><path d="M14.5 5.5l4 4-8.5 8.5-4.5 1 1-4.5z"/></g>`,
  chat: `<path d="M20 11.5c0 3.87-3.58 7-8 7-1.2 0-2.34-.2-3.36-.55L4 19.5l1.3-3.6C4.5 14.7 4 13.14 4 11.5c0-3.87 3.58-7 8-7s8 3.13 8 7z"/><circle class="a-dot" style="animation-delay:0ms" cx="8.5" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle class="a-dot" style="animation-delay:100ms" cx="12" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle class="a-dot" style="animation-delay:200ms" cx="15.5" cy="11.5" r="1" fill="currentColor" stroke="none"/>`,
  chart: `<path d="M4 4v16h16"/><path class="a-bar" style="animation-delay:0ms" d="M8.5 16v-4"/><path class="a-bar" style="animation-delay:100ms" d="M12 16V8.5"/><path class="a-bar" style="animation-delay:200ms" d="M15.5 16V5"/>`,
  table: `<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/><path class="a-row" d="M3.5 9.5h17"/><path class="a-row" style="animation-delay:120ms" d="M3.5 14.5h17"/>`,
  folder: `<path d="M3.5 6.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path class="a-flap" d="M3.5 10h17"/>`,
  'folder-open': `<path d="M3.5 8V6.5a2 2 0 0 1 2-2h3.8l2 2h6.7a2 2 0 0 1 2 2V8"/><path class="a-front" d="M3 19.5l2.2-7.4A2 2 0 0 1 7.1 10.6h13.3a1 1 0 0 1 .95 1.3l-2.1 6.9a2 2 0 0 1-1.9 1.4H4.5A1.5 1.5 0 0 1 3 18.7z"/>`,
  dots: `<circle class="a-d" style="animation-delay:0ms" cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle class="a-d" style="animation-delay:100ms" cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle class="a-d" style="animation-delay:200ms" cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>`,
  edit: `<path d="M4 20.5h5"/><g class="a-scrib"><path d="M14.5 5.5l4 4-8.5 8.5-4.5 1 1-4.5z"/></g>`,
  trash: `<g class="a-lid"><path d="M4 7h16"/><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/></g><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6M14 11v6"/>`,
  pin: `<g class="a-tilt"><path d="M8.5 4.5h7l-1 5 2.5 3v1.5h-10V12.5l2.5-3z"/><path d="M12 14v6.5"/></g>`,
  gear: `<g class="a-spin"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.8"/><path d="M12 5.2V2.4M16.81 7.19l1.98-1.98M18.8 12h2.8M16.81 16.81l1.98 1.98M12 18.8v2.8M7.19 16.81l-1.98 1.98M5.2 12H2.4M7.19 7.19 5.21 5.21"/></g>`,
  home: `<path class="a-roof" d="M3 11 12 3.8 21 11"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V10"/><path class="a-door" d="M10 20.5v-5h4v5"/>`,
  check: `<path class="a-draw" pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/>`,
  x: `<path class="a-rot" d="M6 6l12 12M18 6 6 18"/>`,
  plus: `<path class="a-rot" d="M12 5v14M5 12h14"/>`,
  send: `<g class="a-arrow"><path d="M12 19V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/></g>`,
  clip: `<path class="a-clip" d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>`,
  'chevron-down': `<path class="a-nudge-y" d="M6 9.5l6 6 6-6"/>`,
  'chevron-right': `<path class="a-nudge-x" d="M9.5 6l6 6-6 6"/>`,
  'arrow-right': `<g class="a-nudge-x"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></g>`,
  'arrow-up-right': `<g class="a-diag"><path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/></g>`,
  keyboard: `<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01"/><path class="a-key" d="M7.5 14.5h9"/>`,
  user: `<circle class="a-head" cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.9-3.6 3.8-5.8 7.5-5.8s6.6 2.2 7.5 5.8"/>`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>`,
  logout: `<path d="M9.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.5"/><g class="a-out"><path d="M15 16.5 20 12l-5-4.5"/><path d="M20 12H9.5"/></g>`,
  sparkle: `<g class="a-tw"><path d="M12 3.5c.5 4.3 2.2 6 6.5 6.5-4.3.5-6 2.2-6.5 6.5-.5-4.3-2.2-6-6.5-6.5 4.3-.5 6-2.2 6.5-6.5z"/><path d="M19 2.5v3M17.5 4h3"/></g>`,
  sun: `<circle cx="12" cy="12" r="4"/><g class="a-rays"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.55 1.55M17.15 17.15l1.55 1.55M5.3 18.7l1.55-1.55M17.15 6.85l1.55-1.55"/></g>`,
  graph: `<path d="M5.5 6 12 12l6.5-6M12 12l-6 6.5M12 12l6.5 6.5"/><circle class="a-node" cx="5.5" cy="6" r="2.2"/><circle class="a-node" style="animation-delay:120ms" cx="18.5" cy="6" r="2.2"/><circle class="a-node" style="animation-delay:240ms" cx="12" cy="12" r="2.2"/><circle class="a-node" style="animation-delay:120ms" cx="6" cy="18.5" r="2.2"/><circle class="a-node" style="animation-delay:240ms" cx="18.5" cy="18.5" r="2.2"/>`,
  doc: `<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/><path class="a-draw" pathLength="1" d="M9 13h6"/><path class="a-draw" style="animation-delay:140ms" pathLength="1" d="M9 16.5h4"/>`,
  undo: `<path d="M3 7v6h6"/><g class="a-undo"><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></g>`,
  eye: `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle class="a-pupil" cx="12" cy="12" r="3"/>`,
  filter: `<path class="a-funnel" d="M4 5h16l-6 7.5V19l-4 2v-8.5z"/>`,
  move: `<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V11"/><path d="M3.5 7v11a2 2 0 0 0 2 2H11"/><g class="a-nudge-x"><path d="M11.5 15.5h8"/><path d="M16.5 12.5l3 3-3 3"/></g>`,
  warn: `<path class="a-tri" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4.5M12 17.2v.01"/>`,
  info: `<circle cx="12" cy="12" r="9"/><g class="a-i"><path d="M12 11v5.5"/><path d="M12 7.6v.01"/></g>`,
  'zoom-in': `<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/><path class="a-sign" d="M11 8.2v5.6M8.2 11h5.6"/>`,
  'zoom-out': `<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/><path class="a-sign" d="M8.2 11h5.6"/>`,
  share: `<path d="M8 9H6.5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H16"/><g class="a-up"><path d="M12 15V3.5"/><path d="M8 7.5l4-4 4 4"/></g>`,
  target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle class="a-node" cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>`,
  columns: `<rect x="3.5" y="4.5" width="7" height="15" rx="2"/><rect class="a-nudge-x" x="13.5" y="4.5" width="7" height="15" rx="2"/>`,
  history: `<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5v4h4"/><g class="a-undo"><path d="M12 7.5V12l3 2"/></g>`,
  code: `<path class="a-nudge-x" d="M15.5 7l5 5-5 5"/><path d="M8.5 7l-5 5 5 5"/><path d="M13.5 4.5l-3 15"/>`,
  play: `<circle cx="12" cy="12" r="9"/><path class="a-nudge-x" d="M10 8.5v7l5.5-3.5z" fill="currentColor"/>`,
  grid: `<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect class="a-node" x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect class="a-node" style="animation-delay:120ms" x="13.5" y="13.5" width="7" height="7" rx="1.5"/>`,
  image: `<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 16.5l5-5 4 4 3-3 5 5"/><circle class="a-node" cx="15.5" cy="9" r="1.6"/>`,
  shield: `<path d="M12 3.2 5 6v5.5c0 4.2 2.9 7.8 7 9.3 4.1-1.5 7-5.1 7-9.3V6z"/><path class="a-draw" pathLength="1" d="M8.8 12.2l2.3 2.3 4.2-4.6"/>`,
  marker: `<g class="a-scrib"><path d="M15 4.5l4.5 4.5-8 8H7v-4.5z"/></g><path d="M4 20.5h16"/>`,
  copy: `<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path class="a-nudge-y" d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>`,
  layers: `<path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/><g class="a-top"><path d="M12 2 2 7l10 5 10-5z"/></g>`,
  maximize: `<g class="a-node"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9"/><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9"/><path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/></g>`,
  sheet: `<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/><path class="a-row" d="M8.5 12.5h7"/><path class="a-row" style="animation-delay:120ms" d="M8.5 16h7"/><path d="M12 11v7"/>`,
  book: `<g class="a-page"><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></g><path d="M12 7v14"/>`,
}
</script>

<template>
  <svg
    class="ico"
    :viewBox="name === 'logo' ? '0 0 100 100' : '0 0 24 24'"
    :style="{ '--s': size + 'px' }"
    aria-hidden="true"
    v-html="ICONS[name] ?? ''"
  />
</template>

<style>
.ico .a-spark { opacity: 0; }
.ico .a-bar { transform-origin: 50% 100%; }
.ico .a-draw { stroke-dasharray: 1; }
:is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-spark { opacity: 1; }

@media (prefers-reduced-motion: no-preference) {
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-spark { animation: ico-twinkle 600ms var(--ease) forwards; }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-up { animation: ico-up 520ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-down { animation: ico-down 520ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-wig { animation: ico-wiggle 560ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-slide { animation: ico-slide 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-scrib { animation: ico-scribble 600ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-dot { animation: ico-bounce 480ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-bar { animation: ico-grow 600ms var(--ease) both; }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-row { animation: ico-flash 520ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-flap { animation: ico-lift 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-front { animation: ico-lift 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-d { animation: ico-bounce 480ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-lid { animation: ico-lid 520ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-tilt { animation: ico-tilt 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-spin { animation: ico-spin 600ms var(--ease) forwards; }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-roof { animation: ico-bob 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-door { animation: ico-door 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-draw { animation: ico-draw 520ms var(--ease) both; }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-rot { animation: ico-rot 480ms var(--ease) forwards; }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-arrow { animation: ico-send 620ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-clip { animation: ico-swing 560ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-nudge-y { animation: ico-nudge-y 420ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-nudge-x { animation: ico-nudge-x 420ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-diag { animation: ico-diag 420ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-key { animation: ico-press 420ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-head { animation: ico-bob 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-out { animation: ico-out 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-tw { animation: ico-tw 560ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-rays { animation: ico-spin-s 600ms var(--ease) forwards; }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-node { animation: ico-pulse 520ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-undo { animation: ico-undo 520ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-pupil { animation: ico-look 600ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-funnel { animation: ico-shake 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-tri { animation: ico-shake 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-i { animation: ico-pulse 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-sign { animation: ico-pulse 420ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-top { animation: ico-lift 500ms var(--ease); }
  :is(button, a, label, [data-hover]):is(:hover, :focus-visible) .ico .a-page { animation: ico-lift 500ms var(--ease); }
}

@keyframes ico-twinkle { 0% { opacity: 0; transform: scale(0.2) rotate(-45deg); } 60% { opacity: 1; transform: scale(1.15) rotate(10deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes ico-up { 50% { transform: translateY(-3px); } }
@keyframes ico-down { 50% { transform: translateY(3px); } }
@keyframes ico-wiggle { 25% { transform: rotate(-10deg); } 60% { transform: rotate(8deg); } }
@keyframes ico-slide { 50% { transform: translateX(2.5px); } }
@keyframes ico-scribble { 25% { transform: rotate(-10deg) translate(-1px, 1px); } 50% { transform: rotate(8deg) translate(1px, -1px); } 75% { transform: rotate(-5deg); } }
@keyframes ico-bounce { 40% { transform: translateY(-2.5px); } }
@keyframes ico-grow { from { transform: scaleY(0.15); } }
@keyframes ico-flash { 50% { opacity: 0.2; } }
@keyframes ico-lift { 50% { transform: translateY(-2px); } }
@keyframes ico-lid { 40% { transform: translateY(-2px) rotate(-10deg); } }
@keyframes ico-tilt { 40% { transform: rotate(15deg); } }
@keyframes ico-spin { to { transform: rotate(60deg); } }
@keyframes ico-bob { 50% { transform: translateY(-2px); } }
@keyframes ico-door { 50% { transform: translateY(-1.5px); } }
@keyframes ico-draw { from { stroke-dashoffset: 1; } }
@keyframes ico-rot { to { transform: rotate(90deg); } }
@keyframes ico-send { 40% { transform: translateY(-24px); opacity: 0; } 41% { transform: translateY(24px); opacity: 0; } }
@keyframes ico-swing { 30% { transform: rotate(12deg); } 65% { transform: rotate(-8deg); } }
@keyframes ico-nudge-y { 50% { transform: translateY(2px); } }
@keyframes ico-nudge-x { 50% { transform: translateX(2px); } }
@keyframes ico-diag { 50% { transform: translate(2px, -2px); } }
@keyframes ico-press { 40% { transform: translateY(1.5px); } }
@keyframes ico-out { 50% { transform: translateX(3px); } }
@keyframes ico-tw { 50% { transform: scale(1.18) rotate(15deg); } }
@keyframes ico-spin-s { to { transform: rotate(45deg); } }
@keyframes ico-pulse { 50% { transform: scale(1.2); } }
@keyframes ico-undo { 40% { transform: rotate(-14deg); } }
@keyframes ico-look { 30% { transform: translateX(-1.5px); } 70% { transform: translateX(1.5px); } }
@keyframes ico-shake { 25% { transform: rotate(-6deg); } 75% { transform: rotate(6deg); } }
</style>
