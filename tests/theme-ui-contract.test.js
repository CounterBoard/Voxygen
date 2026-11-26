import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const events = readFileSync(new URL('../src/features/events/Events.jsx', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/theme/theme-tokens.css', import.meta.url), 'utf8');
const catalog = readFileSync(new URL('../shared/theme-catalog.js', import.meta.url), 'utf8');

test('theme host binds the app root to the shared default theme ID', () => {
  assert.match(app, /data-theme=\{activeTheme\}/);
  assert.match(app, /setActiveTheme\(normalizeThemeId\(value\.theme \?\? value\.defaultTheme/);
  assert.match(catalog, /DEFAULT_THEME_ID\s*=\s*['"]vox['"]/);
});

test('effective server theme is applied and personal theme choices use the shared catalog', () => {
  assert.equal((app.match(/Object\.values\(THEME_CATALOG\)\.filter\(item=>item\.status==='active'\)\.map\(item=><option/g)||[]).length, 1, 'global theme picker must use the shared catalog');
  assert.match(app, /Array\.isArray\(settings\?\.availableThemes\).*settings\.availableThemes\.length/, 'personal picker must honor backend access filtering');
  assert.match(app, /Выбор темы интерфейса/);
  assert.match(app, /onTouchStart=\{onThemeTouchStart\}/);
  assert.match(app, /onTouchEnd=\{onThemeTouchEnd\}/);
  assert.doesNotMatch(app, /<SelectField value=\{normalizeThemeId\(settings\.personalTheme/);
  assert.match(app, /settings\.personalTheme\?\?settings\.defaultTheme/);
  assert.match(app, /setPersonalThemeChanged\(true\)/);
  assert.match(app, /onSettingsSaved=\{settings=>\{setActiveTheme/);
  assert.match(app, /maxWidth: 'var\(--theme-content-max-width\)'/);
  assert.equal((app.match(/min\(var\(--theme-modal-max-width\),100%\)/g)||[]).length, 3, 'all compact modal widths must use the theme token');
  assert.equal((app.match(/maxWidth:'var\(--theme-modal-max-width\)'/g)||[]).length, 2, 'all wide modal widths must use the theme token');
  assert.match(app, /maxWidth:'var\(--theme-content-max-width\)',display:'flex'/);
});

test('shared theme-aware primitives are present in the application', () => {
  for (const primitive of [
    'function Button', 'function IconButton', 'function SurfaceCard',
    'function Slider', 'function Field', 'function TextAreaField',
    'function SelectField', 'function ToggleField', 'function Segmented',
  ]) assert.ok(app.includes(primitive), `Missing UI primitive: ${primitive}`);
});

test('theme tokens define separate semantic statuses and protected gem content', () => {
  for (const token of [
    '--theme-color-action-primary:', '--theme-color-status-success:',
    '--theme-color-status-warning:', '--theme-color-status-danger:',
    '--theme-color-status-info:', '--content-color-gem:',
  ]) assert.ok(tokens.includes(token), `Missing semantic token: ${token}`);
  assert.match(tokens, /--gem:\s*var\(--content-color-gem\)/);
});

test('focus-visible, invalid/disabled states and reduced motion are covered', () => {
  assert.match(tokens, /:focus-visible/);
  assert.match(tokens, /\[aria-invalid="true"\]/);
  assert.match(tokens, /:disabled/);
  assert.match(tokens, /prefers-reduced-motion:\s*reduce/);
});

test('toggle field geometry and typography are fully theme-tokenized', () => {
  for (const token of [
    '--theme-toggle-track-width:', '--theme-toggle-track-height:',
    '--theme-toggle-thumb-size:', '--theme-toggle-track-inset:',
    '--theme-toggle-row-gap:', '--theme-toggle-row-padding:',
    '--theme-toggle-label-size:', '--theme-toggle-label-weight:',
    '--theme-toggle-label-line-height:', '--theme-toggle-description-size:',
    '--theme-toggle-description-line-height:', '--theme-toggle-description-gap:',
  ]) assert.ok(tokens.includes(token), `Missing toggle token: ${token}`);
  const toggle = app.slice(app.indexOf('function ToggleField'), app.indexOf('function ProfileSettingsModal'));
  assert.match(toggle, /role="switch"/);
  assert.match(toggle, /aria-checked=\{Boolean\(checked\)\}/);
  assert.match(toggle, /disabled=\{disabled\}/);
  assert.match(toggle, /onClick=\{\(\)=>onChange\(!checked\)\}/);
  assert.doesNotMatch(toggle, /(?:width|height|fontSize|fontWeight|lineHeight|gap|padding|marginTop):\s*(?:\d+(?:\.\d+)?px|\d+(?:\.\d+)?)/);
});

test('button and icon-button typography and glyph sizing are theme-tokenized', () => {
  for (const token of [
    '--theme-icon-button-glyph-size:', '--theme-icon-button-glyph-stroke:',
    '--theme-button-font-weight:', '--theme-button-line-height:',
    '--theme-button-radius:', '--theme-button-gap:',
  ]) assert.ok(tokens.includes(token), `Missing button token: ${token}`);
  const button = app.slice(app.indexOf('function Button'), app.indexOf('function SurfaceCard'));
  assert.match(button, /fontWeight:'var\(--theme-button-font-weight\)'/);
  assert.match(button, /lineHeight:'var\(--theme-button-line-height\)'/);
  assert.match(button, /borderRadius:'var\(--theme-button-radius\)'/);
  assert.match(button, /gap:\s*'var\(--theme-button-gap\)'/);
  const iconButton = app.slice(app.indexOf('function IconButton'), app.indexOf('function Button'));
  assert.match(iconButton, /size="var\(--theme-icon-button-glyph-size\)"/);
  assert.match(iconButton, /strokeWidth="var\(--theme-icon-button-glyph-stroke\)"/);
  assert.match(iconButton, /aria-label=\{label\}/);
  assert.match(iconButton, /disabled=\{disabled\}/);
});

test('field, textarea and select typography and message rhythm are theme-tokenized', () => {
  for (const token of [
    '--theme-type-control-line-height:', '--theme-type-textarea-line-height:',
    '--theme-field-label-gap:', '--theme-field-message-gap:',
  ]) assert.ok(tokens.includes(token), `Missing form token: ${token}`);
  const field = app.slice(app.indexOf('function Field'), app.indexOf('function FixedToast'));
  assert.equal((field.match(/theme-field-label-gap/g) || []).length, 3);
  assert.equal((field.match(/theme-field-message-gap/g) || []).length, 4);
  assert.match(field, /lineHeight: 'var\(--theme-type-control-line-height\)'/);
  assert.match(field, /lineHeight: 'var\(--theme-type-textarea-line-height\)'/);
  assert.match(field, /aria-invalid=\{error \? 'true' : props\['aria-invalid'\]\}/);
  assert.match(field, /aria-describedby=\{messageId \|\| props\['aria-describedby'\]\}/);
  assert.match(field, /role="alert"/);
});

test('section headings and reaction actions use theme tokens', () => {
  for (const token of [
    '--theme-react-action-gap:', '--theme-react-action-size:',
    '--theme-react-action-weight-active:', '--theme-react-action-weight-idle:',
    '--theme-section-title-gap:', '--theme-section-title-bottom-gap:',
    '--theme-section-title-size:', '--theme-section-title-weight:',
    '--theme-section-count-size:',
  ]) assert.ok(tokens.includes(token), `Missing section/action token: ${token}`);
  const react = app.slice(app.indexOf('function reactBtn'), app.indexOf('function SectionTitle'));
  assert.match(react, /gap: 'var\(--theme-react-action-gap\)'/);
  assert.match(react, /fontSize: 'var\(--theme-react-action-size\)'/);
  assert.match(react, /theme-react-action-weight-active/);
  assert.match(react, /theme-react-action-weight-idle/);
  assert.match(react, /color: active \? 'var\(--theme-color-status-warning\)' : 'var\(--theme-color-text-muted\)'/);
  const section = app.slice(app.indexOf('function SectionTitle'), app.indexOf('function Field'));
  assert.match(section, /theme-section-title-gap/);
  assert.match(section, /theme-section-title-bottom-gap/);
  assert.match(section, /theme-section-title-size/);
  assert.match(section, /theme-section-title-weight/);
  assert.match(section, /theme-section-count-size/);
  assert.match(section, /--theme-color-text-muted/);
  assert.match(section, /--theme-color-text-primary/);
});

test('avatar fallback and skin frame use theme tokens', () => {
  for (const token of [
    '--theme-avatar-radius:', '--theme-avatar-fallback-background:',
    '--theme-avatar-fallback-foreground:',
  ]) assert.ok(tokens.includes(token), `Missing avatar token: ${token}`);
  const avatar = app.slice(app.indexOf('function AvatarHead'), app.indexOf('// ---------------------------------------------------------------------------\n// Add-territory request'));
  assert.match(avatar, /borderRadius: 'var\(--theme-avatar-radius\)'/);
  assert.match(avatar, /background: 'var\(--theme-avatar-fallback-background\)'/);
  assert.match(avatar, /color: 'var\(--theme-avatar-fallback-foreground\)'/);
  assert.match(avatar, /border: '1px solid var\(--theme-color-border\)'/);
  assert.match(avatar, /size = 46/);
  assert.match(avatar, /onError=\{\(\) => setError\(true\)\}/);
  assert.match(avatar, /useEffect\(\(\)=>setError\(false\),\[source\]\)/);
});

test('score badge geometry and typography are tokenized without changing role colors', () => {
  for (const token of [
    '--theme-score-badge-radius:', '--theme-score-badge-weight:',
    '--theme-score-badge-line-height:', '--theme-score-badge-icon-stroke:',
    '--theme-score-badge-shadow:',
    ...['sm', 'default', 'lg', 'recruitment'].flatMap(preset => [
      `--theme-score-badge-gap-${preset}:`,
      `--theme-score-badge-padding-${preset}:`,
      `--theme-score-badge-size-${preset}:`,
      `--theme-score-badge-icon-${preset}:`,
      `--theme-score-badge-height-${preset}:`,
    ]),
  ]) assert.ok(tokens.includes(token), `Missing score badge token: ${token}`);
  const score = app.slice(app.indexOf('function ScoreBadge'), app.indexOf('function Segmented'));
  assert.match(score, /const preset = \['sm', 'recruitment', 'lg'\]/);
  assert.match(score, /var\(--theme-score-badge-\$\{name\}-\$\{preset\}\)/);
  assert.match(score, /var\(--theme-recipe-badge-success-fg\)/);
  assert.match(score, /var\(--theme-recipe-badge-primary-fg\)/);
  assert.match(tokens, /--theme-recipe-badge-success-fg: var\(--theme-color-status-success\);/);
  assert.match(tokens, /--theme-recipe-badge-primary-fg: var\(--theme-color-action-primary\);/);
  assert.match(score, /Оценка инспектора/);
  assert.match(score, /Оценка игроков/);
  assert.match(score, /Number\(value\|\|0\)\.toFixed\(1\)/);
});

test('App styles consume semantic theme roles instead of legacy color aliases', () => {
  for (const legacy of [
    'bg', 'surface', 'surface-2', 'surface-3', 'text', 'text-secondary',
    'text-muted', 'text-dim', 'purple', 'purple-soft', 'purple-strong',
    'purple-border', 'mint', 'mint-soft',
    'red', 'red-soft', 'red-border', 'gem', 'border',
    'shadow-sm', 'shadow-md', 'shadow-lg', 'glow-purple', 'glow-mint',
    'ease-standard', 'ease-interactive', 'motion-tap', 'motion-standard',
    'motion-modal', 'radius-md', 'radius-lg',
  ]) assert.doesNotMatch(app, new RegExp(`var\\(--${legacy}\\)`), `Legacy alias still used: ${legacy}`);
  assert.match(app, /var\(--content-color-gem\)/);
  assert.match(tokens, /--gem: var\(--content-color-gem\)/);
  assert.match(app, /var\(--slider-fill\)/);
  assert.match(app, /var\(--slider-progress\)/);
  assert.match(app, /var\(--vox-marker-inverse-scale, 1\)/);
});


test('success and warning borders have distinct semantic tokens', () => {
  assert.match(tokens, /--theme-color-status-success-border:/);
  assert.match(tokens, /--theme-color-status-warning-border:/);
  assert.doesNotMatch(tokens, /--(?:emerald|gold)(?:-soft)?:/);
  assert.match(tokens, /--theme-color-status-warning:\s*var\(--theme-color-status-success\);/);
  assert.match(tokens, /--theme-color-status-info:\s*#B5BBCB/);
  assert.doesNotMatch(app, /--mint-strong/);
  assert.ok(app.includes('border-color:var(--theme-color-status-warning-border)'));
  assert.ok(app.includes('var(--theme-color-status-success-border)'));
});

test('primary action text uses the theme-defined contrast role', () => {
  assert.match(tokens, /--theme-color-action-primary-contrast:/);
  assert.doesNotMatch(app, /background:\s*['"]var\\(--theme-color-action-primary\\)['"],\s*color:\s*['"]#fff['"]/);
});


test('theme tokens define overlay, focus, and warning contrast roles', () => {
  for (const token of [
    '--theme-color-overlay-scrim:',
    '--theme-color-action-primary-focus:',
    '--theme-color-status-warning-contrast:',
    '--theme-glow-warning:',
  ]) assert.ok(tokens.includes(token), `Missing token: ${token}`);
  assert.ok(app.includes('background:\'var(--theme-color-overlay-scrim)\''));
  assert.ok(app.includes('var(--theme-color-action-primary-focus)'));
  assert.ok(app.includes('var(--theme-color-status-warning-contrast)'));
});

test('warning buttons retain warning background, contrast, border, and glow', () => {
  const warning = app.slice(app.indexOf('/* Primary controls */'), app.indexOf('button[style*="background: var(--theme-color-status-success)"]'));
  assert.ok(warning.includes('background:var(--theme-color-status-warning)!important'));
  assert.ok(warning.includes('color:var(--theme-color-status-warning-contrast)!important'));
  assert.ok(warning.includes('--theme-glow-warning'));
  assert.ok(!warning.includes('background:var(--theme-color-status-success)!important'));
});

test('semantic action and status controls avoid hard-coded contrast colors', () => {
  const primary = app.slice(app.indexOf('/* Primary controls */'), app.indexOf('/* Cyan is reserved'));
  assert.doesNotMatch(primary, /#FFFFFF|#06120D/);
  assert.ok(primary.includes('--theme-color-action-primary-contrast'));
  assert.ok(primary.includes('--theme-color-status-success-contrast'));
});


test('status and action hover treatments consume semantic theme roles', () => {
  const styles = app.slice(app.indexOf('.atlas-fixed-toast{'), app.indexOf('/* More consistent control geometry.'));
  assert.match(styles, /border:1px solid var\(--theme-color-status-success-border\)/);
  assert.match(styles, /var\(--theme-color-status-success-soft\)/);
  assert.match(styles, /var\(--theme-color-action-primary-border\)/);
  assert.match(styles, /var\(--theme-glow-primary\)/);
  assert.match(styles, /var\(--theme-glow-success\)/);
  assert.match(styles, /var\(--theme-color-border-strong\)/);
  const reusableChrome = styles.slice(0, styles.indexOf('.atlas-visual-card:hover'));
  assert.doesNotMatch(reusableChrome, /rgba\(65,255,167|rgba\(139,92,246|rgba\(181,187,203/);
});

test('user-selected visual palette remains content-owned, not theme chrome', () => {
  assert.match(app, /const VISUAL_COLORS=\[\['none','none'\],\['red','#EF4444'\]/);
  assert.match(app, /data-visual-color=/);
});


test('image overlays and bottom navigation use semantic theme tokens', () => {
  for (const token of [
    '--theme-color-navigation-surface:',
    '--theme-color-image-control-surface:',
  ]) assert.ok(tokens.includes(token), `Missing theme token: ${token}`);
  assert.ok(app.includes("background: 'var(--theme-color-overlay-scrim)'"));
  assert.ok(app.includes("background: 'rgba(8,13,34,.72)'"),'territory exit button shares the award badge surface');
  assert.ok(app.includes("border: '1px solid rgba(255,255,255,.4)'"),"territory exit button shares the award badge border");
  assert.ok(app.includes("color:'var(--theme-color-text-secondary)'"));
  assert.ok(app.includes("background:'var(--theme-color-navigation-surface)'"));
});


test('reusable depth and inset highlights are controlled by theme tokens', () => {
  for (const token of [
    '--theme-shadow-slider-thumb:',
    '--theme-shadow-toast:',
    '--theme-shadow-navigation:',
    '--theme-color-highlight-inset-subtle:',
    '--theme-color-highlight-inset-soft:',
  ]) assert.ok(tokens.includes(token), `Missing theme token: ${token}`);
  assert.ok(app.includes('box-shadow:var(--theme-shadow-slider-thumb)'));
  assert.ok(app.includes('box-shadow:var(--theme-shadow-toast),0 0 0 1px var(--theme-color-status-success-border)'));
  assert.ok(app.includes('box-shadow:var(--theme-shadow-navigation)'));
  assert.ok(app.includes('inset 0 1px 0 var(--theme-color-highlight-inset-subtle)'));
  assert.ok(app.includes('inset 0 1px 0 var(--theme-color-highlight-inset-soft)'));
});


test('global typography hierarchy uses theme-owned line-height and field roles', () => {
  for (const token of [
    '--theme-type-headline-line-height:',
    '--theme-type-title-line-height:',
    '--theme-type-small-line-height:',
    '--theme-type-label-line-height:',
    '--theme-type-field-size:',
    '--theme-type-field-line-height:',
    '--theme-type-button-line-height:',
    '--theme-type-inline-line-height:',
  ]) assert.ok(tokens.includes(token), `Missing typography token: ${token}`);
  assert.ok(app.includes('line-height:var(--theme-type-headline-line-height)'));
  assert.ok(app.includes('line-height:var(--theme-type-title-line-height)'));
  assert.ok(app.includes('font-size:var(--theme-type-field-size)'));
  assert.ok(app.includes('font-size:var(--theme-type-label-size)'));
  assert.ok(app.includes('.atlas-root span{ line-height:var(--theme-type-inline-line-height); }'));
});


test('display and control typography details are theme roles', () => {
  for (const token of [
    '--theme-type-display-letter-spacing:',
    '--theme-type-h1-letter-spacing:',
    '--theme-type-h2-letter-spacing:',
    '--theme-type-h3-letter-spacing:',
    '--theme-type-paragraph-margin-bottom:',
    '--theme-type-button-weight:',
    '--theme-type-button-letter-spacing:',
  ]) assert.ok(tokens.includes(token), `Missing typography token: ${token}`);
  assert.ok(app.includes('letter-spacing:var(--theme-type-display-letter-spacing)'));
  assert.ok(app.includes('font-weight:var(--theme-type-button-weight)'));
  assert.match(app, /margin:\s*0 0 var\(--theme-type-paragraph-margin-bottom\)/);
});


test('decorative chrome sheen and map-marker depth use theme roles', () => {
  for (const token of [
    '--theme-shadow-map-marker-hover:',
    '--theme-color-sheen-soft:',
    '--theme-color-sheen-strong:',
  ]) assert.ok(tokens.includes(token), `Missing theme token: ${token}`);
  assert.ok(app.includes('filter:drop-shadow(var(--theme-shadow-map-marker-hover))'));
  assert.ok(app.includes('var(--theme-color-sheen-soft)'));
  assert.ok(app.includes('var(--theme-color-sheen-strong)'));
});


test('account switcher geometry and all toast/focus depths use theme roles', () => {
  for (const token of [
    '--theme-shadow-focus-field:',
    '--theme-account-switcher-padding:',
  ]) assert.ok(tokens.includes(token), `Missing theme token: ${token}`);
  assert.match(app, /\.atlas-account-switcher\{[^}]*border-radius:var\(--theme-radius-card\);padding:\s*var\(--theme-account-switcher-padding\)/);
  assert.ok(app.includes('margin-bottom:var(--theme-space-3)'));
  assert.ok(app.includes('.atlas-fixed-toast--error{background:color-mix(in srgb,var(--theme-color-status-danger-soft) 45%,#000);border-color:var(--theme-color-status-danger-border);color:var(--theme-color-status-danger);box-shadow:var(--theme-shadow-toast);animation:atlas-toast-in .28s cubic-bezier(.22,.72,.22,1) both,atlas-toast-error-glow .70s ease-out both;'));
  assert.ok(app.includes('.atlas-fixed-toast--warning{background:color-mix(in srgb,var(--theme-color-status-warning-soft) 45%,#000);border-color:var(--theme-color-status-warning-border);color:var(--theme-color-status-warning);box-shadow:var(--theme-shadow-toast);'));
  assert.ok(app.includes('box-shadow:0 0 0 3px var(--theme-color-action-primary-focus),var(--theme-shadow-focus-field)'));
});


test('range slider shadows and cover-title readability use theme roles', () => {
  assert.ok(tokens.includes('--theme-shadow-cover-title:'));
  assert.equal((app.match(/box-shadow:var\(--theme-shadow-slider-thumb\)/g) || []).length, 2, 'WebKit and Firefox slider thumbs must share the same shadow');
  assert.ok(app.includes("textShadow:'var(--theme-shadow-cover-title)'"));
});


test('application references only defined static theme roles', () => {
  assert.doesNotMatch(app, /var\(--theme-color-surface-base\)/, 'Removed undefined surface-base alias');
  const defined = new Set([...tokens.matchAll(/(--[\\w-]+)\\s*:/g)].map(match => match[1]));
  const referenced = new Set([...app.matchAll(/var\((--[\\w-]+)/g)].map(match => match[1]));
  const localOrDynamic = new Set([
    '--slider-fill', '--slider-progress', '--vox-marker-inverse-scale',
    '--theme-score-badge-',
  ]);
  const missing = [...referenced].filter(name =>
    !defined.has(name) && !localOrDynamic.has(name) && !name.startsWith('--theme-score-badge-')
  );
  assert.deepEqual(missing, [], 'Every static theme token used by App.jsx must be defined');
});


test('shared Button and IconButton use theme recipes mapped to semantic borders', () => {
  const iconButton = app.slice(app.indexOf('function IconButton'), app.indexOf('function Button'));
  const button = app.slice(app.indexOf('function Button'), app.indexOf('function SurfaceCard'));
  assert.match(iconButton, /primary: \{[^}]*border:'1px solid var\(--theme-recipe-icon-primary-border\)'/);
  assert.match(iconButton, /success: \{[^}]*border:'1px solid var\(--theme-recipe-icon-success-border\)'/);
  assert.match(button, /primary: \{[^}]*border:'1px solid var\(--theme-recipe-button-primary-border\)'/);
  assert.match(button, /success: \{[^}]*border:'1px solid var\(--theme-recipe-button-success-border\)'/);
  assert.match(tokens, /--theme-recipe-icon-primary-border: var\(--theme-color-action-primary-border\);/);
  assert.match(tokens, /--theme-recipe-icon-success-border: var\(--theme-color-status-success-border\);/);
  assert.match(tokens, /--theme-recipe-button-primary-border: var\(--theme-color-action-primary-border\);/);
  assert.match(tokens, /--theme-recipe-button-success-border: var\(--theme-color-status-success-border\);/);
});


test('bottom navigation uses safe-area-aware theme geometry and a mobile dynamic viewport', () => {
  for (const token of [
    '--theme-navigation-padding-block-start:', '--theme-navigation-padding-inline:',
    '--theme-navigation-padding-block-end:', '--theme-navigation-item-min-height:',
    '--theme-navigation-item-gap:', '--theme-navigation-icon-size:',
    '--theme-navigation-label-size:',
  ]) assert.ok(tokens.includes(token), `Missing navigation token: ${token}`);
  assert.ok(tokens.includes('--theme-navigation-padding-block-end: calc(14px + env(safe-area-inset-bottom));'));
  assert.ok(app.includes('min-height:100vh;'));
  assert.ok(app.includes('min-height:100dvh;'));
  assert.ok(app.includes("padding: 'var(--theme-navigation-padding-block-start) var(--theme-navigation-padding-inline) var(--theme-navigation-padding-block-end)'"));
  assert.ok(app.includes("minHeight:'var(--theme-navigation-item-min-height)'"));
  assert.ok(app.includes('size="var(--theme-navigation-icon-size)"'));
  assert.ok(!app.includes("data-theme={activeTheme} style={{ minHeight: '100vh'"));
});


test('narrow-screen typography uses theme-owned compact type roles', () => {
  for (const token of [
    '--theme-type-compact-display-size:', '--theme-type-compact-headline-size:',
    '--theme-type-compact-title-size:', '--theme-type-compact-body-size:',
  ]) assert.ok(tokens.includes(token), `Missing compact typography token: ${token}`);
  assert.ok(app.includes('.atlas-root h1{font-size:var(--theme-type-compact-display-size);}'));
  assert.ok(app.includes('.atlas-root h2{font-size:var(--theme-type-compact-headline-size);}'));
  assert.ok(app.includes('.atlas-root h3{font-size:var(--theme-type-compact-title-size);}'));
  assert.ok(app.includes('.atlas-root p{font-size:var(--theme-type-compact-body-size);}'));
  assert.ok(app.includes('@media (max-width:380px)'));
});


test('modal shells use safe overlay spacing, theme geometry and dynamic viewport caps', () => {
  const roles = ['compact', 'standard', 'form', 'settings', 'expanded', 'editor'];
  for (const token of [
    '--theme-modal-overlay-padding:', '--theme-modal-content-padding:',
    '--theme-modal-viewport-inset-total:', '--theme-modal-viewport-safe-height:',
    ...roles.map(role => `--theme-modal-max-height-${role}:`),
  ]) assert.ok(tokens.includes(token), `Missing modal token: ${token}`);
  assert.ok(tokens.includes('--theme-modal-viewport-safe-height: calc(100vh - var(--theme-modal-viewport-inset-total));'));
  assert.match(app, /\.atlas-overlay\{box-sizing:border-box;padding:\s*var\(--theme-modal-overlay-padding\);/);
  assert.ok(app.includes('@supports (height:100dvh)'));
  assert.ok(app.includes('--theme-modal-viewport-safe-height:calc(100dvh - var(--theme-modal-viewport-inset-total));'));
  assert.ok(app.includes('var(--theme-modal-viewport-safe-height)'));
  for (const role of roles) assert.ok(app.includes(`var(--theme-modal-max-height-${role})`));
  assert.ok(app.includes("padding: 'calc(env(safe-area-inset-top) + 12px) 12px calc(69px + env(safe-area-inset-bottom) + 12px)'"));
  assert.ok(app.includes("calc(100vh - 93px - env(safe-area-inset-top) - env(safe-area-inset-bottom))"));
  assert.ok(app.includes("zIndex:130"));
  assert.ok(app.includes("borderRadius: 'var(--theme-radius-modal)'"));
  assert.equal(app.split("padding:'var(--theme-modal-content-padding)'").length - 1 + app.split("padding: 'var(--theme-modal-content-padding)'").length - 1, 5);
});


test('modal shells retain dedicated radius and elevation outside generic surface rules', () => {
  assert.ok(app.includes('div[style*="background: var(--theme-color-surface)"]:not(.atlas-modal-shell):not(.atlas-surface){'));
  assert.ok(app.includes('div[style*="background: var(--theme-color-surface-raised)"]:not(.atlas-modal-shell):not(.atlas-surface){'));
  assert.ok(app.includes('.atlas-modal-shell{animation:atlas-modal-in var(--theme-motion-modal) var(--theme-ease-standard) both;isolation:isolate;box-shadow:var(--theme-shadow-high)'));
  assert.ok(app.includes("borderRadius:'var(--theme-radius-modal)'"));
});


test('shared SurfaceCard keeps its explicit radius and elevation', () => {
  assert.ok(app.includes('className={`atlas-surface${className ? ` ${className}` : \'\'}`}'));
  assert.ok(app.includes("borderRadius: radius"));
  assert.ok(app.includes("boxShadow: 'var(--theme-recipe-surface-shadow)'"));
  assert.ok(app.includes(':not(.atlas-surface){'));
});


test('fixed toast geometry, typography and safe viewport spacing use theme tokens', () => {
  for (const token of [
    '--theme-toast-bottom-offset:', '--theme-toast-max-width:',
    '--theme-toast-viewport-gutter-total:', '--theme-toast-padding-block:',
    '--theme-toast-padding-inline:', '--theme-toast-radius:',
    '--theme-toast-font-size:', '--theme-toast-font-weight:',
    '--theme-toast-line-height:',
  ]) assert.ok(tokens.includes(token), `Missing toast token: ${token}`);
  assert.ok(app.includes('bottom:calc(var(--theme-toast-bottom-offset) - 4px);'));
  assert.ok(app.includes('max-width:min(calc(100vw - var(--theme-toast-viewport-gutter-total)),var(--theme-toast-max-width));'));
  assert.ok(app.includes('padding: var(--theme-toast-padding-block) var(--theme-toast-padding-inline);'));
  assert.ok(app.includes('border-radius:var(--theme-toast-radius);'));
  assert.ok(app.includes('font-size:var(--theme-toast-font-size);'));
  assert.ok(app.includes('line-height:var(--theme-toast-line-height);'));
});


test('account switcher inset highlight uses the shared surface treatment token', () => {
  assert.ok(tokens.includes('--theme-color-highlight-inset-soft:'));
  assert.ok(app.includes('box-shadow:var(--theme-shadow-low),inset 0 1px 0 var(--theme-color-highlight-inset-soft)'));
  assert.doesNotMatch(app.slice(app.indexOf('.atlas-account-switcher{'), app.indexOf('.atlas-account-switcher--static')), /rgba\(255,255,255,\.025\)/);
});


test('repeated list, review and recruitment cards use theme geometry roles', () => {
  for (const token of ['--theme-radius-card:', '--theme-radius-control:', '--theme-space-2:', '--theme-space-3:', '--theme-space-4:']) {
    assert.ok(tokens.includes(token), `Missing card geometry token: ${token}`);
  }
  assert.match(app, /className="press atlas-recruitment-card" style=\{\{[^}]*borderRadius:'var\(--theme-radius-card\)',padding: 10/);
  assert.match(app, /className="atlas-review-card" style=\{\{[^}]*borderRadius: 'var\(--theme-radius-control\)', padding: 'var\(--theme-space-3\)'/);
  assert.match(app, /className="press atlas-list-card" style=\{\{[^}]*borderRadius:'var\(--theme-radius-card\)',padding: 10/);
});


test('repeated base surface panels use shared card radius and spacing tokens', () => {
  const surface = app.slice(app.indexOf('function SurfaceCard'), app.indexOf('/** Theme-aware range control'));
  assert.match(surface, /padding = 'var\(--theme-space-4\)'/);
  assert.match(surface, /padding === 'var\(--theme-space-4\)' \? 'var\(--theme-recipe-surface-padding\)' : padding/);
  assert.match(tokens, /--theme-recipe-surface-padding:\s*10px/);
});


test('compact raised panels use control radius and space-3 geometry roles', () => {
  assert.ok(app.includes("borderRadius:'var(--theme-radius-control)',padding: 10,marginBottom: 'var(--theme-layout-section-gap)'"));
  assert.match(tokens, /--theme-layout-section-gap:\s*8px/);
});


test('button and icon-button variants resolve through theme-owned component recipes', () => {
  const recipeRoles = [
    '--theme-recipe-button-primary-bg:', '--theme-recipe-button-primary-fg:', '--theme-recipe-button-primary-border:',
    '--theme-recipe-button-neutral-bg:', '--theme-recipe-button-neutral-fg:', '--theme-recipe-button-neutral-border:',
    '--theme-recipe-button-success-bg:', '--theme-recipe-button-success-fg:', '--theme-recipe-button-success-border:',
    '--theme-recipe-button-danger-bg:', '--theme-recipe-button-danger-fg:', '--theme-recipe-button-danger-border:',
    '--theme-recipe-button-ghost-bg:', '--theme-recipe-button-ghost-fg:', '--theme-recipe-button-ghost-border:',
    '--theme-recipe-icon-neutral-bg:', '--theme-recipe-icon-primary-bg:', '--theme-recipe-icon-success-bg:',
    '--theme-recipe-icon-danger-bg:', '--theme-recipe-icon-ghost-bg:',
    '--theme-recipe-segmented-active-bg:', '--theme-recipe-segmented-active-fg:',
    '--theme-recipe-segmented-idle-bg:', '--theme-recipe-segmented-idle-fg:',
  ];
  for (const role of recipeRoles) assert.ok(tokens.includes(role), `Missing component recipe role: ${role}`);
  for (const role of ['primary','neutral','success','danger','ghost']) {
    assert.ok(app.includes(`var(--theme-recipe-button-${role}-bg)`), `Button ${role} background bypasses its recipe`);
    assert.ok(app.includes(`var(--theme-recipe-icon-${role}-bg)`), `IconButton ${role} background bypasses its recipe`);
  }
});


test('segmented control uses a moving action indicator and theme-owned idle text', () => {
  const optionRule=app.slice(app.indexOf('.atlas-segmented__option{'),app.indexOf('.atlas-segmented__option.is-active{'));
  const activeRule=app.slice(app.indexOf('.atlas-segmented__option.is-active{'),app.indexOf('.atlas-segmented__option:focus-visible{'));
  const indicatorRule=app.slice(app.indexOf('.atlas-segmented__indicator{'),app.indexOf('.atlas-segmented__option{'));
  assert.ok(optionRule.includes('background:transparent;'));
  assert.ok(optionRule.includes('color:var(--theme-recipe-segmented-idle-fg);'));
  assert.ok(activeRule.includes('color:#fff;'));
  assert.ok(indicatorRule.includes('background:var(--theme-color-action-primary);'));
  assert.ok(indicatorRule.includes('transform:translateX(calc(var(--segmented-index) * 100%));'));
});


test('text, textarea and select primitives share theme-owned field recipes', () => {
  for (const token of ['--theme-recipe-field-bg:', '--theme-recipe-field-fg:', '--theme-recipe-field-border:', '--theme-recipe-field-radius:', '--theme-recipe-field-padding:']) {
    assert.ok(tokens.includes(token), `Missing field recipe role: ${token}`);
  }
  for (const name of ['Field','TextAreaField','SelectField']) {
    const start=app.indexOf(`function ${name}(`);
    const end=app.indexOf('\nfunction ',start+10);
    const component=app.slice(start,end>0?end:app.length);
    assert.ok(component.includes('var(--theme-recipe-field-bg)'), `${name} bypasses field background recipe`);
    assert.ok(component.includes('var(--theme-recipe-field-radius)'), `${name} bypasses field radius recipe`);
    assert.ok(component.includes('var(--theme-recipe-field-padding)'), `${name} bypasses field padding recipe`);
  }
});


test('SurfaceCard tone and shared geometry resolve through surface recipes', () => {
  for (const token of ['--theme-recipe-surface-base-bg:', '--theme-recipe-surface-raised-bg:', '--theme-recipe-surface-elevated-bg:', '--theme-recipe-surface-border:', '--theme-recipe-surface-fg:', '--theme-recipe-surface-shadow:', '--theme-recipe-surface-radius:', '--theme-recipe-surface-padding:']) {
    assert.ok(tokens.includes(token), `Missing surface recipe: ${token}`);
  }
  const surface = app.slice(app.indexOf('function SurfaceCard'), app.indexOf('/** Theme-aware range control'));
  for (const role of ['base-bg','raised-bg','elevated-bg','border','fg','shadow','radius','padding']) {
    assert.ok(surface.includes(`var(--theme-recipe-surface-${role})`), `SurfaceCard bypasses ${role} recipe`);
  }
});


test('ScoreBadge uses semantic badge recipes for community and curator variants', () => {
  const badge=app.slice(app.indexOf('function ScoreBadge('),app.indexOf('\nfunction ',app.indexOf('function ScoreBadge(')+10));
  for (const recipe of ['success-fg','success-bg','success-border','primary-fg','primary-bg','primary-border']) assert.ok(badge.includes(`var(--theme-recipe-badge-${recipe})`), `ScoreBadge bypasses ${recipe}`);
  for (const status of ['neutral','primary','success','warning','danger']) for (const part of ['bg','fg','border']) assert.ok(tokens.includes(`--theme-recipe-badge-${status}-${part}:`),`Missing badge recipe ${status}-${part}`);
});


test('ToggleField track and thumb states use independent theme recipes', () => {
  const toggle=app.slice(app.indexOf('function ToggleField('),app.indexOf('\nfunction ',app.indexOf('function ToggleField(')+10));
  for(const role of ['track-on-bg','track-on-border','track-off-bg','track-off-border','thumb-on-bg','thumb-off-bg']) {
    assert.ok(tokens.includes(`--theme-recipe-toggle-${role}:`),`Missing toggle recipe ${role}`);
    assert.ok(toggle.includes(`var(--theme-recipe-toggle-${role})`),`ToggleField bypasses ${role}`);
  }
});


test('Vox profile textarea rhythm and action states follow the shared UI contract', () => {
  const textarea = app.slice(app.indexOf('function TextAreaField('), app.indexOf('function SelectField('));
  assert.match(textarea, /containerStyle = \{\}/);
  assert.match(textarea, /marginBottom: 'var\(--theme-space-3\)', \.\.\.containerStyle/);

  const recruitment = app.slice(app.indexOf('function RecruitmentManagement('), app.indexOf('function CityManagementProfile('));
  assert.match(recruitment, /containerStyle=\{\{marginBottom:\s*0\}\}/);
  assert.match(recruitment, /display:'flex',gap:\s*8,marginTop:\s*8/);
  assert.doesNotMatch(recruitment, /fontSize:13,marginBottom:8,cursor:/);

  const cityProfile = app.slice(app.indexOf('function CityManagementProfile('), app.indexOf('\nfunction ', app.indexOf('function CityManagementProfile(') + 10));
  assert.match(cityProfile, /containerStyle=\{\{marginBottom:\s*0\}\}/);
  assert.doesNotMatch(cityProfile, /fontSize:13,marginBottom:4\}\}\/>/);

  const lightbox = app.slice(app.indexOf('function Lightbox('), app.indexOf('\nfunction ', app.indexOf('function Lightbox(') + 10));
  assert.match(lightbox, /width:44, height:44/);
  const territoryHeader = app.slice(app.indexOf('function TerritoryDetail('), app.indexOf('\nfunction ', app.indexOf('function TerritoryDetail(') + 10));
  assert.match(territoryHeader, /width: 44, height: 44/);

  const visualFilters = app.slice(app.indexOf('function CustomizationScreen('), app.indexOf('function BottomNav('));
  assert.match(visualFilters, /var\(--theme-color-border-strong\)/);
  assert.match(visualFilters, /var\(--theme-color-action-primary-border\)/);

  const reviewCompose = app.slice(app.indexOf('className="atlas-review-compose-row"'), app.indexOf('!hasNickname', app.indexOf('className="atlas-review-compose-row"')));
  assert.match(reviewCompose, /background:isInspectorRole\?'var\(--theme-color-status-success\)':'var\(--theme-color-action-primary\)'/);
  assert.match(reviewCompose, /color:isInspectorRole\?'var\(--theme-color-status-success-contrast\)':'var\(--theme-color-action-primary-contrast\)'/);
  assert.match(reviewCompose, /width:44,height:44/);
});

test('event reminder unit switch is a flush two-half segmented control', () => {
  assert.match(events, /className="event-reminder-unit-switch" style=\{\{display:'flex',minHeight:44,padding:0,borderRadius:'var\(--theme-radius-control\)',overflow:'hidden'[^}]*gap:0\}\}/);
  assert.match(events, /className="press event-reminder-unit-option" style=\{\{flex:'1 1 50%',minWidth:0,minHeight:42,padding:0,border:0,borderRadius:0/);
  assert.ok(app.includes('#root .atlas-root .event-reminder-unit-switch>.event-reminder-unit-option{flex:1 1 0!important;min-width:0!important;width:50%!important;max-width:50%!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;transform:none!important;}'));
  assert.ok(app.includes('.event-reminder-unit-switch>.event-reminder-unit-option:active{transform:none!important;filter:none!important;}'));
  assert.match(events, /background:draft\.unit===unit\.value\?'var\(--theme-color-action-primary\)':'var\(--theme-color-surface-raised\)'/);
});

test('events page starts at the same 15px inset as its horizontal content', () => {
  assert.ok(events.includes("className=\"atlas-page atlas-page--events\" style={{ padding: '15px 15px 100px' }}"));
});

test('fixed toast uses 12px content-sized padding', () => {
  assert.match(tokens, /--theme-toast-padding-block:\s*7px/);
  assert.match(tokens, /--theme-toast-padding-inline:\s*12px/);
  assert.match(app, /width:max-content;[\s\S]*padding: var\(--theme-toast-padding-block\) var\(--theme-toast-padding-inline\);/);
});

test('resident read-only territory fields do not expose an I-beam or keyboard focus', () => {
  const recruitment = app.slice(app.indexOf('function RecruitmentManagement('), app.indexOf('function CityManagementProfile('));
  const cityProfile = app.slice(app.indexOf('function CityManagementProfile('), app.indexOf('function ProfileInventory('));
  assert.match(recruitment, /readOnly=\{readOnly\} tabIndex=\{readOnly\?-1:undefined\}/);
  assert.match(recruitment, /pointerEvents:readOnly\?'none':'auto',userSelect:readOnly\?'none':'auto',caretColor:readOnly\?'transparent':'auto'/);
  assert.match(cityProfile, /readOnly=\{readOnly\} tabIndex=\{readOnly\?-1:undefined\}/);
  assert.match(cityProfile, /pointerEvents:readOnly\?'none':'auto',userSelect:readOnly\?'none':'auto',caretColor:readOnly\?'transparent':'auto'/);
});

test('resident additional information matches the 8px profile card rhythm', () => {
  const cityProfile = app.slice(app.indexOf('function CityManagementProfile('), app.indexOf('function ProfileInventory('));
  assert.match(cityProfile, /fontSize:13,marginBottom: 8,minHeight:72/);
});

test('territory customization section has the same subtle divider rhythm as member sections', () => {
  const cityProfile = app.slice(app.indexOf('function CityManagementProfile('), app.indexOf('function ProfileInventory('));
  assert.match(cityProfile, /Оформление территории<\/div>\s*<div style=\{\{borderTop:'1px solid var\(--theme-color-border\)',marginTop: 8,paddingTop: 8\}\}>/);
});

test('profile bottom padding clears the fixed navigation and safe area', () => {
  assert.ok(app.includes("className=\"atlas-page atlas-page--profile\" style={{padding: '18px 15px calc(85px + env(safe-area-inset-bottom))',minHeight:'60vh'}}"));
});

test('reminder amount label and all three control radii are consistent', () => {
  assert.ok(app.includes('placeholder="Количество"'));
  assert.match(app, /event-reminder-unit-switch[\s\S]*?borderRadius:'var\(--theme-radius-control\)'/);
  assert.match(app, /placeholder="Количество" style=\{\{[^}]*borderRadius:'var\(--theme-radius-control\)'/);
  assert.match(app, /borderRadius:'var\(--theme-radius-control\)'[^}]*fontWeight:800\}\}>\{busy\?'Сохранение…':event\.reminder\?'Сохранить изменения':'Подтвердить напоминание'\}/);
});

test('field borders transition from Purple to Mint, with the inspector review inverse', () => {
  for (const token of [
    '--theme-recipe-field-border:', '--theme-recipe-field-focus-border:',
    '--theme-recipe-field-inspector-border:', '--theme-recipe-field-inspector-focus-border:',
    '--theme-recipe-field-transition:',
  ]) assert.ok(tokens.includes(token), `Missing field interaction token: ${token}`);
  assert.match(tokens, /--theme-recipe-field-border:\s*var\(--theme-color-action-primary\)/);
  assert.match(tokens, /--theme-recipe-field-focus-border:\s*var\(--theme-color-status-success\)/);
  assert.match(tokens, /--theme-recipe-field-inspector-border:\s*var\(--theme-color-status-success\)/);
  assert.match(tokens, /--theme-recipe-field-inspector-focus-border:\s*var\(--theme-color-action-primary\)/);
  assert.ok(app.includes('transition:var(--theme-recipe-field-transition)'));
  assert.ok(app.includes('#root .atlas-root textarea,#root .atlas-root select{border-color:var(--theme-recipe-field-border)!important;transition:var(--theme-recipe-field-transition);}'));
  assert.ok(app.includes('#root .atlas-root .atlas-readonly-field{border-color:var(--theme-recipe-field-border)!important;}'));
  assert.ok(app.includes('input.atlas-review-compose-field:focus{border-color:var(--theme-recipe-field-inspector-focus-border)'));
  assert.ok(app.includes("className={isInspectorRole?'atlas-review-compose-field':''}"));
});

test('theme picker removes the one-theme notice and uses Purple arrow outlines', () => {
  assert.doesNotMatch(app, /Сейчас доступна только тема Vox/);
  assert.ok(app.includes("whiteSpace:'pre-line'"));
  assert.equal((app.match(/aria-label="(?:Предыдущая|Следующая) тема"/g)||[]).length, 2);
  const arrows = [...app.matchAll(/<button type="button" aria-label="(?:Предыдущая|Следующая) тема"[\s\S]*?<\/button>/g)].map(match=>match[0]);
  assert.equal(arrows.length, 2);
  for (const arrow of arrows) {
    assert.ok(arrow.includes("border:'1px solid var(--theme-color-action-primary-border)'"));
    assert.ok(arrow.includes("background:'var(--theme-color-action-primary-soft)'"));
    assert.ok(arrow.includes("color:'var(--theme-color-action-primary)'"));
  }
});

test('profile and Visual bottom clearance is 85px and final territory actions keep 10px', () => {
  assert.ok(app.includes("className=\"atlas-page atlas-page--profile\" style={{padding: '18px 15px calc(85px + env(safe-area-inset-bottom))',minHeight:'60vh'}}"));
  assert.ok(app.includes("className=\"atlas-page atlas-page--customization\" style={{padding: '18px 15px 85px'}}"));
  assert.match(app, /fontWeight:800,marginBottom: 0\}\}>\{leaveBusy\?'Выход…':'Покинуть территорию'\}/);
  assert.match(app, /fontWeight:700,marginBottom: 0,minHeight:44\}\}>Запросить оценку инспектора/);
});

test('toast remains content-sized with 12px horizontal padding', () => {
  assert.match(tokens, /--theme-toast-padding-inline:\s*12px/);
  assert.match(app, /width:max-content;[\s\S]*max-width:min\(calc\(100vw - var\(--theme-toast-viewport-gutter-total\)\),var\(--theme-toast-max-width\)\)/);
});

test('equipped inventory visuals use a Mint image outline without a check badge', () => {
  const grid = app.slice(app.indexOf('function InventoryGrid('), app.indexOf('function RecruitmentManagement('));
  assert.ok(grid.includes("border:equipped?'2px solid #6EE7B7':'1px solid var(--theme-color-border)'"));
  assert.doesNotMatch(grid, /<Check size=\{11\}\/>/);
  assert.ok(grid.includes("objectFit:imageFit"));
  assert.ok(app.includes('#root .atlas-root .atlas-inventory-image--equipped{border:2px solid #6EE7B7!important;outline:none!important;box-shadow:inset 0 0 0 1px rgba(110,231,183,.2),0 0 0 1px rgba(110,231,183,.12)!important;}'));
  assert.doesNotMatch(grid, /MinecraftText as="div" text=\{item\.name\}/);
});


test('resident read-only additional information never turns usernames into links', () => {
  const cityProfile=app.slice(app.indexOf('function CityManagementProfile('),app.indexOf('function ProfileInventory('));
  assert.ok(cityProfile.includes('text={additionalInfo} interactive={false} className="atlas-readonly-field"'));
});

test('profile and event description textareas explicitly use the shared field recipe', () => {
  assert.ok(app.includes('className="atlas-profile-additional-field"'));
  assert.ok(app.includes('className="atlas-recruitment-description-field"'));
  assert.equal((events.match(/className="atlas-event-description-field"/g)||[]).length,3);
  assert.ok(app.includes('#root .atlas-root textarea.atlas-profile-additional-field,#root .atlas-root textarea.atlas-recruitment-description-field,#root .atlas-root textarea.atlas-event-description-field{border-color:var(--theme-recipe-field-border)!important;}'));
});

test('territory profile includes awards inventory, Telegram emoji previews and 52px banner plates', () => {
  const profile=app.slice(app.indexOf('function ProfileInventory('),app.indexOf('function TreasuryCard('));
  const city=app.slice(app.indexOf('function CityManagementProfile('),app.indexOf('function ProfileInventory('));
  const detail=app.slice(app.indexOf('function TerritoryDetail('),app.indexOf('function TerritoryCard('));
  assert.ok(profile.includes("columns={4} aspectRatio=\"1 / 1\" imageFit=\"contain\""));
  assert.ok(city.includes("columns={4} aspectRatio=\"1 / 1\" imageFit=\"contain\""));
  const banner=city.indexOf('>Баннер</div>');
  const marker=city.indexOf('>Метка</div>');
  const rewards=city.indexOf('>Награды</div>');
  assert.ok(banner>=0&&marker>banner&&rewards>marker,'Banner, marker and rewards appear in the intended order');
  assert.ok(city.includes("VISUAL_COLORS.filter(([value])=>value!=='none').map(([value])"));
  assert.ok(city.includes('inventory?.bannerGradient')&&city.includes('inventory?.bannerColor'));
  assert.ok(city.includes('Наград пока нет'));
  assert.ok(city.includes('inventory?.territoryAwards')&&city.includes('toggleAwardPlacement'));
  assert.ok(city.includes('Максимум 4 награды на странице территории'));
  assert.ok(city.includes("margin: '14px 0 6px'}}>Награды</div>"));
  assert.ok(city.includes("flexWrap:'wrap',marginBottom:0"));
  assert.ok(city.includes('marginTop:8,height:72'));
  assert.ok(city.includes("justifyContent:'center',gap: 8,flexWrap:'wrap',marginBottom:0"),'Profile banner colors are horizontally centered');
  assert.doesNotMatch(city, /На баннере ·/);
  assert.ok(city.includes("setNotice(`Награда установлена в слот ${nextSlot}`)"));
  assert.ok(city.includes("setNotice('Награда снята')"));
  assert.ok(city.includes("setNoticeType('success')"));
  assert.ok(city.includes("setNoticeType('error')"));
  assert.ok(city.includes('<FixedToast key={noticeRevision} message={notice} type={noticeType}/>'));
  assert.ok(!city.includes("territory?.name||'Название территории'"));
  assert.ok(city.includes("gridColumn:'1 / -1'")&&city.includes("gridTemplateColumns:'48px minmax(0,1fr)'"));
  assert.ok(city.includes("background:'var(--theme-color-surface-raised)'"),'Award cards use the same raised surface as marker tiles');
  assert.ok(city.includes("textAlign:'center'"),'Award names are centered within their text column');
  assert.ok(city.includes('WebkitLineClamp:3'));
  assert.ok(detail.includes("awards: Array.isArray(row.awards) ? row.awards : []"),'Detailed territory loading must copy awards into the visible page state');
  assert.ok(detail.includes("(t.awards||[]).filter(award=>award.slot_index!==null&&award.slot_index!==undefined)"));
  assert.ok(detail.includes("top:6,right:6+index*58,width:52,height:52"),'Award badges match the exit button plus its edge offset, with 6px outer margins');
  assert.ok(detail.includes('Number(b.slot_index)-Number(a.slot_index)'),'Most recently equipped award occupies the rightmost slot');
  assert.ok(detail.includes('setSelectedTerritoryAward(award)'));
  assert.ok(detail.includes('selectedTerritoryAward.name'));
  assert.ok(app.includes('function formatTerritoryAwardDate(value)'));
  assert.ok(app.includes("String(date.getDate()).padStart(2,'0')"));
  assert.ok(app.includes("String(date.getMonth()+1).padStart(2,'0')"));
  assert.ok(detail.includes('formatTerritoryAwardDate(selectedTerritoryAward.awarded_at)'),'Award modal shows the date as DD.MM.YYYY');
  assert.ok(detail.includes('TerritoryAwardIcon award={award} size={36}'),'Banner uses Telegram sticker previews');
  assert.ok(detail.includes('TerritoryAwardIcon award={selectedTerritoryAward} size={56}'),'Award detail popup uses the enlarged Telegram sticker preview');
});
test('visual color palettes are horizontally centered in editor, creation form and filters', () => {
  const editor=app.slice(app.indexOf('function VisualEditModal('),app.indexOf('function profileAccountLabel('));
  const visual=app.slice(app.indexOf('function CustomizationScreen('),app.indexOf('function BottomNav('));
  assert.equal((editor.match(/justifyContent:'center',gap: 6,marginBottom: 8/g)||[]).length,1);
  assert.ok(visual.includes("justifyContent:'center',gap: 6,flexWrap:'wrap'"));
});

test('theme picker arrows enforce the same Purple action surface and glyph as event links', () => {
  assert.equal((app.match(/className="press atlas-theme-arrow"/g)||[]).length,2);
  assert.ok(app.includes('#root .atlas-root .atlas-theme-arrow{border:1px solid var(--theme-color-action-primary-border)!important;background:var(--theme-color-action-primary-soft)!important;color:var(--theme-color-action-primary)!important;}'));
  assert.ok(app.includes('#root .atlas-root .atlas-theme-arrow svg{stroke:var(--theme-color-action-primary)!important;}'));
  assert.ok(app.includes('#root .atlas-root .atlas-theme-arrow:disabled{opacity:1!important;filter:none!important;}'));
});

test('FixedToast emerges from behind the bottom navigation, with compact typography and red errors', () => {
  assert.match(tokens,/--theme-toast-bottom-offset:\s*calc\(73px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(tokens,/--theme-toast-font-size:\s*14px/);
  assert.match(tokens,/--theme-toast-padding-inline:\s*12px/);
  assert.ok(app.includes('z-index:220;'),'Global toasts remain above the modal portal layer');
  assert.ok(app.includes('.atlas-toast-viewport{'));
  assert.ok(app.includes('bottom:calc(var(--theme-toast-bottom-offset) - 4px);'));
  assert.ok(app.includes('overflow:hidden;'));
  assert.ok(app.includes('@keyframes atlas-toast-in{from{opacity:0;transform:translate(-50%,100%)}to{opacity:1;transform:translate(-50%,0)}}'));
  assert.ok(app.includes('@keyframes atlas-toast-out{from{opacity:1;transform:translate(-50%,0)}to{opacity:0;transform:translate(-50%,100%)}}'));
  assert.ok(app.includes("onToast?.('Недостаточно самоцветов','error')"));
  assert.ok(app.includes('type={globalToast.type}/>'));
  assert.ok(app.includes('.atlas-fixed-toast--error{background:color-mix(in srgb,var(--theme-color-status-danger-soft) 45%,#000);border-color:var(--theme-color-status-danger-border);color:var(--theme-color-status-danger);'));
});


test('non-interactive Telegram usernames inherit the surrounding text color', () => {
  assert.ok(app.includes("color:interactive?'var(--theme-color-status-success)':(style.color||'inherit')"));
  const cityProfile=app.slice(app.indexOf('function CityManagementProfile('),app.indexOf('function ProfileInventory('));
  assert.ok(cityProfile.includes('text={additionalInfo} interactive={false}'));
});

test('territory action spacing relies on the card inset, without extra button margin', () => {
  const cityProfile=app.slice(app.indexOf('function CityManagementProfile('),app.indexOf('function ProfileInventory('));
  assert.match(cityProfile,/marginBottom: 0\}\}>\{leaveBusy\?'Выход…':'Покинуть территорию'/);
  assert.match(cityProfile,/fontWeight:700,marginBottom: 0,minHeight:44\}\}>Запросить оценку инспектора/);
  assert.ok(cityProfile.includes('<SurfaceCard className="atlas-page-panel" padding={10}'));
});

test('repeating the same territory action creates a fresh toast instance', () => {
  const cityProfile=app.slice(app.indexOf('function CityManagementProfile('),app.indexOf('function ProfileInventory('));
  assert.ok(cityProfile.includes('[noticeRevision,setNoticeRevision]=useState(0)'));
  assert.ok(cityProfile.includes('setNoticeRevision(value=>value+1)'));
  assert.ok(cityProfile.includes('<FixedToast key={noticeRevision} message={notice} type={noticeType}/>'));
});

test('toast width follows its text and darkens only the covered backdrop', () => {
  const start=app.indexOf('.atlas-fixed-toast{');
  const css=app.slice(start,app.indexOf('@keyframes atlas-toast-in',start));
  assert.ok(css.includes('display:inline-block;'));
  assert.ok(css.includes('width:max-content;'));
  assert.ok(css.includes('min-width:0;'));
  assert.ok(app.includes('.atlas-root > div:not(.atlas-fixed-toast):not(.atlas-toast-viewport){ width:min(100%,var(--theme-content-max-width)); }'));
  assert.doesNotMatch(app, /\.atlas-root > div\{\s*width:min\(100%,var\(--theme-content-max-width\)\)/);
  assert.ok(!css.includes('backdrop-filter'));
  assert.ok(!css.includes('-webkit-backdrop-filter'));
  assert.ok(app.includes('@keyframes atlas-toast-error-glow{'));
  assert.ok(app.includes('0 0 0 5px var(--theme-color-status-danger-soft)'));
  assert.ok(app.includes('background:color-mix(in srgb,var(--theme-color-status-danger-soft) 45%,#000)'));
});


test('insufficient-gems purchase failure uses the app-level red FixedToast', () => {
  const customization=app.slice(app.indexOf('function CustomizationScreen('),app.indexOf('function BottomNav('));
  assert.ok(customization.includes("function CustomizationScreen({initData,tgUser,role,territories,profile,onToast})"));
  assert.ok(customization.includes("onToast?.('Недостаточно самоцветов','error')"));
  assert.doesNotMatch(customization,/purchaseToast|setPurchaseToast/);
  assert.ok(app.includes("const [globalToast,setGlobalToast]=useState(null)"));
  assert.ok(app.includes("onToast={showGlobalToast}"));
  assert.ok(app.includes('<FixedToast key={globalToast.id} message={globalToast.message} type={globalToast.type}/>'));
});

test('toast sits 4px above the persistent navigation strip', () => {
  assert.match(tokens,/--theme-toast-bottom-offset:\s*calc\(73px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(tokens,/--theme-navigation-padding-block-start:\s*10px/);
  assert.match(tokens,/--theme-navigation-item-min-height:\s*44px/);
  assert.match(tokens,/--theme-navigation-padding-block-end:\s*calc\(14px \+ env\(safe-area-inset-bottom\)\)/);
});


test('treasury deposit insufficient funds is a global error toast, not inline text', () => {
  const treasuryStart=app.indexOf('function TreasuryCard(');
  const treasury=app.slice(treasuryStart,app.indexOf('function DonationModal(',treasuryStart));
  assert.ok(treasury.includes('function TreasuryCard({city,initData,tgUser,onToast}={})'));
  assert.ok(treasury.includes("onToast?.('Недостаточно самоцветов','error')"));
  assert.ok(treasury.includes("if(/недостаточно самоцветов/i.test(message)){setError('');"));
  assert.ok(app.includes('onToast={onToast}/>'));
  assert.ok(app.includes('onOpenGlobalSettings={()=>setGlobalSettingsOpen(true)} onToast={showGlobalToast} />'));
});

test('equipped award cards have a visible mint cover in addition to the mint border', () => {
  const city=app.slice(app.indexOf('function CityManagementProfile('),app.indexOf('function ProfileInventory('));
  assert.ok(city.includes("background:equipped?'rgba(110,231,183,.18)'"));
  assert.ok(city.includes("boxShadow:equipped?'inset 0 0 0 1px rgba(110,231,183,.2),0 0 0 1px rgba(110,231,183,.12)':'none'"));
});

test('donation modal uses a compact 6px title-to-content gap', () => {
  const donation=app.slice(app.indexOf('function DonationModal('),app.indexOf('function TerritoryDetail('));
  assert.ok(donation.includes('<SimpleModal title="Донат в казну" titleGap={6} onClose={onClose}>'));
});

test('SimpleModal portals above animated territory content so its blur covers the complete territory page', () => {
  const modal=app.slice(app.indexOf('function SimpleModal('),app.indexOf('function normalizedTelegramUsername('));
  assert.ok(modal.includes('createPortal('));
  assert.ok(modal.includes('document.querySelector(".atlas-root")||document.body'));
  assert.ok(modal.includes('zIndex:200'));
});

test('donation modal insufficient funds uses a global toast visible above the modal layer', () => {
  const donation=app.slice(app.indexOf('function DonationModal('),app.indexOf('function TerritoryDetail('));
  assert.ok(donation.includes('function DonationModal({territory,initData,onClose,onSuccess,onToast})'));
  assert.ok(donation.includes("onToast?.('Недостаточно самоцветов','error')"));
  assert.ok(app.includes('onToast={onToast}/>'));
  assert.ok(app.includes('onToast={showGlobalToast}'));
  assert.ok(app.includes('.atlas-toast-viewport{'));
  assert.ok(app.includes('z-index:220;'),'Global toasts remain above the modal portal layer');
  assert.ok(app.includes('overflow:hidden;'));
});


test('toast plates use substantially stronger darkening without filtering the page behind them', () => {
  for (const status of ['success','danger','warning']) {
    assert.ok(app.includes(`color-mix(in srgb,var(--theme-color-status-${status}-soft) 45%,#000)`), `Toast ${status} surface is not darkened enough`);
  }
  const toast=app.slice(app.indexOf('.atlas-fixed-toast{'),app.indexOf('@keyframes atlas-toast-in'));
  assert.doesNotMatch(toast,/backdrop-filter|webkit-backdrop-filter/);
});

test('main tabs use one moving Purple indicator and white selected text', () => {
  const tabs=app.slice(app.indexOf('function MainTabs('),app.indexOf('function SimpleModal('));
  assert.ok(tabs.includes('atlas-main-tabs__indicator'));
  assert.ok(tabs.includes("'--main-tabs-index':activeIndex"));
  assert.ok(tabs.includes("color:active?'#fff':'var(--theme-color-text-muted)'"));
  assert.ok(app.includes('transform:translateX(calc(var(--main-tabs-index) * 100%))'));
  assert.ok(app.includes('transition:transform 280ms cubic-bezier(.22,.72,.22,1)'));
});

test('inspector/player segmented switch uses a sliding Purple indicator', () => {
  const segmented=app.slice(app.indexOf('function Segmented('),app.indexOf('function ShotThumb('));
  assert.ok(segmented.includes('atlas-segmented__indicator'));
  assert.ok(segmented.includes("'--segmented-count':options.length"));
  assert.ok(segmented.includes("'--segmented-index':activeIndex"));
  assert.ok(app.includes('transform:translateX(calc(var(--segmented-index) * 100%))'));
  assert.ok(app.includes('.atlas-segmented__option.is-active{\n          color:#fff;'));
});

 
test('territory marker selection is not a toggle and never emits a marker-removal notice', () => {
  const city=app.slice(app.indexOf('function CityManagementProfile('),app.indexOf('function ProfileInventory('));
  assert.ok(city.includes("if(String(equippedId||'')===String(itemId||''))return;"));
  assert.ok(city.includes("post('/api/customization/city',{territoryId:territory.id,markerItemId:nextId},'Метка города обновлена')"));
  assert.doesNotMatch(city,/Метка города снята/);
});

test('equipped award feedback is one-based and removal feedback is an error toast', () => {
  const city=app.slice(app.indexOf('function CityManagementProfile('),app.indexOf('function ProfileInventory('));
  assert.ok(city.includes('const nextSlot=Number(data.slotIndex)+1;'));
  assert.ok(city.includes("`Награда установлена в слот ${nextSlot}`"));
  assert.ok(city.includes("setNotice('Награда снята')"));
  assert.ok(city.includes("setNoticeType('error')"));
  assert.ok(city.includes('disabled={readOnly||Boolean(awardBusyId&&String(awardBusyId)===String(award.id))}'));
});

 
test('territory exit control uses the same dark blurred surface as award badges',()=>{
  const city=app.slice(app.indexOf('function TerritoryDetail('),app.indexOf('function WorldMap('));
  const exit=city.slice(city.indexOf('<button onClick={onBack}'),city.indexOf('</button>',city.indexOf('<button onClick={onBack}')));
  const award=city.slice(city.indexOf('className="press atlas-award-badge"'),city.indexOf('</button>',city.indexOf('className="press atlas-award-badge"')));
  assert.ok(exit.includes("background: 'rgba(8,13,34,.72)'"));
  assert.ok(award.includes("background:'rgba(8,13,34,.72)'"));
  assert.ok(exit.includes("backdropFilter: 'blur(8px)'"));
  assert.ok(award.includes("backdropFilter:'blur(8px)'"));
});
