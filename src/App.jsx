// Voxygen-Version: v63
import React, { useEffect, useState, useRef, useId } from 'react';
import { useWorldMap } from './features/world-map/useWorldMap.js';
import { useTerritories } from './features/territories/useTerritories.js';
import { useUserSettings } from './features/settings/useUserSettings.js';
import { useTelegramProfile } from './features/profile/useTelegramProfile.js';
import gemIconUrl from './assets/gem-icon.png';
import { API_BASE } from './config/api.js';
import { TerritoryAwardIcon } from './features/territory-awards/TelegramSticker.jsx';
import { MainInspectorAwardManager } from './features/territory-awards/MainInspectorAwardManager.jsx';
import { MainInspectorIssuedAwardsPanel } from './features/territory-awards/IssuedAwardsPanel.jsx';
import { MainInspectorD1DiagnosticsPanel } from './features/admin-tools/D1DiagnosticsPanel.jsx';
import { ManagedUsersPanel } from './features/admin-tools/ManagedUsersPanel.jsx';
import { ManagedInspectorsPanel } from './features/admin-tools/ManagedInspectorsPanel.jsx';
import { GlobalSettingsPanel } from './features/settings/GlobalSettingsPanel.jsx';
import { CustomizationScreen } from './features/customization/CustomizationScreen.jsx';
import { CityManagementProfile } from './features/territory-management/CityManagementProfile.jsx';
import { TerritoryDetail } from './features/territory-details/TerritoryDetail.jsx';

import {
  defaultGlobalExpiryDateParts, globalExpiryDatePartsFromTimestamp,
  globalExpiryPartsTimestamp, normalizeTimezoneOffset,
} from './features/events/date-time.js';
import { EventsScreen } from './features/events/Events.jsx';
import { readEventImage } from './shared/image-utils.js';
import { EventDateTimeFields } from './features/events/DateTimeFields.jsx';
import { VoxMap } from './features/world-map/VoxMap.jsx';
import { WorldMapUploadPanel } from './features/world-map/MapUploadPanel.jsx';
import { createPortal } from 'react-dom';
import { THEME_CATALOG, normalizeThemeId } from '../shared/theme-catalog.js';
import { getBannerGradient } from '../shared/customization-visuals.js';
import { WORLD_MAP_GEOMETRY, worldCoordinateToPercent, isValidWorldCoordinate, MAP_ZOOM_MAX_SCALE, normalizeMapZoomPercent } from '../shared/world-map-coordinates.js';
import {
  Map as MapIcon, List as ListIcon, Users, MessageCircle, ThumbsUp, ThumbsDown,
  Flag, X, ChevronLeft, ChevronRight, Camera, Check, Plus, Star, Heart,
  User, Send, Sparkles, UserPlus, Trash2, Pencil, ShieldCheck, Clock, ChevronUp, ChevronDown, CalendarDays, Bell, MapPin, ExternalLink, Eye, EyeOff, ImagePlus, Settings
} from 'lucide-react';

const EVENT_UI = { MinecraftText, FixedToast, Field, TextAreaField, apiErrorMessage, safeCaughtError, stripMinecraftCodes, readEventImage };


// Fill this in once the voxygen-bot Worker is deployed, e.g.
// "https://voxygen-bot.your-subdomain.workers.dev"

const financialOperationMemory = new Map();
function getFinancialOperationToken(kind, targetId, amount) {
  const userId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'current-user');
  // One unresolved operation per action/target. A changed amount must not create a new charge
  // while the previous request may already have committed but its response was lost.
  const signature = `${userId}:${kind}:${String(targetId)}`;
  const storageKey = `voxygen:financial-operation:${encodeURIComponent(signature)}`;
  const readStored = storage => {
    try {
      const raw = storage?.getItem(storageKey);
      if (!raw) return null;
      try { const parsed = JSON.parse(raw); return parsed?.id ? { id:String(parsed.id), amount:Number(parsed.amount) } : null; }
      catch { return { id:String(raw), amount:NaN }; }
    } catch { return null; }
  };
  let saved = null;
  try { saved = readStored(window.localStorage); } catch {}
  if (!saved) { try { saved = readStored(window.sessionStorage); } catch {} }
  if (!saved) saved = financialOperationMemory.get(storageKey) || null;
  if (saved && Number(saved.amount) !== Number(amount)) return { id:saved.id, amount:saved.amount, storageKey, blocked:true };
  if (!saved) {
    saved = { id:(window.crypto?.randomUUID?.() || `vox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`).slice(0,120), amount:Number(amount) };
    financialOperationMemory.set(storageKey,saved);
    const serialized = JSON.stringify(saved);
    try { window.localStorage?.setItem(storageKey,serialized); } catch { try { window.sessionStorage?.setItem(storageKey,serialized); } catch {} }
  }
  return { ...saved, storageKey, blocked:false };
}
function clearFinancialOperationToken(token) {
  if (!token?.storageKey) return;
  financialOperationMemory.delete(token.storageKey);
  try { window.localStorage?.removeItem(token.storageKey); } catch {}
  try { window.sessionStorage?.removeItem(token.storageKey); } catch {}
}


const MINECRAFT_OBFUSCATION = '!#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz';
function obfuscateMinecraftText(value) { return [...String(value)].map((ch, i) => /\s/.test(ch) ? ch : MINECRAFT_OBFUSCATION[(ch.charCodeAt(0) + i * 17) % MINECRAFT_OBFUSCATION.length]).join(''); }
function stripMinecraftCodes(value) { return String(value ?? '').replace(/§x(?:§[0-9a-fA-F]){6}/gi, '').replace(/§(?:#[0-9a-fA-F]{6}|[0-9a-fA-Fk-oK-OrR])/g, ''); }
const MINECRAFT_COLORS = {
  '0':'#000000','1':'#0000AA','2':'#00AA00','3':'#00AAAA','4':'#AA0000','5':'#AA00AA','6':'#FFAA00','7':'#AAAAAA',
  '8':'#555555','9':'#5555FF','a':'#55FF55','b':'#55FFFF','c':'#FF5555','d':'#FF55FF','e':'#FFFF55','f':'#FFFFFF'
};
function MinecraftText({ text = '', as = 'span', style = {}, className }) {
  const Tag = as;
  const source = String(text ?? '').replace(/§x(?:§[0-9a-fA-F]){6}/gi, value => '§#' + value.replace(/§x|§/gi, ''));
  const tokenPattern = /§(?:#([0-9a-fA-F]{6})|([0-9a-fA-Fk-oK-OrR]))/g;
  const pieces = [];
  let state = { color: null, bold: false, italic: false, underline: false, strike: false, obfuscated: false };
  let last = 0, match, index = 0;
  const emit = value => {
    if (!value) return;
    const css = { color: state.color || style.color, fontWeight: state.bold ? 800 : style.fontWeight, fontStyle: state.italic ? 'italic' : style.fontStyle };
    const decorations = [];
    if (state.underline) decorations.push('underline');
    if (state.strike) decorations.push('line-through');
    if (decorations.length) css.textDecoration = decorations.join(' ');
    pieces.push(<span key={`mc-${index++}`} style={{...css, fontFamily:state.obfuscated?'monospace':style.fontFamily, textShadow:state.obfuscated?'0 0 1px currentColor':undefined}}>{state.obfuscated ? obfuscateMinecraftText(value) : value}</span>);
  };
  while ((match = tokenPattern.exec(source)) !== null) {
    emit(source.slice(last, match.index));
    if (match[1]) {
      state = { ...state, color: `#${match[1]}` };
    } else {
      const code = String(match[2] || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(MINECRAFT_COLORS, code)) state = { ...state, color: MINECRAFT_COLORS[code] };
      else if (code === 'l') state = { ...state, bold: true };
      else if (code === 'o') state = { ...state, italic: true };
      else if (code === 'n') state = { ...state, underline: true };
      else if (code === 'm') state = { ...state, strike: true };
      else if (code === 'k') state = { ...state, obfuscated: true };
      else if (code === 'r') state = { color: null, bold: false, italic: false, underline: false, strike: false, obfuscated: false };
    }
    last = tokenPattern.lastIndex;
  }
  emit(source.slice(last));
  return <Tag className={className} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...style }}>{pieces.length ? pieces : source}</Tag>;
}

function apiErrorMessage(response, data, fallback = 'Не удалось выполнить запрос.') {
  const status = Number(response?.status || 0);
  const raw = String(data?.error || '').trim();
  const unsafe = /database error|\b(sqlite|sql|exception|stack trace|internal server|bot_token|wrangler|failed to contact telegram|d1 binding|error:)|no such (table|column)|constraint failed|cannot read properties|typeerror|referenceerror/i.test(raw);
  const translated = ({ 'invalid json':'Не удалось прочитать запрос. Обновите экран и повторите попытку.', 'city not found':'Территория не найдена или уже удалена.', 'territory not found':'Территория не найдена или уже удалена.', 'invalid rating':'Проверьте введённую оценку и повторите попытку.', 'only images are allowed':'Можно загрузить только изображение.', 'territoryid is required':'Не выбрана территория. Обновите экран и повторите попытку.', 'commentid is required':'Отзыв не найден. Обновите страницу и повторите попытку.' })[raw.toLowerCase()] || raw;
  if (status === 0) return 'Нет соединения с сервером. Проверьте интернет и повторите попытку.';
  if (status === 401) return 'Сессия Telegram недействительна. Закройте и снова откройте Voxygen через Telegram.';
  if (status === 403) return !unsafe && translated && !/^forbidden$/i.test(raw) ? translated : 'У вас недостаточно прав для этого действия.';
  if (status === 404) return !unsafe && translated && !/^not found$/i.test(raw) && !/^route not found$/i.test(raw) ? translated : 'Запись не найдена: возможно, её уже удалили.';
  if (status === 409) return !unsafe && translated ? translated : 'Запись уже изменилась. Обновите данные и попробуйте снова.';
  if (status === 429) return !unsafe && translated ? translated : 'Слишком много запросов подряд. Немного подождите и повторите.';
  if (status >= 500) return 'Сервер временно недоступен. Повторите попытку чуть позже.';
  if (status === 400 || status === 413) return !unsafe && translated ? translated : fallback;
  return !unsafe && translated ? translated : fallback;
}

function safeCaughtError(error, fallback = 'Не удалось выполнить запрос.') {
  if (error?.status) return String(error.message || fallback);
  const message = String(error?.message || error || '').trim();
  if (/failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(message)) {
    return 'Нет соединения с сервером. Проверьте интернет и повторите попытку.';
  }
  if (/syntaxerror|unexpected token|unexpected end of json|json\.parse|not valid json/i.test(message)) {
    return 'Сервер вернул некорректный ответ. Повторите попытку чуть позже.';
  }
  if (/database error|\b(sqlite|sql|exception|stack trace|bot_token|wrangler|d1 binding)|no such (table|column)|constraint failed|cannot read properties|typeerror|referenceerror|internal server/i.test(message)) {
    return 'Сервер временно недоступен. Повторите попытку чуть позже.';
  }
  return message || fallback;
}

async function parseApiResponse(response, fallback) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false) {
    const error = new Error(apiErrorMessage(response, data, fallback));
    error.status = response.status;
    error.requestId = response.headers?.get?.('X-Request-ID') || null;
    throw error;
  }
  return data;
}

// Lucide Astroid is not exported by the pinned lucide-react version used by Voxygen,
// so keep the exact Lucide path locally instead of changing the dependency.
function Astroid({ size = 24, strokeWidth = 2, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12.983 21.186a1 1 0 0 1-1.966 0 10 10 0 0 0-8.203-8.203 1 1 0 0 1 0-1.966 10 10 0 0 0 8.203-8.203 1 1 0 0 1 1.966 0 10 10 0 0 0 8.203 8.203 1 1 0 0 1 0 1.966 10 10 0 0 0-8.203 8.203" />
    </svg>
  );
}

const DEFAULT_FAQ_TEXT = `Voxygen — карта городов и их жителей.

Города: карта, страницы городов, оценки, отзывы и скрины.

Добавить: заявка проходит через главного инспектора, который вручную создаёт город.

Инспекторы: оценивают города и оставляют инспекторские комментарии.

Жители: получают приглашения в город через Telegram-бота.

Визуал: метки и другие элементы оформления города.

Чтобы дополнить или обновить карту Vox, создайте, полностью заполните карту без локатора 2-го уровня и отправьте на почтовый адрес "Vox" (карта будет отсканирована и отправлена адресанту, возможно с вознаграждением).`;


