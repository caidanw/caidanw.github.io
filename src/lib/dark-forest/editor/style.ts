/** The editor's styles: chrome around the scene, in the site's mono type and the fire's orange. */
export const CSS = `
html.dfe-on, html.dfe-on body { overflow: hidden; }
.dfe {
  --bg: #0b0c0e; --panel: #111316; --line: #23262b; --text: #c9c6bd; --dim: #7d7a72; --accent: #f08a3c;
  position: fixed; inset: 0; z-index: 1000;
  display: grid;
  grid-template: "head head head" auto "left stage right" 1fr "foot foot foot" 168px / 232px 1fr 340px;
  background: var(--bg); color: var(--text);
  font: 11px/1.45 var(--font-mono, ui-monospace, Menlo, monospace);
}
.dfe * { box-sizing: border-box; }
.dfe [hidden] { display: none !important; }
.dfe .dim { color: var(--dim); }
.dfe h3 { margin: 0 0 6px; font: inherit; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--dim); }
.dfe h4 { margin: 10px 0 4px; font: inherit; color: var(--dim); }
.dfe p { margin: 0 0 8px; }
.dfe button, .dfe select {
  font: inherit; color: var(--text); background: transparent;
  border: 1px solid var(--line); border-radius: 3px; padding: 2px 7px; cursor: pointer;
}
.dfe button:hover, .dfe select:hover { border-color: #3a3e45; }
.dfe button[aria-pressed='true'] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
.dfe button[disabled] { opacity: 0.4; cursor: default; }
.dfe select option { background: var(--panel); }
.dfe .seg { display: inline-flex; }
.dfe .seg button { border-radius: 0; margin-left: -1px; }
.dfe .seg button:first-child { border-radius: 3px 0 0 3px; margin-left: 0; }
.dfe .seg button:last-child { border-radius: 0 3px 3px 0; }

.dfe-head {
  grid-area: head; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 7px 12px; border-bottom: 1px solid var(--line); background: var(--panel);
}
.dfe-head strong { font-weight: 600; }
.dfe-head .group { display: flex; align-items: center; gap: 6px; }
.dfe-head .row.slider { width: 170px; }
.dfe-head .exit { margin-left: auto; color: var(--dim); text-decoration: none; }
.dfe-head .exit:hover { color: var(--text); }

.dfe-left, .dfe-right { overflow: auto; background: var(--panel); padding: 10px 12px; }
.dfe-left { border-right: 1px solid var(--line); }
.dfe-right { grid-area: right; border-left: 1px solid var(--line); }
.dfe section { margin-bottom: 16px; }

.dfe .row { display: flex; align-items: center; gap: 6px; min-height: 20px; }
.dfe .row.check { cursor: pointer; }
.dfe .row.slider span { width: 62px; flex: none; color: var(--dim); }
.dfe .row.slider input { flex: 1; min-width: 0; accent-color: var(--accent); }
.dfe .row.slider output { width: 34px; text-align: right; }
.dfe input[type='checkbox'], .dfe input[type='radio'] { accent-color: var(--accent); margin: 0; }

.dfe-center { grid-area: stage; min-width: 0; min-height: 0; display: flex; background: #000; }
.dfe-stage { flex: 1; min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 8px; }
.dfe-left { grid-area: left; }

/* the art editor */
.dfe .art { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.dfe .art-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.dfe .art-tools .edge { display: inline-flex; align-items: center; gap: 2px; }
.dfe .art-tools .edge button { padding: 0 5px; }
.dfe .art-main { flex: 1; min-height: 0; display: flex; }
.dfe .art-board { flex: 1; min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.dfe .art-canvas { image-rendering: pixelated; cursor: crosshair; box-shadow: 0 0 0 1px var(--line); }
.dfe .art-previews { display: flex; align-items: flex-end; gap: 14px; padding: 8px 10px; border-top: 1px solid var(--line); min-height: 0; }
.dfe .art-previews figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.dfe .art-previews canvas { image-rendering: pixelated; }
.dfe .art-previews figcaption { color: var(--dim); }
.dfe .light-pad { cursor: grab; border-radius: 50%; }
.dfe .pip { margin-left: auto; width: 360px; aspect-ratio: 16 / 9; display: flex; border: 1px solid var(--line); }
.dfe .pip .dfe-stage { padding: 0; }
.dfe .assets .asset { display: block; width: 100%; text-align: left; border-color: transparent; padding: 1px 6px; }
.dfe .assets .asset[aria-pressed='true'] { border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
.dfe .pal-row, .dfe .part-row { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
.dfe .pal-row.on .ch { color: var(--accent); border-color: var(--accent); }
.dfe .pal-row.missing .ch { color: #ff6b6b; }
.dfe .pal-row .ch { width: 24px; padding: 2px 0; text-align: center; }
.dfe .pal-row input[type='color'] { width: 28px; height: 20px; padding: 0; border: 1px solid var(--line); background: none; }
.dfe .pal-row select { flex: 1; min-width: 0; }
.dfe input.num, .dfe input.chars { font: inherit; color: var(--text); background: transparent; border: 1px solid var(--line); border-radius: 3px; padding: 1px 4px; }
.dfe input.num { width: 52px; }
.dfe input.chars { flex: 1; min-width: 0; }
.dfe .warn { color: #e0b04a; }
.dfe .meter { display: inline-block; width: 40px; height: 6px; border: 1px solid var(--line); }
.dfe .meter i { display: block; height: 100%; width: 0; background: var(--accent); }
.dfe .field { width: 44px; }
.dfe .world-col input { width: 28px; height: 18px; padding: 0; border: 1px solid var(--line); background: none; }
.dfe .tabs { flex-wrap: wrap; }
.dfe-stage canvas { display: block; image-rendering: pixelated; cursor: crosshair; }

.dfe .tabs { margin-bottom: 10px; }
.dfe .sw { display: inline-block; width: 10px; height: 10px; border: 1px solid #0006; vertical-align: -1px; margin-right: 5px; }
.dfe table { border-collapse: collapse; width: 100%; }
.dfe .kv th { text-align: left; font-weight: normal; color: var(--dim); padding: 1px 8px 1px 0; vertical-align: top; width: 64px; }
.dfe .kv td { padding: 1px 0; word-break: break-word; }
.dfe .lights td { padding: 1px 4px 1px 0; white-space: nowrap; }
.dfe .lights td:nth-child(2) { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.dfe .lights .bar { width: 100%; }
.dfe .lights .bar i { display: block; height: 6px; background: var(--accent); opacity: 0.7; }

.dfe .light { border: 1px solid var(--line); border-radius: 3px; margin-bottom: 4px; }
.dfe .light.open { border-color: #3a3e45; }
.dfe .light .title { display: flex; align-items: center; gap: 6px; padding: 4px 6px; cursor: pointer; }
.dfe .light .title .count { margin-left: auto; }
.dfe .sound .title .meter { margin-left: auto; }
.dfe .sound .title button { padding: 0 6px; }
.dfe .sound.muted { opacity: 0.45; }
.dfe .light .body { padding: 2px 8px 8px; display: grid; gap: 4px; }
.dfe .instances { margin: 4px 0 0; padding: 0; list-style: none; max-height: 120px; overflow: auto; }

.dfe .change { border: 1px solid var(--line); border-radius: 3px; padding: 6px 8px; margin-bottom: 6px; }
.dfe .change ul { margin: 4px 0 6px; padding-left: 14px; color: var(--dim); }
.dfe .change .group { display: flex; gap: 6px; }
.dfe-foot {
  grid-area: foot; display: grid; grid-template-columns: 220px 1fr 1.2fr; gap: 16px;
  padding: 8px 12px; border-top: 1px solid var(--line); background: var(--panel); min-height: 0;
}
.dfe-foot > div { min-height: 0; overflow: auto; }
.dfe-foot ul, .dfe-foot ol { margin: 0; padding: 0; list-style: none; }
.dfe-foot .story li { padding: 1px 0; border-bottom: 1px solid #ffffff08; }
`