// Minecraft block centers are mapped to normalized world-space percentages; raster resolution is independent.
function voxWorldToPercent(x, z, coordinateSystem = WORLD_MAP_GEOMETRY) {
  return worldCoordinateToPercent(x, z, coordinateSystem);
}
function finiteCoordinate(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function hasMapOwner(territory) {
  return Number(territory?.owner_telegram_id || 0) > 0 || territory?.is_government === true || Number(territory?.is_government || 0) === 1;
}
const MAP_MARKER_WIDTH = 12;
const MAP_MARKER_HEIGHT = 14;
// A city should remain visible when its founder has not purchased a cosmetic marker.
// Custom inventory markers still take precedence over this neutral default pin.
const DEFAULT_CITY_MARKER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23A78BFA' stroke='%23FFFFFF' stroke-width='1.5' d='M12 23s9-8.1 9-13A9 9 0 1 0 3 10c0 4.9 9 13 9 13Z'/%3E%3Ccircle cx='12' cy='10' r='3' fill='%23101118'/%3E%3C/svg%3E";
function pluralizeTerritories(n) { const value=Math.abs(Math.trunc(Number(n)||0)); const lastTwo=value%100,last=value%10; if(lastTwo>=11&&lastTwo<=14)return 'территорий'; if(last===1)return 'территория'; if(last>=2&&last<=4)return 'территории'; return 'территорий'; }
function formatTerritoryCoords(raw) { const value=String(raw??'').trim().replace(/−/g,'-'); const numbers=value.match(/-?\d+(?:[.,]\d+)?/g)||[]; if(numbers.length>=2)return `${numbers[0]} / ${numbers[1]}`; return value||'Координаты не указаны'; }
function formatTerritoryAwardDate(value) { const timestamp=Number(value); if(!Number.isFinite(timestamp)||timestamp<=0)return 'Дата не указана'; const date=new Date(timestamp); if(Number.isNaN(date.getTime()))return 'Дата не указана'; return `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.${date.getFullYear()}`; }
function pluralizeRatings(n) { const value=Math.abs(Math.trunc(Number(n)||0)); const lastTwo=value%100,last=value%10; if(lastTwo>=11&&lastTwo<=14)return 'оценок'; if(last===1)return 'оценка'; if(last>=2&&last<=4)return 'оценки'; return 'оценок'; }


// Each criterion is scored 1–5 by the rater. Each point contributes 0.5 to
// the territory's overall score, so one person's rating totals 4×0.5=2 (all
// 1s) to 4×0.5×5=10 (all 5s). That total is intentionally never shown to the
// rater while rating — only the aggregate community score (computed
// server-side across everyone's ratings) is ever displayed publicly.
function getTelegramUser() {
  try {
    return (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user) || null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function FontsAndTheme() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
    </>
  );
}
function ScoreBadge({ type, value, size = 'md' }) {
  const isInspector = type === 'curator';
  const color = isInspector ? 'var(--theme-recipe-badge-success-fg)' : 'var(--theme-recipe-badge-primary-fg)';
  const bg = isInspector ? 'var(--theme-recipe-badge-success-bg)' : 'var(--theme-recipe-badge-primary-bg)';
  const border = isInspector ? 'var(--theme-recipe-badge-success-border)' : 'var(--theme-recipe-badge-primary-border)';
  const Icon = isInspector ? Star : Astroid;
  const preset = ['sm', 'recruitment', 'lg'].includes(size) ? size : 'default';
  const token = name => `var(--theme-score-badge-${name}-${preset})`;
  return (
    <div className={`atlas-display atlas-score-badge${size==='recruitment' ? ` atlas-recruitment-score ${isInspector?'atlas-recruitment-score--inspector':'atlas-recruitment-score--community'}` : ''}`} style={{
      display:'inline-flex',alignItems:'center',justifyContent:'center',gap: token('gap'),boxSizing:'border-box',
      background:bg,color,border:`1px solid ${border}`,borderRadius:'var(--theme-score-badge-radius)',padding: token('padding'),
      minHeight:token('height'),fontSize:token('size'),fontWeight:'var(--theme-score-badge-weight)',lineHeight:'var(--theme-score-badge-line-height)',
      boxShadow:'var(--theme-score-badge-shadow)',animationDelay:isInspector?'45ms':'105ms'
    }} title={isInspector?'Оценка инспектора':'Оценка игроков'}>
      <Icon size={token('icon')} strokeWidth="var(--theme-score-badge-icon-stroke)" color={color} fill="none" />
      {Number(value||0).toFixed(1)}
    </div>
  );
}

function Segmented({ options, value, onChange, style = {}, optionStyle = {}, indicatorStyle = {} }) {
  const activeIndex=Math.max(0,options.findIndex(opt=>opt.value===value));
  return (
    <div className="atlas-segmented" role="group" style={{'--segmented-count':options.length,'--segmented-index':activeIndex,...style}}>
      <span className="atlas-segmented__indicator" aria-hidden="true" style={indicatorStyle}/>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`press atlas-segmented__option${active ? ' is-active' : ''}`}
            aria-pressed={active}
            style={optionStyle}
          >
            {opt.icon}{opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ShotThumb({ shot, big = false, onOpen }) {
  const label = shot?.author || shot?.mc_nickname || shot?.telegram_username || 'Пользователь';
  return (
    <div style={{ width: big ? 150 : 96, flexShrink: 0 }}>
      <button
        onClick={onOpen}
        className="press atlas-shot-thumb"
        style={{
          width:'100%', height: big ? 100 : 68, borderRadius: 12,
          background: shot.url ? `center / cover no-repeat url(${shot.url})` : 'linear-gradient(135deg, var(--theme-color-surface-raised), var(--theme-color-surface))',
          border: '1px solid var(--theme-color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden', padding: 0, cursor: 'pointer',
        }}
      >
        {!shot.url && <Camera size={big ? 22 : 16} color="var(--theme-color-text-muted)" strokeWidth={1.5} />}
        {shot.status === 'pending' && (
          <span style={{
            position: 'absolute', top: 5, right: 5, fontSize: 9, fontWeight: 700,
            background: 'var(--theme-color-status-warning-soft)', color: 'var(--theme-color-status-warning)', padding: '2px 6px', borderRadius: 999,
          }}>на проверке</span>
        )}
      </button>
      <div style={{ marginTop: 4, fontSize: big ? 11.5 : 10.5, lineHeight: 1.2, color:'var(--theme-color-text-muted)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={label}>{label}</div>
    </div>
  );
}

function useAnimatedClose(onClose, duration = 175) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timerRef = useRef(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = setTimeout(() => onClose?.(), duration);
  };
  return { closing, requestClose };
}

// Full-screen viewer for a screenshot. Tap the image to toggle a closer zoom;
// on real phones this sits inside a scrollable frame so native pinch-zoom
// also works. In "moderate" mode the owner gets approve/reject actions here.
function Lightbox({ shots = [], index = 0, mode, onClose, onApprove, onReject, onChange }) {
  const safeShots = Array.isArray(shots) && shots.length ? shots : [];
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(0, safeShots.length - 1)));
  const shot = safeShots[safeIndex] || {};
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const { closing, requestClose } = useAnimatedClose(onClose, 170);
  const touchStart = useRef(null);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  useEffect(() => { setZoomed(false); setOrigin('50% 50%'); }, [safeIndex]);
  function go(delta) {
    if (!safeShots.length) return;
    const next = (safeIndex + delta + safeShots.length) % safeShots.length;
    onChange?.(next);
  }
  function handleImageClick(e) {
    e.stopPropagation();
    if (zoomed) { setZoomed(false); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setOrigin(`${x}% ${y}%`);
    setZoomed(true);
  }
  function handleTouchStart(e) {
    if (zoomed || e.touches.length !== 1) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function handleTouchEnd(e) {
    if (zoomed || !touchStart.current || e.changedTouches.length !== 1) { touchStart.current = null; return; }
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    go(dx < 0 ? 1 : -1);
  }
  return (
    <div
      onClick={requestClose}
      className={`atlas-overlay${closing ? ' atlas-closing' : ''}`}
      style={{ position:'fixed', inset:0, background:'var(--theme-color-canvas)', zIndex:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflow:'hidden', padding: 0 }}
    >
      <button onClick={requestClose} className="press" aria-label="Закрыть" style={{ ...iconBtn('var(--theme-color-surface-raised)','var(--theme-color-text-primary)'), position:'fixed', top:14, right:14, width:44, height:44, zIndex:5 }}><X size={20}/></button>
      <div
        onClick={e=>e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="atlas-lightbox-content"
        style={{ width:'100vw', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', touchAction:'none' }}
      >
        {shot.url ? (
          <img
            src={shot.url}
            alt="Скриншот"
            onClick={handleImageClick}
            draggable={false}
            style={{ maxWidth:'100vw', maxHeight:'100vh', width:'auto', height:'auto', display:'block', objectFit:'contain', cursor:zoomed?'zoom-out':'zoom-in', userSelect:'none', transform:zoomed?'scale(2.2)':'scale(1)', transformOrigin:origin, transition:'transform .24s cubic-bezier(.2,.8,.2,1)' }}
          />
        ) : (
          <div style={{ width:'min(100vw,448px)', aspectRatio:'4/3', background:'var(--theme-color-surface)', borderRadius:'var(--theme-radius-card)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--theme-color-text-muted)' }}>
            <Camera size={32}/>
          </div>
        )}
      </div>
      <MinecraftText text={shot.author || shot.mc_nickname || shot.telegram_username || ''} style={{position:'fixed',bottom:'calc(38px + env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',zIndex:8,maxWidth:'80vw',fontSize:12,color:'var(--theme-color-text-muted)',textAlign:'center',pointerEvents:'none',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}/>
      {mode==='moderate'&&<div style={{position:'absolute',left:12,right:12,bottom:14,display:'flex',gap: 10}} onClick={e=>e.stopPropagation()}>
        <Button onClick={onApprove} variant="success" style={{flex:1}}>Одобрить</Button>
        <Button onClick={onReject} variant="danger" style={{flex:1}}>Отклонить</Button>
      </div>}
    </div>
  );
}

function Dot({ c }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />;
}

/** Theme-aware icon-only action with an explicit accessible name and stable touch target. */
function IconButton({ icon: Icon, label, title = label, size = 'var(--theme-icon-button-size)', radius = 'var(--theme-radius-control)', variant = 'neutral', onClick, disabled = false, style = {}, ...props }) {
  const variants = {
    neutral: { background:'var(--theme-recipe-icon-neutral-bg)', color:'var(--theme-recipe-icon-neutral-fg)', border:'1px solid var(--theme-recipe-icon-neutral-border)' },
    primary: { background:'var(--theme-recipe-icon-primary-bg)', color:'var(--theme-recipe-icon-primary-fg)', border:'1px solid var(--theme-recipe-icon-primary-border)' },
    success: { background:'var(--theme-recipe-icon-success-bg)', color:'var(--theme-recipe-icon-success-fg)', border:'1px solid var(--theme-recipe-icon-success-border)' },
    danger: { background:'var(--theme-recipe-icon-danger-bg)', color:'var(--theme-recipe-icon-danger-fg)', border:'1px solid var(--theme-recipe-icon-danger-border)' },
    ghost: { background:'var(--theme-recipe-icon-ghost-bg)', color:'var(--theme-recipe-icon-ghost-fg)', border:'1px solid var(--theme-recipe-icon-ghost-border)' },
  };
  return (
    <button
      type="button"
      {...props}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className="press atlas-icon-button"
      style={{
        width:size, height:size, minWidth:size, minHeight:size, padding: 0,
        borderRadius:radius, display:'inline-flex', alignItems:'center',
        justifyContent:'center', flexShrink:0,
        cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.5:1,
        ...variants[variant] || variants.neutral, ...style,
      }}
    >
      {Icon && <Icon size="var(--theme-icon-button-glyph-size)" strokeWidth="var(--theme-icon-button-glyph-stroke)" aria-hidden="true" />}
    </button>
  );
}

/** Theme-aware text action with semantic variants and token-driven geometry. */
function Button({ children, variant = 'primary', size = 'md', fullWidth = false, type = 'button', disabled = false, onClick, style = {}, className = '', ...props }) {
  const variants = {
    primary: { background:'var(--theme-recipe-button-primary-bg)', color:'var(--theme-recipe-button-primary-fg)', border:'1px solid var(--theme-recipe-button-primary-border)' },
    neutral: { background:'var(--theme-recipe-button-neutral-bg)', color:'var(--theme-recipe-button-neutral-fg)', border:'1px solid var(--theme-recipe-button-neutral-border)' },
    success: { background:'var(--theme-recipe-button-success-bg)', color:'var(--theme-recipe-button-success-fg)', border:'1px solid var(--theme-recipe-button-success-border)' },
    danger: { background:'var(--theme-recipe-button-danger-bg)', color:'var(--theme-recipe-button-danger-fg)', border:'1px solid var(--theme-recipe-button-danger-border)' },
    ghost: { background:'var(--theme-recipe-button-ghost-bg)', color:'var(--theme-recipe-button-ghost-fg)', border:'1px solid var(--theme-recipe-button-ghost-border)' },
  };
  const sizes = {
    sm: { minHeight:'var(--theme-control-height-compact)', padding: '0 var(--theme-space-3)', fontSize:'var(--theme-type-label-size)' },
    md: { minHeight:'var(--theme-control-height)', padding: '0 var(--theme-space-4)', fontSize:'var(--theme-type-control-size)' },
    lg: { minHeight:'calc(var(--theme-control-height) + var(--theme-space-2))', padding: '0 var(--theme-space-5)', fontSize:'var(--theme-type-body-size)' },
  };
  return (
    <button
      {...props}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`press atlas-button${className ? ` ${className}` : ''}`}
      style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center', gap: 'var(--theme-button-gap)',
        width:fullWidth?'100%':undefined, minWidth:0, borderRadius:'var(--theme-button-radius)',
        fontFamily:'var(--theme-font-body)', fontWeight:'var(--theme-button-font-weight)', lineHeight:'var(--theme-button-line-height)',
        cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.52:1,
        transition:'background var(--theme-motion-tap) var(--theme-ease-interactive), border-color var(--theme-motion-tap) var(--theme-ease-interactive), opacity var(--theme-motion-tap) var(--theme-ease-interactive)',
        ...sizes[size] || sizes.md, ...variants[variant] || variants.primary, ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Theme-aware content surface shared by cards and grouped panels. */
function SurfaceCard({ children, tone = 'base', padding = 'var(--theme-space-4)', radius = 'var(--theme-radius-card)', className = '', style = {}, ...props }) {
  const surfaces = {
    base: 'var(--theme-recipe-surface-base-bg)',
    raised: 'var(--theme-recipe-surface-raised-bg)',
    elevated: 'var(--theme-recipe-surface-elevated-bg)',
  };
  return (
    <div
      {...props}
      className={`atlas-surface${className ? ` ${className}` : ''}`}
      style={{
        background: surfaces[tone] || surfaces.base,
        border: '1px solid var(--theme-recipe-surface-border)',
        borderRadius: radius === 'var(--theme-radius-card)' ? 'var(--theme-recipe-surface-radius)' : radius,
        padding: padding === 'var(--theme-space-4)' ? 'var(--theme-recipe-surface-padding)' : padding,
        color: 'var(--theme-recipe-surface-fg)',
        boxShadow: 'var(--theme-recipe-surface-shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Theme-aware range control with shared geometry and semantic track variants. */
function Slider({ label, variant = 'player', className = '', style = {}, ...props }) {
  const safeVariant = ['gold', 'inspector', 'player'].includes(variant) ? variant : 'player';
  return (
    <input
      {...props}
      type="range"
      aria-label={label || props['aria-label']}
      className={`atlas-slider slider-${safeVariant}${className ? ` ${className}` : ''}`}
      style={{ width: '100%', ...style }}
    />
  );
}
function iconBtn(bg, color, square) {
  return {
    width: 'var(--theme-icon-button-size)', height: 'var(--theme-icon-button-size)',
    borderRadius: square ? 'var(--theme-radius-control)' : 'var(--theme-radius-pill)',
    background: bg, color,
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
}

function reactBtn(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 'var(--theme-react-action-gap)', fontSize: 'var(--theme-react-action-size)', background: 'transparent', border: 'none',
    cursor: 'pointer', color: active ? 'var(--theme-color-status-warning)' : 'var(--theme-color-text-muted)', padding: 0,
    fontWeight: active ? 'var(--theme-react-action-weight-active)' : 'var(--theme-react-action-weight-idle)',
  };
}

function SectionTitle({ icon, title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--theme-section-title-gap)', marginBottom: 'var(--theme-section-title-bottom-gap)', color: 'var(--theme-color-text-muted)' }}>
      {icon}
      <span style={{ fontSize: 'var(--theme-section-title-size)', fontWeight: 'var(--theme-section-title-weight)', color: 'var(--theme-color-text-primary)' }}>{title}</span>
      <span style={{ fontSize: 'var(--theme-section-count-size)' }}>· {count}</span>
    </div>
  );
}

function Field({ label, hint, error, id, className = '', style = {}, containerStyle = {}, ...props }) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const messageId = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;
  return (
    <div style={{ marginBottom: 'var(--theme-space-3)', ...containerStyle }}>
      {label && <label htmlFor={controlId} style={{ display:'block', fontSize:'var(--theme-type-label-size)', color:'var(--theme-color-text-muted)', marginBottom: 'var(--theme-field-label-gap)' }}>{label}</label>}
      <input
        {...props}
        id={controlId}
        aria-invalid={error ? 'true' : props['aria-invalid']}
        aria-describedby={messageId || props['aria-describedby']}
        className={`atlas-field-input ${className}`.trim()}
        style={{
          width: '100%', minHeight: 'var(--theme-control-height)',
          background: 'var(--theme-recipe-field-bg)', border: `1px solid ${error ? 'var(--theme-color-status-danger)' : 'var(--theme-recipe-field-border)'}`,
          borderRadius: 'var(--theme-recipe-field-radius)',
          padding: 'var(--theme-recipe-field-padding)',
          color: 'var(--theme-recipe-field-fg)', fontSize: 'var(--theme-type-control-size)', lineHeight: 'var(--theme-type-control-line-height)',
          outline: 'none', boxSizing: 'border-box', ...style,
        }}
      />
      {error && <div id={`${controlId}-error`} role="alert" style={{fontSize:'var(--theme-type-technical-size)',color:'var(--theme-color-status-danger)',marginTop: 'var(--theme-field-message-gap)'}}>{error}</div>}
      {!error && hint && <div id={`${controlId}-hint`} style={{fontSize:'var(--theme-type-technical-size)',color:'var(--theme-color-text-muted)',marginTop: 'var(--theme-field-message-gap)'}}>{hint}</div>}
    </div>
  );
}

function TextAreaField({ label, hint, error, id, className = '', style = {}, containerStyle = {}, ...props }) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const messageId = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined;
  return (
    <div style={{ marginBottom: 'var(--theme-space-3)', ...containerStyle }}>
      {label && <label htmlFor={controlId} style={{ display:'block',fontSize:'var(--theme-type-label-size)',color:'var(--theme-color-text-muted)',marginBottom: 'var(--theme-field-label-gap)' }}>{label}</label>}
      <textarea
        {...props}
        id={controlId}
        aria-invalid={error ? 'true' : props['aria-invalid']}
        aria-describedby={messageId || props['aria-describedby']}
        className={`atlas-field-input atlas-textarea-field ${className}`.trim()}
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 'var(--theme-control-height)',
          resize: 'vertical', background: 'var(--theme-recipe-field-bg)',
          border: `1px solid ${error ? 'var(--theme-color-status-danger)' : 'var(--theme-recipe-field-border)'}`, borderRadius: 'var(--theme-recipe-field-radius)',
          padding: 'var(--theme-recipe-field-padding)', color: 'var(--theme-recipe-field-fg)',
          fontSize: 'var(--theme-type-control-size)', outline: 'none', lineHeight: 'var(--theme-type-textarea-line-height)', ...style,
        }}
      />
      {error && <div id={`${controlId}-error`} role="alert" style={{fontSize:'var(--theme-type-technical-size)',color:'var(--theme-color-status-danger)',marginTop: 'var(--theme-field-message-gap)'}}>{error}</div>}
      {!error && hint && <div id={`${controlId}-hint`} style={{fontSize:'var(--theme-type-technical-size)',color:'var(--theme-color-text-muted)',marginTop: 'var(--theme-field-message-gap)'}}>{hint}</div>}
    </div>
  );
}


function SelectField({ label, id, className = '', style = {}, containerStyle = {}, children, ...props }) {
  const generatedId = useId();
  const controlId = id || generatedId;
  return (
    <div style={{ marginBottom: 'var(--theme-space-3)', ...containerStyle }}>
      {label && <label htmlFor={controlId} style={{display:'block',fontSize:'var(--theme-type-label-size)',color:'var(--theme-color-text-muted)',marginBottom: 'var(--theme-field-label-gap)' }}>{label}</label>}
      <select
        {...props}
        id={controlId}
        className={`atlas-field-input atlas-select-field ${className}`.trim()}
        style={{
          width: '100%', minHeight: 'var(--theme-control-height)', boxSizing: 'border-box',
          background: 'var(--theme-recipe-field-bg)', border: '1px solid var(--theme-recipe-field-border)',
          borderRadius: 'var(--theme-recipe-field-radius)', padding: 'var(--theme-recipe-field-padding)',
          color: 'var(--theme-recipe-field-fg)', fontSize: 'var(--theme-type-control-size)', lineHeight: 'var(--theme-type-control-line-height)',
          outline: 'none', ...style,
        }}
      >
        {children}
      </select>
    </div>
  );
}

function FixedToast({ message, type = null }) {
  const [visible,setVisible]=useState(Boolean(message));
  const [exiting,setExiting]=useState(false);
  useEffect(()=>{
    if(!message){setVisible(false);setExiting(false);return undefined;}
    setVisible(true);setExiting(false);
    const duration=type==='error'?4300:2600;
    const exitTimer=setTimeout(()=>setExiting(true),Math.max(0,duration-180));
    const hideTimer=setTimeout(()=>setVisible(false),duration);
    return ()=>{clearTimeout(exitTimer);clearTimeout(hideTimer)};
  },[message,type]);
  if(!message || !visible) return null;
  const resolvedType = type || (/ошиб|не удалось|нет соединения|недостаточно прав|не найдена|временно недоступен|не выполнена|не получилось/i.test(String(message))?'error':/ожидает|повторите|проверьте|не подтверждён/i.test(String(message))?'warning':'success');
  const toast=<div className="atlas-toast-viewport"><div className={`atlas-fixed-toast atlas-fixed-toast--${resolvedType}${exiting?' atlas-toast-exiting':''}`} role={resolvedType==='error'?'alert':'status'} aria-live={resolvedType==='error'?'assertive':'polite'}>{message}</div></div>;
  return createPortal(toast,document.querySelector('.atlas-root')||document.body);
}

function AvatarHead({ nickname, skinUrl, size = 46 }) {
  const [error, setError] = useState(false);
  const source=skinUrl || '';
  useEffect(()=>setError(false),[source]);
  if (!nickname || !source || error) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 'var(--theme-avatar-radius)',
        background: 'var(--theme-avatar-fallback-background)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--theme-avatar-fallback-foreground)', flexShrink: 0,
      }}>
        <User size={size * 0.45} />
      </div>
    );
  }
  return (
    <img
      src={source}
      onError={() => setError(true)}
      width={size} height={size}
      alt={nickname}
      style={{ borderRadius: 'var(--theme-avatar-radius)', border: '1px solid var(--theme-color-border)', display: 'block', flexShrink: 0 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Add-territory request
// ---------------------------------------------------------------------------
function AddTerritoryModal({ onClose, onSubmit, isMainInspector = false }) {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [coords, setCoords] = useState('');
  const { closing, requestClose } = useAnimatedClose(onClose, 175);

  return (
    <div className={`atlas-overlay${closing ? ' atlas-closing' : ''}`} style={{
      position: 'fixed', inset: 0, background: 'var(--theme-color-overlay-scrim)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={requestClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`atlas-modal-shell${closing ? ' atlas-closing' : ''}`}
        style={{
          width: '100%', maxWidth: 'var(--theme-modal-max-width)', background: 'var(--theme-color-surface)', borderRadius: 'var(--theme-radius-modal)',
          border: '1px solid var(--theme-color-border)', padding: 'var(--theme-modal-content-padding)', maxHeight: 'min(var(--theme-modal-max-height-form), var(--theme-modal-viewport-safe-height))', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="atlas-display" style={{ fontSize: 16, fontWeight: 700 }}>Добавить территорию</div>
          <IconButton icon={X} label="Закрыть окно" onClick={requestClose} />
        </div>

        <Field label="Название территории" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="@username основателя/мэра" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <Field label="Координаты X / Z (без высоты)" value={coords} onChange={(e) => setCoords(e.target.value)} />

        <button
          onClick={() => onSubmit({ name: name.trim(), owner: owner.trim(), coords: coords.trim() })}
          disabled={!name.trim() || (!isMainInspector && !owner.trim()) || !coords.trim()}
          className="press"
          style={{
            width: '100%', marginTop: 4, padding: '12px 0', borderRadius: 12, border: 'none',
            cursor: name.trim() && (isMainInspector || owner.trim()) && coords.trim() ? 'pointer' : 'not-allowed',
            opacity: name.trim() && (isMainInspector || owner.trim()) && coords.trim() ? 1 : 0.5,
            background: 'var(--theme-color-action-primary)', color: 'var(--theme-color-action-primary-contrast)', fontWeight: 700, fontSize: 14,
          }}
        >
          {isMainInspector ? 'Добавить без подтверждения' : 'Отправить на подтверждение'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive Vox map
// ---------------------------------------------------------------------------
function MainInspectorPanel({ initData, onMapSaved, territories = [], onTerritoriesChanged, onFaqSaved }) {
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [faqText,setFaqText]=useState(''),[faqSaving,setFaqSaving]=useState(false),[faqLoading,setFaqLoading]=useState(true),[faqLoadError,setFaqLoadError]=useState('');
  const [managerModalCity,setManagerModalCity]=useState(null);


  async function loadFaq(){
    try{
      setFaqLoading(true);setFaqLoadError('');setFaqText('');
      const r=await fetch(`${API_BASE}/api/faq`,{cache:'no-store'}),d=await r.json().catch(()=>null);
      if(!r.ok||!d?.ok||typeof d.text!=='string')throw new Error(apiErrorMessage(r,d,'Не удалось загрузить ЧиВо.'));
      setFaqText(d.text.trim()?d.text:DEFAULT_FAQ_TEXT);
    }catch(e){setFaqLoadError(safeCaughtError(e,'Не удалось загрузить ЧиВо.'));}
    finally{setFaqLoading(false)}
  }
  useEffect(()=>{if(initData){loadFaq()}},[initData]);
  async function saveFaq(){const text=faqText.trim();if(!text){setError('Текст ЧиВо не может быть пустым');return}try{setFaqSaving(true);setError('');const r=await fetch(`${API_BASE}/api/faq`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,text})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setFaqText(d.text||text);onFaqSaved?.(d.text||text);setNotice('ЧиВо сохранено')}catch(e){setError(safeCaughtError(e, 'Не удалось сохранить ЧиВо'))}finally{setFaqSaving(false)}}
  async function deleteCity(id){if(!window.confirm('Удалить этот город? Это действие нельзя отменить.'))return;try{const r=await fetch(`${API_BASE}/api/admin/territories/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,territoryId:id})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setNotice('Город удалён');onTerritoriesChanged?.()}catch(e){setError(safeCaughtError(e, 'Не удалось удалить город'))}}
  async function moveCity(city){const raw=window.prompt('Новые координаты X Z (от −3008 до 3007)',`${city.vox_x??0} ${city.vox_z??0}`);if(raw===null)return;const m=raw.trim().replace(/−/g,'-').match(/^(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)$/);if(!m){setError('Формат: X Z');return}const x=Number(m[1].replace(',','.')),z=Number(m[2].replace(',','.'));if(!isValidWorldCoordinate(x,z)){setError('Координаты должны быть от −3008 до 3007');return}try{const r=await fetch(`${API_BASE}/api/admin/territories/coords`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,territoryId:city.id,x,z})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setNotice('Координаты обновлены');onTerritoriesChanged?.()}catch(e){setError(safeCaughtError(e, 'Не удалось изменить координаты'))}}
  function changeFounder(city){ setManagerModalCity(city); setError(''); }
  return <div style={{marginTop: 12}}>
    <ManagedInspectorsPanel initData={initData} onError={setError} onNotice={setNotice} ui={{Field,apiErrorMessage,safeCaughtError}} />

    <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-card)',padding: 'var(--theme-space-4)',marginBottom: 12}}><div style={{display:'flex',alignItems:'center',gap: 8,marginBottom: 10}}><Trash2 size={16} color="var(--theme-color-status-danger)"/><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>Города</div><span style={{marginLeft: 'auto',fontSize:11,color:'var(--theme-color-text-muted)'}}>{territories.length}</span></div>{territories.length===0?<div style={{fontSize:12,color:'var(--theme-color-text-muted)'}}>Городов пока нет.</div>:territories.map(city=><div key={city.id} style={{display:'flex',alignItems:'center',gap: 6,padding: '10px 0',borderTop:'1px solid var(--theme-color-border)'}}><div style={{flex:1,minWidth:0}}><MinecraftText text={city.name} as="div" style={{fontSize:13,fontWeight:700}}/><div style={{fontSize:11,color:'var(--theme-color-text-muted)'}}><MinecraftText text={city.owner}/> · {formatTerritoryCoords(city.coords)}</div></div><button onClick={()=>moveCity(city)} className="press" style={{border:'1px solid var(--theme-color-border)',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-primary)',borderRadius:9,padding: '6px 8px',fontSize:11}}>Коорд.</button><button onClick={()=>changeFounder(city)} className="press" style={{border:'1px solid var(--theme-color-border)',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-status-success)',borderRadius:9,padding: '6px 8px',fontSize:11}}>Мэр</button><button onClick={()=>deleteCity(city.id)} className="press" style={{border:'none',background:'var(--theme-color-status-danger-soft)',color:'var(--theme-color-status-danger)',borderRadius:9,padding: '6px 8px'}}><Trash2 size={14}/></button></div>)}</div>
    <WorldMapUploadPanel initData={initData} onMapSaved={onMapSaved} onError={setError} onNotice={setNotice} safeCaughtError={safeCaughtError} />
    <ManagedUsersPanel initData={initData} onError={setError} onNotice={setNotice} ui={{Field,MinecraftText,apiErrorMessage,safeCaughtError}} />
    <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-card)',padding: 'var(--theme-space-4)',marginBottom: 12}}>
      <div style={{display:'flex',alignItems:'center',gap: 8,marginBottom: 10}}><MessageCircle size={16} color="var(--theme-color-action-primary)"/><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>ЧиВо</div></div>
      {faqLoading&&<div role="status" style={{fontSize:12,color:'var(--theme-color-text-muted)',marginBottom: 8}}>Загрузка сохранённого текста…</div>}
      {faqLoadError&&<div role="alert" style={{fontSize:12,color:'var(--theme-color-status-danger)',lineHeight:1.45,marginBottom: 8}}>{faqLoadError}<button type="button" onClick={loadFaq} className="press" style={{display:'block',marginTop: 8,padding: '8px 11px',borderRadius:9,border:'1px solid var(--theme-color-border)',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-primary)',fontWeight:700}}>Повторить загрузку</button></div>}
      <TextAreaField value={faqText} onChange={e=>setFaqText(e.target.value)} disabled={faqLoading||Boolean(faqLoadError)} placeholder={faqLoading?'Загрузка…':faqLoadError?'Загрузка не удалась. Повторите запрос.':''} rows={9} style={{resize:'none',marginBottom: 8,opacity:faqLoading||faqLoadError?0.65:1}}/>
      <button onClick={saveFaq} disabled={faqSaving||faqLoading||Boolean(faqLoadError)} className="press" style={{width:'100%',border:'none',borderRadius:10,padding: '10px 12px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700,opacity:faqSaving||faqLoading||faqLoadError?0.55:1}}>{faqSaving?'Сохранение…':'Сохранить ЧиВо'}</button>
    </div>

    {managerModalCity&&<MainInspectorManagersModal city={managerModalCity} initData={initData} onClose={()=>setManagerModalCity(null)} onSaved={(message)=>{setNotice(message);onTerritoriesChanged?.()}} />}
    {notice&&<FixedToast key={notice} message={notice}/>}
    {error&&<div style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 8}}>{error}</div>}
    <MainInspectorD1DiagnosticsPanel initData={initData} ui={{parseApiResponse,safeCaughtError}} />
    <MainInspectorIssuedAwardsPanel initData={initData} onTerritoriesChanged={onTerritoriesChanged} ui={{apiErrorMessage,safeCaughtError,formatTerritoryAwardDate}} />
  </div>;
}

function MainInspectorManagersModal({city,initData,onClose,onSaved}){
  const makeRows=()=>((Array.isArray(city?.managers)?city.managers:[]).map(m=>({
    telegram_id:Number(m.telegram_id),
    mc_nickname:m.mc_nickname||'',
    telegram_username:String(m.telegram_username||'').replace(/^@/,''),
    username:String(m.telegram_username||'').replace(/^@/,'')
    ,skin_url:m.skin_url||null
  })));
  const [rows,setRows]=useState(makeRows);
  const [savingId,setSavingId]=useState(null);
  const [ownerAssignTelegramId,setOwnerAssignTelegramId]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>setRows(makeRows()),[city?.id,city?.managers]);
  async function save(row){
    const username=String(row.username||'').trim().replace(/^@+/,'');
    try{
      setSavingId(row.telegram_id); setError('');
      const r=await fetch(`${API_BASE}/api/admin/territories/manager`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,territoryId:city.id,currentTelegramId:Number(row.telegram_id),username})});
      const d=await r.json().catch(() => null);
      if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      const next=Array.isArray(d.managers)?d.managers.map(m=>({telegram_id:Number(m.telegram_id),mc_nickname:m.mc_nickname||'',telegram_username:String(m.telegram_username||'').replace(/^@/,''),username:String(m.telegram_username||'').replace(/^@/,'')})):[];
      setRows(next);
      onSaved?.(username?'Основатель/мэр изменён':'Основатель/мэр понижен');
    }catch(e){setError(safeCaughtError(e, 'Не удалось изменить основателя/мэра'))}finally{setSavingId(null)}
  }
  return <SimpleModal title={<>Основатели/мэры · <MinecraftText text={city?.name||''}/></>} onClose={onClose}>
    <div style={{fontSize:12,color:'var(--theme-color-text-muted)',marginBottom: 12}}>Измените Telegram username нужного человека. Пустое поле — понижение. Новый username должен принадлежать подтверждённому пользователю.</div>
    {rows.length===0?<div><div style={{fontSize:13,color:'var(--theme-color-text-muted)',padding: '4px 0 10px'}}>Основателей/мэров сейчас нет. Назначить нового может только главный инспектор.</div><Field value={ownerAssignTelegramId} onChange={e=>setOwnerAssignTelegramId(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="Telegram ID нового основателя/мэра" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13,marginBottom: 8}}/><button onClick={async()=>{const telegramId=Number(ownerAssignTelegramId);if(!Number.isSafeInteger(telegramId)||telegramId<=0){setError('Укажите корректный Telegram ID');return}try{setSavingId('owner');setError('');const r=await fetch(`${API_BASE}/api/admin/territories/owner`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,territoryId:city.id,telegramId})});const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setOwnerAssignTelegramId('');const next=Array.isArray(d.managers)?d.managers.map(m=>({telegram_id:Number(m.telegram_id),mc_nickname:m.mc_nickname||'',telegram_username:String(m.telegram_username||'').replace(/^@/,''),username:String(m.telegram_username||'').replace(/^@/,'')})):d.owner?[{telegram_id:Number(d.owner.telegram_id),mc_nickname:d.owner.mc_nickname||'',telegram_username:String(d.owner.telegram_username||'').replace(/^@/,''),username:String(d.owner.telegram_username||'').replace(/^@/,'')}]:[];setRows(next);onSaved?.('Основатель/мэр назначен')}catch(e){setError(safeCaughtError(e, 'Не удалось назначить основателя/мэра'))}finally{setSavingId(null)}}} disabled={savingId==='owner'} className="press" style={{width:'100%',border:'none',borderRadius:10,padding: '10px 12px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700}}>{savingId==='owner'?'Назначение…':'Назначить основателя/мэра'}</button></div>:<div style={{display:'flex',flexDirection:'column',gap: 10}}>
      {rows.map(row=><div key={row.telegram_id} style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-control)',padding: 'var(--theme-space-3)'}}>
        <div style={{display:'flex',alignItems:'center',gap: 8,marginBottom: 8}}>
          <AvatarHead nickname={row.mc_nickname} skinUrl={row.skin_url} size={40}/>
          <div style={{flex:1,minWidth:0}}><MinecraftText text={row.mc_nickname||'Без ника'} style={{fontSize:13,fontWeight:700}}/><div style={{fontSize:10.5,color:'var(--theme-color-status-success)'}}>Основатель/мэр</div></div>
          <ShieldCheck size={18} color="var(--theme-color-status-success)"/>
        </div>
        <Field value={row.username} onChange={e=>setRows(v=>v.map(x=>x.telegram_id===row.telegram_id?{...x,username:e.target.value}:x))} placeholder="Telegram username" autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13,marginBottom: 8}}/>
        <button onClick={()=>save(row)} disabled={savingId===row.telegram_id} className="press" style={{width:'100%',border:'none',borderRadius:10,padding: '10px 12px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700}}>{savingId===row.telegram_id?'Сохранение…':'Сохранить'}</button>
      </div>)}
    </div>}
    {error&&<div style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 10}}>{error}</div>}
  </SimpleModal>;
}
function InventoryGrid({items=[],equippedId=null,onEquip,showEquip=false,emptyText='Инвентарь пуст.',columns=4,aspectRatio='1 / 1',imageFit='contain'}){
  return <div>{items.length===0?<div style={{fontSize:12,color:'var(--theme-color-text-muted)'}}>{emptyText}</div>:<div style={{display:'grid',gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gap: 8}}>{items.map((item,i)=>{
    const equipped=String(item.item_id)===String(equippedId);
    const image=<div className={equipped?'atlas-inventory-image--equipped':'atlas-inventory-image'} style={{width:'100%',aspectRatio,display:'flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',border:equipped?'2px solid #6EE7B7':'1px solid var(--theme-color-border)',borderRadius:12,overflow:'hidden',background:equipped?'rgba(110,231,183,.18)':'var(--theme-color-surface-raised)',boxShadow:equipped?'inset 0 0 0 1px rgba(110,231,183,.2),0 0 0 1px rgba(110,231,183,.12)':'none'}}>{item.image_data?<img src={item.image_data} alt="" draggable={false} style={{display:'block',width:'100%',height:'100%',objectFit:imageFit}}/>:<Sparkles size={24} color="var(--theme-color-text-muted)"/>}</div>;
    const style={display:'block',width:'100%',minWidth:0,padding:0,margin:0,border:0,borderRadius:12,background:'transparent',cursor:showEquip?'pointer':'default',animationDelay:`${Math.min(i*28,168)}ms`};
    return showEquip
      ? <button type="button" key={`${item.item_id}-${item.telegram_id||''}-${i}`} onClick={()=>onEquip?.(item.item_id)} aria-label={`Выбрать визуал: ${item.name}`} className="press atlas-item-reveal atlas-inventory-item" style={style}>{image}</button>
      : <div key={`${item.item_id}-${item.telegram_id||''}-${i}`} className="atlas-item-reveal atlas-inventory-item" style={style} aria-label={item.name}>{image}</div>;
  })}</div>}</div>;
}
function ProfileInventory({initData,role,tgUser,territory}={}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  async function load(){
    try{
      setLoading(true);setError('');
      const url=territory?`${API_BASE}/api/customization?scope=profile&territoryId=${encodeURIComponent(territory.id)}`:`${API_BASE}/api/customization?scope=profile`;
      const r=await fetch(url,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'}),d=await r.json().catch(() => null);
      if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,"Операция не выполнена."));
      setData(d);
    }catch(e){setError(safeCaughtError(e,'Не удалось загрузить визуал'));}
    finally{setLoading(false);}
  }
  useEffect(()=>{load()},[initData,territory?.id]);
  const items=territory?(data?.cityInventory||[]):(data?.myItems||[]);
  const hasCategory=(item,category)=>String(item.category_name||'').trim().toLowerCase()===category||String(item.categories_text||'').toLowerCase().split(',').map(value=>value.trim()).includes(category);
  const markers=items.filter(item=>hasCategory(item,'метка'));
  const otherItems=items.filter(item=>!hasCategory(item,'метка'));
  return <div className="atlas-page-panel" style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,padding: 10,marginBottom: 8}}>
    <div className="atlas-display" style={{fontSize:16,fontWeight:700,marginBottom: 4}}>{territory?<>Инвентарь визуала — <MinecraftText text={territory.name}/></>:'Покупки'}</div>
    {loading&&!data?<div role="status" style={{fontSize:12,color:'var(--theme-color-text-muted)',padding: '8px 0'}}>Загрузка покупок…</div>
      : error&&!data?<div role="alert" style={{fontSize:12,color:'var(--theme-color-status-danger)',padding: '8px 0'}}>{error}</div>
      : items.length===0?<div style={{fontSize:12,color:'var(--theme-color-text-muted)'}}>{territory?'Инвентарь визуала пуст.':'Покупок пока нет.'}</div>
      : <div style={{display:'flex',flexDirection:'column',gap: 8}}>
          {markers.length>0&&<InventoryGrid items={markers} columns={4} aspectRatio="1 / 1" imageFit="contain"/>}
          {otherItems.length>0&&<InventoryGrid items={otherItems} columns={4} aspectRatio="1 / 1" imageFit="contain"/>}
        </div>}
  </div>;
}

function TreasuryCard({city,initData,tgUser,onToast}={}){
  const [data,setData]=useState(null),[amount,setAmount]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function load(){if(!city)return;try{setError('');const r=await fetch(`${API_BASE}/api/treasury?territoryId=${encodeURIComponent(city.id)}`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setData(d)}catch(e){setError(safeCaughtError(e, 'Не удалось загрузить казну'))}}
  useEffect(()=>{load()},[city?.id,initData]);
  async function deposit(){const n=Math.floor(Number(amount));if(!Number.isSafeInteger(n)||n<=0){setError('');return}const operation=getFinancialOperationToken('treasury-deposit',city.id,n);if(operation.blocked){setError(`Предыдущая операция на ${operation.amount} сц ещё не подтверждена. Верните прежнюю сумму и повторите попытку.`);return}try{setBusy(true);setError('');setNotice('');const r=await fetch(`${API_BASE}/api/treasury/deposit`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,territoryId:city.id,amount:n,operationId:operation.id})}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok){if([400,401,403,404,422].includes(r.status))clearFinancialOperationToken(operation);throw new Error(apiErrorMessage(r,d,"Операция не выполнена."));}clearFinancialOperationToken(operation);setData(d);setAmount('');setNotice('Казна пополнена');window.dispatchEvent(new Event('voxygen:currency-changed'))}catch(e){const message=safeCaughtError(e, 'Не удалось пополнить казну');if(/недостаточно самоцветов/i.test(message)){setError('');onToast?.('Недостаточно самоцветов','error');}else setError(message)}finally{setBusy(false)}}
  if(!city)return null;
  return <div className="atlas-page-panel" style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-card)',padding: 10,marginBottom: 8}}>
    <div className="atlas-display" style={{fontSize:18,fontWeight:800,marginBottom: 4}}>Казна: <MinecraftText text={city.name}/></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap: 8,marginBottom: 8}}>
      <div style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:14,padding: 10}}><div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginBottom: 6}}>В казне</div><div className="atlas-display" style={{fontSize:22,fontWeight:800,color:'var(--content-color-gem)',display:'flex',alignItems:'center',gap: 6}}>{data?.balance??0}<GemHex/></div></div>
      <div style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:14,padding: 10}}><div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginBottom: 6}}>Ваш баланс</div><div className="atlas-display" style={{fontSize:22,fontWeight:800,color:'var(--content-color-gem)',display:'flex',alignItems:'center',gap: 6}}>{data?.personal_balance??0}<GemHex/></div></div>
    </div>
    <div className="atlas-treasury-deposit-row" style={{display:'flex',alignItems:'stretch',gap: 8,width:'100%',boxSizing:'border-box'}}><div style={{flex:'1 1 auto',minWidth:0,marginBottom: 0}}><Field value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="Количество сц" style={{width:'100%'}}/></div><Button onClick={deposit} disabled={busy||!amount} size="md" style={{flex:'0 0 120px',width:120,minWidth:120,maxWidth:120,height:'var(--theme-control-height)',minHeight:'var(--theme-control-height)',padding: '0 10px',fontSize:13,whiteSpace:'nowrap',transform:'none'}}>{busy?'…':'Пополнить'}</Button></div>
    {error&&<div style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 8}}>{error}</div>}
    {notice&&<FixedToast key={notice} message={notice}/>}
  </div>;
}
function ToggleField({ checked, onChange, disabled = false, label, description }) {
  return <div style={{
    display:'flex', alignItems:'center', gap: 'var(--theme-toggle-row-gap)',
    padding: 'var(--theme-toggle-row-padding) 0', opacity:disabled?0.48:1,
  }}>
    <div style={{flex:1,minWidth:0}}>
      <div style={{
        fontSize:'var(--theme-toggle-label-size)',fontWeight:'var(--theme-toggle-label-weight)',
        color:'var(--theme-color-text-primary)',lineHeight:'var(--theme-toggle-label-line-height)',
      }}>{label}</div>
      {description&&<div style={{
        fontSize:'var(--theme-toggle-description-size)',color:'var(--theme-color-text-muted)',
        lineHeight:'var(--theme-toggle-description-line-height)',marginTop: 'var(--theme-toggle-description-gap)',
      }}>{description}</div>}
    </div>
    <button type="button" role="switch" aria-checked={Boolean(checked)} disabled={disabled}
      onClick={()=>onChange(!checked)} className="press" style={{
        width:'var(--theme-toggle-track-width)',height:'var(--theme-toggle-track-height)',
        borderRadius:'var(--theme-radius-pill)',
        border:`1px solid ${checked?'var(--theme-recipe-toggle-track-on-border)':'var(--theme-recipe-toggle-track-off-border)'}`,
        background:checked?'var(--theme-recipe-toggle-track-on-bg)':'var(--theme-recipe-toggle-track-off-bg)',
        padding: 'var(--theme-toggle-track-inset)',display:'flex',alignItems:'center',
        justifyContent:checked?'flex-end':'flex-start',flexShrink:0,cursor:disabled?'default':'pointer',
      }}><span style={{
        width:'var(--theme-toggle-thumb-size)',height:'var(--theme-toggle-thumb-size)',
        borderRadius:'var(--theme-radius-pill)',
        background:checked?'var(--theme-recipe-toggle-thumb-on-bg)':'var(--theme-recipe-toggle-thumb-off-bg)',
        display:'block',transition:'all var(--theme-motion-tap) var(--theme-ease-interactive)',
      }}/></button>
  </div>;
}

function ProfileSettingsModal({ initData, onClose, onSaved }) {
  const [settings,setSettings] = useState(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [reloadToken,setReloadToken] = useState(0);
  const [personalZoomChanged,setPersonalZoomChanged] = useState(false);
  const [personalThemeChanged,setPersonalThemeChanged] = useState(false);
  const themeSwipeStart = useRef(null);
  const { closing, requestClose } = useAnimatedClose(onClose, 175);

  useEffect(()=>{
    let cancelled=false;
    async function load(){
      try{
        setLoading(true); setError('');
        const response=await fetch(API_BASE+'/api/user-settings',{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
        const data=await response.json().catch(()=>null);
        if(!response.ok||!data?.ok||!data?.settings)throw new Error(apiErrorMessage(response,data,'Не удалось загрузить настройки.'));
        if(!cancelled){const personalTheme=String(data.settings.personalTheme??'vox');setSettings({...data.settings,defaultTheme:personalTheme,personalTheme,personalMapZoomPercent:normalizeMapZoomPercent(data.settings.personalMapZoomPercent??data.settings.mapZoomPercent??88),timezone:normalizeTimezoneOffset(data.settings.timezone),territories:Array.isArray(data.settings.territories)?data.settings.territories:[]});}
      }catch(e){if(!cancelled)setError(safeCaughtError(e,'Не удалось загрузить настройки.'));}
      finally{if(!cancelled)setLoading(false);}
    }
    load(); return()=>{cancelled=true};
  },[initData,reloadToken]);

  function patch(values){setSettings(current=>current?{...current,...values}:current)}
  function changeTerritory(id,enabled){setSettings(current=>current?{...current,territories:(current.territories||[]).map(item=>String(item.id)===String(id)?{...item,enabled}:item)}:current)}
  function keepUtcPrefix(value){const raw=String(value??'');const rest=raw.toUpperCase().startsWith('UTC')?raw.slice(3):raw.replace(/^U?T?C?/i,'');return ('UTC'+rest).slice(0,24)}
  async function save(){
    if(!settings)return;
    try{
      setSaving(true);setError('');
      const payload={defaultTheme:String(settings.personalTheme??settings.defaultTheme??'vox'),mapZoomPercent:normalizeMapZoomPercent(settings.personalMapZoomPercent),personalThemeChanged,personalMapZoomChanged:personalZoomChanged,timezone:normalizeTimezoneOffset(settings.timezone),eventNotifications:Boolean(settings.eventNotifications),territories:(settings.territories||[]).map(item=>({id:String(item.id),enabled:Boolean(item.enabled)}))};
      const response=await fetch(API_BASE+'/api/user-settings',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({...payload,initData})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||!data?.settings)throw new Error(apiErrorMessage(response,data,'Не удалось сохранить настройки.'));
      onSaved?.(data.settings); requestClose();
    }catch(e){setError(safeCaughtError(e,'Не удалось сохранить настройки.'));}
    finally{setSaving(false);}
  }

  const availableThemeIds = Array.isArray(settings?.availableThemes) && settings.availableThemes.length ? settings.availableThemes : ['vox'];
  const availableThemeItems = availableThemeIds.map(themeId=>THEME_CATALOG[themeId]).filter(Boolean);
  const selectedThemeId = normalizeThemeId(settings?.personalTheme??settings?.defaultTheme);
  const selectedThemeIndex = Math.max(0,availableThemeItems.findIndex(item=>item.id===selectedThemeId));
  const selectedTheme = availableThemeItems[selectedThemeIndex] || THEME_CATALOG.vox;
  function selectTheme(themeId){setPersonalThemeChanged(true);patch({personalTheme:themeId,defaultTheme:themeId});}
  function stepTheme(delta){const nextIndex=Math.max(0,Math.min(availableThemeItems.length-1,selectedThemeIndex+delta));const next=availableThemeItems[nextIndex];if(next&&next.id!==selectedThemeId)selectTheme(next.id);}
  function onThemeTouchStart(event){const touch=event.touches?.[0];themeSwipeStart.current=touch?{x:touch.clientX,y:touch.clientY}:null;}
  function onThemeTouchEnd(event){const start=themeSwipeStart.current;themeSwipeStart.current=null;const touch=event.changedTouches?.[0];if(!start||!touch)return;const dx=touch.clientX-start.x,dy=touch.clientY-start.y;if(Math.abs(dx)<36||Math.abs(dx)<Math.abs(dy)*1.2)return;stepTheme(dx<0?1:-1);}
  function onThemeKeyDown(event){if(event.key==='ArrowLeft'){event.preventDefault();stepTheme(-1);}else if(event.key==='ArrowRight'){event.preventDefault();stepTheme(1);}}

    return <div className={'atlas-overlay'+(closing?' atlas-closing':'')} style={{position:'fixed',inset:0,zIndex:130,background:'var(--theme-color-overlay-scrim)',display:'flex',alignItems:'center',justifyContent:'center',padding: 'calc(env(safe-area-inset-top) + 12px) 12px calc(69px + env(safe-area-inset-bottom) + 12px)'}} onClick={requestClose}>
    <div onClick={e=>e.stopPropagation()} className={'atlas-modal-shell'+(closing?' atlas-closing':'')} style={{width:'min(var(--theme-modal-max-width),100%)',maxHeight:'min(var(--theme-modal-max-height-settings), var(--theme-modal-viewport-safe-height), calc(100vh - 93px - env(safe-area-inset-top) - env(safe-area-inset-bottom)))',overflowY:'auto',background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-modal)',padding: 'var(--theme-modal-content-padding)',boxSizing:'border-box'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap: 12,marginBottom: 15}}>
        <div className="atlas-display" style={{fontSize:19,fontWeight:750}}>Настройки</div>
        <IconButton icon={X} label="Закрыть настройки" onClick={requestClose} />
      </div>
      {loading?<div style={{padding: '24px 0',textAlign:'center',fontSize:13,color:'var(--theme-color-text-muted)'}}>Загрузка настроек…</div>:!settings?<div style={{fontSize:12.5,color:'var(--theme-color-status-danger)',lineHeight:1.5}}>
        {error||'Настройки недоступны.'}
        <button onClick={()=>setReloadToken(value=>value+1)} className="press" style={{display:'block',marginTop: 10,padding: '8px 12px',borderRadius:10,border:'1px solid var(--theme-color-border)',background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-primary)',fontWeight:700}}>Повторить</button>
      </div>:<>
        <div style={{fontSize:15,fontWeight:750,marginBottom: 8}}>Основные</div>
        <div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginBottom: 6}}>Тема интерфейса</div>
        <div role="group" aria-label="Выбор темы интерфейса" tabIndex={0} onKeyDown={onThemeKeyDown} onTouchStart={onThemeTouchStart} onTouchEnd={onThemeTouchEnd} style={{display:'flex',alignItems:'center',gap: 8,padding: 10,marginBottom: 15,background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:14,touchAction:'pan-y',userSelect:'none'}}>
          <button type="button" aria-label="Предыдущая тема" title="Предыдущая тема" onClick={()=>stepTheme(-1)} disabled={selectedThemeIndex<=0} className="press atlas-theme-arrow" style={{width:40,height:40,minWidth:40,minHeight:40,padding:0,border:'1px solid var(--theme-color-action-primary-border)',borderRadius:11,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0,opacity:1}}><ChevronLeft size={18} color="var(--theme-color-action-primary)"/></button>
          <div aria-live="polite" style={{flex:1,minWidth:0,textAlign:'center'}}>
            <div className="atlas-display" style={{fontSize:17,fontWeight:800}}>{selectedTheme?.name||'Vox'}</div>
            <div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',lineHeight:1.4,marginTop: 3,whiteSpace:'pre-line'}}>{selectedTheme?.description||'Тема интерфейса Voxygen'}</div>
            {availableThemeItems.length>1&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',gap: 4,marginTop: 8}}>{availableThemeItems.map((item,index)=><span key={item.id} aria-label={item.name} style={{width:index===selectedThemeIndex?16:6,height:6,borderRadius:99,background:index===selectedThemeIndex?'var(--theme-color-action-primary)':'var(--theme-color-border-strong)',transition:'all 160ms ease'}}/>)}</div>}
          </div>
          <button type="button" aria-label="Следующая тема" title="Следующая тема" onClick={()=>stepTheme(1)} disabled={selectedThemeIndex>=availableThemeItems.length-1} className="press atlas-theme-arrow" style={{width:40,height:40,minWidth:40,minHeight:40,padding:0,border:'1px solid var(--theme-color-action-primary-border)',borderRadius:11,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0,opacity:1}}><ChevronRight size={18} color="var(--theme-color-action-primary)"/></button>
        </div>
        <div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginBottom: 6}}>Часовой пояс</div>
        <input value={settings.timezone||'UTC+3'} onChange={e=>patch({timezone:keepUtcPrefix(e.target.value)})} onBlur={()=>patch({timezone:normalizeTimezoneOffset(settings.timezone)})} placeholder="UTC+3" aria-label="Часовой пояс" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:11,padding: '11px 12px',color:'var(--theme-color-text-primary)',fontSize:14,marginBottom: 15}}/>
        <div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginBottom: 6}}>Масштаб карты</div>
        <Slider label="Масштаб карты" variant="player" min="1" max="100" step="1" value={settings.personalMapZoomPercent??88} onChange={e=>{setPersonalZoomChanged(true);patch({personalMapZoomPercent:normalizeMapZoomPercent(e.target.value)})}} style={{'--slider-progress':`${((settings.personalMapZoomPercent??88)-1)/99*100}%`,margin: '4px 0 2px'}}/>
        <div style={{fontSize:12,color:'var(--theme-color-text-primary)',fontWeight:700,textAlign:'center',marginBottom: 15}}>{settings.personalMapZoomPercent??88}%</div>
        <div style={{fontSize:15,fontWeight:750,marginBottom: 4}}>Уведомления</div>
        <div style={{borderTop:'1px solid var(--theme-color-border)',borderBottom:'1px solid var(--theme-color-border)',marginBottom: 8}}>
          <ToggleField label="Уведомления о новых ивентах" description="Сообщение от бота при создании каждого нового ивента" checked={Boolean(settings.eventNotifications)} onChange={enabled=>patch({eventNotifications:enabled})}/>
        </div>
        {(settings.territories||[]).length>0&&<div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginBottom: 4}}>Уведомления территорий</div>}
        {(settings.territories||[]).map(item=><div key={item.id} style={{borderBottom:'1px solid var(--theme-color-border)'}}><ToggleField label={<span>Территория <MinecraftText text={item.name}/></span>} description={item.role==='manager'?'Основатель/мэр':'Житель'} checked={Boolean(item.enabled)} onChange={enabled=>changeTerritory(item.id,enabled)}/></div>)}
        {error&&<div role="alert" style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 10}}>{error}</div>}
        <Button onClick={save} disabled={saving} fullWidth style={{marginTop: 15}}>{saving?'Сохранение…':'Сохранить настройки'}</Button>
      </>}
    </div>
  </div>;
}

function ProfileScreen({ profile, profileLoadState, profileLoadError, claimNickname, role, tgUser, refreshProfile, territories, onTerritoriesChanged, onMapSaved, onFaqSaved, onSettingsSaved, onOpenGlobalSettings, onToast }) {
  const isInspector = role === 'inspector' || role === 'main_inspector';
  const isMainInspector = role === 'main_inspector';
  const initData = window.Telegram?.WebApp?.initData || '';
  const [draft, setDraft] = useState(profile.nickname || '');
  const [error, setError] = useState('');
  const [settingsOpen,setSettingsOpen] = useState(false);
  useEffect(() => { setDraft(profile.nickname || ''); }, [profile.nickname]);
  async function submit(){const res=await claimNickname(draft);setError(res.ok?'':res.message)}
  const uid=String(tgUser?.id||'');
  const visibleCities=(territories||[]).filter(t=>String(t.owner_telegram_id||'')===uid||(Array.isArray(t.manager_telegram_ids)&&t.manager_telegram_ids.map(String).includes(uid))||(Array.isArray(t.resident_telegram_ids)&&t.resident_telegram_ids.map(String).includes(uid)));
  const managerCities=visibleCities.filter(t=>String(t.owner_telegram_id||'')===uid||(Array.isArray(t.manager_telegram_ids)&&t.manager_telegram_ids.map(String).includes(uid)));
  const managerCityIds=new Set(managerCities.map(t=>String(t.id)));
  const residentCities=visibleCities.filter(t=>!managerCityIds.has(String(t.id))&&(Array.isArray(t.resident_telegram_ids)&&t.resident_telegram_ids.map(String).includes(uid)));
  const userCitiesForTreasury=visibleCities;
  return <div className="atlas-page atlas-page--profile" style={{padding: '18px 15px calc(85px + env(safe-area-inset-bottom))',minHeight:'60vh'}}>
    <div className="atlas-display atlas-page-title" style={{fontSize:22,fontWeight:700,marginBottom: 12}}>Профиль</div>
    {profileLoadError&&<div role="status" style={{display:'flex',alignItems:'center',gap: 10,background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:12,padding: 12,marginBottom: 12,fontSize:12.5,lineHeight:1.45}}><span style={{flex:1,color:'var(--theme-color-text-muted)'}}>{profileLoadError}{profileLoadState!=='error'?' Последние подтверждённые данные сохранены.':''}</span><button onClick={refreshProfile} className="press" style={{border:'1px solid var(--theme-color-border)',borderRadius:10,background:'var(--theme-color-surface)',color:'var(--theme-color-text-primary)',padding: '8px 10px',fontWeight:700,flexShrink:0}}>Повторить</button></div>}
    <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-card)',padding: 10,marginBottom: 8}}><div style={{display:'flex',alignItems:'center',gap: 12,marginBottom: 8}}><AvatarHead nickname={profile.status==='verified'?profile.nickname:null} skinUrl={profile.status==='verified'?profile.skinUrl:null} size={46}/><div><div style={{fontSize:15,fontWeight:600}}>{profileLoadState==='error'?'Профиль временно недоступен':<MinecraftText text={profile.nickname||'Ник не указан'}/>}</div>{isInspector?<div style={{fontSize:11.5,color:'var(--theme-color-status-warning)',display:'flex',alignItems:'center',gap: 4,fontWeight:700}}><ShieldCheck size={12}/>{isMainInspector?'Главный инспектор':'Инспектор'}</div>:profile.status==='verified'?<div style={{fontSize:11.5,color:'var(--theme-color-status-success)'}}>Ник подтверждён</div>:profile.status==='pending'?<div style={{fontSize:11.5,color:'var(--theme-color-status-warning)'}}>Ожидает подтверждения инспектора</div>:<div style={{fontSize:11.5,color:'var(--theme-color-text-muted)'}}>Ник в Minecraft</div>}</div><div style={{display:'flex',alignItems:'center',gap: 6,marginLeft: 'auto',flexShrink:0}}>
        <button type="button" onClick={()=>setSettingsOpen(true)} className="press" aria-label="Настройки профиля" title="Настройки" style={{width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--theme-color-border)',borderRadius:12,background:'var(--theme-color-surface-raised)',color:'var(--theme-color-text-muted)'}}><Settings size={18}/></button>
        {isMainInspector&&<button type="button" onClick={()=>onOpenGlobalSettings?.()} className="press" aria-label="Глобальные настройки" title="Глобальные настройки" style={{width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--theme-color-status-success)',borderRadius:12,background:'var(--theme-color-status-success)',color:'var(--theme-color-status-success-contrast)'}}><Settings size={18}/></button>}
      </div></div><div style={{fontSize:11.5,color:'var(--theme-color-text-muted)',marginBottom: 10}}>Telegram: {tgUser?`@${tgUser.username||'—'} · id ${tgUser.id}`:'не определён'}</div>{!isInspector&&profileLoadState==='needs_nickname'&&profile.status!=='verified'&&<><div style={{display:'flex',gap: 8}}><Field value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Ваш ник в Minecraft" style={{flex:1,background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13}}/><button onClick={submit} className="press" style={iconBtn('var(--theme-color-action-primary)','var(--theme-color-action-primary-contrast)',true)}><Pencil size={15}/></button></div>{error&&<div style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 8}}>{error}</div>}</>}</div>
    {isMainInspector?<MainInspectorAwardManager initData={initData} territories={territories} onTerritoriesChanged={onTerritoriesChanged} ui={{apiErrorMessage,safeCaughtError}}/>:<ProfileInventory initData={initData} role={role} tgUser={tgUser}/>}
    {!isInspector&&userCitiesForTreasury.map(city=><TreasuryCard key={`treasury-${city.id}`} city={city} initData={initData} tgUser={tgUser} onToast={onToast}/>)}
    {!isInspector&&managerCities.map(city=><CityManagementProfile key={`manage-${city.id}`} territory={city} managerTerritories={managerCities} initData={initData} tgUser={tgUser} onChanged={onTerritoriesChanged} ui={{apiErrorMessage,safeCaughtError,SurfaceCard,MinecraftText,TelegramMinecraftText,TextAreaField,Field,AvatarHead,InventoryGrid,TerritoryAwardIcon,FixedToast,iconBtn}}/>)}
    {!isInspector&&residentCities.map(city=><CityManagementProfile key={`view-${city.id}`} territory={city} managerTerritories={managerCities} initData={initData} tgUser={tgUser} readOnly onChanged={onTerritoriesChanged} ui={{apiErrorMessage,safeCaughtError,SurfaceCard,MinecraftText,TelegramMinecraftText,TextAreaField,Field,AvatarHead,InventoryGrid,TerritoryAwardIcon,FixedToast,iconBtn}}/>)}
    {isMainInspector&&<MainInspectorPanel initData={initData} onMapSaved={onMapSaved} territories={territories} onTerritoriesChanged={onTerritoriesChanged} onFaqSaved={onFaqSaved}/>}
      {settingsOpen&&<ProfileSettingsModal initData={initData} onClose={()=>setSettingsOpen(false)} onSaved={settings=>onSettingsSaved?.(settings)}/>}
      </div>;
}

function HomeScreen({ territories, onSelect, onAddTerritory, mode='map', mapImage=null, mapSource=null, mapLoading=false, mapError='', onRetryMap, voxView, onVoxViewChange, markersReady=false, mapZoomPercent=100, mapZoomReady=false }) {
  const [sortBy,setSortBy]=useState('curator');
  const [resetSignal,setResetSignal]=useState(0);

  function resetWorldMapView() {
    setResetSignal(value => value + 1);
  }

  return <div className="atlas-page atlas-page--home" style={{paddingBottom: 90}}>
    {mode==='map'
      ? <div style={{padding: '0 15px'}}>
          <div style={{position:'relative',width:'100%',aspectRatio:'1 / 1',borderRadius:6,border:'1px solid var(--theme-color-border)',overflow:'hidden',background:'var(--theme-color-canvas)'}}>
            {mapImage && mapZoomReady ? (
              <VoxMap
                image={mapImage}
                source={mapSource}
                territories={territories}
                onSelect={onSelect}
                resetSignal={resetSignal}
                viewState={voxView}
                onViewStateChange={onVoxViewChange}
                markersReady={markersReady}
                mapZoomPercent={mapZoomPercent}
                mapZoomReady={mapZoomReady}
                mapUtils={{ finiteCoordinate, voxWorldToPercent, hasMapOwner, DEFAULT_CITY_MARKER, MAP_MARKER_WIDTH, MAP_MARKER_HEIGHT, stripMinecraftCodes }}
              />
            ) : (
              <div role="status" aria-live="polite" aria-label="Подготовка карты" style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap: 12,padding: 24,boxSizing:'border-box',textAlign:'center',background:'var(--theme-color-surface)',color:'var(--theme-color-text-muted)',fontSize:13,lineHeight:1.5}}>
                {mapZoomReady && !mapLoading && !mapImage ? <><div>{mapError || 'Карта ещё не загружена.'}</div><button type="button" onClick={onRetryMap} className="press" style={{border:'1px solid var(--theme-color-action-primary-border)',borderRadius:10,padding: '8px 12px',background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',fontWeight:700}}>Повторить</button></> : null}
              </div>
            )}
          </div>
          <div style={{display:'flex',justifyContent:'center',paddingTop: 12}}>
            <button onClick={resetWorldMapView} className="press" style={{width:'100%',maxWidth:520,margin: '0 auto',display:'flex',alignItems:'center',justifyContent:'center',gap: 6,border:'1px solid var(--theme-color-action-primary-border)',borderRadius:11,padding: '11px',minHeight:44,background:'var(--theme-color-action-primary-soft)',color:'var(--theme-color-action-primary)',fontWeight:800}}>Сбросить</button>
          </div>
        </div>
      : <div style={{padding: '0 15px'}}>
          <div style={{marginBottom: 10}}><Segmented value={sortBy} onChange={setSortBy} style={{background:'var(--theme-recipe-rating-switch-track-bg)',borderRadius:'var(--theme-recipe-rating-switch-track-radius)',height:'var(--theme-recipe-rating-switch-track-height)',boxSizing:'border-box',padding:'var(--theme-recipe-rating-switch-inset)',display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:0,position:'relative',isolation:'isolate'}} optionStyle={{position:'relative',zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:4,minWidth:0,height:'var(--theme-recipe-rating-switch-indicator-height)',minHeight:'var(--theme-recipe-rating-switch-indicator-height)',padding:'6px 6px',borderRadius:'var(--theme-recipe-rating-switch-indicator-radius)',fontSize:12.5,border:'none',cursor:'pointer',background:'transparent'}} indicatorStyle={{top:'var(--theme-recipe-rating-switch-inset)',bottom:'var(--theme-recipe-rating-switch-inset)',left:'var(--theme-recipe-rating-switch-inset)',width:'calc((100% - var(--theme-recipe-rating-switch-inset) - var(--theme-recipe-rating-switch-inset)) / 2)',borderRadius:'var(--theme-recipe-rating-switch-indicator-radius)',background:'var(--theme-recipe-segmented-active-bg)'}} options={[{value:'curator',label:'По инспекторам'},{value:'community',label:'По игрокам'}]}/></div>
          {territories.length===0
            ? <div style={{textAlign:'center',padding: '40px 15px',color:'var(--theme-color-text-muted)',fontSize:13}}>Городов пока нет — станьте первым, кто добавит свой.</div>
            : <div style={{display:'flex',flexDirection:'column',gap: 8}}>
                {[...territories].sort((a,b)=>b[sortBy]-a[sortBy]).map((t,i)=>(
                  <button key={t.id} onClick={()=>onSelect(t.id)} className="press atlas-list-card" style={{display:'flex',alignItems:'center',gap: 12,textAlign:'left',background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-card)',padding: 10,color:'var(--theme-color-text-primary)',animationDelay:`${Math.min(i*28,168)}ms`}}>
                    <span className="atlas-display" style={{width:20,fontSize:13,color:'var(--theme-color-text-muted)'}}>{i+1}</span>
                    <span aria-hidden="true" style={{position:'relative',display:'block',width:46,height:46,flex:'0 0 46px',borderRadius:12,border:'1px solid var(--theme-color-border)',overflow:'hidden'}}><span style={{position:'absolute',width:'100vw',height:150,left:'50%',top:'50%',transform:'translate(-50%,-50%)',background:getBannerGradient(t.banner_color||'none',t.banner_gradient||'aurora',t.accent),pointerEvents:'none'}}/></span>
                    <div style={{flex:1,minWidth:0}}><MinecraftText text={t.name} as="div" className="atlas-display" style={{fontSize:16,fontWeight:800,lineHeight:1.2}}/><div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:400,marginTop: 4}}>{Number(t.votes||0)} {pluralizeRatings(t.votes)}</div></div>
                    <ScoreBadge type={sortBy==='curator'?'curator':'community'} value={t[sortBy]} size="lg"/>
                  </button>
                ))}
              </div>
          }
        </div>
    }
  </div>;
}
function DonationModal({territory,initData,onClose,onSuccess,onToast}){
  const [amount,setAmount]=useState(''),[balance,setBalance]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{(async()=>{try{const r=await fetch(`${API_BASE}/api/customization?lite=1`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});const d=await r.json().catch(() => null);if(r.ok&&d.ok)setBalance(Number(d.personalBalance??0));}catch{}})()},[initData]);
  async function donate(){const n=Math.floor(Number(amount));if(!Number.isSafeInteger(n)||n<=0)return;const operation=getFinancialOperationToken('treasury-donate',territory.id,n);if(operation.blocked){setError(`Предыдущая операция на ${operation.amount} сц ещё не подтверждена. Верните прежнюю сумму и повторите попытку.`);return}try{setBusy(true);setError('');const r=await fetch(`${API_BASE}/api/treasury/donate`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,territoryId:territory.id,amount:n,operationId:operation.id})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok){if([400,401,403,404,422].includes(r.status))clearFinancialOperationToken(operation);throw new Error(apiErrorMessage(r,d,"Операция не выполнена."));}clearFinancialOperationToken(operation);setBalance(Number(d.personal_balance??Math.max(0,(balance??0)-n)));window.dispatchEvent(new Event('voxygen:currency-changed'));onSuccess?.()}catch(e){const message=safeCaughtError(e, 'Не удалось отправить донат');if(/недостаточно самоцветов/i.test(message)){setError('');onToast?.('Недостаточно самоцветов','error');}else setError(message)}finally{setBusy(false)}}
  return <SimpleModal title="Донат в казну" titleGap={6} onClose={onClose}>
    <div style={{fontSize:13,color:'var(--theme-color-text-muted)',lineHeight:1.5,marginBottom: 12}}>Поддержать <b style={{color:'var(--theme-color-text-primary)'}}><MinecraftText text={territory.name}/></b> донатом</div>
    <div style={{background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:14,padding: 10,marginBottom: 12}}><div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginBottom: 4}}>Ваш баланс</div><div className="atlas-display" style={{fontSize:22,fontWeight:800,color:'var(--content-color-gem)',display:'flex',alignItems:'center',gap: 6}}>{balance??'…'}<GemHex/></div></div>
    <input value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="Количество сц" style={{width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:12,padding: '12px',color:'var(--theme-color-text-primary)',fontSize:15,marginBottom: 10}}/>
    {error&&<div style={{fontSize:12,color:'var(--theme-color-status-danger)',marginBottom: 10}}>{error}</div>}
    <button onClick={donate} disabled={busy||!amount} className="press" style={{width:'100%',padding: '12px',border:'none',borderRadius:12,background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:800}}>{busy?'Отправка…':'Отправить донат'}</button>
  </SimpleModal>;
}



function ResidentsModal({ residents, members = [], pendingInvites = [], ownerName, isOwner, onClose, newResident, setNewResident, onAdd, onRemove, onCancelInvite }) {
  const displayMembers=members.length?members:residents.map((name,i)=>({mc_nickname:name,fallback:i}));
  const { closing, requestClose } = useAnimatedClose(onClose, 175);
  return <div className={`atlas-overlay${closing ? ' atlas-closing' : ''}`} style={{position:'fixed',inset:0,background:'var(--theme-color-overlay-scrim)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={requestClose}><div onClick={e=>e.stopPropagation()} className={`atlas-modal-shell${closing ? ' atlas-closing' : ''}`} style={{width:'100%',maxWidth:'var(--theme-modal-max-width)',background:'var(--theme-color-surface)',borderRadius:'var(--theme-radius-modal)',border:'1px solid var(--theme-color-border)',padding: 'var(--theme-modal-content-padding)',maxHeight:'min(var(--theme-modal-max-height-compact), var(--theme-modal-viewport-safe-height))',overflowY:'auto'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: 12}}><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>Жители</div><IconButton icon={X} label="Закрыть окно" onClick={requestClose} /></div><div style={{display:'flex',flexDirection:'column',gap: 8,marginBottom: isOwner?12:0}}>{displayMembers.length===0?<div style={{fontSize:12.5,color:'var(--theme-color-text-muted)'}}>Список жителей пуст.</div>:displayMembers.map(m=><div key={m.telegram_id||m.fallback||m.mc_nickname} style={{display:'flex',alignItems:'center',gap: 10,background:'var(--theme-color-surface-raised)',borderRadius:12,padding: '8px 12px'}}><User size={15} color="var(--theme-color-text-muted)"/><MinecraftText text={m.mc_nickname||'Неизвестно'} style={{fontSize:13.5,flex:1}}/>{isOwner&&m.telegram_id&&<button onClick={()=>onRemove(m)} className="press" style={{border:'none',background:'transparent',color:'var(--theme-color-status-danger)'}}><Trash2 size={14}/></button>}</div>)}</div>{isOwner&&pendingInvites.length>0&&<div style={{marginBottom: 12}}><div style={{fontSize:12,fontWeight:700,color:'var(--theme-color-status-warning)',marginBottom: 6}}>Ожидают ответа</div>{pendingInvites.map(inv=><div key={inv.id} style={{display:'flex',alignItems:'center',gap: 8,background:'var(--theme-color-status-warning-soft)',borderRadius:12,padding: '8px 10px',marginBottom: 6}}><Clock size={14} color="var(--theme-color-status-warning)"/><MinecraftText text={inv.target_nickname} style={{flex:1,fontSize:12.5}}/><button onClick={()=>onCancelInvite(inv.id)} className="press" style={{border:'none',background:'transparent',color:'var(--theme-color-status-danger)'}}><X size={15}/></button></div>)}</div>}{isOwner&&<div style={{display:'flex',gap: 8}}><Field value={newResident} onChange={e=>setNewResident(e.target.value)} placeholder="Ник игрока" style={{flex:1,background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:10,padding: '8px 12px',color:'var(--theme-color-text-primary)',fontSize:13}}/><button onClick={onAdd} className="press" style={iconBtn('var(--theme-color-action-primary)','var(--theme-color-action-primary-contrast)',true)}><UserPlus size={15}/></button></div>}</div></div>;
}

function RecruitmentScreen({ territories, onSelect }) {
  const [selected, setSelected] = useState(null);
  const cities = (territories || [])
    .filter(t => Number(t.recruitment_enabled) === 1 && String(t.recruitment_description || '').trim())
    .sort((a,b) => Number(b.curator||0) - Number(a.curator||0));
  const contact = city => String(city?.recruitment_contact_username || city?.owner_telegram_username || '').trim().replace(/^@+/, '');
  const formatCoords = formatTerritoryCoords;
  return <div className="atlas-page atlas-page--recruitment" style={{padding: '0 15px 100px'}}>
    {cities.length===0 ? <div style={{background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:16,padding: 18,color:'var(--theme-color-text-muted)',fontSize:13}}>Сейчас нет открытых объявлений о наборе.</div> :
      <div style={{display:'flex',flexDirection:'column',gap: 8}}>
        {cities.map((city,index)=><button key={city.id} onClick={()=>setSelected(city)} className="press atlas-recruitment-card" style={{width:'100%',textAlign:'left',background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:'var(--theme-radius-card)',padding: 10,color:'var(--theme-color-text-primary)',minHeight:76,animationDelay:`${Math.min(index*32,192)}ms`}}>
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',alignItems:'center',gap: 10,minWidth:0,minHeight:48}}>
            <div style={{minWidth:0}}>
              <MinecraftText text={city.name} as="div" lang="ru" className="atlas-display" style={{fontSize:22,fontWeight:800,lineHeight:1.2,minWidth:0,whiteSpace:'normal',overflowWrap:'anywhere',wordBreak:'normal',hyphens:'auto',hyphenateCharacter:'–'}} />
              <div style={{fontSize:12,color:'var(--theme-color-text-muted)',marginTop: 6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}><span style={{color:'var(--theme-color-text-primary)'}}>Связь:</span> {contact(city)?<TelegramUsername username={contact(city)} style={{fontWeight:700}}/>: 'не указан'}</div>
            </div>
            <div style={{display:'flex',flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap: 6,flexShrink:0}}>
              <ScoreBadge type="curator" value={Number(city.curator||0)} size="recruitment" />
              <ScoreBadge type="community" value={Number(city.community||0)} size="recruitment" />
            </div>
          </div>
        </button>)}
      </div>}
    {selected&&<SimpleModal title={<MinecraftText text={selected.name} style={{fontSize:23,fontWeight:800,lineHeight:1.2,display:"block"}} />} onClose={()=>setSelected(null)}>
      <div style={{fontSize:16,color:'var(--theme-color-text-muted)',lineHeight:1.1,marginBottom: 12}}>{formatCoords(selected.coords)}</div>
      <div style={{fontSize:14,marginBottom: 12}}><b>Связь:</b> {contact(selected)?<TelegramUsername username={contact(selected)} interactive style={{fontWeight:700}}/>:'не указан'}</div>
      <div style={{display:'flex',gap: 10,marginBottom: 12}}>
        <ScoreBadge type="curator" value={Number(selected.curator||0)} size="lg" />
        <ScoreBadge type="community" value={Number(selected.community||0)} size="lg" />
      </div>
      <TelegramMinecraftText text={selected.recruitment_description} interactive style={{background:'var(--theme-color-surface-raised)',borderRadius:12,padding: '11px 12px',fontSize:13,lineHeight:1.55,marginBottom: 12}}/>
      <button onClick={()=>{setSelected(null);onSelect(selected.id)}} className="press" style={{width:'100%',padding: '11px 0',border:'none',borderRadius:11,background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700}}>Перейти на страницу города</button>
    </SimpleModal>}
  </div>;
}

function MainTabs({ tab, onChange }) {
  const items = [
    { key: 'recruit', label: 'Набор', icon: UserPlus },
    { key: 'map', label: 'Карта', icon: MapIcon },
    { key: 'rating', label: 'Рейтинг', icon: ListIcon },
  ];
  const activeIndex=Math.max(0,items.findIndex(item=>item.key===tab));

  return (
    <div style={{ padding: '4px 15px 12px' }}>
      <div className="atlas-main-tabs" style={{
        '--main-tabs-index':activeIndex,
        background:'var(--theme-color-surface-raised)',borderRadius:12,padding:3,
        display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:0,position:'relative',isolation:'isolate',
      }}>
        <span className="atlas-main-tabs__indicator" aria-hidden="true"/>
        {items.map((it) => {
          const active = it.key === tab;
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              className={`press atlas-main-tabs__option${active?' is-active':''}`}
              aria-pressed={active}
              style={{
                position:'relative',zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:4,
                minWidth:0,padding:'6px 6px',borderRadius:999,fontSize:12.5,fontWeight:active?700:600,
                border:'none',cursor:'pointer',background:'transparent',
                color:active?'#fff':'var(--theme-color-text-muted)',
                transition:'color 180ms ease,font-weight 180ms ease',
              }}
            >
              <Icon size={14} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


function SimpleModal({title,children,onClose,titleGap}) {
  const {closing,requestClose}=useAnimatedClose(onClose,175);
  const portalRoot=typeof document!=="undefined"?(document.querySelector(".atlas-root")||document.body):null;
  if(!portalRoot)return null;
  return createPortal(
    <div className={"atlas-overlay"+(closing?" atlas-closing":"")} style={{position:"fixed",inset:0,zIndex:200,background:"var(--theme-color-surface-overlay)",display:"flex",alignItems:"center",justifyContent:"center",padding:"var(--theme-space-6) var(--theme-space-4)",backdropFilter:"blur(var(--theme-modal-backdrop-blur))",WebkitBackdropFilter:"blur(var(--theme-modal-backdrop-blur))"}} onClick={requestClose}>
      <div onClick={e=>e.stopPropagation()} className={"atlas-modal-shell"+(closing?" atlas-closing":"")} style={{width:"min(var(--theme-modal-max-width),100%)",maxHeight:"min(var(--theme-modal-max-height-standard), var(--theme-modal-viewport-safe-height))",overflowY:"auto",margin:"auto",background:"var(--theme-color-surface)",border:"1px solid var(--theme-color-border)",borderRadius:"var(--theme-radius-modal)",padding:"var(--theme-space-4)"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:title?"space-between":"flex-end",marginBottom:title?(titleGap??"var(--theme-space-3)"):"var(--theme-space-2)"}}>
          {title&&<div className="atlas-display" style={{fontSize:"var(--theme-type-title-size)",fontWeight:"var(--theme-type-title-weight)",lineHeight:1.2}}>{title}</div>}
          <IconButton icon={X} label="Закрыть окно" onClick={requestClose}/>
        </div>
        {children}
      </div>
    </div>,
    portalRoot
  );
}
function normalizedTelegramUsername(value) {
  const username=String(value||'').trim().replace(/^@+/,'');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : '';
}
function TelegramUsername({username,interactive=false,style={}}) {
  const raw=String(username||'').trim().replace(/^@+/,'');
  if(!raw)return null;
  const normalized=normalizedTelegramUsername(raw);
  const label='@'+raw;
  const appearance={...style,color:interactive?'var(--theme-color-status-success)':(style.color||'inherit'),textDecoration:'none'};
  if(!interactive||!normalized)return <span style={appearance}>{label}</span>;
  const href='https://t.me/'+normalized;
  return <a href={href} target="_blank" rel="noopener noreferrer" onClick={event=>{
    event.stopPropagation();
    const openTelegramLink=window.Telegram?.WebApp?.openTelegramLink;
    if(typeof openTelegramLink==='function'){event.preventDefault();openTelegramLink.call(window.Telegram.WebApp,href);}
  }} style={appearance}>{label}</a>;
}
function TelegramRichText({text,interactive=true,style={}}) {
  const value=String(text??'');
  const pattern=/@[A-Za-z][A-Za-z0-9_]{4,31}/g;
  const pieces=[];
  let cursor=0,match;
  while((match=pattern.exec(value))){
    const previous=match.index>0?value[match.index-1]:'';
    if(previous&&/[A-Za-z0-9_.]/.test(previous))continue;
    if(match.index>cursor)pieces.push(value.slice(cursor,match.index));
    pieces.push(<TelegramUsername key={match.index} username={match[0]} interactive={interactive}/>);
    cursor=match.index+match[0].length;
  }
  if(cursor<value.length)pieces.push(value.slice(cursor));
  return <div style={{whiteSpace:'pre-wrap',...style}}>{pieces}</div>;
}

function TelegramMinecraftText({text,interactive=true,style={},className=''}) {
  const source=String(text??'').replace(/§x(?:§[0-9a-fA-F]){6}/gi,value=>'§#'+value.replace(/§x|§/gi,''));
  const pieces=[],inlineStyle={};
  for(const key of ['color','fontSize','fontWeight','fontFamily','fontStyle','lineHeight','letterSpacing','textTransform'])if(style[key]!==undefined)inlineStyle[key]=style[key];
  const state={color:null,bold:false,italic:false,underline:false,strike:false,obfuscated:false};
  const tokenPattern=/§(?:#([0-9a-fA-F]{6})|([0-9a-fk-oK-OrR]))/gi;
  let cursor=0,linkIndex=0,match;
  const statePrefix=()=>{let prefix='';if(state.color){const hex=String(state.color).match(/^#[0-9a-f]{6}$/i);if(hex)prefix+='§'+hex[0];else{const code=Object.keys(MINECRAFT_COLORS).find(key=>MINECRAFT_COLORS[key]===state.color);if(code)prefix+='§'+code;}}if(state.obfuscated)prefix+='§k';if(state.bold)prefix+='§l';if(state.strike)prefix+='§m';if(state.underline)prefix+='§n';if(state.italic)prefix+='§o';return prefix;};
  const updateState=value=>{tokenPattern.lastIndex=0;let token;while((token=tokenPattern.exec(value))){if(token[1])state.color='#'+token[1];else{const code=String(token[2]||'').toLowerCase();if(Object.prototype.hasOwnProperty.call(MINECRAFT_COLORS,code))state.color=MINECRAFT_COLORS[code];else if(code==='l')state.bold=true;else if(code==='o')state.italic=true;else if(code==='n')state.underline=true;else if(code==='m')state.strike=true;else if(code==='k')state.obfuscated=true;else if(code==='r'){state.color=null;state.bold=false;state.italic=false;state.underline=false;state.strike=false;state.obfuscated=false;}}}};
  const addText=value=>{if(!value)return;pieces.push(<MinecraftText key={'mc-'+linkIndex++} text={statePrefix()+value} style={inlineStyle}/>);updateState(value);};
  const isBoundary=at=>{let prefix=source.slice(0,at),token;while((token=prefix.match(/§(?:#[0-9a-fA-F]{6}|[0-9a-fk-or])$/i)))prefix=prefix.slice(0,-token[0].length);const previous=prefix.slice(-1);return !previous||!/[A-Za-z0-9_.]/.test(previous);};
  const usernamePattern=/@[A-Za-z][A-Za-z0-9_]{4,31}/g;
  while((match=usernamePattern.exec(source))){if(!isBoundary(match.index))continue;addText(source.slice(cursor,match.index));pieces.push(<TelegramUsername key={'tg-'+match.index} username={match[0]} interactive={interactive} style={inlineStyle}/>);cursor=match.index+match[0].length;}
  addText(source.slice(cursor));
  return <div className={className} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',...style}}>{pieces}</div>;
}

function FaqModal({onClose,text}){
  return <SimpleModal title="ЧиВо" onClose={onClose}>
    <TelegramRichText text={String(text??'')} interactive style={{fontSize:13,lineHeight:1.55,color:'var(--theme-color-text-muted)'}}/>
  </SimpleModal>;
}
function HomeFeatureButtonModal({mode='view',config,onClose,initData,onSaved}){
  const [form,setForm]=useState(()=>({...config}));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const fileRef=useRef(null);
  const inputStyle={width:'100%',boxSizing:'border-box',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)',borderRadius:11,padding: '10px 12px',color:'var(--theme-color-text-primary)',fontSize:13,marginTop: 6};
  function patch(values){setForm(current=>({...current,...values}));}
  async function chooseImage(event){
    const input=event.currentTarget,file=input.files?.[0];
    if(!file){patch({imageData:''});return;}
    try{patch({imageData:await readEventImage(file)});setError('');}
    catch(error){input.value='';setError(safeCaughtError(error,'Не удалось подготовить изображение.'));}
  }
  async function save(){
    try{
      setBusy(true);setError('');
      const response=await fetch(`${API_BASE}/api/home-feature-button`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,...form})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||!data?.config)throw new Error(apiErrorMessage(response,data,'Не удалось сохранить кнопку.'));
      onSaved?.(data.config);onClose?.();
    }catch(error){setError(safeCaughtError(error,'Не удалось сохранить кнопку.'));}
    finally{setBusy(false);}
  }
  if(mode!=='edit')return <SimpleModal title={form.title||'Информация'} onClose={onClose}>
    {form.subtitle&&<div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:650,marginBottom: 10}}>{form.subtitle}</div>}
    <div style={{fontSize:13,color:'var(--theme-color-text-muted)',lineHeight:1.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{form.text||'Информация пока не добавлена.'}</div>
  </SimpleModal>;
  return <SimpleModal title="Настройка кнопки" onClose={onClose}>
    <div style={{fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginBottom: 6}}>Изображение кнопки</div>
    <div style={{display:'flex',alignItems:'center',gap: 12,marginBottom: 12}}>
      <div style={{width:64,height:64,borderRadius:12,overflow:'hidden',border:'1px solid var(--theme-color-border)',background:'var(--theme-color-surface-raised)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{form.imageData?<img src={form.imageData} alt="Изображение кнопки" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<ImagePlus size={22} color="var(--theme-color-text-muted)"/>}</div>
      <div style={{flex:1,minWidth:0}}><input ref={fileRef} type="file" accept="image/*" onChange={chooseImage} style={{width:'100%',fontSize:11.5,color:'var(--theme-color-text-muted)'}}/><div style={{fontSize:10.5,color:'var(--theme-color-text-muted)',marginTop: 4}}>Изображение будет подогнано под квадрат кнопки.</div>{form.imageData&&<button type="button" onClick={()=>{patch({imageData:''});if(fileRef.current)fileRef.current.value=''}} className="press" style={{marginTop: 6,border:'none',background:'transparent',color:'var(--theme-color-status-danger)',fontSize:11.5,padding: 0}}>Удалить изображение</button>}</div>
    </div>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700}}>Заголовок<input value={form.title||''} maxLength={80} onChange={e=>patch({title:e.target.value})} style={inputStyle}/></label>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginTop: 12}}>Подзаголовок<input value={form.subtitle||''} maxLength={140} onChange={e=>patch({subtitle:e.target.value})} style={inputStyle}/></label>
    <label style={{display:'block',fontSize:12,color:'var(--theme-color-text-muted)',fontWeight:700,marginTop: 12}}>Текст<TextAreaField value={form.text||''} maxLength={6000} rows={6} onChange={e=>patch({text:e.target.value})} style={{...inputStyle,resize:'vertical',lineHeight:1.5}}/></label>
    <div style={{marginTop: 8}}><ToggleField label="Скрыть кнопку для пользователей" description="Главный инспектор продолжит видеть кнопку и сможет редактировать её." checked={Boolean(form.hidden)} onChange={hidden=>patch({hidden})}/></div>
    {error&&<div role="alert" style={{fontSize:12,color:'var(--theme-color-status-danger)',marginTop: 8}}>{error}</div>}
    <button onClick={save} disabled={busy} className="press" style={{width:'100%',border:'none',borderRadius:11,padding: '12px',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:750,marginTop: 12}}>{busy?'Сохранение…':'Сохранить'}</button>
  </SimpleModal>;
}
const TRANSPARENT_COLOR = '#D0D0D0';
const TRANSPARENT_RGB = [208,208,208];
function readImageData(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const max=1536;
        const ratio=Math.min(1,max/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*ratio));
        canvas.height=Math.max(1,Math.round(img.height*ratio));
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const image=ctx.getImageData(0,0,canvas.width,canvas.height);
        const d=image.data;
        for(let i=0;i<d.length;i+=4){
          if(d[i]===TRANSPARENT_RGB[0]&&d[i+1]===TRANSPARENT_RGB[1]&&d[i+2]===TRANSPARENT_RGB[2]) d[i+3]=0;
        }
        ctx.putImageData(image,0,0);
        canvas.toBlob(blob=>{
          if(!blob)return reject(new Error('Не удалось подготовить изображение'));
          const fr=new FileReader();
          fr.onload=()=>{const out=String(fr.result||'');if(out.length>600000)return reject(new Error('Изображение слишком большое, выберите файл меньшего размера'));resolve(out)};
          fr.onerror=()=>reject(new Error('Не удалось прочитать подготовленное изображение'));
          fr.readAsDataURL(blob);
        },'image/png');
      };
      img.onerror=()=>reject(new Error('Не удалось прочитать изображение'));
      img.src=r.result;
    };
    r.onerror=()=>reject(new Error('Не удалось прочитать файл'));
    r.readAsDataURL(file)
  })
}

function GemHex(){return <img src={gemIconUrl} alt="" aria-hidden="true" style={{width:18,height:18,objectFit:'contain',display:'inline-block',verticalAlign:'-4px',marginRight: 0}}/>}
function BottomNav({screen,onNavigate}){const items=[{key:'customization',icon:Sparkles,label:'Визуал'},{key:'cities',icon:MapIcon,label:'Территории'},{key:'events',icon:CalendarDays,label:'Ивенты'},{key:'profile',icon:User,label:'Профиль'}];return <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:40,display:'flex',justifyContent:'center'}}><div className="atlas-nav-glow" style={{width:'100%',maxWidth:'var(--theme-content-max-width)',display:'flex',background:'var(--theme-color-navigation-surface)',backdropFilter:'blur(10px)',borderTop:'1px solid var(--theme-color-border)',padding: 'var(--theme-navigation-padding-block-start) var(--theme-navigation-padding-inline) var(--theme-navigation-padding-block-end)'}}>{items.map(it=>{const active=it.key===screen;return <button key={it.key} onClick={()=>onNavigate(it.key)} className={`press${active?' atlas-nav-active':''}`} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'var(--theme-navigation-item-min-height)',gap: 'var(--theme-navigation-item-gap)',color:active?'var(--theme-color-action-primary)':'var(--theme-color-text-muted)',background:'none',border:'none'}}><it.icon size="var(--theme-navigation-icon-size)" strokeWidth={active?2.4:2}/><span style={{fontSize:'var(--theme-navigation-label-size)',fontWeight:active?700:500}}>{it.label}</span></button>})}</div></div>}

// Root
// ---------------------------------------------------------------------------
export default function CityRatingApp() {
  const tgUser = getTelegramUser();

  const [screen, setScreen] = useState('cities');
  const [mainTab, setMainTab] = useState('map');
  const [selectedId, setSelectedId] = useState(null);
  const [returnToEvents, setReturnToEvents] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [showAddTerritory, setShowAddTerritory] = useState(false);
  const [homeToast, setHomeToast] = useState(null);
  const [globalToast,setGlobalToast]=useState(null);
  const globalToastSequenceRef=useRef(0);
  const showGlobalToast=(message,type='success')=>setGlobalToast({id:++globalToastSequenceRef.current,message,type});
  const [voxView, setVoxView] = useState(null);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqText, setFaqText] = useState('');
  const faqRequestRef = useRef(false);
  const [homeFeatureButton,setHomeFeatureButton]=useState({imageData:'',title:'Информация',subtitle:'',text:'',hidden:false});
  const [homeFeatureButtonReady,setHomeFeatureButtonReady]=useState(false);
  const [homeFeatureOpen,setHomeFeatureOpen]=useState(false);
  const [globalSettingsOpen,setGlobalSettingsOpen]=useState(false);

  const { worldMapImage, worldMapSource, worldMapLoading, worldMapError, loadWorldMap, retryWorldMap, onMapSaved } = useWorldMap({ safeCaughtError });
  const { territories, territoriesLoading, territoriesHasLoaded, territoriesError, markersReady, loadTerritories, resetForTelegramIdentity } = useTerritories({
    ui: { apiErrorMessage, safeCaughtError, finiteCoordinate },
  });
  const {
    role, profile, profileLoadState, profileLoadError, refreshProfile, claimNickname,
  } = useTelegramProfile({
    initialTelegramId: tgUser?.id,
    onTelegramIdentityChanged: resetForTelegramIdentity,
    ui: { apiErrorMessage, safeCaughtError, parseApiResponse },
  });

  const selected = territories.find((t) => String(t.id) === String(selectedId));


  useEffect(() => {
    refreshProfile();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshProfile(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refreshProfile, 60000);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const {
    activeTheme, mapZoomPercent, mapZoomReady, timezoneOffset, timezoneReady, timezoneLoadError,
    applyUserSettings, retryUserSettings,
  } = useUserSettings({
    setVoxView,
    ui: { apiErrorMessage },
  });


  async function openFaq(){
    if(faqRequestRef.current)return;
    faqRequestRef.current=true;
    try{
      const res=await fetch(`${API_BASE}/api/faq?_=${Date.now()}`,{cache:'no-store'});
      const data=await res.json().catch(()=>null);
      if(!res.ok||!data?.ok||typeof data.text!=='string')throw new Error(apiErrorMessage(res,data,'Не удалось загрузить ЧиВо.'));
      // Mount the modal only after the canonical server text is ready.
      setFaqText(data.text);
      setFaqOpen(true);
    }catch(error){
      console.error('Load FAQ error:',error);
      setHomeToast(safeCaughtError(error,'Не удалось загрузить ЧиВо. Нажмите кнопку ещё раз.'));
      setTimeout(()=>setHomeToast(null),3500);
    }finally{faqRequestRef.current=false;}
  }

  useEffect(()=>{
    let cancelled=false;
    const initData=window.Telegram?.WebApp?.initData||'';
    if(!initData)return()=>{cancelled=true};
    fetch(`${API_BASE}/api/home-feature-button`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'})
      .then(async response=>{const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok||!data?.config)throw new Error('Home feature button load failed');if(!cancelled)setHomeFeatureButton(data.config);})
      .catch(error=>{console.warn('Voxygen home feature button load failed',error);if(!cancelled)setHomeFeatureButton(current=>({...current,hidden:true}));})
      .finally(()=>{if(!cancelled)setHomeFeatureButtonReady(true)});
    return()=>{cancelled=true};
  },[]);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    try {
      webApp.ready?.();
      if (typeof webApp.disableVerticalSwipes === 'function') {
        webApp.disableVerticalSwipes();
      }
    } catch (e) {
      console.warn('Telegram vertical swipe control unavailable:', e);
    }
    return () => {
      try {
        if (typeof webApp.enableVerticalSwipes === 'function') {
          webApp.enableVerticalSwipes();
        }
      } catch (e) {}
    };
  }, []);

  useEffect(() => {
    if (screen === 'cities' && !selectedId) loadTerritories();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && screen === 'cities' && !selectedId) loadTerritories();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && screen === 'cities' && !selectedId) loadTerritories();
    }, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [screen, selectedId, loadTerritories]);

  useEffect(() => { if (screen === 'cities' && mainTab === 'map') loadWorldMap(); }, [screen, mainTab, loadWorldMap]);

  function navigate(key) {
    setScreen(key);
    setReturnToEvents(false);
    setSelectedId(null);
    if (key === 'cities') setMainTab('map');
  }

  function changeMainTab(tab) {
    setScreen('cities');
    setMainTab(tab);
    setSelectedId(null);
  }


  async function submitTerritoryRequest(data) {
    setShowAddTerritory(false);
    try {
      const tg = window.Telegram?.WebApp;
      const initData = tg?.initData || '';
      if (!tg) throw new Error('Откройте приложение через Telegram.');
      if (!initData) throw new Error('Сессия Telegram не найдена. Откройте Voxygen заново из Telegram.');

      const response = await fetch(`${API_BASE}/api/territories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, initData }),
      });
      const result = await parseApiResponse(response, 'Не удалось отправить заявку на территорию.');
      setHomeToast(result?.status === 'approved' ? 'Город добавлен без подтверждения' : 'Заявка отправлена инспектору на подтверждение');
      if (result?.status === 'approved') loadTerritories();
    } catch (error) {
      console.warn('Voxygen territory submit failed', { code: 'TERRITORY_SUBMIT_FAILED' });
      setHomeToast(`Ошибка: ${safeCaughtError(error, 'Не удалось отправить заявку.')}`);
    }
    setTimeout(() => setHomeToast(null), 5000);
  }

  return (
    <div className="atlas-root" data-theme={activeTheme} style={{ width: '100%' }}>
      <FontsAndTheme />
      <div style={{ maxWidth: 'var(--theme-content-max-width)', margin: '0 auto', position: 'relative' }}>
        <div className="atlas-screen-transition" key={`${screen}-${selected?.id || 'none'}`}>
        {screen === 'profile' ? (
          <ProfileScreen profile={profile} profileLoadState={profileLoadState} profileLoadError={profileLoadError} claimNickname={claimNickname} role={role} tgUser={tgUser} refreshProfile={refreshProfile} territories={territories} onTerritoriesChanged={loadTerritories} onMapSaved={onMapSaved} onFaqSaved={setFaqText} onSettingsSaved={settings=>{applyUserSettings(settings,{markTimezoneReady:true,clearTimezoneError:true});retryUserSettings();}} onOpenGlobalSettings={()=>setGlobalSettingsOpen(true)} onToast={showGlobalToast} />
        ) : screen === 'customization' ? (
          <CustomizationScreen initData={window.Telegram?.WebApp?.initData || ''} tgUser={tgUser} role={role} territories={territories} profile={profile} onToast={showGlobalToast} ui={{apiErrorMessage,safeCaughtError,useAnimatedClose,IconButton,Field,readImageData,GemHex,MinecraftText}} />
        ) : screen === 'events' ? (
          <EventsScreen ui={EVENT_UI} initData={window.Telegram?.WebApp?.initData || ''} territories={territories} tgUser={tgUser} isMainInspector={role==='main_inspector'} expandedEventId={expandedEventId} setExpandedEventId={setExpandedEventId} timezoneOffset={timezoneOffset} timezoneReady={timezoneReady} timezoneLoadError={timezoneLoadError} onRetryTimezone={retryUserSettings} onSelectTerritory={id=>{setReturnToEvents(true);setScreen('cities');setMainTab('map');setSelectedId(id)}} />
        ) : selected ? (
          <TerritoryDetail
            base={selected}
            onBack={() => { setSelectedId(null); if(returnToEvents){setScreen('events');setReturnToEvents(false);} }}
            profile={profile}
            onGoToProfile={() => navigate('profile')}
            tgUser={tgUser}
            role={role}
            mapImage={worldMapImage}
            loadError={territoriesError}
            onRetry={loadTerritories}
            onToast={showGlobalToast}
            ui={{
              apiErrorMessage, safeCaughtError, getBannerGradient, formatTerritoryCoords, formatTerritoryAwardDate,
              MinecraftText, TelegramMinecraftText, ScoreBadge, SimpleModal, AvatarHead, Lightbox,
              DonationModal, FixedToast, SectionTitle, ShotThumb, Slider, Field, iconBtn,
            }}
          />
        ) : (
          <>
            <div style={{ padding: '18px 15px 10px', display: 'flex', flexWrap:'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, rowGap: 8 }}>
              <div>
                <div className="atlas-display" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Multi-Punk</div>
                <div style={{ fontSize: 13, color: 'var(--theme-color-text-muted)', marginTop: 2 }}>{territories.length} {pluralizeTerritories(territories.length)}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap: 6,flexShrink:0,marginTop: 2,marginLeft: 'auto'}}>{homeFeatureButtonReady&&(role==='main_inspector'||!homeFeatureButton.hidden)&&<button type="button" onClick={()=>setHomeFeatureOpen(true)} className="press" aria-label="Информация от главного инспектора" title={homeFeatureButton.title||'Информация'} style={{width:36,height:36,padding: 0,overflow:'hidden',border:'1px solid var(--theme-color-border)',borderRadius:'50%',background:'var(--theme-color-surface)',color:'var(--theme-color-action-primary)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{homeFeatureButton.imageData?<img src={homeFeatureButton.imageData} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<ImagePlus size={17}/>}</button>}<button onClick={openFaq} className="press" style={{height:36,boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',padding: '0 12px',borderRadius:999,border:'1px solid var(--theme-color-border)',background:'var(--theme-color-surface)',color:'var(--theme-color-text-primary)',fontWeight:700,fontSize:13}}>ЧиВо</button>{(profile.status==='verified'||role==='main_inspector') && <button onClick={()=>setShowAddTerritory(true)} className="press" style={{height:36,boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'0 12px',borderRadius:999,border:'none',background:'var(--theme-color-action-primary)',color:'var(--theme-color-action-primary-contrast)',fontWeight:700,fontSize:13}}><Plus size={15}/> Добавить</button>}</div>
            </div>

            <MainTabs tab={mainTab} onChange={changeMainTab} />

            {territoriesError && (
                  <div role="status" style={{ margin: '0 15px 10px', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--theme-color-border)', background: 'var(--theme-color-surface-raised)', color: 'var(--theme-color-text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{flex:1}}>{String(territoriesError).startsWith('Часть данных')?territoriesError:`Не удалось обновить территории. Показаны последние успешно загруженные данные. ${territoriesError}`}</span>
                    <button onClick={loadTerritories} className="press" style={{padding: '6px 8px',borderRadius:9,border:'1px solid var(--theme-color-border)',background:'var(--theme-color-surface)',color:'var(--theme-color-text-primary)',fontWeight:700,flexShrink:0}}>Повторить</button>
                  </div>
                )}
                {mainTab === 'recruit' ? (
                  <RecruitmentScreen territories={territories} onSelect={setSelectedId} />
                ) : (
                  <HomeScreen
                    territories={territories}
                    onSelect={setSelectedId}
                    mode={mainTab === 'rating' ? 'list' : 'map'}
                    mapImage={worldMapImage}
                    mapSource={worldMapSource}
                    mapLoading={worldMapLoading}
                    mapError={worldMapError}
                    onRetryMap={retryWorldMap}
                    voxView={voxView}
                    onVoxViewChange={setVoxView}
                    markersReady={markersReady}
                    mapZoomPercent={mapZoomPercent}
                    mapZoomReady={mapZoomReady}
                  />
                )}
          </>
        )}
        </div>
        <BottomNav screen={screen} onNavigate={navigate} />
        {globalSettingsOpen&&role==='main_inspector'&&<GlobalSettingsPanel timezoneOffset={timezoneOffset} initData={window.Telegram?.WebApp?.initData||''} onSettingsChanged={applyUserSettings} onClose={()=>setGlobalSettingsOpen(false)} ui={{apiErrorMessage,safeCaughtError,useAnimatedClose,IconButton,SelectField,Slider,TextAreaField}}/>}

        {showAddTerritory && (
          <AddTerritoryModal onClose={() => setShowAddTerritory(false)} onSubmit={submitTerritoryRequest} isMainInspector={role==='main_inspector'} />
        )}
        {faqOpen && <FaqModal text={faqText} onClose={()=>setFaqOpen(false)} />}
        {homeFeatureOpen&&<HomeFeatureButtonModal mode={role==='main_inspector'?'edit':'view'} config={homeFeatureButton} initData={window.Telegram?.WebApp?.initData||''} onClose={()=>setHomeFeatureOpen(false)} onSaved={setHomeFeatureButton}/>}

        {homeToast && <FixedToast key={homeToast} message={homeToast}/>}
        {globalToast && <FixedToast key={globalToast.id} message={globalToast.message} type={globalToast.type}/>}
      </div>
    </div>
  );
}
