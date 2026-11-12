// Voxygen-Version: v48
import React, { useEffect, useState, useRef } from 'react';
import { WORLD_MAP_GEOMETRY, worldCoordinateToPercent, coordinateGeometryMatchesManifest, MAP_ZOOM_MAX_SCALE, mapZoomPercentToScale, normalizeMapZoomPercent } from '../shared/world-map-coordinates.js';
import {
  Map as MapIcon, List as ListIcon, Users, MessageCircle, ThumbsUp, ThumbsDown,
  Flag, X, ChevronLeft, ChevronRight, Camera, Check, Plus, Star, Heart,
  User, Send, Sparkles, UserPlus, Trash2, Pencil, ShieldCheck, Clock, ChevronUp, ChevronDown, CalendarDays, Bell, MapPin, ExternalLink, Eye, EyeOff, ImagePlus, Settings
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Canonical Voxygen baseline v2. Restore previously fixed UX/backend regressions without changing unrelated behavior.
// Production data starts empty — territories are added through the
// "Добавить" flow below and confirmed by the inspector once the backend
// (bot + database) exists. Nothing here is demo/mock content.
// ---------------------------------------------------------------------------
const TERRITORIES = [];

// Fill this in once the voxygen-bot Worker is deployed, e.g.
// "https://voxygen-bot.your-subdomain.workers.dev"
const API_BASE = 'https://voxygen.counterboard.workers.dev';
const MAP_ASSETS_BASE = 'https://voxygen-map-assets.counterboard.workers.dev';

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

function timezoneOffsetToMinutes(value) {
  const normalized = normalizeTimezoneOffset(value || 'UTC+3');
  const match = normalized.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return 180;
  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === '-' ? -minutes : minutes;
}
function eventDateLabel(value, timezoneOffset = 'UTC+3') {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return 'Дата не указана';
  const date = new Date(timestamp + timezoneOffsetToMinutes(timezoneOffset) * 60000);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';
  // The preference is a fixed UTC offset, not an IANA region. Shift the UTC
  // timestamp explicitly so the chosen offset is applied consistently everywhere.
  return date.toLocaleString('ru-RU', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
}
function localDateTimeInput(value) {
  const d = new Date(Number(value));
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function readEventImage(file) {
  if (!file) return null;
  if (!String(file.type || '').startsWith('image/')) throw new Error('Выберите файл изображения.');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1200 / img.width, 900 / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Не удалось обработать изображение.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => reject(new Error('Файл не удалось открыть как изображение.'));
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
  if (dataUrl.length > 1_400_000) throw new Error('Изображение слишком большое. Выберите изображение меньшего размера.');
  return dataUrl;
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


// Pixel-center mapping keeps X=0/Z=0 on the exact center pixel of the 6001x6001 map.
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
function pluralizeRatings(n) { const value=Math.abs(Math.trunc(Number(n)||0)); const lastTwo=value%100,last=value%10; if(lastTwo>=11&&lastTwo<=14)return 'оценок'; if(last===1)return 'оценка'; if(last>=2&&last<=4)return 'оценки'; return 'оценок'; }


// Each criterion is scored 1–5 by the rater. Each point contributes 0.5 to
// the territory's overall score, so one person's rating totals 4×0.5=2 (all
// 1s) to 4×0.5×5=10 (all 5s). That total is intentionally never shown to the
// rater while rating — only the aggregate community score (computed
// server-side across everyone's ratings) is ever displayed publicly.
const CRITERIA = [
  { key: 'integrity', label: 'Целостность' },
  { key: 'comfort', label: 'Комфортность' },
  { key: 'atmosphere', label: 'Атмосферность' },
  { key: 'detail', label: 'Детализированность' },
];

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
      <style>{`
        :root{
          /* Voxygen visual system: dark neutral foundation + Mint + Purple + cyan GEM semantics */
          --bg:#0A0B10;
          --surface:#12151D;
          --surface-2:#171B24;
          --surface-3:#1D2230;

          --text:#F7F8FC;
          --text-secondary:#B5BBCB;
          --text-muted:#7F879A;
          --text-dim:#636B7E;

          --purple:#8B5CF6;
          --purple-soft:rgba(139,92,246,.14);
          --purple-strong:rgba(139,92,246,.30);
          --purple-border:rgba(139,92,246,.28);

          --mint:#41FFA7;
          --mint-soft:rgba(65,255,167,.11);
          --mint-strong:rgba(65,255,167,.28);

          /* Kept deliberately blue because gem balances already use it. */
          --gem:#38BDF8;

          /* Semantic states stay inside the Voxygen palette. */
          --gold:var(--mint);
          --gold-soft:var(--mint-soft);
          --emerald:var(--mint);
          --red:#FF5D73;
          --red-soft:rgba(255,93,115,.12);
          --red-border:rgba(255,93,115,.28);

          --border:rgba(181,187,203,.12);
          --shadow-sm:0 8px 22px rgba(0,0,0,.18);
          --shadow-md:0 16px 42px rgba(0,0,0,.28);
          --shadow-lg:0 26px 70px rgba(0,0,0,.38);
          --glow-purple:0 14px 34px rgba(139,92,246,.17);
          --glow-mint:0 14px 34px rgba(65,255,167,.12);
          --ease-standard:cubic-bezier(.22,.72,.22,1);
          --ease-interactive:cubic-bezier(.2,.85,.25,1);
          --motion-tap:160ms;
          --motion-standard:190ms;
          --motion-modal:245ms;

          --radius-md:16px;
          --radius-lg:20px;
        }

        .atlas-root[data-theme="aurora"]{
          --purple:#5FA8FF;
          --purple-soft:rgba(95,168,255,.15);
          --purple-strong:rgba(95,168,255,.32);
          --purple-border:rgba(95,168,255,.30);
          --mint:#65E6D2;
          --mint-soft:rgba(101,230,210,.12);
          --mint-strong:rgba(101,230,210,.30);
          --gold:var(--mint);
          --emerald:var(--mint);
          --glow-purple:0 14px 34px rgba(95,168,255,.17);
          --glow-mint:0 14px 34px rgba(101,230,210,.12);
        }
        *{ box-sizing:border-box; }
        html,body,#root{ min-height:100%; }
        body{
          margin:0;
          background:var(--bg);
          color:var(--text);
          font-family:'Inter',ui-sans-serif,system-ui,sans-serif;
          -webkit-font-smoothing:antialiased;
          text-rendering:optimizeLegibility;
        }

        .atlas-root{
          min-height:100vh;
          font-family:'Inter',ui-sans-serif,system-ui,sans-serif;
          background:
            radial-gradient(620px 360px at 100% -8%, rgba(139,92,246,.075), transparent 68%),
            radial-gradient(520px 320px at -10% 40%, rgba(65,255,167,.045), transparent 72%),
            linear-gradient(180deg,#0B0C11 0%,#090A0F 100%);
          color:var(--text);
        }

        /* Typography: one display face and one reading face, with clear hierarchy. */
        .atlas-root h1,.atlas-root h2,.atlas-root h3,
        .atlas-root .atlas-display{
          font-family:'Manrope',ui-sans-serif,system-ui,sans-serif!important;
          color:var(--text);
        }
        .atlas-display{ letter-spacing:-.028em; }
        .atlas-root h1{
          font-size:30px;
          line-height:1.08;
          letter-spacing:-.035em;
          font-weight:800;
          margin:0 0 20px;
        }
        .atlas-root h2{
          font-size:24px;
          line-height:1.14;
          letter-spacing:-.028em;
          font-weight:750;
          margin:0 0 16px;
        }
        .atlas-root h3{
          font-size:18px;
          line-height:1.2;
          letter-spacing:-.018em;
          font-weight:700;
          margin:0 0 10px;
        }
        .atlas-root p{
          margin:0 0 14px;
          font-size:15px;
          line-height:1.55;
          color:var(--text-secondary);
        }
        .atlas-root small{
          font-size:12px;
          line-height:1.45;
        }
        .atlas-root button,
        .atlas-root input,
        .atlas-root textarea,
        .atlas-root select{
          font-family:'Inter',ui-sans-serif,system-ui,sans-serif;
        }
        .atlas-root button{
          font-weight:650;
          line-height:1.2;
          text-align:center;
          vertical-align:middle;
          letter-spacing:-.01em;
        }
        .atlas-root input,.atlas-root textarea{
          line-height:1.45;
          font-size:14px;
        }
        .atlas-root label{
          font-size:12px;
          line-height:1.35;
          color:var(--text-muted);
          font-weight:600;
        }
        .atlas-root span{ line-height:1.35; }

        .atlas-scroll::-webkit-scrollbar{ display:none; }
        .atlas-scroll{ -ms-overflow-style:none; scrollbar-width:none; }
        input::placeholder,textarea::placeholder{ color:var(--text-dim); }
        input:focus,textarea:focus,select:focus{
          outline:none;
          border-color:rgba(65,255,167,.46)!important;
          box-shadow:0 0 0 3px rgba(65,255,167,.08), 0 6px 24px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.025);
        }

        .atlas-root input[type="range"].slider-gold,
        .atlas-root input[type="range"].slider-inspector,
        .atlas-root input[type="range"].slider-player{
          -webkit-appearance:none;
          appearance:none;
          width:100%;
          height:20px;
          margin:0;
          padding:0;
          background:transparent;
          color-scheme:dark;
          cursor:pointer;
        }
        .atlas-root input[type="range"].slider-gold::-webkit-slider-runnable-track,
        .atlas-root input[type="range"].slider-inspector::-webkit-slider-runnable-track,
        .atlas-root input[type="range"].slider-player::-webkit-slider-runnable-track{
          height:4px;
          border-radius:999px;
          background:linear-gradient(to right,var(--slider-fill) 0 var(--slider-progress),var(--surface-3) var(--slider-progress) 100%);
          border:0;
        }
        .atlas-root input[type="range"].slider-gold::-webkit-slider-thumb,
        .atlas-root input[type="range"].slider-inspector::-webkit-slider-thumb,
        .atlas-root input[type="range"].slider-player::-webkit-slider-thumb{
          -webkit-appearance:none;
          appearance:none;
          width:18px;
          height:18px;
          margin-top:-7px;
          border-radius:50%;
          border:2px solid #0A0B10;
          background:var(--slider-fill);
          box-shadow:0 1px 4px rgba(0,0,0,.35);
        }
        .atlas-root input[type="range"].slider-gold::-moz-range-track,
        .atlas-root input[type="range"].slider-inspector::-moz-range-track,
        .atlas-root input[type="range"].slider-player::-moz-range-track{
          height:4px;
          border-radius:999px;
          background:var(--surface-3);
          border:0;
        }
        .atlas-root input[type="range"].slider-gold::-moz-range-progress,
        .atlas-root input[type="range"].slider-inspector::-moz-range-progress,
        .atlas-root input[type="range"].slider-player::-moz-range-progress{
          height:4px;
          border-radius:999px;
          background:var(--slider-fill);
        }
        .atlas-root input[type="range"].slider-gold::-moz-range-thumb,
        .atlas-root input[type="range"].slider-inspector::-moz-range-thumb,
        .atlas-root input[type="range"].slider-player::-moz-range-thumb{
          width:18px;
          height:18px;
          border-radius:50%;
          border:2px solid #0A0B10;
          background:var(--slider-fill);
          box-shadow:0 1px 4px rgba(0,0,0,.35);
        }
        .atlas-root input[type="range"].slider-gold,
        .atlas-root input[type="range"].slider-inspector{ --slider-fill:var(--mint); }
        .atlas-root input[type="range"].slider-player{ --slider-fill:var(--purple); }

        .atlas-fixed-toast{
          position:fixed;
          left:50%;
          bottom:calc(76px + env(safe-area-inset-bottom));
          transform:translateX(-50%);
          width:max-content;
          max-width:min(calc(100vw - 32px),420px);
          box-sizing:border-box;
          padding:11px 16px;
          border-radius:999px;
          border:1px solid rgba(65,255,167,.38);
          background:var(--mint-soft);
          color:var(--mint);
          box-shadow:0 10px 26px rgba(0,0,0,.20),0 0 0 1px rgba(65,255,167,.06);
          font-size:12.5px;
          font-weight:700;
          line-height:1.3;
          text-align:center;
          white-space:normal;
          pointer-events:none;
          z-index:1200;
          animation:atlas-toast-in .32s cubic-bezier(.2,.9,.25,1) both, atlas-toast-glow .70s ease-out both;
        }
        @keyframes atlas-toast-in{
          0%{opacity:0;transform:translate(-50%,22px) scale(.91)}
          68%{opacity:1;transform:translate(-50%,-3px) scale(1.025)}
          84%{transform:translate(-50%,1px) scale(.995)}
          100%{opacity:1;transform:translate(-50%,0) scale(1)}
        }
        @keyframes atlas-toast-glow{
          0%,38%{box-shadow:0 0 0 1px rgba(65,255,167,.14),0 0 0 5px rgba(65,255,167,.045),0 10px 26px rgba(0,0,0,.20)}
          100%{box-shadow:0 10px 26px rgba(0,0,0,.20),0 0 0 1px rgba(65,255,167,.06)}
        }

        .atlas-root .event-reminder-unit-switch{border-radius:10px!important;overflow:hidden;box-shadow:none!important;}
        .atlas-root .event-reminder-unit-switch .event-reminder-unit-option{border-radius:7px!important;box-shadow:none!important;}

        .press{
          transition:
            transform var(--motion-tap) var(--ease-interactive),
            box-shadow var(--motion-standard) var(--ease-standard),
            background-color var(--motion-standard) ease,
            border-color var(--motion-standard) ease,
            color var(--motion-standard) ease,
            opacity var(--motion-standard) ease,
            filter var(--motion-standard) ease;
          -webkit-tap-highlight-color:transparent;
          transform-origin:center;
        }
        .press:focus-visible{outline:2px solid var(--purple);outline-offset:3px;box-shadow:0 0 0 4px rgba(139,92,246,.13);}
        .press:disabled{cursor:not-allowed;}
        @media (hover:hover) and (pointer:fine){
          .press:not(:disabled):hover{transform:translateY(-1px);filter:brightness(1.035);}
          button[style*="background: var(--purple)"].press:not(:disabled):hover,
          button[style*="background:var(--purple)"].press:not(:disabled):hover{box-shadow:var(--glow-purple),0 0 0 1px rgba(139,92,246,.12);}
          button[style*="background: var(--gold)"].press:not(:disabled):hover,
          button[style*="background:var(--gold)"].press:not(:disabled):hover{box-shadow:var(--glow-mint),0 0 0 1px rgba(65,255,167,.10);}
        }
        .press:not(:disabled):active{transform:translateY(1px) scale(.975);filter:brightness(.985);transition-duration:80ms;}
        .atlas-root input,.atlas-root textarea,.atlas-root select{
          transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease;
        }
        button.event-publish-button:disabled{opacity:1;filter:none;background:var(--purple);color:#fff}
        button:disabled{ opacity:.45; filter:saturate(.65); cursor:not-allowed; transform:none!important; }

        /* Surfaces: neutral, calm, with restrained depth rather than a blue wash. */
        div[style*="background: var(--surface)"]{
          background:#12151D!important;
          box-shadow:var(--shadow-md),inset 0 1px 0 rgba(255,255,255,.018);
          border-radius:var(--radius-lg)!important;
        }
        div[style*="background: var(--surface-2)"]{
          background:#171B24!important;
          box-shadow:var(--shadow-sm),inset 0 1px 0 rgba(255,255,255,.02);
          border-radius:var(--radius-md)!important;
        }
        .atlas-root [style*="background: var(--surface)"],
        .atlas-root [style*="background: var(--surface-2)"],
        .atlas-root [style*="background:var(--surface)"],
        .atlas-root [style*="background:var(--surface-2)"]{
          border-color:var(--border)!important;
        }

        /* Primary controls */
        button[style*="background: var(--purple)"],
        button[style*="background:var(--purple)"],
        button[style*="background: 'var(--purple)'"]{
          background:var(--purple)!important;
          color:#FFFFFF!important;
          border:1px solid rgba(255,255,255,.055)!important;
          box-shadow:var(--glow-purple)!important;
        }
        button[style*="background: var(--gold)"],
        button[style*="background:var(--gold)"],
        button[style*="background: 'var(--gold)'"]{
          background:var(--mint)!important;
          color:#06120D!important;
          border:1px solid rgba(255,255,255,.06)!important;
          box-shadow:var(--glow-mint)!important;
        }
        button[style*="background: var(--emerald)"],
        button[style*="background:var(--emerald)"],
        button[style*="background: 'var(--emerald)'"]{
          background:var(--mint)!important;
          color:#06120D!important;
          border:1px solid rgba(255,255,255,.06)!important;
          box-shadow:var(--glow-mint)!important;
        }

        /* Cyan is reserved for gems; do not recolor semantic/content colors globally. */
        .atlas-root [style*="#38BDF8"]{ color:var(--gem)!important; }

        /* Segmented controls and chips */
        [style*="border-radius: 999"],[style*="borderRadius: 999"]{
          -webkit-tap-highlight-color:transparent;
        }
        .atlas-root [style*="background: var(--surface-3)"]{
          background:#1D2230!important;
        }

        /* Navigation and sticky controls */
        .atlas-nav-glow{
          box-shadow:0 -16px 42px rgba(0,0,0,.30),inset 0 1px 0 rgba(255,255,255,.035);
          backdrop-filter:blur(18px) saturate(1.05);
          -webkit-backdrop-filter:blur(18px) saturate(1.05);
        }

        :root{ color-scheme:dark; }
        html{ scroll-behavior:smooth; }
        button,input,textarea,select{ -webkit-tap-highlight-color:transparent; }
        .atlas-root{ isolation:isolate; }
        .atlas-root > div{ width:min(100%,448px); }

        .atlas-root .atlas-display{ font-weight:700; }
        .atlas-root .atlas-display strong{ font-weight:800; }

        /* Keep the main screen wrapper opacity-only: transforms here would change
           the containing block of fixed map/dialog controls on mobile. */
        @keyframes atlas-screen-in{from{opacity:0}to{opacity:1}}
        @keyframes atlas-page-title-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes atlas-surface-in{from{opacity:0;transform:translateY(7px) scale(.995)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes atlas-overlay-in{from{opacity:0}to{opacity:1}}
        @keyframes atlas-overlay-out{from{opacity:1}to{opacity:0}}
        @keyframes atlas-viewer-content-in{from{opacity:0}to{opacity:1}}
        @keyframes atlas-modal-in{from{opacity:0;transform:translateY(-16px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes atlas-modal-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-8px) scale(.99)}}
        @keyframes atlas-sheet-in{from{opacity:0;transform:translateY(22px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes atlas-soft-pop{0%{transform:scale(.965) translateY(4px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}
        @keyframes atlas-card-reveal{0%{opacity:0;transform:translateY(-10px) scale(.99)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes atlas-card-sheen{0%{transform:translateX(-130%);opacity:0}18%{opacity:.6}100%{transform:translateX(130%);opacity:0}}
        @keyframes atlas-score-arrive{0%{opacity:0;transform:translateY(5px) scale(.94)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes atlas-review-arrive{0%{opacity:0;transform:translateY(7px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes atlas-shot-arrive{0%{opacity:0;transform:translateY(6px) scale(.97)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes atlas-cover-arrive{from{transform:scale(1.025);opacity:.75}to{transform:scale(1);opacity:1}}
        @keyframes atlas-nav-pop{0%{transform:scale(.90)}55%{transform:scale(1.08)}100%{transform:scale(1)}}
        @keyframes atlas-toast-in{from{opacity:0;transform:translate(-50%,12px) scale(.97)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
        @keyframes atlas-toast-out{from{opacity:1;transform:translate(-50%,0) scale(1)}to{opacity:0;transform:translate(-50%,6px) scale(.99)}}
        @keyframes atlas-success-halo{0%{box-shadow:0 0 0 0 rgba(65,255,167,.20)}100%{box-shadow:0 0 0 8px rgba(65,255,167,0)}}
        .atlas-screen-transition{animation:atlas-screen-in .20s ease-out both;}
        .atlas-page{animation:atlas-screen-in .20s ease-out both;}
        .atlas-page-title{animation:atlas-page-title-in .24s var(--ease-standard) both;}
        .atlas-page-panel{animation:atlas-surface-in .24s var(--ease-standard) both;}
        .atlas-overlay{animation:atlas-overlay-in .20s ease-out both;background-color:rgba(0,0,0,.78);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}
        .atlas-overlay.atlas-closing{animation:atlas-overlay-out .17s ease-in both;pointer-events:none;}
        .atlas-lightbox-content{animation:atlas-viewer-content-in .22s ease-out both;}
        .atlas-modal-shell{animation:atlas-modal-in var(--motion-modal) var(--ease-standard) both;isolation:isolate;box-shadow:var(--shadow-lg),0 0 0 1px rgba(255,255,255,.035),0 24px 54px rgba(0,0,0,.32);transform-origin:top center;}
        .atlas-modal-shell.atlas-closing{animation:atlas-modal-out .17s ease-in both;pointer-events:none;}
        .atlas-bottom-sheet{transform-origin:bottom center;animation:atlas-sheet-in var(--motion-modal) var(--ease-standard) both;}
        .atlas-pop{animation:atlas-soft-pop .22s cubic-bezier(.2,.75,.25,1) both;}
        .atlas-recruitment-card,.atlas-item-reveal,.atlas-visual-card-reveal,.atlas-list-card{animation:atlas-card-reveal .25s cubic-bezier(.22,.72,.22,1) backwards;}
        .atlas-list-card{transition:border-color var(--motion-standard) ease,box-shadow var(--motion-standard) ease;}
        .atlas-recruitment-card{position:relative;isolation:isolate;overflow:hidden;}
        .atlas-recruitment-card::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;border-radius:inherit;background:linear-gradient(108deg,transparent 0%,rgba(255,255,255,.012) 38%,rgba(255,255,255,.055) 50%,transparent 66%);transform:translateX(-130%);animation:atlas-card-sheen .48s .04s ease-out both;}
        .atlas-score-badge{transform-origin:center;animation:atlas-score-arrive .22s cubic-bezier(.22,.72,.22,1) backwards;}
        .atlas-recruitment-score{transition:transform .18s ease,box-shadow .18s ease;}
        .atlas-review-card{position:relative;overflow:hidden;animation:atlas-review-arrive .22s ease-out backwards;transition:border-color var(--motion-standard) ease,box-shadow var(--motion-standard) ease;}
        .atlas-shot-reveal{animation:atlas-shot-arrive .23s ease-out backwards;}
        .atlas-shot-thumb{transition:transform var(--motion-standard) var(--ease-standard),border-color var(--motion-standard) ease,box-shadow var(--motion-standard) ease;}
        .atlas-account-switcher{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;text-align:left;color:var(--text);box-shadow:var(--shadow-sm),inset 0 1px 0 rgba(255,255,255,.025);}
        .atlas-account-switcher--static{opacity:1!important;filter:none!important;cursor:default;}
        .atlas-account-switcher--static .atlas-account-balance{color:var(--gem);text-shadow:0 0 18px rgba(56,189,248,.13);}
        .atlas-account-switcher--interactive{cursor:pointer;}
        @media (hover:hover) and (pointer:fine){
          .atlas-recruitment-card:hover .atlas-recruitment-score{transform:translateY(-1px) scale(1.025);}
          .atlas-recruitment-card:hover .atlas-recruitment-score--inspector{box-shadow:0 5px 12px rgba(65,255,167,.12);}
          .atlas-recruitment-card:hover .atlas-recruitment-score--community{box-shadow:0 5px 12px rgba(139,92,246,.14);}
          .atlas-account-switcher--interactive:hover{border-color:rgba(139,92,246,.34);box-shadow:var(--shadow-md),0 0 22px rgba(139,92,246,.085);}
          .atlas-review-card:hover{border-color:rgba(181,187,203,.24);box-shadow:0 10px 26px rgba(0,0,0,.18);}
          .atlas-list-card:hover{border-color:rgba(139,92,246,.28)!important;box-shadow:0 10px 24px rgba(0,0,0,.20),0 0 18px rgba(139,92,246,.055);}
          .atlas-shot-thumb:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.30)!important;box-shadow:0 8px 20px rgba(0,0,0,.24);}
          .atlas-inventory-item:hover{transform:translateY(-2px);border-color:rgba(139,92,246,.32)!important;box-shadow:0 8px 18px rgba(0,0,0,.20);}
          .atlas-map-marker img{transition:transform var(--motion-standard) var(--ease-standard),filter var(--motion-standard) ease;}
          .atlas-map-marker:hover img{transform:scale(1.045);filter:drop-shadow(0 4px 9px rgba(0,0,0,.48));}
          .atlas-visual-card:hover{border-color:rgba(181,187,203,.24)!important;transform:translateY(-2px);}
          .atlas-visual-card[data-visual-color="red"]:hover{box-shadow:0 9px 24px rgba(239,68,68,.13);}
          .atlas-visual-card[data-visual-color="orange"]:hover{box-shadow:0 9px 24px rgba(249,115,22,.13);}
          .atlas-visual-card[data-visual-color="yellow"]:hover{box-shadow:0 9px 24px rgba(250,204,21,.12);}
          .atlas-visual-card[data-visual-color="green"]:hover{box-shadow:0 9px 24px rgba(34,197,94,.13);}
          .atlas-visual-card[data-visual-color="turquoise"]:hover{box-shadow:0 9px 24px rgba(20,184,166,.13);}
          .atlas-visual-card[data-visual-color="blue"]:hover{box-shadow:0 9px 24px rgba(59,130,246,.13);}
          .atlas-visual-card[data-visual-color="purple"]:hover{box-shadow:0 9px 24px rgba(139,92,246,.14);}
          .atlas-visual-card[data-visual-color="magenta"]:hover{box-shadow:0 9px 24px rgba(236,72,153,.13);}
          .atlas-visual-card[data-visual-color="white"]:hover{box-shadow:0 9px 24px rgba(245,245,245,.10);}
        }
        .atlas-inventory-item{transition:transform var(--motion-standard) var(--ease-standard),border-color var(--motion-standard) ease,box-shadow var(--motion-standard) ease;}
        .atlas-visual-card{transition:transform var(--motion-standard) var(--ease-standard),border-color var(--motion-standard) ease,box-shadow var(--motion-standard) ease;}
        .atlas-visual-card .atlas-visual-price{color:var(--gem);text-shadow:0 0 18px rgba(56,189,248,.10);}
        .atlas-cover-image{animation:atlas-cover-arrive .32s ease-out both;}
        .atlas-panel-reveal{animation:atlas-soft-pop .22s ease-out both;}
        .atlas-nav-active svg{animation:atlas-nav-pop .2s ease-out both;}
        @media (hover:hover) and (pointer:fine){
          .press:not(:disabled):hover{filter:none;}
          .atlas-map-marker.press:not(:disabled):hover{transform:translate(-50%,-50%);}
        }
        .press:not(:disabled):active{filter:none;opacity:.94;}
        .press:active svg{transform:scale(.94);transition:transform 90ms var(--ease-interactive);}
        .atlas-map-marker.press:active{transform:translate(-50%,-50%);}
        /* A single transient success accent, reserved for meaningful confirmations. */
        .atlas-success-pulse{animation:atlas-success-halo .42s ease-out both;}
        .atlas-fixed-toast{animation:atlas-toast-in .28s cubic-bezier(.22,.72,.22,1) both,atlas-toast-glow .70s ease-out both;}
        .atlas-fixed-toast.atlas-toast-exiting{animation:atlas-toast-out .17s ease-in both;}
        .atlas-fixed-toast--success{background:var(--mint-soft);border-color:var(--mint-strong);color:var(--mint);}
        .atlas-fixed-toast--error{background:var(--red-soft);border-color:var(--red-border);color:var(--red);box-shadow:0 10px 26px rgba(0,0,0,.20);}
        .atlas-fixed-toast--warning{background:var(--gold-soft);border-color:var(--mint-strong);color:var(--gold);box-shadow:0 10px 26px rgba(0,0,0,.20);}
        .atlas-root input:not([type="range"]):focus,.atlas-root textarea:focus,.atlas-root select:focus{border-color:rgba(139,92,246,.82)!important;box-shadow:0 0 0 3px rgba(139,92,246,.13),0 6px 18px rgba(0,0,0,.12);outline:none;}

        /* More consistent control geometry. */
        .atlas-root input,.atlas-root textarea,.atlas-root select{ border-radius:14px!important; }
        .atlas-root ::selection{ background:rgba(65,255,167,.20); color:var(--text); }
        .atlas-root ::-webkit-scrollbar{ width:0;height:0; }
        .atlas-root a{ color:var(--mint); text-decoration:none; }
        .atlas-root hr{ border:0; border-top:1px solid var(--border); margin:16px 0; }

        @media (max-width:380px){
          .atlas-root h1{font-size:27px;}
          .atlas-root h2{font-size:22px;}
          .atlas-root h3{font-size:17px;}
          .atlas-root p{font-size:14px;}
        }
        @media (prefers-reduced-motion:reduce){
          *,*::before,*::after{
            scroll-behavior:auto!important;
            animation-duration:.001ms!important;
            animation-iteration-count:1!important;
            transition-duration:.001ms!important;
          }
          .atlas-root .press:not(.atlas-map-marker),.atlas-root .atlas-visual-card,.atlas-root .atlas-inventory-item,.atlas-root .atlas-shot-thumb{transform:none!important;}
          .atlas-root .atlas-map-marker img{transform:none!important;filter:none!important;}
          .atlas-root .atlas-modal-shell,.atlas-root .atlas-bottom-sheet{animation:none!important;}
        }
`}</style>
    </>
  );
}

function ScoreBadge({ type, value, size = 'md' }) {
  const isInspector = type === 'curator';
  const color = isInspector ? 'var(--mint)' : 'var(--purple)';
  const bg = isInspector ? 'var(--mint-soft)' : 'var(--purple-soft)';
  const border = isInspector ? 'var(--mint-strong)' : 'var(--purple-strong)';
  const Icon = isInspector ? Star : Astroid;
  const pad = size === 'sm' ? '6px 11px' : size === 'recruitment' ? '8px 12px' : size === 'lg' ? '11px 17px' : '8px 12px';
  const fs = size === 'sm' ? 13 : size === 'recruitment' ? 16 : size === 'lg' ? 20 : 15;
  const iconSize = size === 'sm' ? 14 : size === 'recruitment' ? 17 : size === 'lg' ? 20 : 15;
  return (
    <div className={`atlas-display atlas-score-badge${size==='recruitment' ? ` atlas-recruitment-score ${isInspector?'atlas-recruitment-score--inspector':'atlas-recruitment-score--community'}` : ''}`} style={{
      display:'inline-flex',alignItems:'center',justifyContent:'center',gap:size==='lg'?8:size==='recruitment'?6:6,
      background:bg,color,border:`1px solid ${border}`,borderRadius:999,padding:pad,
      minHeight:size==='lg'?48:size==='recruitment'?42:36,fontSize:fs,fontWeight:800,lineHeight:1,
      boxShadow:'0 6px 18px rgba(0,0,0,.12)',animationDelay:isInspector?'45ms':'105ms'
    }} title={isInspector?'Оценка инспектора':'Оценка игроков'}>
      <Icon size={iconSize} strokeWidth={2.5} color={color} fill="none" />
      {Number(value||0).toFixed(1)}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 999, padding: 3, display: 'flex', gap: 2 }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="press"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: active ? 'var(--purple)' : 'transparent',
              color: active ? '#fff' : 'var(--text-muted)',
            }}
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
          background: shot.url ? `center / cover no-repeat url(${shot.url})` : 'linear-gradient(135deg, var(--surface-2), var(--surface))',
          border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden', padding: 0, cursor: 'pointer',
        }}
      >
        {!shot.url && <Camera size={big ? 22 : 16} color="var(--text-muted)" strokeWidth={1.5} />}
        {shot.status === 'pending' && (
          <span style={{
            position: 'absolute', top: 5, right: 5, fontSize: 9, fontWeight: 700,
            background: 'var(--gold-soft)', color: 'var(--gold)', padding: '2px 6px', borderRadius: 999,
          }}>на проверке</span>
        )}
      </button>
      <div style={{ marginTop: 4, fontSize: big ? 11.5 : 10.5, lineHeight: 1.2, color:'var(--text-muted)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={label}>{label}</div>
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
      style={{ position:'fixed', inset:0, background:'rgba(10,11,16,.97)', zIndex:80, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflow:'hidden', padding:0 }}
    >
      <button onClick={requestClose} className="press" aria-label="Закрыть" style={{ ...iconBtn('var(--surface-2)','var(--text)'), position:'fixed', top:12, right:12, width:58, height:58, zIndex:5 }}><X size={34}/></button>
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
          <div style={{ width:'min(100vw,448px)', aspectRatio:'4/3', background:'var(--surface)', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}>
            <Camera size={32}/>
          </div>
        )}
      </div>
      <MinecraftText text={shot.author || shot.mc_nickname || shot.telegram_username || ''} style={{position:'fixed',bottom:'calc(38px + env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',zIndex:8,maxWidth:'80vw',fontSize:12,color:'var(--text-muted)',textAlign:'center',pointerEvents:'none',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}/>
      {safeShots.length>1&&<div onClick={e=>e.stopPropagation()} style={{position:'fixed',bottom:'calc(14px + env(safe-area-inset-bottom))',left:'50%',transform:'translateX(-50%)',display:'flex',alignItems:'center',gap:5,zIndex:8,pointerEvents:'auto'}}>{safeShots.map((_,i)=><span key={i} style={{width:i===safeIndex?14:6,height:6,borderRadius:999,background:i===safeIndex?'var(--purple)':'var(--surface-2)',border:'1px solid var(--border)'}} />)}</div>}
      {mode==='moderate'&&<div style={{position:'absolute',left:12,right:12,bottom:14,display:'flex',gap:10}} onClick={e=>e.stopPropagation()}>
        <button onClick={onApprove} className="press" style={{flex:1,padding:'12px 0',borderRadius:12,border:'none',background:'var(--emerald)',color:'#06120D',fontWeight:700,fontSize:14}}>Одобрить</button>
        <button onClick={onReject} className="press" style={{flex:1,padding:'12px 0',borderRadius:12,border:'none',background:'var(--red-soft)',color:'var(--red)',fontWeight:700,fontSize:14}}>Отклонить</button>
      </div>}
    </div>
  );
}

function Dot({ c }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />;
}

function iconBtn(bg, color, square) {
  return {
    width: 40, height: 40, borderRadius: square ? 12 : '50%', background: bg, color,
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
}

function reactBtn(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, background: 'transparent', border: 'none',
    cursor: 'pointer', color: active ? 'var(--gold)' : 'var(--text-muted)', padding: 0, fontWeight: active ? 700 : 500,
  };
}

function SectionTitle({ icon, title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--text-muted)' }}>
      {icon}
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
      <span style={{ fontSize: 12 }}>· {count}</span>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>{label}</div>
      <input
        {...props}
        style={{
          width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
        }}
      />
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
  return <div className={`atlas-fixed-toast atlas-fixed-toast--${resolvedType}${exiting?' atlas-toast-exiting':''}`} role={resolvedType==='error'?'alert':'status'} aria-live={resolvedType==='error'?'assertive':'polite'}>{message}</div>;
}

function AvatarHead({ nickname, skinUrl, size = 46 }) {
  const [error, setError] = useState(false);
  const source=skinUrl || '';
  useEffect(()=>setError(false),[source]);
  if (!nickname || !source || error) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 12, background: 'var(--purple-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--purple)', flexShrink: 0,
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
      style={{ borderRadius: 12, border: '1px solid var(--border)', display: 'block', flexShrink: 0 }}
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={requestClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`atlas-modal-shell${closing ? ' atlas-closing' : ''}`}
        style={{
          width: '100%', maxWidth: 448, background: 'var(--surface)', borderRadius: 22,
          border: '1px solid var(--border)', padding: 18, maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="atlas-display" style={{ fontSize: 16, fontWeight: 700 }}>Добавить территорию</div>
          <button onClick={requestClose} className="press" style={iconBtn('var(--surface-2)', 'var(--text-muted)')}><X size={16} /></button>
        </div>

        <Field label="Название территории" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="@username основателя/мэра (необязательно для главного инспектора)" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <Field label="Координаты (без высоты)" value={coords} onChange={(e) => setCoords(e.target.value)} />

        <button
          onClick={() => onSubmit({ name: name.trim(), owner: owner.trim(), coords: coords.trim() })}
          disabled={!name.trim() || (!isMainInspector && !owner.trim()) || !coords.trim()}
          className="press"
          style={{
            width: '100%', marginTop: 4, padding: '12px 0', borderRadius: 12, border: 'none',
            cursor: name.trim() && (isMainInspector || owner.trim()) && coords.trim() ? 'pointer' : 'not-allowed',
            opacity: name.trim() && (isMainInspector || owner.trim()) && coords.trim() ? 1 : 0.5,
            background: 'var(--purple)', color: '#fff', fontWeight: 700, fontSize: 14,
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
function VoxMap({ image, source = null, territories, onSelect, resetSignal = 0, viewState = null, onViewStateChange, markersReady = false, mapZoomPercent = 100 }) {
  const MAX_MAP_ZOOM = MAP_ZOOM_MAX_SCALE;
  const defaultScale = mapZoomPercentToScale(mapZoomPercent);
  const viewportRef = useRef(null);
  const mapLayerRef = useRef(null);
  const pointersRef = useRef(new Map());
  const transformRef = useRef(viewState || { x: 0, y: 0, scale: defaultScale });
  const userGestureRef = useRef(false);
  const gestureRef = useRef(null);
  const lastResetRef = useRef(resetSignal);
  const paintFrameRef = useRef(null);
  const viewSyncTimerRef = useRef(null);
  const tileRefreshTimerRef = useRef(null);
  const tileSignatureRef = useRef('');
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const [visibleTiles, setVisibleTiles] = useState([]);

  function buildVisibleTiles() {
    const src = sourceRef.current;
    const viewport = viewportRef.current;
    if (!src || !viewport || !['deepzoom', 'url-grid'].includes(src.type)) return [];
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    const t = transformRef.current;
    const scale = Math.max(1, Number(t.scale) || 1);
    const clamp01 = value => Math.max(0, Math.min(1, value));
    const left = clamp01(0.5 + (-width / 2 - t.x) / (scale * width));
    const right = clamp01(0.5 + (width / 2 - t.x) / (scale * width));
    const top = clamp01(0.5 + (-height / 2 - t.y) / (scale * height));
    const bottom = clamp01(0.5 + (height / 2 - t.y) / (scale * height));
    const tiles = [];

    if (src.type === 'deepzoom') {
      const mapWidth = Math.max(1, Number(src.width) || 1);
      const mapHeight = Math.max(1, Number(src.height) || 1);
      const tileSize = Math.max(64, Number(src.tileSize) || 512);
      const minLevel = Math.max(0, Number(src.minLevel) || 0);
      const maxLevel = Math.max(minLevel, Number(src.maxLevel) || minLevel);
      const dpr = Math.max(1, Math.min(3, Number(window.devicePixelRatio) || 1));
      const targetPixels = Math.max(width, height) * dpr * scale;
      const idealLevel = maxLevel + Math.log2(targetPixels / Math.max(mapWidth, mapHeight));
      const level = Math.max(minLevel, Math.min(maxLevel, Math.ceil(idealLevel)));
      const reduction = 2 ** (maxLevel - level);
      const levelWidth = Math.max(1, Math.ceil(mapWidth / reduction));
      const levelHeight = Math.max(1, Math.ceil(mapHeight / reduction));
      const columns = Math.ceil(levelWidth / tileSize);
      const rows = Math.ceil(levelHeight / tileSize);
      const xStart = Math.max(0, Math.floor(left * levelWidth / tileSize) - 1);
      const xEnd = Math.min(columns - 1, Math.floor(Math.max(0, right * levelWidth - 1) / tileSize) + 1);
      const yStart = Math.max(0, Math.floor(top * levelHeight / tileSize) - 1);
      const yEnd = Math.min(rows - 1, Math.floor(Math.max(0, bottom * levelHeight - 1) / tileSize) + 1);
      const template = String(src.tileUrlTemplate || '');
      const assetBase = String(src.assetBase || MAP_ASSETS_BASE);
      for (let y = yStart; y <= yEnd; y += 1) {
        for (let x = xStart; x <= xEnd; x += 1) {
          const tilePath = template
            .replaceAll('{level}', String(level))
            .replaceAll('{x}', String(x))
            .replaceAll('{y}', String(y));
          if (!tilePath) continue;
          let url = tilePath;
          try { url = /^https?:\/\//i.test(tilePath) ? tilePath : new URL(tilePath, assetBase).href; } catch {}
          const tileWidth = Math.min(tileSize, levelWidth - x * tileSize);
          const tileHeight = Math.min(tileSize, levelHeight - y * tileSize);
          tiles.push({
            key: url,
            src: url,
            left: x * tileSize / levelWidth * 100,
            top: y * tileSize / levelHeight * 100,
            width: tileWidth / levelWidth * 100,
            height: tileHeight / levelHeight * 100,
          });
        }
      }
      return tiles;
    }

    const columns = Math.max(1, Number(src.columns) || 12);
    const rows = Math.max(1, Number(src.rows) || 12);
    const urls = Array.isArray(src.urls) ? src.urls : [];
    const xStart = Math.max(0, Math.floor(left * columns) - 1);
    const xEnd = Math.min(columns - 1, Math.floor(Math.max(0, right - 0.000001) * columns) + 1);
    const yStart = Math.max(0, Math.floor(top * rows) - 1);
    const yEnd = Math.min(rows - 1, Math.floor(Math.max(0, bottom - 0.000001) * rows) + 1);
    for (let y = yStart; y <= yEnd; y += 1) {
      for (let x = xStart; x <= xEnd; x += 1) {
        const url = urls[y * columns + x];
        if (typeof url !== 'string' || !url.trim()) continue;
        let resolvedUrl = url.trim();
        try { resolvedUrl = /^https?:\/\//i.test(resolvedUrl) ? resolvedUrl : new URL(resolvedUrl, String(src.assetBase || MAP_ASSETS_BASE)).href; } catch {}
        tiles.push({
          key: resolvedUrl,
          src: resolvedUrl,
          left: x / columns * 100,
          top: y / rows * 100,
          width: 100 / columns,
          height: 100 / rows,
        });
      }
    }
    return tiles;
  }

  function refreshTilesNow() {
    const next = buildVisibleTiles();
    const signature = next.map(tile => tile.key).join('|');
    if (signature !== tileSignatureRef.current) {
      tileSignatureRef.current = signature;
      setVisibleTiles(next);
    }
  }

  function scheduleTileRefresh() {
    if (tileRefreshTimerRef.current !== null) return;
    tileRefreshTimerRef.current = window.setTimeout(() => {
      tileRefreshTimerRef.current = null;
      refreshTilesNow();
    }, 110);
  }

  function bounds(scale = transformRef.current.scale) {
    const el = viewportRef.current;
    if (!el) return { x: 0, y: 0 };
    return {
      x: Math.max(0, el.clientWidth * (scale - 1) / 2),
      y: Math.max(0, el.clientHeight * (scale - 1) / 2),
    };
  }

  function clamp(next) {
    const scale = Math.min(MAX_MAP_ZOOM, Math.max(1, Number(next.scale) || 1));
    const b = bounds(scale);
    return {
      scale,
      x: Math.max(-b.x, Math.min(b.x, Number(next.x) || 0)),
      y: Math.max(-b.y, Math.min(b.y, Number(next.y) || 0)),
    };
  }

  // Gesture updates are applied directly to the existing DOM layer. This avoids
  // React re-rendering every marker and the surrounding map on every pointer frame.
  function paintTransform() {
    const layer = mapLayerRef.current;
    if (!layer) return;
    const t = transformRef.current;
    layer.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
    layer.style.setProperty('--vox-marker-inverse-scale', String(1 / t.scale));
  }

  function schedulePaint() {
    if (paintFrameRef.current !== null) return;
    paintFrameRef.current = window.requestAnimationFrame(() => {
      paintFrameRef.current = null;
      paintTransform();
    });
  }

  function apply(next) {
    transformRef.current = clamp(next);
    schedulePaint();
    scheduleTileRefresh();
  }

  function syncViewStateNow() {
    if (viewSyncTimerRef.current !== null) {
      window.clearTimeout(viewSyncTimerRef.current);
      viewSyncTimerRef.current = null;
    }
    onViewStateChange?.({ ...transformRef.current });
  }

  function syncViewStateSoon() {
    if (viewSyncTimerRef.current !== null) window.clearTimeout(viewSyncTimerRef.current);
    viewSyncTimerRef.current = window.setTimeout(() => {
      viewSyncTimerRef.current = null;
      onViewStateChange?.({ ...transformRef.current });
    }, 180);
  }

  useEffect(() => {
    if (!viewState || userGestureRef.current) return;
    transformRef.current = clamp(viewState);
    paintTransform();
  }, [viewState]);

  useEffect(() => {
    if (userGestureRef.current) return;
    transformRef.current = clamp({ x: 0, y: 0, scale: defaultScale });
    paintTransform();
    scheduleTileRefresh();
    onViewStateChange?.({ ...transformRef.current });
  }, [defaultScale]);

  useEffect(() => {
    paintTransform();
    return () => {
      if (viewSyncTimerRef.current !== null) window.clearTimeout(viewSyncTimerRef.current);
      if (paintFrameRef.current !== null) window.cancelAnimationFrame(paintFrameRef.current);
      if (tileRefreshTimerRef.current !== null) window.clearTimeout(tileRefreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (lastResetRef.current !== resetSignal) {
      lastResetRef.current = resetSignal;
      userGestureRef.current = false;
      transformRef.current = { x: 0, y: 0, scale: defaultScale };
      pointersRef.current.clear();
      gestureRef.current = null;
      paintTransform();
      syncViewStateNow();
      scheduleTileRefresh();
    }
  }, [resetSignal]);

  useEffect(() => {
    tileSignatureRef.current = '';
    setVisibleTiles([]);
    scheduleTileRefresh();
  }, [source]);

  useEffect(() => {
    const onResize = () => {
      transformRef.current = clamp(transformRef.current);
      paintTransform();
      scheduleTileRefresh();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function down(e) {
    userGestureRef.current = true;
    e.preventDefault?.();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointersRef.current.values()];
    const t = transformRef.current;

    if (pts.length >= 2) {
      const center = midpoint(pts[0], pts[1]);
      gestureRef.current = {
        mode: 'pinch',
        startDistance: Math.max(1, distance(pts[0], pts[1])),
        startScale: t.scale,
        startX: t.x,
        startY: t.y,
        startCenter: center,
      };
    } else {
      gestureRef.current = {
        mode: 'pan',
        startX: t.x,
        startY: t.y,
        pointer: pts[0],
      };
    }
  }

  function move(e) {
    if (!pointersRef.current.has(e.pointerId)) return;
    e.preventDefault?.();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointersRef.current.values()];
    const g = gestureRef.current;
    if (!g) return;

    if (pts.length >= 2 && g.mode === 'pinch') {
      const currentDistance = Math.max(1, distance(pts[0], pts[1]));
      const currentCenter = midpoint(pts[0], pts[1]);
      const scale = Math.min(MAX_MAP_ZOOM, Math.max(1, g.startScale * currentDistance / g.startDistance));
      const el = viewportRef.current;
      const cx = (el?.clientWidth || 0) / 2;
      const cy = (el?.clientHeight || 0) / 2;
      const worldX = (g.startCenter.x - cx - g.startX) / g.startScale;
      const worldY = (g.startCenter.y - cy - g.startY) / g.startScale;
      apply({
        scale,
        x: currentCenter.x - cx - worldX * scale,
        y: currentCenter.y - cy - worldY * scale,
      });
    } else if (pts.length === 1 && g.mode === 'pan') {
      const q = pts[0];
      apply({
        scale: transformRef.current.scale,
        x: g.startX + q.x - g.pointer.x,
        y: g.startY + q.y - g.pointer.y,
      });
    }
  }

  function up(e) {
    pointersRef.current.delete(e.pointerId);
    const pts = [...pointersRef.current.values()];
    if (!pts.length) {
      gestureRef.current = null;
      syncViewStateNow();
    } else if (pts.length === 1) {
      const t = transformRef.current;
      gestureRef.current = {
        mode: 'pan',
        startX: t.x,
        startY: t.y,
        pointer: pts[0],
      };
    }
  }

  function wheel(e) {
    userGestureRef.current = true;
    e.preventDefault?.();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const t = transformRef.current;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.min(MAX_MAP_ZOOM, Math.max(1, t.scale * factor));
    const worldX = (px - cx - t.x) / t.scale;
    const worldY = (py - cy - t.y) / t.scale;
    apply({
      scale,
      x: px - cx - worldX * scale,
      y: py - cy - worldY * scale,
    });
    syncViewStateSoon();
  }

  const initialTransform = transformRef.current;

  return <div
    ref={viewportRef}
    onPointerDown={down}
    onPointerMove={move}
    onPointerUp={up}
    onPointerCancel={up}
    onWheel={wheel}
    style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      background: 'var(--bg)', touchAction: 'none', userSelect: 'none',
    }}
  >
    {image && <div ref={mapLayerRef} style={{
      position: 'absolute', inset: 0,
      transform: `translate(${initialTransform.x}px, ${initialTransform.y}px) scale(${initialTransform.scale})`,
      transformOrigin: 'center center',
      '--vox-marker-inverse-scale': String(1 / initialTransform.scale),
    }}>
      {source && ['deepzoom', 'url-grid'].includes(source.type) ? <>
        <img src={image} alt="Карта мира" draggable={false} decoding="async" fetchPriority="high" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'fill', pointerEvents: 'none',
        }}/>
        {visibleTiles.map(tile => <img
          key={tile.key}
          src={tile.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          fetchPriority="high"
          style={{
            position: 'absolute',
            left: `${tile.left}%`,
            top: `${tile.top}%`,
            width: `${tile.width}%`,
            height: `${tile.height}%`,
            objectFit: 'fill',
            display: 'block',
            pointerEvents: 'none',
          }}
        />)}
      </> : <img src={image} alt="Карта мира" draggable={false} decoding="async" fetchPriority="high" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'fill', pointerEvents: 'none',
      }}/>}
      <div style={{ position: 'absolute', inset: 0, zIndex: 15, pointerEvents: 'none' }}>
        {markersReady && territories.map(city => {
          const hasCoords = finiteCoordinate(city.vox_x) !== null && finiteCoordinate(city.vox_z) !== null;
          const pos = hasCoords ? voxWorldToPercent(city.vox_x, city.vox_z) : null;
          if (!hasMapOwner(city) || !pos) return null;
          const markerSrc = city.marker_url || DEFAULT_CITY_MARKER;

          return <button key={city.id} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onSelect(city.id); }} className="press atlas-map-marker" style={{
            position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`,
            transform: 'translate(-50%,-50%) scale(var(--vox-marker-inverse-scale, 1))',
            transformOrigin: 'center center', border: 'none', background: 'transparent',
            cursor: 'pointer', padding: 0,
            width: MAP_MARKER_WIDTH, height: MAP_MARKER_HEIGHT,
            pointerEvents: 'auto',
          }} title={stripMinecraftCodes(city.name)}>
            <img src={markerSrc} alt={stripMinecraftCodes(city.name)} draggable={false} style={{
              width: MAP_MARKER_WIDTH, height: MAP_MARKER_HEIGHT, objectFit: 'contain', display: 'block',
            }}/>
          </button>;
        })}
      </div>
    </div>}
  </div>;
}
function MainInspectorPanel({ initData, onMapSaved, territories = [], onTerritoriesChanged, onFaqSaved }) {
  const [inspectors,setInspectors]=useState([]),[inspectorInput,setInspectorInput]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[mapSaving,setMapSaving]=useState(false),[mapProcessing,setMapProcessing]=useState(false),[mapProgress,setMapProgress]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [managedUsers,setManagedUsers]=useState([]),[usersLoading,setUsersLoading]=useState(true),[userSaving,setUserSaving]=useState(false),[newMcNickname,setNewMcNickname]=useState(''),[newTelegramId,setNewTelegramId]=useState(''),[editingUserId,setEditingUserId]=useState(null),[editingUser,setEditingUser]=useState({mcNickname:'',telegramId:''});
  const [faqText,setFaqText]=useState(''),[faqSaving,setFaqSaving]=useState(false),[faqLoading,setFaqLoading]=useState(true),[faqLoadError,setFaqLoadError]=useState('');
  const [managerModalCity,setManagerModalCity]=useState(null);
  const fileRef=useRef(null);
  const [d1Diagnostics,setD1Diagnostics]=useState(null);
  const [d1DiagnosticsLoading,setD1DiagnosticsLoading]=useState(false);
  const [d1DiagnosticsError,setD1DiagnosticsError]=useState('');
  const [d1ReportCopyText,setD1ReportCopyText]=useState('');
  const [d1ReportCopyNotice,setD1ReportCopyNotice]=useState('');
  async function loadD1Diagnostics(){
    try{
      setD1DiagnosticsLoading(true);setD1DiagnosticsError('');
      const response=await fetch(`${API_BASE}/api/admin/diagnostics/d1`,{method:'GET',headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
      const report=await parseApiResponse(response,'Не удалось проверить базу данных.');
      if(report.readOnly!==true)throw new Error('Диагностика вернула неожиданный формат.');
      setD1Diagnostics(report);setD1ReportCopyText('');setD1ReportCopyNotice('');
    }catch(error){setD1DiagnosticsError(safeCaughtError(error,'Не удалось получить read-only отчёт D1.'))}
    finally{setD1DiagnosticsLoading(false)}
  }
  async function copyD1Diagnostics(){
    if(!d1Diagnostics)return;
    const text=JSON.stringify(d1Diagnostics,null,2);
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);setD1ReportCopyText('');setD1ReportCopyNotice('JSON-отчёт скопирован. Его можно отправить для анализа.');
    }catch{
      setD1ReportCopyNotice('Автокопирование недоступно. Выделите текст ниже и скопируйте его вручную.');setD1ReportCopyText(text);
    }
  }
  async function loadInspectors(){try{setLoading(true);const r=await fetch(`${API_BASE}/api/inspectors/list`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData}),cache:'no-store'}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setInspectors(d.inspectors||[])}catch(e){setError(safeCaughtError(e, 'Не удалось загрузить инспекторов'))}finally{setLoading(false)}}
  async function loadUsers(){try{setUsersLoading(true);const r=await fetch(`${API_BASE}/api/admin/users`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setManagedUsers(d.users||[])}catch(e){setError(safeCaughtError(e, 'Не удалось загрузить пользователей'))}finally{setUsersLoading(false)}}
  async function loadFaq(){
    try{
      setFaqLoading(true);setFaqLoadError('');setFaqText('');
      const r=await fetch(`${API_BASE}/api/faq`,{cache:'no-store'}),d=await r.json().catch(()=>null);
      if(!r.ok||!d?.ok||typeof d.text!=='string')throw new Error(apiErrorMessage(r,d,'Не удалось загрузить ЧиВо.'));
      setFaqText(d.text.trim()?d.text:DEFAULT_FAQ_TEXT);
    }catch(e){setFaqLoadError(safeCaughtError(e,'Не удалось загрузить ЧиВо.'));}
    finally{setFaqLoading(false)}
  }
  useEffect(()=>{if(initData){loadInspectors();loadUsers();loadFaq()}},[initData]);
  async function saveFaq(){const text=faqText.trim();if(!text){setError('Текст ЧиВо не может быть пустым');return}try{setFaqSaving(true);setError('');const r=await fetch(`${API_BASE}/api/faq`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,text})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setFaqText(d.text||text);onFaqSaved?.(d.text||text);setNotice('ЧиВо сохранено')}catch(e){setError(safeCaughtError(e, 'Не удалось сохранить ЧиВо'))}finally{setFaqSaving(false)}}
  async function add(){const value=inspectorInput.trim();if(!value){setError('Укажите username или Telegram ID.');return}const numeric=/^\d+$/.test(value);try{setSaving(true);setError('');const r=await fetch(`${API_BASE}/api/inspectors`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,telegramId:numeric?value:null,username:numeric?null:value})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setInspectorInput('');setNotice('Инспектор добавлен');loadInspectors()}catch(e){setError(safeCaughtError(e, 'Не удалось добавить инспектора'))}finally{setSaving(false)}}
  async function remove(id){if(!window.confirm('Удалить этого инспектора?'))return;try{const r=await fetch(`${API_BASE}/api/inspectors/${id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setNotice('Инспектор удалён');loadInspectors()}catch(e){setError(safeCaughtError(e, 'Не удалось удалить инспектора'))}}
  async function saveMap(file) {
    if (!file) return;
    try {
      setError(''); setNotice(''); setMapSaving(true); setMapProcessing(false); setMapProgress(0);
      const maxBytes = 90_000_000;
      if (!['image/png','image/jpeg','image/webp'].includes(String(file.type || '').toLowerCase())) {
        throw new Error('Поддерживаются только PNG, JPG и WebP.');
      }
      if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) {
        throw new Error('Размер файла должен быть не больше 90 МБ.');
      }
      const uploadResult = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/map`, true);
        xhr.timeout = 600000;
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.setRequestHeader('X-Telegram-Init-Data', initData);
        xhr.setRequestHeader('X-Map-Size', String(file.size));
        xhr.upload.onprogress = event => {
          if (event.lengthComputable && event.total > 0) setMapProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
        };
        xhr.onload = () => {
          let data = null;
          try { data = JSON.parse(xhr.responseText || 'null'); } catch {}
          if (xhr.status >= 200 && xhr.status < 300 && data?.ok) resolve(data);
          else reject(new Error(data?.error || `Не удалось загрузить карту (HTTP ${xhr.status || 'ошибка'}).`));
        };
        xhr.onerror = () => reject(new Error('Соединение прервалось. Проверьте сеть и повторите загрузку.'));
        xhr.ontimeout = () => reject(new Error('Загрузка заняла больше 10 минут и была остановлена. Проверьте соединение и повторите попытку.'));
        xhr.onabort = () => reject(new Error('Загрузка карты отменена.'));
        xhr.send(file);
      });

      const expectedVersion = String(uploadResult?.mapVersion || '').trim();
      if (!expectedVersion) throw new Error('Worker сохранил файл, но не вернул версию для обработки карты.');
      setMapProcessing(true);
      setNotice('Файл загружен. Генерируем и публикуем тайлы карты…');

      const deadline = Date.now() + 25 * 60 * 1000;
      let publishedManifest = null;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`${MAP_ASSETS_BASE}/world-map/manifest.json?check=${Date.now()}`, { cache: 'no-store' });
          if (response.ok) {
            const manifest = await response.json();
            if (manifest?.mapVersion === expectedVersion
              && manifest?.source
              && ['deepzoom', 'url-grid'].includes(manifest.source.type)) {
              publishedManifest = manifest;
              break;
            }
          }
        } catch {}
        await new Promise(resolve => window.setTimeout(resolve, 5000));
      }
      if (!publishedManifest) {
        throw new Error('Исходный файл загружен, но публикация тайлов не завершилась за 25 минут. Предыдущая опубликованная карта осталась доступна. Проверьте запуск GitHub Actions в Voxygen-map-assets.');
      }

      const previewPath = publishedManifest.source.previewUrl || publishedManifest.previewUrl;
      if (!previewPath) throw new Error('Публикация завершилась, но в манифесте отсутствует previewUrl.');
      const previewUrl = /^https?:\/\//i.test(previewPath) ? previewPath : new URL(previewPath, MAP_ASSETS_BASE).href;
      const preview = new Image();
      preview.decoding = 'async';
      preview.fetchPriority = 'high';
      if (typeof preview.decode === 'function') {
        preview.src = previewUrl;
        await preview.decode();
      } else {
        await new Promise((resolve, reject) => {
          if (preview.complete) {
            if (preview.naturalWidth > 0) resolve();
            else reject(new Error('Не удалось загрузить превью опубликованной карты.'));
            return;
          }
          preview.onload = resolve;
          preview.onerror = () => reject(new Error('Не удалось загрузить превью опубликованной карты.'));
          preview.src = previewUrl;
        });
      }
      if (!preview.naturalWidth || !preview.naturalHeight) {
        throw new Error('Превью опубликованной карты не удалось декодировать.');
      }

      const publishedSource = {
        ...publishedManifest.source,
        assetBase: MAP_ASSETS_BASE,
        mapVersion: publishedManifest.mapVersion,
      };
      setMapProgress(100);
      setNotice('Карта мира обновлена');
      onMapSaved?.({ image: previewUrl, source: publishedSource });
    } catch (e) {
      setError(safeCaughtError(e, 'Не удалось сохранить карту'));
    } finally {
      setMapSaving(false);
      setMapProcessing(false);
      window.setTimeout(() => setMapProgress(0), 900);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function addUser(){const mc=newMcNickname.trim();const tid=Number(newTelegramId.trim());if(!mc||!Number.isSafeInteger(tid)||tid<=0){setError('Укажите Minecraft никнейм и корректный Telegram ID');return}try{setUserSaving(true);setError('');const r=await fetch(`${API_BASE}/api/admin/users`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,mcNickname:mc,telegramId:tid})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setNewMcNickname('');setNewTelegramId('');setNotice(d.user?.telegram_username?`Пользователь добавлен: @${String(d.user.telegram_username).replace(/^@/,'')}`:'Пользователь добавлен. Username появится после входа в Voxygen.');await loadUsers()}catch(e){setError(safeCaughtError(e, 'Не удалось добавить пользователя'))}finally{setUserSaving(false)}}
  function startEdit(u){setEditingUserId(u.id);setEditingUser({mcNickname:u.mc_nickname||'',telegramId:u.telegram_id==null?'':String(u.telegram_id)})}
  async function saveUser(id){const mc=editingUser.mcNickname.trim();const tid=String(editingUser.telegramId||'').trim();if(!mc||!tid){setError('Укажите Minecraft никнейм и Telegram ID');return}try{setUserSaving(true);setError('');const r=await fetch(`${API_BASE}/api/admin/users/update/${encodeURIComponent(id)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,mcNickname:mc,telegramId:Number(tid)})});let d=null;try{d=await r.json().catch(() => null)}catch{throw new Error(`HTTP ${r.status}`)}if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setEditingUserId(null);setNotice(d.user?.telegram_username?`Данные сохранены: @${String(d.user.telegram_username).replace(/^@/,'')}`:'Данные сохранены. Username обновится после входа пользователя.');await loadUsers()}catch(e){setError(safeCaughtError(e, 'Не удалось сохранить пользователя'))}finally{setUserSaving(false)}}
  async function deleteUser(id){if(!window.confirm('Удалить пользователя из списка?'))return;try{setUserSaving(true);setError('');const r=await fetch(`${API_BASE}/api/admin/users/delete/${encodeURIComponent(id)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));if(editingUserId===id)setEditingUserId(null);setNotice('Пользователь удалён');await loadUsers()}catch(e){setError(safeCaughtError(e, 'Не удалось удалить пользователя'))}finally{setUserSaving(false)}}
  async function deleteCity(id){if(!window.confirm('Удалить этот город? Это действие нельзя отменить.'))return;try{const r=await fetch(`${API_BASE}/api/admin/territories/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,territoryId:id})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setNotice('Город удалён');onTerritoriesChanged?.()}catch(e){setError(safeCaughtError(e, 'Не удалось удалить город'))}}
  async function moveCity(city){const raw=window.prompt('Новые координаты X Z',`${city.vox_x??0} ${city.vox_z??0}`);if(raw===null)return;const m=raw.trim().replace(/−/g,'-').match(/^(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)$/);if(!m){setError('Формат: X Z');return}const x=Number(m[1].replace(',','.')),z=Number(m[2].replace(',','.'));if(!Number.isFinite(x)||!Number.isFinite(z)||x<-2500||x>2500||z<-2500||z>2500){setError('Координаты должны быть от −2500 до 2500');return}try{const r=await fetch(`${API_BASE}/api/admin/territories/coords`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,territoryId:city.id,x,z})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setNotice('Координаты обновлены');onTerritoriesChanged?.()}catch(e){setError(safeCaughtError(e, 'Не удалось изменить координаты'))}}
  function changeFounder(city){ setManagerModalCity(city); setError(''); }
  return <div style={{marginTop:12}}>
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginBottom:12}}><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}><Users size={16} color="var(--gold)"/><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>Инспекторы</div><span style={{marginLeft:'auto',fontSize:11,color:'var(--text-muted)'}}>{inspectors.length}</span></div><input value={inspectorInput} onChange={e=>setInspectorInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add()}} placeholder="Username или Telegram ID" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',marginBottom:8}}/><button onClick={add} disabled={saving} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'10px 12px',background:'var(--gold)',color:'#06120D',fontWeight:700}}>{saving?'Добавление…':'Добавить инспектора'}</button>{loading?null:inspectors.map(i=><div key={i.telegram_id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderTop:'1px solid var(--border)'}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{i.telegram_username?`@${String(i.telegram_username).replace(/^@/,'')}`:'Username не указан'}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>Telegram ID: {i.telegram_id}</div></div><button onClick={()=>remove(i.telegram_id)} className="press" style={{border:'none',background:'var(--red-soft)',color:'var(--red)',borderRadius:9,padding:'8px'}}><Trash2 size={14}/></button></div>)}</div>

    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginBottom:12}}><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><Trash2 size={16} color="var(--red)"/><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>Города</div><span style={{marginLeft:'auto',fontSize:11,color:'var(--text-muted)'}}>{territories.length}</span></div>{territories.length===0?<div style={{fontSize:12,color:'var(--text-muted)'}}>Городов пока нет.</div>:territories.map(city=><div key={city.id} style={{display:'flex',alignItems:'center',gap:7,padding:'10px 0',borderTop:'1px solid var(--border)'}}><div style={{flex:1,minWidth:0}}><MinecraftText text={city.name} as="div" style={{fontSize:13,fontWeight:700}}/><div style={{fontSize:11,color:'var(--text-muted)'}}><MinecraftText text={city.owner}/> · {formatTerritoryCoords(city.coords)}</div></div><button onClick={()=>moveCity(city)} className="press" style={{border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',borderRadius:9,padding:'7px 9px',fontSize:11}}>Коорд.</button><button onClick={()=>changeFounder(city)} className="press" style={{border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--mint)',borderRadius:9,padding:'7px 9px',fontSize:11}}>Мэр</button><button onClick={()=>deleteCity(city.id)} className="press" style={{border:'none',background:'var(--red-soft)',color:'var(--red)',borderRadius:9,padding:'7px 9px'}}><Trash2 size={14}/></button></div>)}</div>
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><MapIcon size={16} color="var(--purple)"/><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>Карта мира</div></div>
      <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.5,marginBottom:10}}>Загрузите изображение PNG, JPG или WebP любого разрешения. Исходное качество сохраняется; размер файла — до 90 МБ. Карта хранится в GitHub Releases.</div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{display:'none'}} onChange={e=>saveMap(e.target.files?.[0])}/>
      <button onClick={()=>fileRef.current?.click()} disabled={mapSaving} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'11px',background:'var(--purple)',color:'#fff',fontWeight:700}}>{mapSaving?(mapProcessing?'Обработка карты…':'Загрузка карты…'):'Загрузить карту мира'}</button>
      {mapSaving&&<div role="status" aria-live="polite" style={{marginTop:10}}><div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)',marginBottom:5}}><span>{mapProcessing?'Генерация тайлов и публикация…':(mapProgress>=100?'Файл передан, запускаем обработку…':'Загрузка файла')}</span><span>{mapProcessing?'В работе':`${mapProgress}%`}</span></div><div style={{height:6,background:'var(--surface-3)',borderRadius:99,overflow:'hidden'}}><div style={{height:'100%',width:`${mapProgress}%`,background:'var(--purple)',borderRadius:99,transition:'width 120ms linear'}}/></div></div>}
    </div>
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}><Users size={16} color="var(--purple)"/><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>Пользователи</div><span style={{marginLeft:'auto',fontSize:11,color:'var(--text-muted)'}}>{managedUsers.length}</span></div>
      <input value={newMcNickname} onChange={e=>setNewMcNickname(e.target.value)} placeholder="Никнейм в Minecraft" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',marginBottom:8}}/>
      <input value={newTelegramId} onChange={e=>setNewTelegramId(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="Telegram ID" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',marginBottom:8}}/>
      <button onClick={addUser} disabled={userSaving} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'10px 12px',background:'var(--purple)',color:'#fff',fontWeight:700}}>{userSaving?'Сохранение…':'Добавить пользователя'}</button>
      {usersLoading?null:managedUsers.length===0?<div style={{fontSize:12,color:'var(--text-muted)',marginTop:12}}>Подтверждённых пользователей пока нет.</div>:<div style={{marginTop:12}}>{managedUsers.map(u=>{
        const editing=editingUserId===u.id;
        return <div key={u.id} style={{padding:'12px 0',borderTop:'1px solid var(--border)'}}>
          {editing?<>
            <input value={editingUser.mcNickname} onChange={e=>setEditingUser(v=>({...v,mcNickname:e.target.value}))} placeholder="Никнейм в Minecraft" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:9,padding:'9px 10px',color:'var(--text)',marginBottom:7}}/>
            <input value={editingUser.telegramId} onChange={e=>setEditingUser(v=>({...v,telegramId:e.target.value.replace(/\D/g,'')}))} inputMode="numeric" placeholder="Telegram ID" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:9,padding:'9px 10px',color:'var(--text)',marginBottom:7}}/>
            <div style={{display:'flex',gap:7}}><button onClick={()=>saveUser(u.id)} disabled={userSaving} className="press" style={{flex:1,border:'none',borderRadius:9,padding:'9px',background:'var(--purple)',color:'#fff',fontWeight:700}}>Сохранить</button><button onClick={()=>setEditingUserId(null)} className="press" style={{border:'1px solid var(--border)',borderRadius:9,padding:'9px 12px',background:'var(--surface-2)',color:'var(--text)'}}>Отмена</button></div>
          </>:<>
            <div style={{display:'flex',alignItems:'flex-start',gap:8}}><div style={{flex:1,minWidth:0}}><MinecraftText text={u.mc_nickname||'Никнейм не указан'} style={{fontSize:15,fontWeight:700}}/><div style={{fontSize:13,color:'var(--text-muted)',marginTop:2}}>{u.telegram_username?`@${String(u.telegram_username).replace(/^@/,'')}`:'Username не указан'}</div><div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Telegram ID: {u.telegram_id}</div></div><button onClick={()=>startEdit(u)} className="press" style={{border:'none',background:'var(--surface-2)',color:'var(--text-muted)',borderRadius:9,padding:'8px'}} title="Редактировать"><Pencil size={14}/></button><button onClick={()=>deleteUser(u.id)} disabled={userSaving} className="press" style={{border:'none',background:'var(--red-soft)',color:'var(--red)',borderRadius:9,padding:'8px'}} title="Удалить"><Trash2 size={14}/></button></div>
          </>}
        </div>;
      })}</div>}
    </div>

    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><MessageCircle size={16} color="var(--purple)"/><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>ЧиВо</div></div>
      {faqLoading&&<div role="status" style={{fontSize:12,color:'var(--text-muted)',marginBottom:8}}>Загрузка сохранённого текста…</div>}
      {faqLoadError&&<div role="alert" style={{fontSize:12,color:'var(--red)',lineHeight:1.45,marginBottom:8}}>{faqLoadError}<button type="button" onClick={loadFaq} className="press" style={{display:'block',marginTop:8,padding:'8px 11px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontWeight:700}}>Повторить загрузку</button></div>}
      <textarea value={faqText} onChange={e=>setFaqText(e.target.value)} disabled={faqLoading||Boolean(faqLoadError)} placeholder={faqLoading?'Загрузка…':faqLoadError?'Загрузка не удалась. Повторите запрос.':''} rows={9} style={{width:'100%',boxSizing:'border-box',resize:'none',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',fontSize:13,lineHeight:1.5,marginBottom:8,opacity:faqLoading||faqLoadError?0.65:1}}/>
      <button onClick={saveFaq} disabled={faqSaving||faqLoading||Boolean(faqLoadError)} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'10px 12px',background:'var(--purple)',color:'#fff',fontWeight:700,opacity:faqSaving||faqLoading||faqLoadError?0.55:1}}>{faqSaving?'Сохранение…':'Сохранить ЧиВо'}</button>
    </div>

    {managerModalCity&&<MainInspectorManagersModal city={managerModalCity} initData={initData} onClose={()=>setManagerModalCity(null)} onSaved={(message)=>{setNotice(message);onTerritoriesChanged?.()}} />}
    {notice&&<FixedToast key={notice} message={notice}/>}
    {error&&<div style={{fontSize:12,color:'var(--red)',marginTop:8}}>{error}</div>}
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><ShieldCheck size={16} color="var(--mint)"/><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>Диагностика D1</div><span style={{marginLeft:'auto',fontSize:10,color:'var(--mint)',fontWeight:700}}>ТОЛЬКО ЧТЕНИЕ</span></div>
      <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.45,marginBottom:10}}>Проверка количества записей, осиротевших связей, статусов и объёма больших полей. Отчёт не удаляет и не изменяет данные.</div>
      <button onClick={loadD1Diagnostics} disabled={d1DiagnosticsLoading} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'10px 12px',background:'var(--mint)',color:'#06120D',fontWeight:700}}>{'Получить read-only отчёт'}</button>
      {d1DiagnosticsError&&<div role="alert" style={{fontSize:12,color:'var(--red)',marginTop:9}}>{d1DiagnosticsError}</div>}
      {d1Diagnostics&&<div style={{marginTop:12,fontSize:12,lineHeight:1.5}}>
        <div style={{color:'var(--text-muted)',marginBottom:8}}>Снимок: {new Date(d1Diagnostics.generatedAt).toLocaleString()} · таблиц: {(d1Diagnostics.tables||[]).length}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginBottom:10}}>
          <div style={{background:'var(--surface-2)',borderRadius:10,padding:10}}><div style={{color:'var(--text-muted)',fontSize:10}}>Orphan по территориям</div><div style={{fontSize:18,fontWeight:800,color:(d1Diagnostics.orphanTerritories||[]).length?'var(--red)':'var(--mint)'}}>{(d1Diagnostics.orphanTerritories||[]).reduce((sum,item)=>sum+Number(item.rows||0),0)}</div></div>
          <div style={{background:'var(--surface-2)',borderRadius:10,padding:10}}><div style={{color:'var(--text-muted)',fontSize:10}}>Orphan связей</div><div style={{fontSize:18,fontWeight:800,color:(d1Diagnostics.orphanRelations||[]).length?'var(--red)':'var(--mint)'}}>{(d1Diagnostics.orphanRelations||[]).reduce((sum,item)=>sum+Number(item.rows||0),0)}</div></div>
          <div style={{background:'var(--surface-2)',borderRadius:10,padding:10}}><div style={{color:'var(--text-muted)',fontSize:10}}>FK нарушения</div><div style={{fontSize:18,fontWeight:800,color:Number(d1Diagnostics.foreignKeyViolations?.count||0)?'var(--red)':'var(--mint)'}}>{Number(d1Diagnostics.foreignKeyViolations?.count||0)}</div></div>
          <div style={{background:'var(--surface-2)',borderRadius:10,padding:10}}><div style={{color:'var(--text-muted)',fontSize:10}}>Предупреждения отчёта</div><div style={{fontSize:18,fontWeight:800}}>{(d1Diagnostics.warnings||[]).length}</div></div>
        </div>
        <details style={{borderTop:'1px solid var(--border)',paddingTop:8}}>
          <summary style={{cursor:'pointer',fontWeight:700}}>Подробности отчёта (JSON)</summary>
          <pre style={{maxHeight:340,overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:10.5,lineHeight:1.4,background:'var(--surface-2)',borderRadius:9,padding:9}}>{JSON.stringify(d1Diagnostics, null, 2)}</pre>
        </details>
        <button onClick={copyD1Diagnostics} className="press" style={{width:'100%',border:'1px solid var(--border)',borderRadius:10,padding:'9px 12px',marginTop:10,background:'var(--surface-2)',color:'var(--text)',fontWeight:700}}>Скопировать JSON отчёта</button>
        {d1ReportCopyNotice&&<div role="status" style={{fontSize:11,color:'var(--text-muted)',marginTop:7}}>{d1ReportCopyNotice}</div>}
        {d1ReportCopyText&&<textarea readOnly value={d1ReportCopyText} onFocus={event=>event.currentTarget.select()} rows={7} aria-label="JSON отчёта D1" style={{width:'100%',boxSizing:'border-box',marginTop:8,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:9,padding:8,color:'var(--text)',fontSize:10,lineHeight:1.4}}/>}
        <div style={{color:'var(--text-muted)',marginTop:9}}>Отчёт не является резервной копией. Перед очисткой нужно проверить результаты и сделать отдельный снимок базы.</div>
      </div>}
    </div>
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
    <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12}}>Измените Telegram username нужного человека. Пустое поле — понижение. Новый username должен принадлежать подтверждённому пользователю.</div>
    {rows.length===0?<div><div style={{fontSize:13,color:'var(--text-muted)',padding:'4px 0 10px'}}>Основателей/мэров сейчас нет. Назначить нового может только главный инспектор.</div><input value={ownerAssignTelegramId} onChange={e=>setOwnerAssignTelegramId(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="Telegram ID нового основателя/мэра" style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',fontSize:13,marginBottom:8}}/><button onClick={async()=>{const telegramId=Number(ownerAssignTelegramId);if(!Number.isSafeInteger(telegramId)||telegramId<=0){setError('Укажите корректный Telegram ID');return}try{setSavingId('owner');setError('');const r=await fetch(`${API_BASE}/api/admin/territories/owner`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,territoryId:city.id,telegramId})});const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setOwnerAssignTelegramId('');const next=Array.isArray(d.managers)?d.managers.map(m=>({telegram_id:Number(m.telegram_id),mc_nickname:m.mc_nickname||'',telegram_username:String(m.telegram_username||'').replace(/^@/,''),username:String(m.telegram_username||'').replace(/^@/,'')})):d.owner?[{telegram_id:Number(d.owner.telegram_id),mc_nickname:d.owner.mc_nickname||'',telegram_username:String(d.owner.telegram_username||'').replace(/^@/,''),username:String(d.owner.telegram_username||'').replace(/^@/,'')}]:[];setRows(next);onSaved?.('Основатель/мэр назначен')}catch(e){setError(safeCaughtError(e, 'Не удалось назначить основателя/мэра'))}finally{setSavingId(null)}}} disabled={savingId==='owner'} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'10px 12px',background:'var(--purple)',color:'#fff',fontWeight:700}}>{savingId==='owner'?'Назначение…':'Назначить основателя/мэра'}</button></div>:<div style={{display:'flex',flexDirection:'column',gap:10}}>
      {rows.map(row=><div key={row.telegram_id} style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:14,padding:12}}>
        <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:9}}>
          <AvatarHead nickname={row.mc_nickname} skinUrl={row.skin_url} size={40}/>
          <div style={{flex:1,minWidth:0}}><MinecraftText text={row.mc_nickname||'Без ника'} style={{fontSize:13,fontWeight:700}}/><div style={{fontSize:10.5,color:'var(--mint)'}}>Основатель/мэр</div></div>
          <ShieldCheck size={18} color="var(--mint)"/>
        </div>
        <input value={row.username} onChange={e=>setRows(v=>v.map(x=>x.telegram_id===row.telegram_id?{...x,username:e.target.value}:x))} placeholder="Telegram username" autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{width:'100%',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',fontSize:13,marginBottom:8}}/>
        <button onClick={()=>save(row)} disabled={savingId===row.telegram_id} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'10px 12px',background:'var(--purple)',color:'#fff',fontWeight:700}}>{savingId===row.telegram_id?'Сохранение…':'Сохранить'}</button>
      </div>)}
    </div>}
    {error&&<div style={{fontSize:12,color:'var(--red)',marginTop:10}}>{error}</div>}
  </SimpleModal>;
}
function InventoryGrid({items=[],equippedId=null,onEquip,showEquip=false,emptyText='Инвентарь пуст.'}){
  return <div>{items.length===0?<div style={{fontSize:12,color:'var(--text-muted)'}}>{emptyText}</div>:<div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>{items.map((item,i)=>{
    const style={position:'relative',border:item.item_id===equippedId?'2px solid var(--gold)':'1px solid var(--border)',borderRadius:12,background:'var(--surface-2)',padding:6,cursor:showEquip?'pointer':'default',color:'var(--text)',animationDelay:`${Math.min(i*28,168)}ms`,textAlign:'left'};
    const content=<><div style={{aspectRatio:'1',display:'flex',alignItems:'center',justifyContent:'center'}}>{item.image_data?<img src={item.image_data} alt={item.name} draggable={false} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}/>:<Sparkles size={24} color="var(--text-muted)"/>}</div>{item.item_id===equippedId&&<span style={{position:'absolute',right:4,top:4,width:18,height:18,borderRadius:'50%',background:'var(--gold)',color:'#06120D',display:'flex',alignItems:'center',justifyContent:'center'}}><Check size={11}/></span>}<MinecraftText as="div" text={item.name} style={{fontSize:9.5,lineHeight:1.2,marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}/></>;
    return showEquip
      ? <button type="button" key={`${item.item_id}-${item.telegram_id||''}-${i}`} onClick={()=>onEquip?.(item.item_id)} className="press atlas-item-reveal atlas-inventory-item" style={{...style,borderStyle:'solid'}}>{content}</button>
      : <div key={`${item.item_id}-${item.telegram_id||''}-${i}`} className="atlas-item-reveal atlas-inventory-item" style={style}>{content}</div>;
  })}</div>}</div>;
}

function RecruitmentManagement({territory,initData,onSaved,readOnly=false}) {
  const [description,setDescription]=useState(territory?.recruitment_description||'');
  const [enabled,setEnabled]=useState(Number(territory?.recruitment_enabled||0)===1);
  const [saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  useEffect(()=>{setDescription(territory?.recruitment_description||'');setEnabled(Number(territory?.recruitment_enabled||0)===1)},[territory?.id,territory?.recruitment_description,territory?.recruitment_enabled]);
  async function save(nextEnabled=enabled){
    try{setSaving(true);setError('');const r=await fetch(`${API_BASE}/api/recruitment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData,territoryId:territory.id,ownerNickname:territory.owner,description:description.trim(),enabled:nextEnabled,recruitmentUsername:territory.recruitment_username||territory.recruitment_contact_username||''})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setEnabled(nextEnabled);setNotice(nextEnabled?'Объявление опубликовано':'Объявление скрыто');onSaved?.()}catch(e){setError(safeCaughtError(e, 'Не удалось сохранить объявление'))}finally{setSaving(false)}}
  return <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:14,marginBottom:12}}>
    <div className="atlas-display" style={{fontSize:16,fontWeight:700,marginBottom:8}}>Набор</div>
    <textarea value={description} onChange={e=>setDescription(e.target.value)} readOnly={readOnly} placeholder={readOnly?'':'Дополнительный текст объявления'} rows={5} style={{width:'100%',boxSizing:'border-box',resize:'none',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',fontSize:13,marginBottom:8,cursor:readOnly?'default':'text'}}/>
    {!readOnly&&<>
      <div style={{display:'flex',gap:8}}>
        <button onClick={()=>save(true)} disabled={saving||!description.trim()} className="press" style={{flex:1,border:'none',borderRadius:10,padding:'10px 8px',background:'var(--purple)',color:'#fff',fontWeight:700}}>{saving?'Сохранение…':'Опубликовать'}</button>
        <button onClick={()=>save(false)} disabled={saving||!description.trim()} className="press" style={{flex:1,border:'1px solid var(--border)',borderRadius:10,padding:'10px 8px',background:'var(--surface-2)',color:'var(--text)',fontWeight:700}}>Скрыть</button>
      </div>
      {error&&<div style={{fontSize:11.5,color:'var(--red)',marginTop:6}}>{error}</div>}
      {notice&&<FixedToast key={notice} message={notice}/>}
    </>}
  </div>;
}
function CityManagementProfile({territory,managerTerritories=[],initData,tgUser,onChanged,readOnly=false}={}){
  const [name,setName]=useState(territory?.name||''),[additionalInfo,setAdditionalInfo]=useState(String(territory?.additional_info||'').slice(0,542)),[members,setMembers]=useState([]),[managers,setManagers]=useState([]),[invites,setInvites]=useState([]),[residentNick,setResidentNick]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[inventory,setInventory]=useState(null),[newRecruitmentUsername,setNewRecruitmentUsername]=useState(''),[leaveBusy,setLeaveBusy]=useState(false);
  useEffect(()=>{setName(territory?.name||'');setAdditionalInfo(String(territory?.additional_info||'').slice(0,542))},[territory?.name,territory?.additional_info]);
  async function load(){if(!territory)return;try{setError('');const h={'X-Telegram-Init-Data':initData};const [mr,ir]=await Promise.all([fetch(`${API_BASE}/api/city/management?territoryId=${encodeURIComponent(territory.id)}`,{headers:h,cache:'no-store'}),fetch(`${API_BASE}/api/customization?scope=profile&territoryId=${encodeURIComponent(territory.id)}`,{headers:h,cache:'no-store'})]);const md=await mr.json().catch(() => null),id=await ir.json().catch(() => null);if(!mr.ok||!md.ok)throw new Error(apiErrorMessage(mr, md, "Операция не выполнена."));if(!ir.ok||!id.ok)throw new Error(apiErrorMessage(ir, id, "Операция не выполнена."));setMembers(md.members||[]);setManagers(md.managers||[]);setInvites(md.invites||[]);setInventory(id);setNewRecruitmentUsername(md.recruitmentUsername||'')}catch(e){setError(safeCaughtError(e, 'Не удалось загрузить данные города'))}}
  useEffect(()=>{load()},[territory?.id]);
  async function post(path,body,success){try{const r=await fetch(`${API_BASE}${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,...body})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setNotice(success);await load();onChanged?.()}catch(e){setError(safeCaughtError(e, 'Операция не выполнена'))}}
  async function rename(){const n=name.trim();if(!n||n===territory.name)return;await post('/api/admin/territories/rename',{territoryId:territory.id,name:n},'Название города изменено')}
  async function saveAdditionalInfo(){await post('/api/city/additional-info',{territoryId:territory.id,additionalInfo},'Дополнительная информация сохранена')}
  async function addResident(){const n=residentNick.trim();if(!n)return;await post('/api/city/invite',{territoryId:territory.id,nickname:n},'Приглашение отправлено');setResidentNick('')}
  async function removeResident(id){await post('/api/city/remove-resident',{territoryId:territory.id,telegramId:Number(id)},'Житель исключён')}
  async function promoteResident(id){await post('/api/city/promote-resident',{territoryId:territory.id,telegramId:Number(id)},'Запрос на повышение отправлен')}
  async function demoteManager(id){if(window.confirm('Понизить этого основателя/мэра до жителя?'))await post('/api/city/demote-manager',{territoryId:territory.id,telegramId:Number(id)},'Запрос на понижение отправлен')}
  async function setRecruitmentUsername(id){await post('/api/recruitment/contact',{territoryId:territory.id,telegramId:Number(id)},'Username для объявления обновлён')}
  async function cancelInvite(id){await post('/api/city/invite/cancel',{inviteId:id},'Приглашение отменено')}
  async function requestInspectorRating(){await post('/api/request-inspector-rating',{territoryId:territory.id},'Запрос отправлен инспекторам')}
  async function leaveTerritory(){
    if(!readOnly||leaveBusy||!window.confirm(`Покинуть территорию «${territory.name}»?`))return;
    try{
      setLeaveBusy(true);setError('');
      const response=await fetch(`${API_BASE}/api/city/leave`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,territoryId:String(territory.id)})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось покинуть территорию.'));
      await onChanged?.();
    }catch(error){setError(safeCaughtError(error,'Не удалось покинуть территорию.'));}finally{setLeaveBusy(false)}
  }
  async function equip(itemId,mode='marker'){
    const equippedId=mode==='cover'?inventory?.equippedBackgroundItemId:inventory?.equippedMarkerItemId;
    const nextId=mode==='cover' && String(equippedId||'')===String(itemId||'') ? null : itemId;
    const body=mode==='cover'?{backgroundItemId:nextId}:{markerItemId:nextId};
    await post('/api/customization/city',{territoryId:territory.id,...body},mode==='cover'?(nextId?'Обложка города обновлена':'Обложка снята'):(nextId?'Метка города обновлена':'Метка города снята'));
    setInventory(v=>v?{...v,...(mode==='cover'?{equippedBackgroundItemId:nextId}:{equippedMarkerItemId:nextId})}:v);
  }
  if(!territory)return null;
  return <div className="atlas-page-panel" style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:14,marginBottom:12}}>
    <MinecraftText text={territory.name} as="div" className="atlas-display" style={{fontSize:16,fontWeight:700,marginBottom:12}}/>
    <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:6}}>Название</div><div style={{display:'flex',gap:8,marginBottom:4}}><input value={name} readOnly={readOnly} onChange={e=>setName(e.target.value)} style={{flex:1,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',fontSize:13,cursor:readOnly?'default':'text'}}/>{!readOnly&&<button onClick={rename} className="press" style={iconBtn('var(--purple)','#fff',true)}><Pencil size={15}/></button>}</div>
    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:12,marginBottom:6}}>Доп. информация</div>
    <textarea value={additionalInfo} readOnly={readOnly} onChange={e=>setAdditionalInfo(e.target.value.slice(0,542))} rows={4} maxLength={542} placeholder={readOnly?'':'Дополнительная информация о территории (необязательно)'} style={{width:'100%',boxSizing:'border-box',resize:'none',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',fontSize:13,marginBottom:4,cursor:readOnly?'default':'text'}} />
    {!readOnly&&<button onClick={saveAdditionalInfo} disabled={additionalInfo===String(territory?.additional_info||'')} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'10px 12px',marginTop:8,marginBottom:14,background:'var(--purple)',color:'#fff',fontWeight:700}}>Сохранить доп. информацию</button>}
    {managers.length>0&&<div style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:14,padding:12,marginBottom:14}}><div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Основатели/мэры</div>{managers.map(m=><div key={m.telegram_id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderTop:'1px solid var(--border)'}}><AvatarHead nickname={m.mc_nickname} skinUrl={m.skin_url} size={32}/><div style={{flex:1,minWidth:0}}><MinecraftText as="div" text={m.mc_nickname||'Без ника'} style={{fontSize:12.5,fontWeight:700}}/><div style={{fontSize:10.5,color:'var(--text-muted)'}}>{m.telegram_username?`@${String(m.telegram_username).replace(/^@/,'')}`:'Username не указан'}</div></div>{!readOnly&&managers.length>1&&<button onClick={()=>demoteManager(m.telegram_id)} className="press" style={{border:'none',background:'var(--red-soft)',color:'var(--red)',borderRadius:8,padding:'6px 8px',fontSize:10.5}}>Понизить</button>}{!readOnly&&managers.length>1&&(()=>{const currentContact=String(newRecruitmentUsername||'').replace(/^@/,'').trim().toLowerCase();const managerUsername=String(m.telegram_username||'').replace(/^@/,'').trim().toLowerCase();const inAnnouncement=Boolean(currentContact&&managerUsername&&currentContact===managerUsername);return <button onClick={()=>!inAnnouncement&&setRecruitmentUsername(m.telegram_id)} disabled={inAnnouncement} className="press" style={{border:'1px solid var(--border)',background:inAnnouncement?'var(--surface-3)':'var(--purple)',color:inAnnouncement?'var(--text-muted)':'#fff',borderRadius:8,padding:'6px 8px',fontSize:10.5,opacity:inAnnouncement?1:.98}}>{inAnnouncement?'В объявлении':'В объявление'}</button>})()}</div>)}</div>}
    <div style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:14,padding:12,marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Жители</div>
      {!readOnly&&<div style={{display:'flex',gap:8,marginBottom:10}}><input value={residentNick} onChange={e=>setResidentNick(e.target.value)} placeholder="Ник Minecraft" style={{flex:1,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'9px 12px',color:'var(--text)',fontSize:13}}/><button onClick={addResident} className="press" style={iconBtn('var(--purple)','#fff',true)}><UserPlus size={15}/></button></div>}
      <div style={{display:'flex',flexDirection:'column',gap:7}}>{members.map(m=><div key={m.telegram_id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderTop:'1px solid var(--border)'}}><AvatarHead nickname={m.mc_nickname} skinUrl={m.skin_url} size={32}/><div style={{flex:1,minWidth:0}}><MinecraftText as="div" text={m.mc_nickname||'Без ника'} style={{fontSize:12.5,fontWeight:700}}/><div style={{fontSize:10.5,color:'var(--text-muted)'}}>{m.telegram_username?`@${String(m.telegram_username).replace(/^@/,'')}`:'Username не указан'}</div></div>{!readOnly&&<><button onClick={()=>promoteResident(m.telegram_id)} className="press" title="Повысить до основателя/мэра" style={{border:'none',background:'var(--gold-soft)',color:'var(--gold)',borderRadius:8,padding:'6px 8px',fontSize:10.5}}><ChevronUp size={14}/></button><button onClick={()=>removeResident(m.telegram_id)} className="press" title="Удалить" style={{border:'none',background:'var(--red-soft)',color:'var(--red)',borderRadius:8,padding:'6px 8px'}}><X size={13}/></button></>}</div>)}{invites.map(inv=><div key={inv.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderTop:'1px solid var(--border)'}}><div style={{width:32,height:32,borderRadius:'50%',background:'var(--gold-soft)',display:'flex',alignItems:'center',justifyContent:'center',flex:'0 0 auto'}}><Clock size={14} color="var(--gold)"/></div><div style={{flex:1,minWidth:0}}><MinecraftText as="div" text={inv.target_nickname} style={{fontSize:12.5,fontWeight:700}}/><div style={{fontSize:10.5,color:'var(--gold)'}}>Ожидает ответа</div></div>{!readOnly&&<button onClick={()=>cancelInvite(inv.id)} className="press" style={{border:'none',background:'transparent',color:'var(--red)',padding:6}}><X size={14}/></button>}</div>)}{!members.length&&!invites.length&&<div style={{fontSize:12,color:'var(--text-muted)',paddingTop:4}}>Жителей и приглашений пока нет.</div>}</div>
    </div>
    <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Оформление территории</div>
    <div style={{fontSize:11.5,color:'var(--text-muted)',marginBottom:7}}>Метка</div>
    <InventoryGrid items={(inventory?.cityInventory||[]).filter(i=>String(i.category_name||'').toLowerCase()==='метка'||String(i.categories_text||'').toLowerCase().split(',').map(x=>x.trim()).includes('метка'))} equippedId={inventory?.equippedMarkerItemId} showEquip={!readOnly} onEquip={id=>equip(id,'marker')} emptyText="Доступных меток нет."/>
    <div style={{fontSize:11.5,color:'var(--text-muted)',margin:'12px 0 7px'}}>Обложка</div>
    <div style={{marginBottom:14}}><InventoryGrid items={(inventory?.cityInventory||[]).filter(i=>String(i.category_name||'').toLowerCase()==='обложка'||String(i.categories_text||'').toLowerCase().split(',').map(x=>x.trim()).includes('обложка'))} equippedId={inventory?.equippedBackgroundItemId} showEquip={!readOnly} onEquip={id=>equip(id,'cover')} emptyText="Доступных обложек нет."/></div>
    <RecruitmentManagement territory={{...territory,recruitment_username:newRecruitmentUsername}} initData={initData} onSaved={load} readOnly={readOnly}/>
    {readOnly&&<button onClick={leaveTerritory} disabled={leaveBusy} className="press" style={{width:'100%',height:48,minWidth:72,padding:'0 12px',border:'1px solid var(--red)',borderRadius:14,background:'var(--red-soft)',color:'var(--red)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,marginBottom:12}}>{leaveBusy?'Выход…':'Покинуть территорию'}</button>}
    {!readOnly&&<button onClick={requestInspectorRating} className="press" style={{width:'100%',border:'none',borderRadius:10,padding:'10px 12px',background:'var(--purple)',color:'#fff',fontWeight:700,marginBottom:16,minHeight:44}}>Запросить оценку инспектора</button>}
    {error&&<div style={{fontSize:12,color:'var(--red)',marginTop:10}}>{error}</div>}
    {notice&&<FixedToast key={notice} message={notice}/>}
  </div>;
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
  return <div className="atlas-page-panel" style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:14,marginBottom:12}}>
    <div className="atlas-display" style={{fontSize:16,fontWeight:700,marginBottom:5}}>{territory?<>Инвентарь визуала — <MinecraftText text={territory.name}/></>:'Покупки'}</div>
    {loading&&!data?<div role="status" style={{fontSize:12,color:'var(--text-muted)',padding:'9px 0'}}>Загрузка покупок…</div>
      : error&&!data?<div role="alert" style={{fontSize:12,color:'var(--red)',padding:'9px 0'}}>{error}</div>
      : <InventoryGrid items={items} emptyText={territory?'Инвентарь визуала пуст.':'Покупок пока нет.'}/>}
  </div>;
}
function TreasuryCard({city,initData,tgUser}={}){
  const [data,setData]=useState(null),[amount,setAmount]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function load(){if(!city)return;try{setError('');const r=await fetch(`${API_BASE}/api/treasury?territoryId=${encodeURIComponent(city.id)}`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setData(d)}catch(e){setError(safeCaughtError(e, 'Не удалось загрузить казну'))}}
  useEffect(()=>{load()},[city?.id,initData]);
  async function deposit(){const n=Math.floor(Number(amount));if(!Number.isSafeInteger(n)||n<=0){setError('');return}const operation=getFinancialOperationToken('treasury-deposit',city.id,n);if(operation.blocked){setError(`Предыдущая операция на ${operation.amount} сц ещё не подтверждена. Верните прежнюю сумму и повторите попытку.`);return}try{setBusy(true);setError('');setNotice('');const r=await fetch(`${API_BASE}/api/treasury/deposit`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,territoryId:city.id,amount:n,operationId:operation.id})}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok){if([400,401,403,404,422].includes(r.status))clearFinancialOperationToken(operation);throw new Error(apiErrorMessage(r,d,"Операция не выполнена."));}clearFinancialOperationToken(operation);setData(d);setAmount('');setNotice('Казна пополнена');window.dispatchEvent(new Event('voxygen:currency-changed'))}catch(e){setError(safeCaughtError(e, 'Не удалось пополнить казну'))}finally{setBusy(false)}}
  if(!city)return null;
  return <div className="atlas-page-panel" style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginBottom:12}}>
    <div className="atlas-display" style={{fontSize:18,fontWeight:800,marginBottom:5}}>Казна: <MinecraftText text={city.name}/></div>
    <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:14}}>Пополнение этого счёта доступно всем жителям города.</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
      <div style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:14,padding:'11px 12px'}}><div style={{fontSize:12,color:'var(--text-muted)',fontWeight:700,marginBottom:6}}>В казне</div><div className="atlas-display" style={{fontSize:22,fontWeight:800,color:'var(--gem)',display:'flex',alignItems:'center',gap:6}}>{data?.balance??0}<GemHex/></div></div>
      <div style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:14,padding:'11px 12px'}}><div style={{fontSize:12,color:'var(--text-muted)',fontWeight:700,marginBottom:6}}>Ваш баланс</div><div className="atlas-display" style={{fontSize:22,fontWeight:800,color:'var(--gem)',display:'flex',alignItems:'center',gap:6}}>{data?.personal_balance??0}<GemHex/></div></div>
    </div>
    <div style={{display:'flex',gap:8}}><input value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="Количество сц" style={{flex:1,minWidth:0,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:12,padding:'11px 12px',color:'var(--text)',fontSize:14}}/><button onClick={deposit} disabled={busy||!amount} className="press" style={{border:'none',borderRadius:12,padding:'10px 14px',background:'var(--purple)',color:'#fff',fontWeight:750,whiteSpace:'nowrap'}}>{busy?'…':'Пополнить казну'}</button></div>
    {error&&<div style={{fontSize:12,color:'var(--red)',marginTop:9}}>{error}</div>}
    {notice&&<FixedToast key={notice} message={notice}/>}
  </div>;
}
function SettingsToggle({ checked, onChange, disabled = false, label, description }) {
  return <div style={{display:'flex',alignItems:'center',gap:12,padding:'11px 0',opacity:disabled?0.48:1}}>
    <div style={{flex:1,minWidth:0}}><div style={{fontSize:13.5,fontWeight:650,color:'var(--text)',lineHeight:1.3}}>{label}</div>{description&&<div style={{fontSize:11.5,color:'var(--text-muted)',lineHeight:1.4,marginTop:4}}>{description}</div>}</div>
    <button type="button" role="switch" aria-checked={Boolean(checked)} disabled={disabled} onClick={()=>onChange(!checked)} className="press" style={{width:48,height:28,borderRadius:999,border:`1px solid ${checked?'var(--purple-border)':'var(--border)'}`,background:checked?'var(--purple-soft)':'var(--surface-2)',padding:3,display:'flex',alignItems:'center',justifyContent:checked?'flex-end':'flex-start',flexShrink:0,cursor:disabled?'default':'pointer'}}><span style={{width:20,height:20,borderRadius:'50%',background:checked?'var(--purple)':'var(--text-muted)',display:'block',transition:'all .16s'}}/></button>
  </div>;
}

function normalizeTheme(value){return String(value??'vox').trim().toLowerCase()==='aurora'?'aurora':'vox';}
function normalizeTimezoneOffset(value){
  const raw=String(value??'').replace(/[\u0000-\u001F\u007F]/g,'').trim().toUpperCase();
  const offset=raw.startsWith('UTC')?raw.slice(3).trim():raw;
  const match=offset.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  if(!match)return 'UTC+3';
  const sign=match[1],hours=Number(match[2]),minutes=Number(match[3]||0);
  const maxHours=sign==='-'?12:14;
  if(hours>maxHours||minutes%15!==0||minutes>=60)return 'UTC+3';
  if((hours===14&&(sign!=='+'||minutes!==0))||(sign==='-'&&hours===12&&minutes!==0))return 'UTC+3';
  return `UTC${sign}${hours}${minutes?`:${String(minutes).padStart(2,'0')}`:''}`;
}
function ProfileSettingsModal({ initData, onClose, onSaved }) {
  const [settings,setSettings] = useState(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const { closing, requestClose } = useAnimatedClose(onClose, 175);
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      try{
        setLoading(true);setError('');
        const response=await fetch(`${API_BASE}/api/user-settings`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
        const data=await response.json().catch(()=>null);
        if(!response.ok||!data?.ok||!data?.settings)throw new Error(apiErrorMessage(response,data,'Не удалось загрузить настройки.'));
        if(!cancelled)setSettings({...data.settings,defaultTheme:normalizeTheme(data.settings.defaultTheme),personalMapZoomPercent:normalizeMapZoomPercent(data.settings.personalMapZoomPercent??data.settings.mapZoomPercent),timezone:normalizeTimezoneOffset(data.settings.timezone),territories:Array.isArray(data.settings.territories)?data.settings.territories:[]});
      }catch(e){if(!cancelled)setError(safeCaughtError(e,'Не удалось загрузить настройки.'));}
      finally{if(!cancelled)setLoading(false);}
    }
    load();return()=>{cancelled=true};
  },[initData]);
  function patch(values){setSettings(current=>current?{...current,...values}:current)}
  function changeTerritory(id,enabled){setSettings(current=>current?{...current,territories:(current.territories||[]).map(item=>String(item.id)===String(id)?{...item,enabled}:item)}:current)}
  function keepUtcPrefix(value){const raw=String(value??'');const rest=raw.toUpperCase().startsWith('UTC')?raw.slice(3):raw.replace(/^U?T?C?/i,'');return `UTC${rest}`.slice(0,24)}
  async function save(){
    if(!settings)return;
    try{
      setSaving(true);setError('');
      const payload={defaultTheme:normalizeTheme(settings.defaultTheme),mapZoomPercent:normalizeMapZoomPercent(settings.personalMapZoomPercent),timezone:normalizeTimezoneOffset(settings.timezone),eventNotifications:Boolean(settings.eventNotifications),territories:(settings.territories||[]).map(item=>({id:String(item.id),enabled:Boolean(item.enabled)}))};
      const response=await fetch(`${API_BASE}/api/user-settings`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({...payload,initData})});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||!data?.settings)throw new Error(apiErrorMessage(response,data,'Не удалось сохранить настройки.'));
      onSaved?.(data.settings);requestClose();
    }catch(e){setError(safeCaughtError(e,'Не удалось сохранить настройки.'));}
    finally{setSaving(false);}
  }
  return <div className={`atlas-overlay${closing?' atlas-closing':''}`} style={{position:'fixed',inset:0,zIndex:130,background:'rgba(0,0,0,.82)',display:'flex',alignItems:'center',justifyContent:'center',padding:'18px 14px'}} onClick={requestClose}>
    <div onClick={e=>e.stopPropagation()} className={`atlas-modal-shell${closing?' atlas-closing':''}`} style={{width:'min(448px,100%)',maxHeight:'84vh',overflowY:'auto',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:22,padding:18,boxSizing:'border-box'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:16}}><div className="atlas-display" style={{fontSize:19,fontWeight:750}}>Настройки</div><button onClick={requestClose} className="press" aria-label="Закрыть настройки" style={iconBtn('var(--surface-2)','var(--text-muted)')}><X size={16}/></button></div>
      {loading?<div style={{padding:'24px 0',textAlign:'center',fontSize:13,color:'var(--text-muted)'}}>Загрузка настроек…</div>:!settings?<div style={{fontSize:12.5,color:'var(--red)',lineHeight:1.5}}>{error||'Настройки недоступны.'}<button onClick={()=>{setSettings(null);setError('');setLoading(true);const init=initData;fetch(`${API_BASE}/api/user-settings`,{headers:{'X-Telegram-Init-Data':init},cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось загрузить настройки.'));setSettings({...d.settings,defaultTheme:normalizeTheme(d.settings.defaultTheme),personalMapZoomPercent:normalizeMapZoomPercent(d.settings.personalMapZoomPercent??d.settings.mapZoomPercent),timezone:normalizeTimezoneOffset(d.settings.timezone),territories:Array.isArray(d.settings.territories)?d.settings.territories:[]});}).catch(e=>setError(safeCaughtError(e,'Не удалось загрузить настройки.'))).finally(()=>setLoading(false));}} className="press" style={{display:'block',marginTop:10,padding:'8px 12px',borderRadius:10,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontWeight:700}}>Повторить</button></div>:<>
        <div style={{fontSize:15,fontWeight:750,marginBottom:8}}>Основные</div>
        <div style={{fontSize:12,color:'var(--text-muted)',fontWeight:700,marginBottom:7}}>Тема по умолчанию</div>
        <select value={normalizeTheme(settings.defaultTheme)} disabled={Boolean(settings.globalOverrides?.theme)} onChange={e=>patch({defaultTheme:normalizeTheme(e.target.value)})} style={{width:'100%',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:11,padding:'11px 12px',color:'var(--text)',fontSize:14,marginBottom:settings.globalOverrides?.theme?6:14}}>
          <option value="vox">Vox</option><option value="aurora">Aurora</option>
        </select>
        {settings.globalOverrides?.theme&&<div style={{fontSize:11,color:'var(--purple)',marginBottom:14}}>Главный инспектор временно установил тему {settings.theme==='aurora'?'Aurora':'Vox'}. Личный выбор сохранён.</div>}
        <div style={{fontSize:12,color:'var(--text-muted)',fontWeight:700,marginBottom:7}}>Масштаб карты</div>
        <input type="range" min="1" max="100" step="1" value={settings.personalMapZoomPercent??100} disabled={Boolean(settings.globalOverrides?.mapZoomPercent)} onChange={e=>patch({personalMapZoomPercent:normalizeMapZoomPercent(e.target.value)})} style={{width:'100%',accentColor:'var(--purple)',margin:'4px 0 2px'}}/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)',marginBottom:6}}><span>1% · приближение</span><strong style={{color:'var(--text)'}}>{settings.personalMapZoomPercent??100}%</strong><span>100% · обзор</span></div>
        {settings.globalOverrides?.mapZoomPercent&&<div style={{fontSize:11,color:'var(--purple)',marginBottom:14}}>Глобально установлено {settings.mapZoomPercent}%. Ваш личный масштаб сохранён и восстановится после отмены или окончания срока.</div>}
        <div style={{fontSize:12,color:'var(--text-muted)',fontWeight:700,marginBottom:6}}>Часовой пояс</div>
        <input value={settings.timezone||'UTC+3'} onChange={e=>patch({timezone:keepUtcPrefix(e.target.value)})} onBlur={()=>patch({timezone:normalizeTimezoneOffset(settings.timezone)})} placeholder="UTC+3" aria-label="Часовой пояс" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:11,padding:'11px 12px',color:'var(--text)',fontSize:14,marginBottom:16}}/>
        <div style={{fontSize:15,fontWeight:750,marginBottom:4}}>Уведомления</div>
        <div style={{borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)',marginBottom:9}}>
          <SettingsToggle label="Уведомления о новых ивентах" description="Сообщение от бота при создании каждого нового ивента" checked={Boolean(settings.eventNotifications)} onChange={enabled=>patch({eventNotifications:enabled})}/>
        </div>
        {(settings.territories||[]).length>0&&<div style={{fontSize:12,color:'var(--text-muted)',fontWeight:700,marginBottom:4}}>Уведомления территорий</div>}
        {(settings.territories||[]).map(item=><div key={item.id} style={{borderBottom:'1px solid var(--border)'}}><SettingsToggle label={<span>Территория <MinecraftText text={item.name}/></span>} description={item.role==='manager'?'Основатель/мэр':'Житель'} checked={Boolean(item.enabled)} onChange={enabled=>changeTerritory(item.id,enabled)}/></div>)}
        {error&&<div role="alert" style={{fontSize:12,color:'var(--red)',marginTop:10}}>{error}</div>}
        <button onClick={save} disabled={saving} className="press" style={{width:'100%',marginTop:16,padding:'12px',border:'none',borderRadius:12,background:'var(--purple)',color:'#fff',fontSize:14,fontWeight:750}}>{saving?'Сохранение…':'Сохранить настройки'}</button>
      </>}
    </div>
  </div>;
}

function GlobalSettingsPanel({ initData, onSettingsChanged }) {
  const [entries,setEntries] = useState([]);
  const [mapZoom,setMapZoom] = useState(100);
  const [theme,setTheme] = useState('vox');
  const [mapDuration,setMapDuration] = useState('1440');
  const [themeDuration,setThemeDuration] = useState('1440');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  async function load() {
    try {
      setLoading(true); setError('');
      const response = await fetch(`${API_BASE}/api/admin/global-settings`, {
        headers: { 'X-Telegram-Init-Data': initData }, cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(apiErrorMessage(response,data,'Не удалось загрузить глобальные настройки.'));
      const rows = Array.isArray(data.settings) ? data.settings : [];
      setEntries(rows);
      const zoom = rows.find(row => row.key==='map_zoom');
      const currentTheme = rows.find(row => row.key==='theme');
      if (zoom) setMapZoom(normalizeMapZoomPercent(zoom.value));
      if (currentTheme) setTheme(normalizeTheme(currentTheme.value));
    } catch (e) {
      setError(safeCaughtError(e,'Не удалось загрузить глобальные настройки.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (initData) load(); }, [initData]);

  async function refreshEffectiveSettings() {
    const response = await fetch(`${API_BASE}/api/user-settings`, {
      headers: { 'X-Telegram-Init-Data': initData }, cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok && data?.settings) onSettingsChanged?.(data.settings);
  }

  async function save(key,value,duration) {
    try {
      setBusy(key); setError(''); setNotice('');
      const response = await fetch(`${API_BASE}/api/admin/global-settings`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'X-Telegram-Init-Data':initData },
        body: JSON.stringify({ initData, key, value, durationMinutes: duration==='permanent' ? null : Number(duration) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(apiErrorMessage(response,data,'Не удалось сохранить глобальную настройку.'));
      setEntries(Array.isArray(data.settings)?data.settings:[]);
      await refreshEffectiveSettings();
      setNotice('Глобальная настройка применена');
    } catch (e) {
      setError(safeCaughtError(e,'Не удалось сохранить глобальную настройку.'));
    } finally {
      setBusy('');
    }
  }

  async function clear(key) {
    try {
      setBusy(key); setError(''); setNotice('');
      const response = await fetch(`${API_BASE}/api/admin/global-settings`, {
        method:'POST',
        headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},
        body:JSON.stringify({initData,key,clear:true}),
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось отменить глобальную настройку.'));
      setEntries(Array.isArray(data.settings)?data.settings:[]);
      await refreshEffectiveSettings();
      setNotice('Глобальное переопределение отменено. Личные настройки восстановлены.');
    } catch(e) {
      setError(safeCaughtError(e,'Не удалось отменить глобальную настройку.'));
    } finally {
      setBusy('');
    }
  }

  const active = key => entries.find(row=>row.key===key&&row.active);
  const status = key => {
    const row=entries.find(item=>item.key===key);
    if(!row)return 'Не задано';
    if(!row.active)return 'Срок действия истёк; используется личная настройка';
    if(row.expiresAt==null)return 'Действует постоянно';
    return 'Действует до '+new Date(Number(row.expiresAt)).toLocaleString('ru-RU');
  };
  const durationOptions = [
    {value:'60',label:'1 час'}, {value:'360',label:'6 часов'}, {value:'1440',label:'24 часа'},
    {value:'10080',label:'7 дней'}, {value:'525600',label:'1 год'}, {value:'permanent',label:'Навсегда'},
  ];
  const selectStyle={width:'100%',minHeight:42,boxSizing:'border-box',border:'1px solid var(--border)',borderRadius:10,background:'var(--surface-2)',color:'var(--text)',padding:'9px 10px',fontSize:13};
  const sectionStyle={borderTop:'1px solid var(--border)',paddingTop:12,marginTop:12};
  return <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:15,marginTop:14,marginBottom:12}}>
    <div className="atlas-display" style={{fontSize:16,fontWeight:800,marginBottom:4}}>Глобальные настройки</div>
    <div style={{fontSize:11.5,color:'var(--text-muted)',lineHeight:1.45}}>Временные значения имеют приоритет над личными настройками всех пользователей. После окончания срока личные значения автоматически восстановятся.</div>
    {loading?<div style={{padding:12,color:'var(--text-muted)',fontSize:12}}>Загрузка…</div>:<>
      <div style={sectionStyle}>
        <div style={{fontSize:13,fontWeight:750,marginBottom:4}}>Масштаб карты</div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>{status('map_zoom')}</div>
        <input type="range" min="1" max="100" step="1" value={mapZoom} onChange={e=>setMapZoom(normalizeMapZoomPercent(e.target.value))} style={{width:'100%',accentColor:'var(--purple)'}}/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)',marginBottom:9}}><span>1% · приближение</span><strong style={{color:'var(--text)'}}>{mapZoom}%</strong><span>100% · обзор</span></div>
        <label style={{display:'block',marginBottom:5}}>Срок действия</label>
        <select value={mapDuration} onChange={e=>setMapDuration(e.target.value)} style={selectStyle}>
          {durationOptions.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <div style={{display:'flex',gap:8,marginTop:9}}>
          <button onClick={()=>save('map_zoom',mapZoom,mapDuration)} disabled={Boolean(busy)} className="press" style={{flex:1,minHeight:40,border:0,borderRadius:10,background:'var(--purple)',color:'#fff',fontWeight:750}}>{busy==='map_zoom'?'Сохранение…':'Применить всем'}</button>
          <button onClick={()=>clear('map_zoom')} disabled={Boolean(busy)||!active('map_zoom')} className="press" style={{minHeight:40,border:'1px solid var(--border)',borderRadius:10,padding:'0 11px',background:'var(--surface-2)',color:'var(--text)',fontWeight:700}}>Снять</button>
        </div>
      </div>
      <div style={sectionStyle}>
        <div style={{fontSize:13,fontWeight:750,marginBottom:4}}>Тема приложения</div>
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>{status('theme')}</div>
        <select value={theme} onChange={e=>setTheme(normalizeTheme(e.target.value))} style={selectStyle}>
          <option value="vox">Vox</option><option value="aurora">Aurora</option>
        </select>
        <label style={{display:'block',marginTop:9,marginBottom:5}}>Срок действия</label>
        <select value={themeDuration} onChange={e=>setThemeDuration(e.target.value)} style={selectStyle}>
          {durationOptions.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <div style={{display:'flex',gap:8,marginTop:9}}>
          <button onClick={()=>save('theme',theme,themeDuration)} disabled={Boolean(busy)} className="press" style={{flex:1,minHeight:40,border:0,borderRadius:10,background:'var(--purple)',color:'#fff',fontWeight:750}}>{busy==='theme'?'Сохранение…':'Применить всем'}</button>
          <button onClick={()=>clear('theme')} disabled={Boolean(busy)||!active('theme')} className="press" style={{minHeight:40,border:'1px solid var(--border)',borderRadius:10,padding:'0 11px',background:'var(--surface-2)',color:'var(--text)',fontWeight:700}}>Снять</button>
        </div>
      </div>
    </>}
    {error&&<div role="alert" style={{fontSize:12,color:'var(--red)',marginTop:10}}>{error}</div>}
    {notice&&<div role="status" style={{fontSize:12,color:'var(--mint)',marginTop:10}}>{notice}</div>}
  </div>;
}

function ProfileScreen({ profile, profileLoadState, profileLoadError, claimNickname, role, tgUser, refreshProfile, territories, onTerritoriesChanged, onMapSaved, onFaqSaved, onSettingsSaved }) {
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
  return <div className="atlas-page atlas-page--profile" style={{padding:'18px 16px 40px',minHeight:'60vh'}}>
    <div className="atlas-display atlas-page-title" style={{fontSize:22,fontWeight:700,marginBottom:4}}>Профиль</div>
    {profileLoadError&&<div role="status" style={{display:'flex',alignItems:'center',gap:10,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:12,padding:12,marginBottom:12,fontSize:12.5,lineHeight:1.45}}><span style={{flex:1,color:'var(--text-muted)'}}>{profileLoadError}{profileLoadState!=='error'?' Последние подтверждённые данные сохранены.':''}</span><button onClick={refreshProfile} className="press" style={{border:'1px solid var(--border)',borderRadius:10,background:'var(--surface)',color:'var(--text)',padding:'8px 10px',fontWeight:700,flexShrink:0}}>Повторить</button></div>}
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:16,marginBottom:12}}><div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}><AvatarHead nickname={profile.status==='verified'?profile.nickname:null} skinUrl={profile.status==='verified'?profile.skinUrl:null} size={46}/><div><div style={{fontSize:15,fontWeight:600}}>{profileLoadState==='error'?'Профиль временно недоступен':<MinecraftText text={profile.nickname||'Ник не указан'}/>}</div>{isInspector?<div style={{fontSize:11.5,color:'var(--gold)',display:'flex',alignItems:'center',gap:4,fontWeight:700}}><ShieldCheck size={12}/>{isMainInspector?'Главный инспектор':'Инспектор'}</div>:profile.status==='verified'?<div style={{fontSize:11.5,color:'var(--emerald)'}}>Ник подтверждён</div>:profile.status==='pending'?<div style={{fontSize:11.5,color:'var(--gold)'}}>Ожидает подтверждения инспектора</div>:<div style={{fontSize:11.5,color:'var(--text-muted)'}}>Ник в Minecraft</div>}</div><button type="button" onClick={()=>setSettingsOpen(true)} className="press" aria-label="Настройки профиля" title="Настройки" style={{marginLeft:'auto',flexShrink:0,width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--border)',borderRadius:12,background:'var(--surface-2)',color:'var(--text-muted)'}}><Settings size={18}/></button></div><div style={{fontSize:11.5,color:'var(--text-muted)',marginBottom:10}}>Telegram: {tgUser?`@${tgUser.username||'—'} · id ${tgUser.id}`:'не определён'}</div>{!isInspector&&profileLoadState==='needs_nickname'&&profile.status!=='verified'&&<><div style={{display:'flex',gap:8}}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Ваш ник в Minecraft" style={{flex:1,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',color:'var(--text)',fontSize:13}}/><button onClick={submit} className="press" style={iconBtn('var(--purple)','#fff',true)}><Pencil size={15}/></button></div>{error&&<div style={{fontSize:12,color:'var(--red)',marginTop:8}}>{error}</div>}</>}</div>
    <ProfileInventory initData={initData} role={role} tgUser={tgUser}/>
    {!isInspector&&userCitiesForTreasury.map(city=><TreasuryCard key={`treasury-${city.id}`} city={city} initData={initData} tgUser={tgUser}/>)}
    {!isInspector&&managerCities.map(city=><CityManagementProfile key={`manage-${city.id}`} territory={city} managerTerritories={managerCities} initData={initData} tgUser={tgUser} onChanged={onTerritoriesChanged}/>)}
    {!isInspector&&residentCities.map(city=><CityManagementProfile key={`view-${city.id}`} territory={city} managerTerritories={managerCities} initData={initData} tgUser={tgUser} readOnly onChanged={onTerritoriesChanged}/>)}
    {isMainInspector&&<GlobalSettingsPanel initData={initData} onSettingsChanged={onSettingsSaved}/>}
        {isMainInspector&&<MainInspectorPanel initData={initData} onMapSaved={onMapSaved} territories={territories} onTerritoriesChanged={onTerritoriesChanged} onFaqSaved={onFaqSaved}/>}
      {settingsOpen&&<ProfileSettingsModal initData={initData} onClose={()=>setSettingsOpen(false)} onSaved={settings=>onSettingsSaved?.(settings)}/>}
      </div>;
}

function HomeScreen({ territories, onSelect, onAddTerritory, mode='map', mapImage=null, mapSource=null, mapLoading=false, mapError='', onRetryMap, voxView, onVoxViewChange, markersReady=false, mapZoomPercent=100 }) {
  const [sortBy,setSortBy]=useState('curator');
  const [resetSignal,setResetSignal]=useState(0);

  function resetWorldMapView() {
    setResetSignal(value => value + 1);
  }

  return <div className="atlas-page atlas-page--home" style={{paddingBottom:90}}>
    {mode==='map'
      ? <div style={{padding:'0 16px'}}>
          <div style={{position:'relative',width:'100%',aspectRatio:'1 / 1',borderRadius:6,border:'1px solid var(--border)',overflow:'hidden',background:'var(--bg)'}}>
            {mapImage ? (
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
              />
            ) : (
              <div role="status" aria-live="polite" style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:24,boxSizing:'border-box',textAlign:'center',background:'var(--surface)',color:'var(--text-muted)',fontSize:13,lineHeight:1.5}}>
                <div>{mapLoading ? 'Загружаем карту…' : (mapError || 'Карта ещё не загружена.')}</div>
                {!mapLoading && <button type="button" onClick={onRetryMap} className="press" style={{border:'1px solid var(--purple-border)',borderRadius:10,padding:'8px 14px',background:'var(--purple-soft)',color:'var(--purple)',fontWeight:700}}>Повторить</button>}
              </div>
            )}
          </div>
          <div style={{display:'flex',justifyContent:'center',paddingTop:12}}>
            <button onClick={resetWorldMapView} className="press" style={{width:'100%',maxWidth:520,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'center',gap:7,border:'1px solid var(--purple-border)',borderRadius:11,padding:'11px',minHeight:44,background:'var(--purple-soft)',color:'var(--purple)',fontWeight:800}}>Сбросить</button>
          </div>
        </div>
      : <div style={{padding:'0 16px'}}>
          <div style={{marginBottom:10}}><Segmented value={sortBy} onChange={setSortBy} options={[{value:'curator',label:'По инспектору'},{value:'community',label:'По игрокам'}]}/></div>
          {territories.length===0
            ? <div style={{textAlign:'center',padding:'40px 16px',color:'var(--text-muted)',fontSize:13}}>Городов пока нет — станьте первым, кто добавит свой.</div>
            : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {[...territories].sort((a,b)=>b[sortBy]-a[sortBy]).map((t,i)=>(
                  <button key={t.id} onClick={()=>onSelect(t.id)} className="press atlas-list-card" style={{display:'flex',alignItems:'center',gap:12,textAlign:'left',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:10,color:'var(--text)',animationDelay:`${Math.min(i*28,168)}ms`}}>
                    <span className="atlas-display" style={{width:20,fontSize:13,color:'var(--text-muted)'}}>{i+1}</span>
                    <span style={{width:46,height:46,borderRadius:12,background:`linear-gradient(135deg,${t.accent}55,${t.accent}15)`}}/>
                    <div style={{flex:1,minWidth:0}}><MinecraftText text={t.name} as="div" className="atlas-display" style={{fontSize:16,fontWeight:800,lineHeight:1.2}}/><div style={{fontSize:12,color:'var(--text-muted)',fontWeight:400,marginTop:4}}>{Number(t.votes||0)} {pluralizeRatings(t.votes)}</div></div>
                    <ScoreBadge type={sortBy==='curator'?'curator':'community'} value={t[sortBy]} size="lg"/>
                  </button>
                ))}
              </div>
          }
        </div>
    }
  </div>;
}
function compressScreenshotFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const ratio = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('Не удалось подготовить скриншот'));
          const name = String(file?.name || 'screenshot.jpg').replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.70);
      };
      img.onerror = () => reject(new Error('Не удалось прочитать скриншот'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}
function formatRatingCooldown(nextAt, now = Date.now()) {
  const diff = Math.max(0, Number(nextAt || 0) - now);
  if (diff <= 0) return '';
  const hours = diff / (60 * 60 * 1000);
  if (hours < 0.5) return 'несколько минут';
  const rounded = Math.max(1, Math.round(hours));
  return `${rounded} ${rounded === 1 ? 'час' : rounded >= 2 && rounded <= 4 ? 'часа' : 'часов'}`;
}
function DonationModal({territory,initData,onClose,onSuccess}){
  const [amount,setAmount]=useState(''),[balance,setBalance]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{(async()=>{try{const r=await fetch(`${API_BASE}/api/customization?lite=1`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});const d=await r.json().catch(() => null);if(r.ok&&d.ok)setBalance(Number(d.personalBalance??0));}catch{}})()},[initData]);
  async function donate(){const n=Math.floor(Number(amount));if(!Number.isSafeInteger(n)||n<=0)return;const operation=getFinancialOperationToken('treasury-donate',territory.id,n);if(operation.blocked){setError(`Предыдущая операция на ${operation.amount} сц ещё не подтверждена. Верните прежнюю сумму и повторите попытку.`);return}try{setBusy(true);setError('');const r=await fetch(`${API_BASE}/api/treasury/donate`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,territoryId:territory.id,amount:n,operationId:operation.id})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok){if([400,401,403,404,422].includes(r.status))clearFinancialOperationToken(operation);throw new Error(apiErrorMessage(r,d,"Операция не выполнена."));}clearFinancialOperationToken(operation);setBalance(Number(d.personal_balance??Math.max(0,(balance??0)-n)));window.dispatchEvent(new Event('voxygen:currency-changed'));onSuccess?.()}catch(e){setError(safeCaughtError(e, 'Не удалось отправить донат'))}finally{setBusy(false)}}
  return <SimpleModal title="Донат в казну" onClose={onClose}>
    <div style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.5,marginBottom:14}}>Поддержать <b style={{color:'var(--text)'}}><MinecraftText text={territory.name}/></b> донатом</div>
    <div style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:14,padding:'11px 12px',marginBottom:12}}><div style={{fontSize:12,color:'var(--text-muted)',fontWeight:700,marginBottom:5}}>Ваш баланс</div><div className="atlas-display" style={{fontSize:22,fontWeight:800,color:'var(--gem)',display:'flex',alignItems:'center',gap:6}}>{balance??'…'}<GemHex/></div></div>
    <input value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="Количество сц" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:12,padding:'12px',color:'var(--text)',fontSize:15,marginBottom:10}}/>
    {error&&<div style={{fontSize:12,color:'var(--red)',marginBottom:10}}>{error}</div>}
    <button onClick={donate} disabled={busy||!amount} className="press" style={{width:'100%',padding:'12px',border:'none',borderRadius:12,background:'var(--purple)',color:'#fff',fontWeight:800}}>{busy?'Отправка…':'Отправить донат'}</button>
  </SimpleModal>;
}
function TerritoryDetail({ base, onBack, profile, onGoToProfile, tgUser, role, mapImage, loadError = null, onRetry = null }) {
  const [t, setT] = useState(base);
  const [newComment, setNewComment] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [toast, setToast] = useState(null);
  const residentCount = Number(t.resident_count ?? ((t.residents || []).length + (t.owner_telegram_id ? 1 : 0)));
  const [showResidents, setShowResidents] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [rated, setRated] = useState(Boolean(base?.my_rating?.rated));
  const [ratingNextAt, setRatingNextAt] = useState(Number(base?.my_rating?.next_at || 0));
  const [ratingNow, setRatingNow] = useState(Date.now());
  const [myRating, setMyRating] = useState(base?.my_rating?.values || { integrity: 3, comfort: 3, atmosphere: 3, detail: 3 });
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editingReplyText, setEditingReplyText] = useState('');
  const fileInputRef = useRef(null);
  const detailPayloadRef = useRef({ territoryId: String(base?.id || ''), payload: null });
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState('');
  const [detailsAttempt, setDetailsAttempt] = useState(0);
  const initData = window.Telegram?.WebApp?.initData || '';
  const hasNickname = profile.status === 'verified';
  const isOwner = String(t.owner_telegram_id || '') === String(tgUser?.id || '') || (Array.isArray(t.manager_telegram_ids) && t.manager_telegram_ids.map(String).includes(String(tgUser?.id || '')));
  const isResident = Array.isArray(t.resident_telegram_ids) && t.resident_telegram_ids.map(String).includes(String(tgUser?.id || ''));
  const isInspectorRole = role === 'inspector' || role === 'main_inspector';
  const isMainInspector = role === 'main_inspector';
  const canRate = hasNickname && (isInspectorRole || !isOwner);
  const isGovernment = Boolean(t.is_government);

  useEffect(() => {
    const territoryId = String(base?.id || '');
    if (detailPayloadRef.current.territoryId !== territoryId) {
      detailPayloadRef.current = { territoryId, payload: null };
    }
    setT({ ...base, ...(detailPayloadRef.current.payload || {}) });
    setRated(Boolean(base?.my_rating?.rated));
    setRatingNextAt(Number(base?.my_rating?.next_at || 0));
    setMyRating(base?.my_rating?.values || { integrity: 3, comfort: 3, atmosphere: 3, detail: 3 });
  }, [base]);

  useEffect(() => {
    const territoryId = String(base?.id || '');
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError('');
    fetch(`${API_BASE}/api/territories?detail=${encodeURIComponent(territoryId)}`, {
      headers: { 'X-Telegram-Init-Data': initData },
      cache: 'no-store',
    }).then(async response => {
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.territories)) {
        throw new Error(apiErrorMessage(response, data, 'Не удалось загрузить подробности территории.'));
      }
      const row = data.territories.find(item => String(item.id) === territoryId);
      if (!row) throw new Error('Территория не найдена. Обновите список и попробуйте снова.');
      const payload = {
        reviews: Array.isArray(row.reviews) ? row.reviews : [],
        screenshots: Array.isArray(row.screenshots) ? row.screenshots.map(shot => ({ ...shot, url: shot?.url ? (String(shot.url).startsWith('http') ? shot.url : `${API_BASE}${shot.url}`) : shot?.url })) : [],
        residents: Array.isArray(row.residents) ? row.residents : [],
        resident_rows: Array.isArray(row.resident_rows) ? row.resident_rows : [],
        resident_telegram_ids: Array.isArray(row.resident_telegram_ids) ? row.resident_telegram_ids : [],
        managers: Array.isArray(row.managers) ? row.managers : [],
        manager_telegram_ids: Array.isArray(row.manager_telegram_ids) ? row.manager_telegram_ids : [],
        manager_count: Number(row.manager_count || 0),
        is_manager: Boolean(row.is_manager),
        resident_count: Number(row.resident_count || 0),
      };
      detailPayloadRef.current = { territoryId, payload };
      if (!cancelled) setT(current => String(current.id) === territoryId ? { ...current, ...payload } : current);
    }).catch(error => {
      if (!cancelled) setDetailsError(safeCaughtError(error, 'Не удалось загрузить подробности территории.'));
    }).finally(() => {
      if (!cancelled) setDetailsLoading(false);
    });
    return () => { cancelled = true; };
  }, [base?.id, initData, detailsAttempt]);

  useEffect(() => {
    const timer = setInterval(() => setRatingNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  function flash(message) { setToast(message); setTimeout(() => setToast(null), 2200); }

  async function saveRating() {
    try {
      const r = await fetch(`${API_BASE}/api/ratings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, territoryId: t.id, ...myRating }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) {
        if (d?.retryAt) {
          setRated(true); setRatingNextAt(Number(d.retryAt));
          if (d.values) setMyRating(d.values);
        }
        throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      }
      setRated(true);
      setRatingNextAt(Number(d.next_at || Date.now() + 20 * 60 * 60 * 1000));
      setT(v => ({ ...v, my_rating: { rated: true, next_at: Number(d.next_at || Date.now() + 20 * 60 * 60 * 1000), values: d.values || myRating }, curator: Number(d.curator ?? v.curator), community: Number(d.community ?? v.community), votes: Number(d.votes ?? v.votes) }));
      flash('Оценка сохранена');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось сохранить оценку')); }
  }

  async function addComment() {
    const text = newComment.trim();
    if (!text || !hasNickname) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, territoryId: t.id, text }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setNewComment('');
      const c = await fetch(`${API_BASE}/api/comments?territoryId=${encodeURIComponent(t.id)}`);
      const cd = await c.json().catch(() => null);
      if (cd.ok) setT(v => ({ ...v, reviews: cd.comments || [] }));
      flash('Отзыв опубликован');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось отправить отзыв')); }
  }

  async function reply(commentId, text) {
    try {
      const r = await fetch(`${API_BASE}/api/comments/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId, text }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setT(v => ({ ...v, reviews: (v.reviews || []).map(x => x.id === commentId ? { ...x, reply: text } : x) }));
      flash('Ответ сохранён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось сохранить ответ')); }
  }

  async function editComment(id) {
    const text = editingCommentText.trim();
    if (!text) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId: id, text }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setT(v => ({ ...v, reviews: (v.reviews || []).map(x => x.id === id ? { ...x, text } : x) }));
      setEditingCommentId(null); setEditingCommentText(''); flash('Комментарий изменён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось изменить комментарий')); }
  }
  async function removeComment(id) {
    if (!window.confirm('Удалить комментарий?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId: id }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setT(v => ({ ...v, reviews: (v.reviews || []).filter(x => x.id !== id) }));
      flash('Комментарий удалён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось удалить комментарий')); }
  }
  async function editReply(id) {
    const text = editingReplyText.trim();
    if (!text) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments/reply`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId: id, text }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setT(v => ({ ...v, reviews: (v.reviews || []).map(x => x.id === id ? { ...x, reply: text } : x) }));
      setEditingReplyId(null); setEditingReplyText(''); flash('Ответ изменён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось изменить ответ')); }
  }
  async function removeReply(id) {
    if (!window.confirm('Удалить ответ?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/comments/reply`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, commentId: id }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setT(v => ({ ...v, reviews: (v.reviews || []).map(x => x.id === id ? { ...x, reply: null } : x) }));
      flash('Ответ удалён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось удалить ответ')); }
  }

  async function deleteShot(id) {
    try {
      const r = await fetch(`${API_BASE}/api/screenshots/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setT(v => ({ ...v, screenshots: (v.screenshots || []).filter(s => s.id !== id) }));
      setLightbox(null); flash('Скрин удалён');
    } catch (e) { flash(safeCaughtError(e, 'Не удалось удалить скрин')); }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const prepared = await compressScreenshotFile(file);
      const fd = new FormData(); fd.append('territoryId', t.id); fd.append('photo', prepared, prepared.name); fd.append('initData', initData);
      const r = await fetch(`${API_BASE}/api/screenshots`, { method: 'POST', headers: { 'X-Telegram-Init-Data': initData }, body: fd });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      flash(isGovernment ? 'Скрин опубликован' : 'Скрин отправлен основателю/мэру на одобрение');
    } catch (e2) { flash(safeCaughtError(e2, 'Не удалось отправить скрин')); }
  }
const approved = (t.screenshots || []).filter(s => s.status === 'approved');
  const canDeleteShot = isMainInspector || (!isGovernment && isOwner);
  return (
    <div className="atlas-page atlas-page--territory" style={{ paddingBottom: 90, position: 'relative' }}>
      <div style={{ position: 'relative', height: 150, overflow:'hidden', background: t.cover_url ? 'var(--bg)' : `linear-gradient(160deg, ${t.accent}66, var(--surface) 85%)` }}>
        {t.cover_url && mapImage && <img src={mapImage} alt="" aria-hidden="true" draggable={false} className="atlas-cover-image" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',objectPosition:'center',display:'block'}}/>}
        {t.cover_url && !mapImage && <div aria-hidden="true" style={{position:'absolute',inset:0,background:'var(--bg)'}}/>}
        {t.cover_url && <img src={t.cover_url} alt="" aria-hidden="true" draggable={false} className="atlas-cover-image" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>}
        <button onClick={onBack} className="press" style={{ position: 'absolute', top: 14, left: 14, width: 44, height: 44, borderRadius: '50%', background: 'rgba(11,13,16,.58)', border: '1px solid rgba(255,255,255,.10)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}><ChevronLeft size={20} /></button>
        <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16, zIndex: 3, textShadow:'0 2px 10px rgba(0,0,0,.28)' }}>
          <MinecraftText as="div" text={t.name} className="atlas-display" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.16 }} />
          <div style={{fontSize:13,color:'rgba(237,238,242,.78)'}}>{formatTerritoryCoords(t.coords || (t.vox_x != null && t.vox_z != null ? `${t.vox_x} / ${t.vox_z}` : ''))}</div>
        </div>
      </div>
      <div style={{ padding: '14px 16px 0' }}>
        {detailsError && <div role="status" style={{fontSize:11.5,color:'var(--text-muted)',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'9px 10px',marginBottom:10,display:'flex',alignItems:'center',gap:8}}><span style={{flex:1}}>{detailsError}</span><button onClick={()=>setDetailsAttempt(value=>value+1)} className="press" style={{border:'1px solid var(--border)',borderRadius:8,background:'var(--surface)',color:'var(--text)',padding:'6px 8px',fontWeight:700,flexShrink:0}}>Повторить</button></div>}
        {loadError && <div role="status" style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:12,padding:'10px 11px',marginBottom:12,color:'var(--text)',fontSize:11.5,lineHeight:1.45,display:'flex',alignItems:'center',gap:9}}><span style={{flex:1,overflowWrap:'anywhere'}}>{String(loadError).startsWith('Часть данных')?loadError:`Не удалось обновить данные города. Показана последняя загруженная версия. ${loadError}`}</span><button onClick={onRetry} className="press" style={{border:'1px solid var(--border)',borderRadius:9,background:'var(--surface)',color:'var(--text)',padding:'7px 9px',fontWeight:700,flexShrink:0}}>Повторить</button></div>}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:18}}>
          <div style={{display:'flex',gap:10,flex:1,minWidth:0}}><ScoreBadge type="curator" value={t.curator} size="lg" /><ScoreBadge type="community" value={t.community} size="lg" /></div>
          {!isGovernment&&<button onClick={()=>setShowDonation(true)} className="press" style={{height:48,minWidth:72,padding:'0 12px',border:'1px solid var(--red)',borderRadius:14,background:'var(--red-soft)',color:'var(--red)',display:'flex',alignItems:'center',justifyContent:'center',gap:5,fontWeight:800}}><Heart size={17} strokeWidth={2.2}/><span>Донат</span></button>}
        </div>
        {String(t.additional_info || '').trim() && <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:'12px 14px',marginTop:-6,marginBottom:18}}><MinecraftText as="div" text={t.additional_info} style={{fontSize:13.5,lineHeight:1.55,color:'var(--text)'}} /></div>}
        <SectionTitle icon={<Camera size={15} />} title="Скрины" count={approved.length} />
        <div className="atlas-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
          {approved.map((s, shotIndex) => <div key={s.id} className="atlas-shot-reveal" style={{ position: 'relative', flexShrink: 0, animationDelay: `${Math.min(shotIndex * 35, 175)}ms` }}><ShotThumb shot={s} onOpen={() => { setLightboxIndex(approved.findIndex(x => x.id === s.id)); setLightbox({ shot: s }); }} />{canDeleteShot && <button onClick={() => deleteShot(s.id)} className="press" style={{ position: 'absolute', right: 3, top: 3, width: 24, height: 24, border: 'none', borderRadius: '50%', background: 'rgba(0,0,0,.72)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} /></button>}</div>)}
          {hasNickname && (!isOwner || isGovernment) && <><input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} /><button onClick={() => fileInputRef.current?.click()} className="press" style={{ flexShrink: 0, width: 96, height: 68, borderRadius: 12, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11 }}><Plus size={16} /> Добавить</button></>}
        </div>
        {!isGovernment&&<button onClick={() => setShowResidents(true)} className="press" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '11px 13px', margin: '0 0 16px', color: 'var(--text)' }}><span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600 }}><Users size={15} /> Жители</span><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{residentCount} →</span></button>}
        {canRate && <div className="atlas-panel-reveal" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, marginBottom: 18 }}><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Ваша оценка</div>{rated && ratingNextAt > ratingNow ? <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--emerald)' }}><Check size={14} /> Спасибо за оценку, обновить её можно через {formatRatingCooldown(ratingNextAt, ratingNow)}.</div> : <>{CRITERIA.map(c => <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}><div style={{ flex: 1 }}><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{c.label}</div><input type="range" min="1" max="5" value={myRating[c.key]} className={isInspectorRole?'slider-inspector':'slider-player'} onChange={e => setMyRating(v => ({ ...v, [c.key]: Number(e.target.value) }))} style={{ '--slider-progress': `${((myRating[c.key] - 1) / 4) * 100}%`, '--slider-fill': isInspectorRole ? 'var(--mint)' : 'var(--purple)' }} /></div><div className="atlas-display" style={{ width: 20, textAlign: 'center', fontSize: 17, fontWeight: 700, color: isInspectorRole ? 'var(--mint)' : 'var(--purple)' }}>{myRating[c.key]}</div></div>)}<button onClick={saveRating} className="press" style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: 'none', background: isInspectorRole ? 'var(--mint)' : 'var(--purple)', color: isInspectorRole ? '#06120D' : '#fff', fontWeight: 700 }}>Сохранить оценку</button></>}</div>}
        <SectionTitle icon={<MessageCircle size={15} />} title="Отзывы" count={(t.reviews || []).length} />
        {!isOwner && hasNickname && <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}><input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Оставить отзыв о территории" style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', color: 'var(--text)', fontSize: 13 }} /><button onClick={addComment} className="press" style={iconBtn('var(--surface)', '#fff', true)}><Send size={15} /></button></div>}
        {!hasNickname && !isOwner && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>Укажите ник в <button onClick={onGoToProfile} className="press" style={{ background: 'none', border: 'none', color: 'var(--purple)', padding: 0, fontSize: 12.5, fontWeight: 600 }}>профиле</button>, чтобы оставлять отзывы.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{(t.reviews || []).map((r, reviewIndex) => {
          const isMyComment = String(r.telegram_id || '') === String(tgUser?.id || '');
          const isResidentReviewer = r.telegram_id != null && (t.resident_telegram_ids || []).some(id => String(id) === String(r.telegram_id));
          return <div key={r.id} className="atlas-review-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, animationDelay: `${Math.min(reviewIndex * 24, 144)}ms` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <MinecraftText text={r.author || r.telegram_username || 'Пользователь'} style={{fontSize:13,fontWeight:600}}/>
              {(r.role === 'inspector' || r.role === 'main_inspector') && <span style={{ fontSize: 10, color: 'var(--mint)', background: 'var(--mint-soft)', border: '1px solid var(--mint)', borderRadius: 999, padding: '2px 6px', fontWeight: 700 }}>Инспектор</span>}
              {isResidentReviewer && <span style={{ fontSize: 10, color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 999, padding: '2px 6px', fontWeight: 700 }}>Житель</span>}
              {(isMyComment || isMainInspector) && <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                {isMyComment && !r.reply && <button onClick={()=>{setEditingCommentId(r.id);setEditingCommentText(r.text||'')}} className="press" title="Изменить" style={{border:'none',background:'var(--purple-soft)',color:'var(--purple)',borderRadius:8,padding:6}}><Pencil size={15}/></button>}
                {(isMyComment || isMainInspector) && <button onClick={()=>removeComment(r.id)} className="press" title="Удалить" style={{border:'none',background:'var(--red-soft)',color:'var(--red)',borderRadius:8,padding:6}}><Trash2 size={15}/></button>}
              </div>}
            </div>
            {editingCommentId===r.id
              ? <div style={{display:'flex',gap:6,marginBottom:8}}><input value={editingCommentText} onChange={e=>setEditingCommentText(e.target.value)} style={{flex:1,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 10px',color:'var(--text)',fontSize:12.5}}/><button onClick={()=>editComment(r.id)} className="press" style={{border:'none',background:'var(--purple)',color:'#fff',borderRadius:9,padding:'0 10px'}}>✓</button></div>
              : <MinecraftText as="div" text={r.text} style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 8 }} />}
            {r.reply && <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px', marginBottom: 8, borderLeft: '2px solid var(--mint)' }}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}><b style={{ color: 'var(--mint)' }}><MinecraftText text={t.owner}/>: </b>{isOwner&&<div style={{marginLeft:'auto',display:'flex',gap:4}}><button onClick={()=>{setEditingReplyId(r.id);setEditingReplyText(r.reply||'')}} className="press" title="Изменить" style={{border:'none',background:'var(--purple-soft)',color:'var(--purple)',borderRadius:8,padding:6}}><Pencil size={15}/></button><button onClick={()=>removeReply(r.id)} className="press" title="Удалить" style={{border:'none',background:'var(--red-soft)',color:'var(--red)',borderRadius:8,padding:6}}><Trash2 size={15}/></button></div>}</div>
              {editingReplyId===r.id ? <div style={{display:'flex',gap:6}}><input value={editingReplyText} onChange={e=>setEditingReplyText(e.target.value)} style={{flex:1,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'7px 9px',color:'var(--text)',fontSize:12}}/><button onClick={()=>editReply(r.id)} className="press" style={{border:'none',background:'var(--purple)',color:'#fff',borderRadius:8,padding:'0 9px'}}>✓</button></div> : <MinecraftText as="div" text={r.reply} style={{fontSize:12,lineHeight:1.45}} />}
            </div>}
            {isOwner && !r.reply && <ReplyBox onSend={text => reply(r.id, text)} />}
          </div>;
        })}</div>
      </div>
      {showResidents && <SimpleModal title="Жители" onClose={() => setShowResidents(false)}><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{(t.managers||[]).map((m,i)=><div key={`manager-${m.telegram_id||i}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: 'var(--mint-soft)', borderRadius: 11 }}><AvatarHead nickname={m.mc_nickname} skinUrl={m.skin_url} size={40}/><div style={{ flex: 1, minWidth:0 }}><MinecraftText text={m.mc_nickname || m.telegram_username || 'Ник не указан'} style={{fontSize:13,fontWeight:700}}/><div style={{ fontSize: 10.5, color: 'var(--mint)' }}>Основатель/мэр</div></div><ShieldCheck size={18} color="var(--mint)" /></div>)}{(t.resident_rows||[]).length===0 ? ((t.residents || []).length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Кроме основателей/мэров жителей пока нет.</div> : (t.residents || []).map((r,i)=><div key={`legacy-resident-${i}`} style={{ display:'flex',alignItems:'center',gap:9,padding:'10px 12px',background:'var(--surface-2)',borderRadius:11 }}><AvatarHead nickname={r} size={40}/><MinecraftText text={r} style={{fontSize:13}}/></div>)) : (t.resident_rows||[]).map((r,i)=><div key={`resident-${r.telegram_id||i}`} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 11 }}><AvatarHead nickname={r.mc_nickname} skinUrl={r.skin_url} size={40}/><div style={{flex:1,minWidth:0}}><MinecraftText text={r.mc_nickname || r.telegram_username || 'Ник не указан'} style={{fontSize:13,fontWeight:700}}/>{r.telegram_username&&<div style={{fontSize:10.5,color:'var(--text-muted)'}}>@{String(r.telegram_username).replace(/^@/,'')}</div>}</div></div>)}</div></SimpleModal>}
      {lightbox && <Lightbox shots={approved} index={lightboxIndex} mode="view" onClose={() => setLightbox(null)} onChange={(i)=>{setLightboxIndex(i);setLightbox({shot:approved[i]});}} />}
      {showDonation && <DonationModal territory={t} initData={initData} onClose={()=>setShowDonation(false)} onSuccess={()=>{setShowDonation(false);flash('Донат отправлен');}}/>}
      {toast && <FixedToast key={toast} message={toast}/>}
    </div>
  );
}

function ReplyBox({ onSend }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ marginBottom: 8 }}>
    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Ответить как основатель/мэр…"
        style={{
          flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '7px 10px', color: 'var(--text)', fontSize: 12.5, outline: 'none',
        }}
      />
      <button
        onClick={() => { if (val.trim()) { onSend(val.trim()); setVal(''); } }}
        className="press"
        style={{ ...iconBtn('var(--purple-soft)', 'var(--purple)'), width: 32, height: 32 }}
      >
        <Send size={13} />
      </button>
    </div>
    </div>
  );
}

function ResidentsModal({ residents, members = [], pendingInvites = [], ownerName, isOwner, onClose, newResident, setNewResident, onAdd, onRemove, onCancelInvite }) {
  const displayMembers=members.length?members:residents.map((name,i)=>({mc_nickname:name,fallback:i}));
  const { closing, requestClose } = useAnimatedClose(onClose, 175);
  return <div className={`atlas-overlay${closing ? ' atlas-closing' : ''}`} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={requestClose}><div onClick={e=>e.stopPropagation()} className={`atlas-modal-shell${closing ? ' atlas-closing' : ''}`} style={{width:'100%',maxWidth:448,background:'var(--surface)',borderRadius:22,border:'1px solid var(--border)',padding:18,maxHeight:'70vh',overflowY:'auto'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><div className="atlas-display" style={{fontSize:16,fontWeight:700}}>Жители</div><button onClick={requestClose} className="press" style={iconBtn('var(--surface-2)','var(--text-muted)')}><X size={16}/></button></div><div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:isOwner?14:0}}>{displayMembers.length===0?<div style={{fontSize:12.5,color:'var(--text-muted)'}}>Список жителей пуст.</div>:displayMembers.map(m=><div key={m.telegram_id||m.fallback||m.mc_nickname} style={{display:'flex',alignItems:'center',gap:10,background:'var(--surface-2)',borderRadius:12,padding:'9px 12px'}}><User size={15} color="var(--text-muted)"/><MinecraftText text={m.mc_nickname||'Неизвестно'} style={{fontSize:13.5,flex:1}}/>{isOwner&&m.telegram_id&&<button onClick={()=>onRemove(m)} className="press" style={{border:'none',background:'transparent',color:'var(--red)'}}><Trash2 size={14}/></button>}</div>)}</div>{isOwner&&pendingInvites.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:12,fontWeight:700,color:'var(--gold)',marginBottom:7}}>Ожидают ответа</div>{pendingInvites.map(inv=><div key={inv.id} style={{display:'flex',alignItems:'center',gap:8,background:'var(--gold-soft)',borderRadius:12,padding:'9px 10px',marginBottom:7}}><Clock size={14} color="var(--gold)"/><MinecraftText text={inv.target_nickname} style={{flex:1,fontSize:12.5}}/><button onClick={()=>onCancelInvite(inv.id)} className="press" style={{border:'none',background:'transparent',color:'var(--red)'}}><X size={15}/></button></div>)}</div>}{isOwner&&<div style={{display:'flex',gap:8}}><input value={newResident} onChange={e=>setNewResident(e.target.value)} placeholder="Ник игрока" style={{flex:1,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'9px 12px',color:'var(--text)',fontSize:13}}/><button onClick={onAdd} className="press" style={iconBtn('var(--purple)','#fff',true)}><UserPlus size={15}/></button></div>}</div></div>;
}

function RecruitmentScreen({ territories, onSelect }) {
  const [selected, setSelected] = useState(null);
  const cities = (territories || [])
    .filter(t => Number(t.recruitment_enabled) === 1 && String(t.recruitment_description || '').trim())
    .sort((a,b) => Number(b.curator||0) - Number(a.curator||0));
  const contact = city => {
    const raw = String(city?.recruitment_contact_username || city?.owner_telegram_username || '').trim().replace(/^@+/, '');
    return raw ? `@${raw}` : 'не указан';
  };
  const formatCoords = formatTerritoryCoords;
  return <div className="atlas-page atlas-page--recruitment" style={{padding:'0 16px 100px'}}>
    {cities.length===0 ? <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:18,color:'var(--text-muted)',fontSize:13}}>Сейчас нет открытых объявлений о наборе.</div> :
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {cities.map((city,index)=><button key={city.id} onClick={()=>setSelected(city)} className="press atlas-recruitment-card" style={{width:'100%',textAlign:'left',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:'13px 14px',color:'var(--text)',minHeight:76,animationDelay:`${Math.min(index*32,192)}ms`}}>
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',alignItems:'center',gap:10,minWidth:0,minHeight:48}}>
            <div style={{minWidth:0}}>
              <MinecraftText text={city.name} as="div" lang="ru" className="atlas-display" style={{fontSize:22,fontWeight:800,lineHeight:1.2,minWidth:0,whiteSpace:'normal',overflowWrap:'anywhere',wordBreak:'normal',hyphens:'auto',hyphenateCharacter:'–'}} />
              <div style={{fontSize:12,color:'var(--text-muted)',marginTop:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}><span style={{color:'var(--text)'}}>Связь:</span> {contact(city)}</div>
            </div>
            <div style={{display:'flex',flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:6,flexShrink:0}}>
              <ScoreBadge type="curator" value={Number(city.curator||0)} size="recruitment" />
              <ScoreBadge type="community" value={Number(city.community||0)} size="recruitment" />
            </div>
          </div>
        </button>)}
      </div>}
    {selected&&<SimpleModal title={<MinecraftText text={selected.name} style={{fontSize:22,fontWeight:800}} />} onClose={()=>setSelected(null)}>
      <div style={{fontSize:16,color:'var(--text-muted)',lineHeight:1.1,marginBottom:12}}>{formatCoords(selected.coords)}</div>
      <div style={{fontSize:14,marginBottom:14}}><b>Связь:</b> {contact(selected)}</div>
      <div style={{display:'flex',gap:10,marginBottom:14}}>
        <ScoreBadge type="curator" value={Number(selected.curator||0)} size="lg" />
        <ScoreBadge type="community" value={Number(selected.community||0)} size="lg" />
      </div>
      <MinecraftText as="div" text={selected.recruitment_description} style={{background:'var(--surface-2)',borderRadius:12,padding:'11px 12px',fontSize:13,lineHeight:1.55,whiteSpace:'pre-wrap',marginBottom:14}} />
      <button onClick={()=>{setSelected(null);onSelect(selected.id)}} className="press" style={{width:'100%',padding:'11px 0',border:'none',borderRadius:11,background:'var(--purple)',color:'#fff',fontWeight:700}}>Перейти на страницу города</button>
    </SimpleModal>}
  </div>;
}

function EventsScreen({ initData, territories = [], onSelectTerritory, isMainInspector = false, tgUser = null, expandedEventId = null, setExpandedEventId = () => {}, timezoneOffset = 'UTC+3', timezoneReady = true, timezoneLoadError = '', onRetryTimezone = () => {} }) {
  const [events, setEvents] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [createExpanded,setCreateExpanded]=useState(false);
  const [drafts, setDrafts] = useState({}), [busyId, setBusyId] = useState(null), [notice, setNotice] = useState(''), [editingEventId,setEditingEventId]=useState(null);
  const [clockNow,setClockNow]=useState(Date.now());
  async function load() {
    try {
      setError('');
      const response = await fetch(`${API_BASE}/api/events`, { headers: { 'X-Telegram-Init-Data': initData }, cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(apiErrorMessage(response, data, 'Не удалось загрузить ивенты.'));
      const items = (data.events || []).sort((a,b) => Number(a.event_at)-Number(b.event_at));
      setEvents(items);
      setDrafts(prev => {
        const next = { ...prev };
        for (const event of items) if (!next[event.id]) next[event.id] = { value: '', unit: event.reminder?.unit || 'minutes' };
        return next;
      });
    } catch (e) { setError(safeCaughtError(e, 'Не удалось загрузить ивенты.')); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [initData]);
  useEffect(() => { const timer=setInterval(()=>setClockNow(Date.now()),15000); return ()=>clearInterval(timer); }, []);
  function updateDraft(id, patch) { setDrafts(prev => ({ ...prev, [id]: { value: prev[id]?.value ?? '', unit: prev[id]?.unit ?? 'minutes', ...patch } })); }
  async function saveReminder(event) {
    const draft = drafts[event.id] || { value: '', unit: 'minutes' };
    const value = Number(draft.value);
    if (!Number.isSafeInteger(value) || value < 1) { setError('Введите положительное число для напоминания.'); return; }
    try {
      setBusyId(event.id); setError(''); setNotice('');
      const response = await fetch(`${API_BASE}/api/events/reminder`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData }, body: JSON.stringify({ initData, eventId: event.id, value, unit: draft.unit }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(apiErrorMessage(response, data, 'Не удалось сохранить напоминание.'));
      setEvents(prev => prev.map(item => item.id === event.id ? { ...item, reminder: data.reminder ? { id:data.reminder.id, value:Number(data.reminder.lead_value ?? data.reminder.value), unit:data.reminder.lead_unit ?? data.reminder.unit, remind_at:Number(data.reminder.remind_at), status:data.reminder.status } : item.reminder } : item));
      setDrafts(prev=>({...prev,[event.id]:{value:'',unit:draft.unit||'minutes'}}));
      setNotice('Напоминание сохранено');
    } catch (e) { const message=safeCaughtError(e, 'Не удалось сохранить напоминание.'); if (/это время напоминания уже прошло/i.test(message)) { setError(''); setNotice('Это время напоминания уже прошло'); } else setError(message); }
    finally { setBusyId(null); }
  }
  async function removeReminder(event) {
    try {
      setBusyId(event.id); setError('');
      const response = await fetch(`${API_BASE}/api/events/reminder`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData }, body: JSON.stringify({ initData, eventId:event.id }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(apiErrorMessage(response, data, 'Не удалось удалить напоминание.'));
      setEvents(prev => prev.map(item => item.id===event.id ? { ...item, reminder:null } : item));
      setDrafts(prev=>({...prev,[event.id]:{value:'',unit:'minutes'}})); setNotice('Напоминание удалено');
    } catch (e) { setError(safeCaughtError(e, 'Не удалось удалить напоминание.')); }
    finally { setBusyId(null); }
  }
  const coords = value => { const raw=String(value||'').trim(); if(/§(?:x(?:§[0-9a-fA-F]){6}|#[0-9a-fA-F]{6}|[0-9a-fK-OrR])/i.test(raw))return raw.replace(/\s*\/\s*/g,' / '); return raw.replace(/\b[ZX]\s*[:=]?\s*/gi,'').replace(/\s*\/\s*/g,' / ').trim().replace(/^[:/ ]+|[:/ ]+$/g,''); };
  const openEventPage = url => {
    if (!url) return;
    try { if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url); else window.open(url, '_blank', 'noopener,noreferrer'); } catch {}
  };
  const recentWindowStart=clockNow-24*60*60*1000;
  const visibleEvents=events.filter(event=>Number(event.event_at)>recentWindowStart);
  const upcomingEvents=visibleEvents.filter(event=>Number(event.event_at)>clockNow).sort((a,b)=>Number(a.event_at)-Number(b.event_at));
  const pastEvents=visibleEvents.filter(event=>Number(event.event_at)<=clockNow).sort((a,b)=>Number(b.event_at)-Number(a.event_at));
  function renderEventCard(event,isPast=false) {
    const open = expandedEventId===event.id, draft = drafts[event.id] || { value:'', unit:event.reminder?.unit||'minutes' }, busy=busyId===event.id;
    const rawPlace = event.territory_name || event.place || '';
    const place = /^(не указано|место не указано)$/i.test(stripMinecraftCodes(String(rawPlace)).trim()) ? '' : String(rawPlace).trim();
    const hasPlace = Boolean(place);
    const eventCoords = coords(event.coords);
    const reminderLabel = event.reminder?.status==='sent' ? 'Напоминание уже отправлено' : event.reminder ? `Напомнить за ${event.reminder.value} ${reminderUnitLabel(event.reminder.value,event.reminder.unit)}` : '';
    const isCreator = Number(tgUser?.id||0)>0 && Number(event.created_by||0)===Number(tgUser.id);
    return <div key={`${isPast?'past':'upcoming'}-${event.id}`} className="atlas-recruitment-card" style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden',opacity:isPast ? .94 : 1}}>
      <button onClick={()=>setExpandedEventId(open?null:event.id)} className="press" aria-expanded={open} style={{width:'100%',textAlign:'left',display:'flex',alignItems:'center',gap:12,padding:'13px 14px',border:0,background:'transparent',color:'var(--text)'}}>
        {event.image_data ? <img src={event.image_data} alt="" style={{width:64,height:64,objectFit:'cover',borderRadius:11,flexShrink:0,background:'var(--surface-2)'}}/> : <div style={{width:64,height:64,borderRadius:11,background:'var(--surface-2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Sparkles size={22} color="var(--purple)"/></div>}
        <div style={{flex:1,minWidth:0}}><MinecraftText as="div" text={event.title} className="atlas-display" style={{fontSize:16,fontWeight:800,lineHeight:1.25,marginBottom:6}}/>{hasPlace&&<div style={{display:'flex',alignItems:'center',gap:5,color:'var(--text-muted)',fontSize:12,marginBottom:4}}><MapPin size={12}/><MinecraftText text={place} style={{fontSize:12,overflowWrap:'anywhere'}}/></div>}<div style={{display:'flex',alignItems:'center',gap:5,color:isPast?'var(--text-muted)':'var(--purple)',fontSize:12,fontWeight:700}}><Clock size={12}/>{eventDateLabel(event.event_at, timezoneOffset)}</div><div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{eventCoords?<>Координаты: <MinecraftText text={eventCoords}/></>:'Координаты не указаны'}</div>{!isPast&&event.reminder&&<div style={{fontSize:10.5,color:event.reminder.status==='sent'?'var(--mint)':'var(--text-muted)',marginTop:5}}>{reminderLabel}</div>}</div>
        <span style={{fontSize:19,color:'var(--text-muted)',padding:'0 3px'}}>{open?'−':'+'}</span>
      </button>
      {open && <div style={{padding:'0 14px 14px'}}>
        {event.image_data && <img src={event.image_data} alt={`Ивент: ${event.title}`} style={{display:'block',width:'100%',maxHeight:220,objectFit:'cover',borderRadius:12,margin:'0 0 12px'}}/>}
        <MinecraftText as="div" text={event.title} className="atlas-display" style={{fontSize:21,fontWeight:800,lineHeight:1.2,marginBottom:10}}/>
        <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:13,marginBottom:12}}>
          <div style={{display:'flex',gap:8,alignItems:'flex-start'}}><CalendarDays size={15} color="var(--purple)"/><span>{eventDateLabel(event.event_at, timezoneOffset)}</span></div>
          {hasPlace&&<div style={{display:'flex',gap:8,alignItems:'flex-start'}}><MapPin size={15} color="var(--purple)"/><div style={{minWidth:0}}><MinecraftText text={place}/></div></div>}
          <div style={{fontSize:12,color:'var(--text-muted)'}}>{eventCoords?<>Координаты: <MinecraftText text={eventCoords}/></>:'Координаты не указаны'}</div>
        </div>
        {event.description && <MinecraftText as="div" text={event.description} style={{fontSize:13.5,lineHeight:1.55,marginBottom:14,whiteSpace:'pre-wrap'}}/>}
        {!isPast && <div style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:13,padding:12,marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:7,fontSize:13,fontWeight:800,marginBottom:9}}><Bell size={15} color="var(--purple)"/>Напомнить об ивенте за</div>
          {event.reminder && <div style={{fontSize:12,color:'var(--mint)',marginBottom:9}}>Текущая настройка: за {event.reminder.value} {reminderUnitLabel(event.reminder.value,event.reminder.unit)} до начала{event.reminder.status==='sent'?' · уже отправлено':''}.</div>}
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1.1fr)',gap:8,marginBottom:9}}>
            <input value={draft.value} onChange={e=>updateDraft(event.id,{value:e.target.value.replace(/\D/g,'')})} inputMode="numeric" placeholder="Число" style={{minWidth:0,width:'100%',boxSizing:'border-box',minHeight:44,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 11px',color:'var(--text)',fontSize:14}}/>
            <div className="event-reminder-unit-switch" style={{display:'flex',minHeight:44,padding:3,borderRadius:10,background:'var(--surface)',border:'1px solid var(--border)',gap:3}}>{[{value:'minutes',label:reminderUnitLabel(draft.value,'minutes')},{value:'hours',label:reminderUnitLabel(draft.value,'hours')}].map(unit=><button key={unit.value} onClick={()=>updateDraft(event.id,{unit:unit.value})} className="press event-reminder-unit-option" style={{flex:1,minWidth:0,border:0,borderRadius:7,padding:'7px 4px',minHeight:36,background:draft.unit===unit.value?'var(--purple)':'transparent',color:draft.unit===unit.value?'#fff':'var(--text-muted)',fontSize:12,fontWeight:700}}>{unit.label}</button>)}</div>
          </div>
          <button onClick={()=>saveReminder(event)} disabled={busy} className="press" style={{width:'100%',border:0,borderRadius:10,padding:'10px 12px',minHeight:44,background:'var(--purple)',color:'#fff',fontWeight:800}}>{busy?'Сохранение…':event.reminder?'Сохранить изменения':'Подтвердить напоминание'}</button>
          {event.reminder && <button onClick={()=>removeReminder(event)} disabled={busy} className="press" style={{width:'100%',marginTop:7,border:'1px solid var(--red-border)',borderRadius:10,padding:'9px 12px',minHeight:44,background:'var(--red-soft)',color:'var(--red)',fontWeight:800}}>Удалить напоминание</button>}
        </div>}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {event.page_url && <button onClick={()=>openEventPage(event.page_url)} className="press" style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:7,border:0,borderRadius:11,padding:'11px',minHeight:44,background:'var(--purple)',color:'#fff',fontWeight:800}}><ExternalLink size={15}/>Перейти на страницу ивента</button>}
          {!isPast && isCreator && (editingEventId===event.id
            ? <EventInlineEditor key={event.id} initData={initData} event={event} territories={territories} tgUser={tgUser} isMainInspector={isMainInspector} timezoneOffset={timezoneOffset} onCancel={()=>setEditingEventId(null)} onSaved={async()=>{setEditingEventId(null);setNotice('Ивент обновлён');await load();}} onDeleted={()=>{setEvents(prev=>prev.filter(item=>item.id!==event.id));setEditingEventId(null);setExpandedEventId(null);setNotice('Ивент удалён');}}/>
            : <button onClick={()=>setEditingEventId(event.id)} disabled={!timezoneReady} className="press" style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:7,border:'1px solid var(--purple-border)',borderRadius:11,padding:'11px',minHeight:44,background:'var(--purple-soft)',color:'var(--purple)',fontWeight:800,opacity:timezoneReady?1:.55}}><Pencil size={15}/>Редактировать</button>)}
          {event.territory_id && territories.some(city=>String(city.id)===String(event.territory_id)) && <button onClick={()=>onSelectTerritory?.(event.territory_id)} className="press" style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:7,border:'1px solid var(--purple-border)',borderRadius:11,padding:'11px',minHeight:44,background:'var(--purple-soft)',color:'var(--purple)',fontWeight:800}}>Перейти на страницу территории</button>}
        </div>
      </div>}
    </div>;
  }
  return <div className="atlas-page atlas-page--events" style={{ padding:'12px 16px 100px' }}>
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:15,overflow:'hidden',marginTop:8,marginBottom:18}}>
      {!timezoneReady&&<div role="status" style={{padding:'9px 14px',borderBottom:'1px solid var(--border)',fontSize:11.5,color:timezoneLoadError?'var(--red)':'var(--text-muted)'}}>{timezoneLoadError||'Подготавливаются настройки времени…'}{timezoneLoadError&&<button type="button" onClick={onRetryTimezone} className="press" style={{marginLeft:8,border:0,background:'transparent',color:'var(--purple)',fontWeight:800}}>Повторить</button>}</div>}
      <button type="button" aria-expanded={createExpanded} disabled={!timezoneReady} onClick={()=>setCreateExpanded(value=>!value)} className="press" style={{width:'100%',minHeight:58,display:'flex',alignItems:'center',gap:10,padding:'13px 15px',border:0,background:'var(--surface)',color:'var(--text)',textAlign:'left',opacity:timezoneReady?1:.55}}>
        <span style={{width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:10,background:'var(--purple-soft)',color:'var(--purple)',flexShrink:0}}><Plus size={19}/></span>
        <span style={{flex:1,minWidth:0,fontSize:14,fontWeight:800}}>Создать ивент</span>
        {createExpanded?<ChevronUp size={18} color="var(--purple)"/>:<ChevronDown size={18} color="var(--purple)"/>}
      </button>
      {createExpanded&&<div style={{borderTop:'1px solid var(--border)',padding:'0 14px 14px'}}><ProfileEventCreateForm embedded initData={initData} territories={territories} isMainInspector={isMainInspector} tgUser={tgUser} timezoneOffset={timezoneOffset}/></div>}
    </div>
    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'0 0 12px' }}><CalendarDays size={18} color="var(--purple)"/><div className="atlas-display" style={{fontSize:19,fontWeight:800}}>Ближайшие ивенты</div><span style={{marginLeft:'auto',fontSize:12,color:'var(--text-muted)'}}>{upcomingEvents.length}</span></div>
    {!loading && !upcomingEvents.length && <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:18,color:'var(--text-muted)',fontSize:13,lineHeight:1.5}}>Предстоящих ивентов пока нет.</div>}
    {upcomingEvents.length>0 && <div style={{display:'flex',flexDirection:'column',gap:10}}>{upcomingEvents.map(event=>renderEventCard(event,false))}</div>}
    {pastEvents.length>0 && <section style={{marginTop:22}}><div style={{display:'flex',alignItems:'center',gap:8,margin:'0 0 12px'}}><Check size={18} color="var(--text-muted)"/><div className="atlas-display" style={{fontSize:19,fontWeight:800}}>Прошедшие ивенты</div><span style={{marginLeft:'auto',fontSize:12,color:'var(--text-muted)'}}>{pastEvents.length}</span></div><div style={{display:'flex',flexDirection:'column',gap:10}}>{pastEvents.map(event=>renderEventCard(event,true))}</div></section>}
    {error && <div role="status" style={{marginTop:10,background:'var(--surface-2)',border:'1px solid var(--red)',borderRadius:12,padding:10,color:'var(--red)',fontSize:12.5}}>{error}<button onClick={load} className="press" style={{marginLeft:8,border:0,background:'transparent',color:'var(--purple)',fontWeight:800}}>Повторить</button></div>}
    {notice && <FixedToast key={notice} message={notice} type={notice==='Это время напоминания уже прошло'?'warning':null}/>}
    {isMainInspector && <div style={{marginTop:18}}><EventManagementPanel initData={initData} territories={territories} timezoneOffset={timezoneOffset} timezoneReady={timezoneReady}/></div>}
  </div>;
}

const VOXYGEN_EVENT_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const EVENT_TIME_ZONE = 'Europe/Moscow';
function eventZonedParts(timestamp, timeZone = EVENT_TIME_ZONE) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return null;
  const fixedOffset = String(timeZone || '').trim().toUpperCase().match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (fixedOffset) {
    const shifted = new Date(date.getTime() + timezoneOffsetToMinutes(timeZone) * 60000);
    return {
      year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes(), second: shifted.getUTCSeconds()
    };
  }
  const values = {};
  try {
    for (const part of new Intl.DateTimeFormat('en-GB', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(date)) {
      if (part.type !== 'literal') values[part.type] = Number(part.value);
    }
  } catch {
    if (timeZone !== EVENT_TIME_ZONE) return eventZonedParts(timestamp, EVENT_TIME_ZONE);
    return null;
  }
  return values;
}
function eventDatePartsFromTimestamp(value, timeZone = EVENT_TIME_ZONE) {
  const parts = eventZonedParts(Number(value), timeZone);
  if (!parts) return defaultEventDateParts(timeZone);
  return { day:parts.day, month:parts.month, hour:parts.hour, minute:parts.minute };
}
function defaultEventDateParts(timeZone = EVENT_TIME_ZONE) {
  // Round up to the next full minute so the default is immediately publishable.
  return eventDatePartsFromTimestamp(Math.floor(Date.now() / 60000) * 60000 + 60000, timeZone);
}
function eventDatePartsTimestamp(parts, timeZone = EVENT_TIME_ZONE) {
  const day=Number(parts?.day), month=Number(parts?.month), hour=Number(parts?.hour), minute=Number(parts?.minute);
  if (![day,month,hour,minute].every(Number.isInteger) || day<1 || day>31 || month<1 || month>12 || hour<0 || hour>23 || minute<0 || minute>59) return null;
  const now=Date.now();
  const current=eventZonedParts(now, timeZone);
  const currentYear=Number(current?.year || new Date(now).getUTCFullYear());
  for(let year=currentYear;year<=currentYear+8;year++) {
    const targetUtc=Date.UTC(year,month-1,day,hour,minute,0,0);
    const targetDate=new Date(targetUtc);
    if(targetDate.getUTCFullYear()!==year || targetDate.getUTCMonth()!==month-1 || targetDate.getUTCDate()!==day) continue;
    let candidate=targetUtc;
    // Convert the wall-clock date/time in the requested timezone to a UTC timestamp.
    for(let attempt=0;attempt<4;attempt++) {
      const zoned=eventZonedParts(candidate,timeZone);
      if(!zoned) break;
      const representedUtc=Date.UTC(zoned.year,zoned.month-1,zoned.day,zoned.hour,zoned.minute,zoned.second||0,0);
      const delta=targetUtc-representedUtc;
      candidate+=delta;
      if(delta===0) break;
    }
    const check=eventZonedParts(candidate,timeZone);
    if(!check || check.year!==year || check.month!==month || check.day!==day || check.hour!==hour || check.minute!==minute) continue;
    if(candidate>now) return candidate;
  }
  return null;
}
function EventWheelColumn({ label, value, options, onChange }) {
  const scrollerRef=useRef(null), syncRef=useRef(false), interactionRef=useRef(false), settleRef=useRef(null);
  const rowHeight=36, foundIndex=options.findIndex(option=>Number(option.value)===Number(value));
  const selectedIndex=Math.max(0,foundIndex);
  useEffect(()=>{
    const node=scrollerRef.current;if(!node)return;
    syncRef.current=true;node.scrollTop=selectedIndex*rowHeight;
    const frame=requestAnimationFrame(()=>{syncRef.current=false;});
    return ()=>cancelAnimationFrame(frame);
  },[selectedIndex,options.length]);
  useEffect(()=>()=>{if(settleRef.current)clearTimeout(settleRef.current);},[]);
  function scheduleSettle(){
    if(settleRef.current)clearTimeout(settleRef.current);
    // Wait until the finger has lifted and native inertia/snap has stopped.
    settleRef.current=setTimeout(()=>{
      const node=scrollerRef.current;if(!node)return;
      const index=Math.max(0,Math.min(options.length-1,Math.round(node.scrollTop/rowHeight)));
      const option=options[index];
      if(option&&Number(option.value)!==Number(value))onChange(option.value);
    },190);
  }
  function handleScroll(){if(syncRef.current||interactionRef.current)return;scheduleSettle();}
  function startInteraction(){interactionRef.current=true;if(settleRef.current)clearTimeout(settleRef.current);}
  function endInteraction(){interactionRef.current=false;scheduleSettle();}
  function choose(option,index){
    if(settleRef.current)clearTimeout(settleRef.current);
    if(Number(option.value)!==Number(value))onChange(option.value);
    const node=scrollerRef.current;if(node){syncRef.current=true;node.scrollTop=index*rowHeight;requestAnimationFrame(()=>{syncRef.current=false;});}
  }
  return <label style={{display:'block',minWidth:0,flex:1}}>
    <span style={{display:'block',fontSize:10.5,color:'var(--text-muted)',fontWeight:750,textAlign:'center',marginBottom:5}}>{label}</span>
    <div style={{position:'relative',height:108,borderRadius:12,overflow:'hidden',background:'var(--surface-2)',border:'1px solid var(--border)'}}>
      <div aria-hidden="true" style={{position:'absolute',zIndex:1,left:4,right:4,top:36,height:36,borderRadius:9,border:'1px solid var(--purple-border)',background:'var(--purple-soft)',pointerEvents:'none'}}/>
      <div ref={scrollerRef} onScroll={handleScroll} onPointerDown={startInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} onTouchStart={startInteraction} onTouchEnd={endInteraction} role="listbox" aria-label={label} aria-activedescendant={`${label}-${value}`} tabIndex={0} style={{position:'relative',height:108,overflowY:'auto',overscrollBehaviorY:'contain',scrollSnapType:'y mandatory',scrollbarWidth:'none',touchAction:'pan-y',boxSizing:'border-box'}}>
        <div aria-hidden="true" style={{height:36,scrollSnapAlign:'none'}}/>
        {options.map((option,index)=><div key={option.value} id={`${label}-${option.value}`} role="option" aria-selected={Number(option.value)===Number(value)} onClick={()=>choose(option,index)} style={{height:36,boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',scrollSnapAlign:'center',fontSize:label==='Месяц'?11:(Number(option.value)===Number(value)?15:13),fontWeight:Number(option.value)===Number(value)?850:550,color:Number(option.value)===Number(value)?'var(--text)':'var(--text-muted)',userSelect:'none',cursor:'pointer'}}>{option.label}</div>)}
        <div aria-hidden="true" style={{height:36,scrollSnapAlign:'none'}}/>
      </div>
      <div aria-hidden="true" style={{position:'absolute',zIndex:2,inset:0,pointerEvents:'none',background:'linear-gradient(to bottom,var(--surface-2) 0%,transparent 25%,transparent 75%,var(--surface-2) 100%)',opacity:.56}}/>
    </div>
  </label>;
}
function EventDateTimeFields({ parts, onChange }) {
  const safe=parts||defaultEventDateParts();
  const daysInSelectedMonth=new Date(2000,Number(safe.month||1),0).getDate();
  function setPart(key,value) {
    const next={...safe,[key]:Number(value)};
    if(key==='month') next.day=Math.min(Number(next.day||1),new Date(2000,next.month,0).getDate());
    onChange(next);
  }
  const fields=[
    {key:'day',label:'День',options:Array.from({length:daysInSelectedMonth},(_,i)=>({value:i+1,label:String(i+1).padStart(2,'0')}))},
    {key:'month',label:'Месяц',options:VOXYGEN_EVENT_MONTHS.map((label,i)=>({value:i+1,label}))},
    {key:'hour',label:'Часы',options:Array.from({length:24},(_,i)=>({value:i,label:String(i).padStart(2,'0')}))},
    {key:'minute',label:'Минуты',options:Array.from({length:60},(_,i)=>({value:i,label:String(i).padStart(2,'0')}))},
  ];
  return <div style={{display:'flex',gap:7,marginTop:7,padding:9,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:15}}>
    {fields.map(field=><EventWheelColumn key={field.key} label={field.label} value={safe[field.key]} options={field.options} onChange={value=>setPart(field.key,value)}/>) }
  </div>;
}
function sanitizeEventCoords(value) { return String(value??'').replace(/[\u0000-\u001F\u007F]/g,'').slice(0,180); }
function formatEventCoords(value) {
  const raw=sanitizeEventCoords(value).trim();
  if(!raw)return '';
  // Coordinates are numeric metadata, not Minecraft-formatted text. Ignore any
  // formatting codes while recognizing the common stored `X 930 / Z 1260` form.
  const plain=raw.replace(/§x(?:§[0-9a-fA-F]){6}/gi,'').replace(/§(?:#[0-9a-fA-F]{6}|[0-9a-fK-OrR])/gi,'');
  const number='(-?\\d+(?:[.,]\\d+)?)';
  const labelled=plain.match(new RegExp('^\\s*X\\s*[:=]?\\s*'+number+'\\s*(?:\\/|,|;|\\s+)\\s*Z\\s*[:=]?\\s*'+number+'\\s*$','i'));
  if(labelled)return `${labelled[1]} / ${labelled[2]}`;
  const pair=plain.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*(?:\/|,|;|\s+)\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if(pair)return `${pair[1]} / ${pair[2]}`;
  return plain.replace(/\b[ZX]\s*[:=]?\s*/gi,'').replace(/\s*\/\s*/g,' / ').trim();
}
function pluralRu(value, one, few, many) { const n=Math.abs(Math.trunc(Number(value)||0)),lastTwo=n%100,last=n%10; if(lastTwo>=11&&lastTwo<=14)return many; if(last===1)return one; if(last>=2&&last<=4)return few; return many; }
function reminderUnitLabel(value, unit) { return unit==='hours'?pluralRu(value,'час','часа','часов'):pluralRu(value,'минуту','минуты','минут'); }

function ProfileEventCreateForm({ initData, territories = [], isMainInspector = false, tgUser = null, embedded = false, timezoneOffset = 'UTC+3' }) {
  const userId=String(tgUser?.id||'');
  const eventInputTimezone=normalizeTimezoneOffset(timezoneOffset);
  const userTerritories=(territories||[]).filter(city=>isMainInspector || String(city.owner_telegram_id||'')===userId || (Array.isArray(city.manager_telegram_ids)&&city.manager_telegram_ids.map(String).includes(userId)) || (Array.isArray(city.resident_telegram_ids)&&city.resident_telegram_ids.map(String).includes(userId)));
  const selectable=userTerritories.filter(city=>city&&!Number(city.is_government||0)&&city.status!=='pending');
  const [placeId,setPlaceId]=useState('');
  const [dateParts,setDateParts]=useState(()=>defaultEventDateParts(eventInputTimezone));
  const [dateEdited,setDateEdited]=useState(false);
  const dateTimezoneRef=useRef(eventInputTimezone);
  const [form,setForm]=useState({title:'',coords:'',description:'',imageData:null});
  const [busy,setBusy]=useState(false),[imageBusy,setImageBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const fileRef=useRef(null);
  useEffect(()=>{
    if(dateTimezoneRef.current!==eventInputTimezone){
      if(!dateEdited)setDateParts(defaultEventDateParts(eventInputTimezone));
      dateTimezoneRef.current=eventInputTimezone;
    }
  },[eventInputTimezone,dateEdited]);
  const selectedPlace=selectable.find(city=>String(city.id)===String(placeId))||null;
  const inputStyle={width:'100%',boxSizing:'border-box',minHeight:44,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:11,padding:'10px 12px',color:'var(--text)',fontSize:13,marginTop:6};
  function patch(key,value){setForm(v=>({...v,[key]:value}));}
  function choosePlace(id){const city=selectable.find(item=>String(item.id)===String(id));setPlaceId(city?String(city.id):'');patch('coords',formatEventCoords(city?.coords||''));setError('');}
  async function chooseImage(event){const input=event.currentTarget,file=input.files?.[0];if(!file){patch('imageData',null);return;}try{setImageBusy(true);setError('');setNotice('');patch('imageData',await readEventImage(file));}catch(e){input.value='';patch('imageData',null);setError(safeCaughtError(e,'Не удалось подготовить изображение.'));}finally{setImageBusy(false);}}
  async function publish(){
    const title=String(form.title||'').trim(),eventAt=eventDatePartsTimestamp(dateParts, eventInputTimezone);
    if(!title||!eventAt){setError('Укажите название, дату и время начала.');return;}
    if(eventAt<=Date.now()){setError('Выберите дату и время в будущем.');return;}
    try{
      setBusy(true);setError('');setNotice('');
      const response=await fetch(`${API_BASE}/api/events`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,title,territoryId:selectedPlace?String(selectedPlace.id):null,place:selectedPlace?String(selectedPlace.name||''):'Не указано',eventAt,eventTimezone:eventInputTimezone,coords:formatEventCoords(form.coords),description:String(form.description||'').trim(),imageData:form.imageData||null})});
      const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось опубликовать ивент.'));
      setForm({title:'',coords:'',description:'',imageData:null});setPlaceId('');setDateParts(defaultEventDateParts(eventInputTimezone));setDateEdited(false);if(fileRef.current)fileRef.current.value='';setNotice('Ивент создан');
    }catch(e){setError(safeCaughtError(e,'Не удалось опубликовать ивент.'));}finally{setBusy(false);}
  }
  const selectBtn=(active)=>({display:'flex',alignItems:'center',gap:7,minHeight:42,maxWidth:'100%',border:active?'1px solid var(--purple)':'1px solid var(--border)',borderRadius:11,padding:'8px 11px',background:active?'var(--purple-soft)':'var(--surface-2)',color:active?'var(--purple)':'var(--text)',fontSize:12.5,fontWeight:750,textAlign:'left'});
  return <section style={{marginTop:embedded?12:18,marginBottom:embedded?0:28,padding:embedded?0:15,background:embedded?'transparent':'var(--surface)',border:embedded?'none':'1px solid var(--border)',borderRadius:embedded?0:17,boxShadow:embedded?'none':'var(--shadow-sm)'}}>
    {!embedded&&<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:15}}><div style={{width:40,height:40,borderRadius:12,background:'var(--purple-soft)',color:'var(--purple)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Plus size={20}/></div><div className="atlas-display" style={{fontSize:17,fontWeight:800,lineHeight:1.2}}>Создать ивент</div></div>}
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:750}}>Название</label>
    <input value={form.title} onChange={e=>patch('title',e.target.value)} maxLength={160} placeholder="Название ивента" style={inputStyle}/>
    <div style={{fontSize:12,color:'var(--text-muted)',fontWeight:750,marginTop:15,marginBottom:8}}>Место проведения</div>
    <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
      <button type="button" aria-pressed={!selectedPlace} onClick={()=>choosePlace('')} className="press" style={selectBtn(!selectedPlace)}>{!selectedPlace?<Check size={14}/>:<MapPin size={14} color="var(--text-muted)"/>}Не указано</button>
      {selectable.map(city=>{const active=String(placeId)===String(city.id);return <button type="button" key={city.id} aria-pressed={active} onClick={()=>choosePlace(city.id)} className="press" style={selectBtn(active)}>{active?<Check size={14}/>:<MapPin size={14} color="var(--text-muted)"/>}<MinecraftText text={city.name} style={{minWidth:0}}/></button>;})}
    </div>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:750,marginTop:15}}>Дата и время начала</label>
    <EventDateTimeFields parts={dateParts} onChange={parts=>{setDateParts(parts);setDateEdited(true);}}/>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:750,marginTop:15}}>Координаты</label>
    <input value={formatEventCoords(form.coords)} onChange={e=>patch('coords',sanitizeEventCoords(e.target.value))} type="text" autoCapitalize="off" autoCorrect="off" placeholder="X / Z" style={inputStyle}/>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:750,marginTop:15}}>Описание</label>
    <textarea value={form.description} onChange={e=>patch('description',e.target.value.slice(0,542))} rows={4} maxLength={542} placeholder="Расскажите о событии" style={{...inputStyle,minHeight:104,resize:'none'}}/>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:750,marginTop:15}}>Обложка</label>
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} style={{display:'none'}}/>
    <button type="button" onClick={()=>fileRef.current?.click()} className="press" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',minHeight:46,marginTop:6,border:'1px solid var(--purple-border)',borderRadius:11,background:'var(--purple-soft)',color:'var(--purple)',fontWeight:800,fontSize:13}}><ImagePlus size={17}/>Выбрать файл</button>
    {fileRef.current?.files?.[0]?.name&&<div style={{fontSize:11.5,color:'var(--text-muted)',marginTop:6,overflowWrap:'anywhere'}}>{fileRef.current.files[0].name}</div>}
    {form.imageData&&<div style={{marginTop:10}}><img src={form.imageData} alt="Предпросмотр обложки" style={{display:'block',width:'100%',maxHeight:180,objectFit:'cover',borderRadius:12}}/><button type="button" onClick={()=>{patch('imageData',null);if(fileRef.current)fileRef.current.value='';}} className="press" style={{minHeight:40,border:0,background:'transparent',color:'var(--red)',padding:'6px 0',fontWeight:750}}>Убрать обложку</button></div>}
    <button onClick={publish} disabled={busy||imageBusy} className="press event-publish-button" style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,minHeight:47,marginTop:17,border:0,borderRadius:11,padding:'12px 14px',background:'var(--purple)',color:'#fff',fontWeight:800,fontSize:14,opacity:1,filter:'none'}}><CalendarDays size={17}/>{busy?'Публикация…':'Опубликовать ивент'}</button>
    {error&&<div role="alert" style={{marginTop:10,border:'1px solid var(--red-border)',background:'var(--red-soft)',borderRadius:10,padding:10,fontSize:12.5,color:'var(--red)'}}>{error}</div>}
    {notice&&<FixedToast key={notice} message={notice}/>}
  </section>;
}


function EventInlineEditor({ initData, event, territories = [], tgUser = null, isMainInspector = false, timezoneOffset = 'UTC+3', onCancel, onSaved, onDeleted }) {
  const userId=String(tgUser?.id||'');
  const selectable=(territories||[]).filter(city=>city&&(isMainInspector||!Number(city.is_government||0))&&city.status!=='pending'&&(
    isMainInspector || String(city.id)===String(event.territory_id||'') ||
    String(city.owner_telegram_id||'')===userId ||
    (Array.isArray(city.manager_telegram_ids)&&city.manager_telegram_ids.map(String).includes(userId)) ||
    (Array.isArray(city.resident_telegram_ids)&&city.resident_telegram_ids.map(String).includes(userId))
  ));
  const [form,setForm]=useState(()=>({title:event.title||'',territoryId:String(event.territory_id||''),coords:formatEventCoords(event.coords||''),description:String(event.description||'').slice(0,542),imageData:event.image_data||null,dateParts:eventDatePartsFromTimestamp(event.event_at,timezoneOffset),dateChanged:false,editorTimezone:normalizeTimezoneOffset(timezoneOffset)}));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const fileRef=useRef(null);
  const inputStyle={width:'100%',boxSizing:'border-box',minHeight:43,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'9px 11px',color:'var(--text)',fontSize:13,marginTop:6};
  function patch(key,value){setForm(v=>({...v,[key]:value}));}
  async function chooseImage(e){const input=e.currentTarget,file=input.files?.[0];if(!file)return;try{patch('imageData',await readEventImage(file));setError('');}catch(err){input.value='';setError(safeCaughtError(err,'Не удалось подготовить изображение.'));}}
  async function save(){
    const title=String(form.title||'').trim(),eventAt=form.dateChanged?eventDatePartsTimestamp(form.dateParts,form.editorTimezone||timezoneOffset):Number(event.event_at);
    if(!title||title.length>160||!Number.isSafeInteger(eventAt)){setError('Укажите название, дату и время ивента.');return;}
    if(form.dateChanged&&eventAt<=Date.now()){setError('Выберите дату и время в будущем.');return;}
    const city=selectable.find(t=>String(t.id)===String(form.territoryId));
    if(form.territoryId&&!city){setError('Выберите доступную территорию или «Не указано».');return;}
    try{
      setBusy(true);setError('');
      const body={initData,id:event.id,title,territoryId:city?String(city.id):null,place:city?String(city.name||''):'Не указано',eventAt,eventTimezone:form.dateChanged?(form.editorTimezone||timezoneOffset):(event.event_timezone||'UTC'),coords:formatEventCoords(form.coords),description:String(form.description||'').trim().slice(0,542),imageData:form.imageData||null};
      const response=await fetch(`${API_BASE}/api/events`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify(body)});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось сохранить ивент.'));
      onSaved?.();
    }catch(err){setError(safeCaughtError(err,'Не удалось сохранить ивент.'));}finally{setBusy(false);}
  }
  async function removeEvent(){
    if(!window.confirm(`Удалить ивент «${event.title}»?`))return;
    try{setBusy(true);setError('');const response=await fetch(`${API_BASE}/api/events`,{method:'DELETE',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,id:event.id})});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(apiErrorMessage(response,data,'Не удалось удалить ивент.'));onDeleted?.();}
    catch(err){setError(safeCaughtError(err,'Не удалось удалить ивент.'));}finally{setBusy(false);}
  }
  return <div style={{border:'1px solid var(--purple-border)',background:'var(--surface-2)',borderRadius:13,padding:12,marginBottom:10}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><div style={{fontSize:13,fontWeight:800,flex:1,minWidth:0}}>Редактировать ивент</div><button type="button" onClick={removeEvent} disabled={busy} title="Удалить ивент" aria-label="Удалить ивент" className="press" style={{width:36,height:36,flex:'0 0 auto',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--red-border)',borderRadius:10,background:'var(--red-soft)',color:'var(--red)'}}><Trash2 size={15}/></button></div>
    <label style={{fontSize:12,color:'var(--text-muted)',fontWeight:700}}>Название</label><input value={form.title} onChange={e=>patch('title',e.target.value.slice(0,160))} maxLength={160} style={inputStyle}/>
    <div style={{fontSize:12,color:'var(--text-muted)',fontWeight:750,marginTop:12,marginBottom:7}}>Место проведения</div>
    <div style={{display:'flex',flexWrap:'wrap',gap:6}}><button type="button" onClick={()=>patch('territoryId','')} className="press" style={{...eventManagePlaceStyle(!form.territoryId),minHeight:40}}>Не указано</button>{selectable.map(city=><button key={city.id} type="button" onClick={()=>patch('territoryId',String(city.id))} className="press" style={{...eventManagePlaceStyle(String(form.territoryId)===String(city.id)),minHeight:40}}><MinecraftText text={city.name}/></button>)}</div>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:750,marginTop:13}}>Дата и время начала</label><EventDateTimeFields parts={form.dateParts} onChange={parts=>setForm(v=>({...v,dateParts:parts,dateChanged:true}))}/>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:750,marginTop:13}}>Координаты</label><input value={formatEventCoords(form.coords)} onChange={e=>patch('coords',sanitizeEventCoords(e.target.value))} type="text" autoCapitalize="off" autoCorrect="off" placeholder="X / Z" style={inputStyle}/>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:750,marginTop:13}}>Описание</label><textarea value={form.description} onChange={e=>patch('description',e.target.value.slice(0,542))} rows={4} maxLength={542} placeholder="Расскажите о событии" style={{...inputStyle,resize:'none',minHeight:95}}/>
    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} style={{display:'none'}}/><button type="button" onClick={()=>fileRef.current?.click()} className="press" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,width:'100%',minHeight:42,marginTop:10,border:'1px solid var(--purple-border)',borderRadius:10,background:'var(--purple-soft)',color:'var(--purple)',fontWeight:800}}><ImagePlus size={16}/>Изменить обложку</button>{form.imageData&&<div style={{marginTop:9}}><img src={form.imageData} alt="Обложка" style={{display:'block',width:'100%',maxHeight:150,objectFit:'cover',borderRadius:10}}/><button type="button" onClick={()=>patch('imageData',null)} className="press" style={{border:0,background:'transparent',color:'var(--red)',padding:'8px 0',fontWeight:700}}>Убрать обложку</button></div>}
    {error&&<div role="alert" style={{border:'1px solid var(--red-border)',background:'var(--red-soft)',borderRadius:10,padding:9,marginTop:10,fontSize:12,color:'var(--red)'}}>{error}</div>}
    <div style={{display:'flex',gap:8,marginTop:12}}><button onClick={save} disabled={busy||!form.title.trim()} className="press" style={{flex:1,border:0,borderRadius:10,minHeight:42,background:'var(--purple)',color:'#fff',fontWeight:800}}>Сохранить</button><button onClick={onCancel} disabled={busy} className="press" style={{border:'1px solid var(--border)',borderRadius:10,padding:'0 12px',background:'var(--surface)',color:'var(--text)',fontWeight:700}}>Отмена</button></div>
  </div>;
}

function EventManagementPanel({ initData, territories = [], timezoneOffset = 'UTC+3', timezoneReady = true }) {
  const [events,setEvents]=useState([]),[editingId,setEditingId]=useState(null),[form,setForm]=useState(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const fileRef=useRef(null);
  const inputStyle={width:'100%',boxSizing:'border-box',minHeight:43,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:'9px 11px',color:'var(--text)',fontSize:13,marginTop:6};
  async function load(){try{setLoading(true);setError('');const r=await fetch(`${API_BASE}/api/events?manage=1`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось загрузить события.'));setEvents(d.events||[]);}catch(e){setError(safeCaughtError(e,'Не удалось загрузить события.'));}finally{setLoading(false);}}
  useEffect(()=>{if(initData)load();},[initData]);
  function startEdit(event){if(Number(event.event_at)<=Date.now()){setError('Прошедшие ивенты нельзя редактировать.');return;}setEditingId(event.id);setForm({title:event.title||'',territoryId:String(event.territory_id||''),legacyPlace:event.place||'',coords:formatEventCoords(event.coords||''),description:event.description||'',imageData:event.image_data||null,dateParts:eventDatePartsFromTimestamp(event.event_at,timezoneOffset),dateChanged:false,eventAtOriginal:Number(event.event_at),eventTimezoneOriginal:event.event_timezone||'UTC',editorTimezone:normalizeTimezoneOffset(timezoneOffset)});setError('');setNotice('');}
  function patch(key,value){setForm(v=>v?({...v,[key]:value}):v);}
  function cancelEdit(){setEditingId(null);setForm(null);if(fileRef.current)fileRef.current.value='';}
  async function chooseImage(event){const input=event.currentTarget,file=input.files?.[0];if(!file)return;try{patch('imageData',await readEventImage(file));}catch(e){input.value='';setError(safeCaughtError(e,'Не удалось подготовить изображение.'));}}
  async function save(){if(!form)return;const title=String(form.title||'').trim();const eventAt=form.dateChanged?eventDatePartsTimestamp(form.dateParts,form.editorTimezone||timezoneOffset):Number(form.eventAtOriginal);if(!title||!Number.isSafeInteger(eventAt)){setError('Укажите название, дату и время ивента.');return;}const city=territories.find(t=>String(t.id)===String(form.territoryId));const place=city?String(city.name||''):String(form.legacyPlace||'Не указано');try{setBusy(true);setError('');setNotice('');const body={initData,id:editingId,title,territoryId:city?String(city.id):null,place,eventAt,eventTimezone:form.dateChanged?(form.editorTimezone||timezoneOffset):(form.eventTimezoneOriginal||'UTC'),coords:formatEventCoords(form.coords),description:String(form.description||'').trim(),imageData:form.imageData||null};const r=await fetch(`${API_BASE}/api/events`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify(body)}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось сохранить ивент.'));setNotice('Ивент обновлён');cancelEdit();await load();}catch(e){setError(safeCaughtError(e,'Не удалось сохранить ивент.'));}finally{setBusy(false);}}
  async function remove(event){if(!window.confirm(`Удалить ивент «${event.title}»?`))return;try{setBusy(true);setError('');const r=await fetch(`${API_BASE}/api/events`,{method:'DELETE',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,id:event.id})}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось удалить ивент.'));if(editingId===event.id)cancelEdit();setNotice('Ивент удалён');await load();}catch(e){setError(safeCaughtError(e,'Не удалось удалить ивент.'));}finally{setBusy(false);}}
  return <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:14,marginTop:16,marginBottom:20}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}><CalendarDays size={17} color="var(--purple)"/><div className="atlas-display" style={{fontSize:16,fontWeight:800}}>Управление ивентами</div><span style={{marginLeft:'auto',fontSize:11,color:'var(--text-muted)'}}>{events.length}</span></div>
    {loading&&!events.length?null:!events.length?<div style={{fontSize:12,color:'var(--text-muted)'}}>Опубликованных ивентов нет.</div>:events.map(event=><div key={event.id} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 0',borderBottom:'1px solid var(--border)'}}><div style={{flex:1,minWidth:0}}><MinecraftText text={event.title} as="div" style={{fontSize:13,fontWeight:750}}/><div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>{eventDateLabel(event.event_at,timezoneOffset)}</div></div>{Number(event.event_at)>Date.now()&&<button onClick={()=>startEdit(event)} disabled={!timezoneReady} className="press" style={{border:'1px solid var(--purple-border)',borderRadius:9,background:'var(--purple-soft)',color:'var(--purple)',padding:8,minWidth:42,minHeight:42,opacity:timezoneReady?1:.55}} title="Изменить"><Pencil size={14}/></button>}<button onClick={()=>remove(event)} disabled={busy} className="press" style={{border:'1px solid var(--red-border)',borderRadius:9,background:'var(--red-soft)',color:'var(--red)',padding:8,minWidth:42,minHeight:42}} title="Удалить"><Trash2 size={14}/></button></div>)}
    {form&&<div style={{borderTop:'1px solid var(--border)',marginTop:13,paddingTop:13}}><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:9}}><div style={{fontSize:13,fontWeight:800,flex:1,minWidth:0}}>Редактировать ивент</div><button type="button" onClick={()=>{const event=events.find(item=>String(item.id)===String(editingId));if(event)remove(event);}} disabled={busy} title="Удалить ивент" aria-label="Удалить ивент" className="press" style={{width:36,height:36,flex:'0 0 auto',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--red-border)',borderRadius:10,background:'var(--red-soft)',color:'var(--red)'}}><Trash2 size={15}/></button></div><label style={{fontSize:12,color:'var(--text-muted)',fontWeight:700}}>Название</label><input value={form.title} onChange={e=>patch('title',e.target.value)} maxLength={160} style={inputStyle}/><label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:700,marginTop:12}}>Место проведения</label><div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:7}}><button type="button" onClick={()=>{patch('territoryId','');patch('legacyPlace','Не указано')}} className="press" style={{...eventManagePlaceStyle(!form.territoryId),minHeight:40}}>Не указано</button>{territories.filter(t=>!Number(t.is_government||0)).map(t=><button key={t.id} type="button" onClick={()=>{patch('territoryId',String(t.id));patch('legacyPlace',t.name||'');}} className="press" style={{...eventManagePlaceStyle(String(form.territoryId)===String(t.id)),minHeight:40}}><MinecraftText text={t.name}/></button>)}</div><label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:700,marginTop:12}}>Дата и время начала</label><EventDateTimeFields parts={form.dateParts} onChange={parts=>setForm(v=>({...v,dateParts:parts,dateChanged:true}))}/><label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:700,marginTop:12}}>Координаты</label><input value={formatEventCoords(form.coords)} onChange={e=>patch('coords',sanitizeEventCoords(e.target.value))} type="text" autoCapitalize="off" autoCorrect="off" placeholder="X / Z" style={inputStyle}/><label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:700,marginTop:12}}>Описание</label><textarea value={form.description} onChange={e=>patch('description',e.target.value.slice(0,542))} rows={4} maxLength={542} style={{...inputStyle,resize:'none'}}/><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} style={{display:'none'}}/><button type="button" onClick={()=>fileRef.current?.click()} className="press" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7,width:'100%',minHeight:42,marginTop:10,border:'1px solid var(--purple-border)',borderRadius:10,background:'var(--purple-soft)',color:'var(--purple)',fontWeight:800}}><ImagePlus size={16}/>Выбрать файл обложки</button>{form.imageData&&<img src={form.imageData} alt="Обложка" style={{width:'100%',maxHeight:140,objectFit:'cover',borderRadius:10,marginTop:9}}/>}<div style={{display:'flex',gap:8,marginTop:12}}><button onClick={save} disabled={busy||!form.title.trim()} className="press" style={{flex:1,border:0,borderRadius:10,minHeight:43,background:'var(--purple)',color:'#fff',fontWeight:800}}>{busy?'Сохранение…':'Сохранить изменения'}</button><button onClick={cancelEdit} disabled={busy} className="press" style={{border:'1px solid var(--border)',borderRadius:10,padding:'0 12px',background:'var(--surface-2)',color:'var(--text)',fontWeight:700}}>Отмена</button></div></div>}
    {error&&<div role="alert" style={{fontSize:12,color:'var(--red)',marginTop:9}}>{error}</div>}{notice&&<div role="status" style={{fontSize:12,color:'var(--mint)',marginTop:9}}>{notice}</div>}
  </div>;
}
function eventManagePlaceStyle(active){return {border:active?'1px solid var(--purple)':'1px solid var(--border)',borderRadius:10,padding:'8px 10px',background:active?'var(--purple-soft)':'var(--surface-2)',color:active?'var(--purple)':'var(--text)',fontSize:12,fontWeight:700};}

function MainTabs({ tab, onChange }) {
  const items = [
    { key: 'recruit', label: 'Набор', icon: UserPlus },
    { key: 'map', label: 'Карта', icon: MapIcon },
    { key: 'rating', label: 'Рейтинг', icon: ListIcon },
  ];

  return (
    <div style={{ padding: '4px 16px 14px' }}>
      <div style={{
        background: 'var(--surface-2)', borderRadius: 12, padding: 3, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2,
      }}>
        {items.map((it) => {
          const active = it.key === tab;
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              className="press"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                minWidth: 0, padding: '7px 7px', borderRadius: 999, fontSize: 12.5, fontWeight: active ? 700 : 600,
                border: 'none', cursor: 'pointer',
                background: active ? 'var(--purple)' : 'transparent',
                color: active ? '#fff' : 'var(--text-muted)',
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


function SimpleModal({title,children,onClose}){const {closing,requestClose}=useAnimatedClose(onClose,175);return <div className={`atlas-overlay${closing?' atlas-closing':''}`} style={{position:'fixed',inset:0,zIndex:100,background:'rgba(0,0,0,.78)',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px 16px'}} onClick={requestClose}><div onClick={e=>e.stopPropagation()} className={`atlas-modal-shell${closing?' atlas-closing':''}`} style={{width:'min(448px,100%)',maxHeight:'76vh',overflowY:'auto',margin:'auto',background:'#12151D',border:'1px solid var(--border)',borderRadius:22,padding:18}}><div style={{display:'flex',alignItems:'center',justifyContent:title?'space-between':'flex-end',marginBottom:title?14:10}}>{title&&<div className="atlas-display" style={{fontSize:18,fontWeight:700}}>{title}</div>}<button onClick={requestClose} className="press" style={iconBtn('var(--surface-2)','var(--text-muted)')}><X size={16}/></button></div>{children}</div></div>}
function FaqModal({onClose,text}){
  return <SimpleModal title="ЧиВо" onClose={onClose}>
    <div style={{fontSize:13,lineHeight:1.55,color:'var(--text-muted)',whiteSpace:'pre-wrap'}}>{String(text??'')}</div>
  </SimpleModal>;
}
function HomeFeatureButtonModal({mode='view',config,onClose,initData,onSaved}){
  const [form,setForm]=useState(()=>({...config}));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const fileRef=useRef(null);
  const inputStyle={width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:11,padding:'10px 12px',color:'var(--text)',fontSize:13,marginTop:6};
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
    {form.subtitle&&<div style={{fontSize:12,color:'var(--text-muted)',fontWeight:650,marginBottom:10}}>{form.subtitle}</div>}
    <div style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.6,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{form.text||'Информация пока не добавлена.'}</div>
  </SimpleModal>;
  return <SimpleModal title="Настройка кнопки" onClose={onClose}>
    <div style={{fontSize:12,color:'var(--text-muted)',fontWeight:700,marginBottom:7}}>Изображение кнопки</div>
    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
      <div style={{width:64,height:64,borderRadius:12,overflow:'hidden',border:'1px solid var(--border)',background:'var(--surface-2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{form.imageData?<img src={form.imageData} alt="Изображение кнопки" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<ImagePlus size={22} color="var(--text-muted)"/>}</div>
      <div style={{flex:1,minWidth:0}}><input ref={fileRef} type="file" accept="image/*" onChange={chooseImage} style={{width:'100%',fontSize:11.5,color:'var(--text-muted)'}}/><div style={{fontSize:10.5,color:'var(--text-muted)',marginTop:4}}>Изображение будет подогнано под квадрат кнопки.</div>{form.imageData&&<button type="button" onClick={()=>{patch({imageData:''});if(fileRef.current)fileRef.current.value=''}} className="press" style={{marginTop:6,border:'none',background:'transparent',color:'var(--red)',fontSize:11.5,padding:0}}>Удалить изображение</button>}</div>
    </div>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:700}}>Заголовок<input value={form.title||''} maxLength={80} onChange={e=>patch({title:e.target.value})} style={inputStyle}/></label>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:700,marginTop:12}}>Подзаголовок<input value={form.subtitle||''} maxLength={140} onChange={e=>patch({subtitle:e.target.value})} style={inputStyle}/></label>
    <label style={{display:'block',fontSize:12,color:'var(--text-muted)',fontWeight:700,marginTop:12}}>Текст<textarea value={form.text||''} maxLength={6000} rows={6} onChange={e=>patch({text:e.target.value})} style={{...inputStyle,resize:'vertical',lineHeight:1.5}}/></label>
    <div style={{marginTop:8}}><SettingsToggle label="Скрыть кнопку для пользователей" description="Главный инспектор продолжит видеть кнопку и сможет редактировать её." checked={Boolean(form.hidden)} onChange={hidden=>patch({hidden})}/></div>
    {error&&<div role="alert" style={{fontSize:12,color:'var(--red)',marginTop:8}}>{error}</div>}
    <button onClick={save} disabled={busy} className="press" style={{width:'100%',border:'none',borderRadius:11,padding:'12px',background:'var(--purple)',color:'#fff',fontWeight:750,marginTop:12}}>{busy?'Сохранение…':'Сохранить'}</button>
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

const GEM_ICON_DATA_URL="data:image/png;base64,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AAAAAAAA4IRIAAAAAAAAAAAAcEIkAAAAAAAAAAAAOCESAAAAAAAAAAAAnBAJAAAAAAAAAAAATogEAAAAAAAAAAAAJ0QCAAAAAAAAAACAEyIBAAAAAAAAAADACZEAAAAAAAAAAADghEgAAAAAAAAAAABwQiQAAAAAAAAAAAA4IRIAAAAAAAAAAACcEAkAAAAAAAAAAABOiAQArB8nEAAAghNJREFUAAAAAAAAAAAnRAIAAAAAAAAAAIATIgEAAAAAAAAAAMAJkQAAAAAAAAAAAOCESAAAAAAAAAAAAHBCJAAAAAAAAAAAADghEgAAAAAAAAAAAJwQCQAAAAAAAAAAAE6IBAAAAAAAAAAAACdEAgAAAAAAAAAAgBMiAQAAAAAAAAAAwAmRAAAAAAAAAAAA4IRIAAAAAAAAAAAAcEIkAAAAAAAAAAAAOCESAAAAAAAAAAAAnBAJAAAAAAAAAAAATogEAAAAAAAAAAAAJ0QCAAAAAAAAAACAEyIBAAAAAAAAAADACZEAAAAAAAAAAADghEgAAAAAAAAAAABwQiQAAAAAAAAAAAA4IRIAAAAAAAAAAACcEAkAAAAAAAAAAABOiAQAAAAAAAAAAAAnRAIAAAAAAAAAAIATIgEAAAAAAAAAAMAJkQAAAAAAAAAAAOCESAAAAAAAAAAAAHBCJAAAAAAAAAAAADghEgAAAAAAAAAAAJwQCQAAAAAAAAAAAE6IBAAAAAAAAAAAACdEAgAAAAAAAAAAgBMiAQAAAAAAAAAAwAmRAAAAAAAAAAAA4IRIAAAAAAAAAAAAcEIkAAAAAAAAAAAAOCESAAAAAAAAAAAAnBAJAAAAAAAAAAAATogEAAAAAAAAAAAAJ0QCAAAAAAAAAACAEyIBAAAAAAAAAADACZEAAAAAAAAAAADghEgAAAAAAAAAAABwQiQAAAAAAAAAAAA4IRIAAAAAAAAAAACcEAkAAAAAAAAAAABOiAQAAAAAAAAAAAAnRAIAAAAAAAAAAIATIgEAAAAAAAAAAMAJkQAAAAAAAAAAAOCESAAAAAAAAAAAAHBCJAAAAAAAAAAAADghEgAAAAAAAAAAAJwQCQAAAAAAAAAAAE6IBAAAAAAAAAAAACdEAgAAAAAAAAAAgBMiAQAAAAAAAAAAwAmRAAAAAAAAAAAA4IRIAAAAAAAAAAAAcEIkAAAAAAAAAAAAOCESAAAAAAAAAAAAnBAJAAAAAAAAAAAATogEAAAAAAAAAAAAJ0QC4CuS9pf7cwCA8wr+CZ63bezT7+yw43f753y9f/y5vxuPcNwInsc/Z+3rlge/wnZPu8UyQbCkJ3jm3tnbxzd3Q2tT3/fk9nn9Cr6edwje39Oftn0/9369fy9272/f/dnxPug/v3mP7P6+ID7wlFKuXD4+HrflJ8ZzAL4uE/8E77zjt4MJ3RsT/O204f7vuzc47BNLXiLA803gbgZ9WQeEaW9P+vG1Thz6zDHaDbK7SSwVm4lg7O471hA8Pgzw9js5TUqlrLdvCwqmmcLKYZ+SnxobrDcIY4EHscw2JrPha0ftkbKUcvNsuyzvPL0Wspu+YTvG5Kl/lnsgWnv78lRaH6dbyNLa161+bCaTLd+/+z5oH/d+3o9+QASQ3+N8MXdv+bTboeESWL4z3zPmgc/x9t8ldC3Xtpt72w4xAht+Jpb3gCtlLbjvysz6bhkad2znHOIAsuAeeOgD7UM/7lKu7RH9ZdDeDYV/LQBiHE+44FM/x0sdAL5Klp8YOCT/RqceGNK+7+Ep/VHD/N6m9/7Um02eTBWA07/XP/Pn9CN/Dr8Z4w6A/e6u/c6Ao7Ya3/M9OTT+vvHP5P4dYewKey5x5x6hnQDcYgcAAJxsgrcM4tt/zNNweL8sswSXZV0lmnJJc5sA9tIhuYQI+r1FkPjB071lddf22R8n9MvXM9tSwL4EtK7827eh53pPeG4XAowBgfV7SRDoCe6Dn7ozM6QhsuPtay6X13tmvTO2O0Bo82doebn5po1qO8USCjIbv17Xfi8r+w+SOrb7eJ802jc774Dnfq/n0E7znfdE79fzaCx5p33X/SYkAZ7BvlTPvZ/xm3YOeYZMJsuo/UWmrO0ZvNc3bDsDAswPlbs26mO0tsvDUsOOr/af0W4A7w0AAPB1DgJyO7n7VFCHCf/ztFv/76hNlonf2M65Dez1QeAY3LdhMrn8mbz/9+P5HO3gXM506HGD4dyH3HzPl7ugfs8PEgs+/IeHTd/SW0jH1/bLoW2yJ3V20718u1/5nL4H7+998Vb/vSR3CR68915heWfbwfvbxp/7jPZ9e7xHEPkJ3vYyRX9jt49jO/6z9fN74zkAXxd2AADAGSZ1drsqK3eTvWTwh9ESLDpYPj4WAZa12rHbn+NeemDTHczej1bq9ud+P9vfJ34+ZZxQ2q5vwYOm/vZT75V+ssdnhICG3QX798rm5/BlLSv92wr/T/TxqVxW/6d+Wv12nvsnvyUOPj/aAWp5Zwz5qfHmJz7HO7lPNgmBdv5TLxVjw4DBftz9hi8+Ath8vN+1uRnnGc8uAPoAAACwn1K8cZgsnl/+JbUX8b33+Zy+2aZ2fN3Xj8Z7eNA/NX37zYRreQ2csx/h/X6S9vxJ7wTf9RG+lAlLHX8f74lvSjsCADsAgK99aNBX9Q2rxDOZ6H0NbQ6EtWfePifoa23CmG3ySC/xWFlrwK+fHrevpHLn67e/8c7Xhx1GY/8R3AKPvQM27bLu2OmtWXftHAdsLPcFwSWPvmo4Nr/KWiBh/O14/Hs82srdsX22bRqSSi390M6L6LWh+3939oHhnbAfcb9sH/lWJip765tieQP4zY4/zv547vH88bt4re8WVgPBfdyW8vXMF3k7/6nW/6/vhjXgn/3ckM2Vf/uneP7bho2l/Xv7bAYKvjzX0lo2DsBX+t7gnwAAAEhr9Z8xsDh+Hc8h7kz4l7az7fd7rffc/bnY/Znx58O27T7Wjd//fjzmWf0RP308Cci1bnQNJIVkeXwGhMWdO5HrQ64Wy+Geh+3S2ms9BLK3I88O3n5f8K5/Z+MB243fNPx38K6Ou6v623ki7eyX7OXF+o6jzZUQ0vM8yN52bKztpiGxsznzh38t4KvHDgAosy0NwmnZ0L5mtvk8rH4toi37bx+7W7038LQ+eWCr1TYs7oq41mvOSndl5vJ9M1dE6NJ+rn+dSME7vz9aO28mfhHK1q5pknlbGWR1ZVjvHzLrT4UkX26D3E0k6R8e/v4eV4Af3gRrNMDMNiWCNgGfrDXCZ6trAPvPj3/P0q+kDr+OL/xeb8+23zRCbtrKvN0CmYqc5TKZSZZzCxTUz9sP1Xsh5/HBv1833KItHub6pa/1XJa6ZcP33bGFFFL2Ng6TeWvSlFJzfR8oFUrNyvUewPt6B/QmP3j/m5ky6hsi3Ta7e8NCZlHPh2jjQLkU8yyLqH92PPuDvv4pHZb9sdr+EbMyUm4ms1RGKGTyyXSNbMHhOi6YZSrmSoXiGiqlLDdLHJwjU98DJAEePxA4HPjJ3fUaszJTF/O6uydVd3jYdn7fx/t9zjDPc5sbADgjEgBYggLjtU/8CQCfaJLQAr5juxqJn3NPAnbP+fgxbf91PfOb/j7X70dEDQZnKs2XAOAYWRimCcSHnq2Nx3bK3dfbB5l94teDu2PApwV/3WS56xfcWsmAYY45nBeYRorwGeb9tmuFor7SL1tfX597zxrU2y/kr4kByTKW4P/9tu0HCGs4OJLrQ6733vq9LNCYwMtZGa5oQd3MbM++yWRyt7oQqHUieacOJP3/OxoTRvykIN6SOGD+967N81z7ffd2tm+uif55XtrZtM79ldI0TTIzzfO8loC76QtKO0AYj+OS4rbaT6v5Pw+LONy9tXLLAru9OVd0d/p64MRIABAgWgYEfXCfrQh8joEg3QYYJEoAvJcgQe7+nySVgzbOYfLH4P8dTPDulADZz9ajBXh7ko/2hZmpeKr4OhewrDXDvbTAUK5lQOp9ZUsF0XUCgsc9+7FpBRu3dw8T98iUeZ3me5FMqWJjf387JhgDQHkzbujdC33IYwdw23awtO1Yrp/VMe/f7VLOKf/woqk9/5ZSyaIwU5lsSQ5u3yvbp5/n/6E9wCaGE8Mz3wND01Q02UtdCdwC/H3H0FReFPHx/rxgGF8cnTHC2P95+E2ivpojVFoAMKy+3yNCVnw5L6QvBlmaM9pK4OI1gJwcDv707a/jVGBE1GC+TBYhT1PKVNTGdkplXBUtBRARijkUZpqmqe4WPnjmlzMH+Kd/+Dtg7faHd3Xrsef2nSJT5FWWs5Rz3RwWMTz/bWFQ5NLe40IhAOdDAgCbQb+GFeKHq0d3f4ZFxM/fpmuZF9t8nG3IMO1Whh+1O95BW7/RZPsV/+wAgFRXgWkOhbLVDTXZtQV4zeo6oj4hyPbhuHyYGcLD2FE99qFqV1/xVzMA0YJ/ppxDkilKLCsDa62n9f3vLeFjw/Xwf8PBz3H9Mte790W7Dbw9r1FrOS0VgU3Wqzrrer3qh1LkWScDIVPErPk6lIiz8VHviQZvpWi4Pu5qyhwPe3Yph5ItZvrhddY8v2qaXnTNVHpqbmO/a8zHISWTivcAcRx+H+/DspLfbSkX1nf2pJsssgb83eRRDwPp5YJ0Xd/vNPmzD/7bId7t2e/JQG+B/oxQXmspMDdTkauYabb6jLu5iksXc80ZUoRyvi6/s9835U4cAE8wHlQOQ8A6np+GHZ2ubDv8pOLLyQ63/XuMu8doaeCsSAB89UGEXSCwf96+RgLgfG1sQ53vpcZnWzqa7QyAbJMCVok//8B//1Dua3Uvq/6tH/hph4eC4SvrE7KuDHLLuq6/HfxpLmluqwD7RDK3N9iy+pylgQ+d8rUp27pCd3+4bzvbwbyu/izta0XSJJMPgWG1lYHr79mvK6u29d/XMyK4ftnr5k5obeKyTb/uLfkzrhA1M5UilWKSu1TqSr/sz7pf1LoAtZjyzdiv3gM9HMT1UVdT2Zzp0R739jyX2kWbZJPLW8gnVOO65kXySenWQ0abnYE2bCeKg/6FE4KeYPhnerOPTq/B/6Wsn9dyL33s75Yq7ZjX6IkBM10z6tGhdxrYh52leLz9Pqyw9Xwns3UcMLmppFQipJilmOUx18CwJPNJlxb37TsCcncGACO+ZxObMYBJCutnOLWePVOZIcuQ66oir8mdpQRoHQuOh8DcKwEH4BxIAHztA8ihBFBf/d1LAEnabAE/evszAHwHw4OIpR37AT/9v4jYfO6tXuh++z+e9gEeHspcggDj9/tKzsioh/1m1JJAtO9X1c/bwcShZKiENLeSMNZXj4bqIeCxnVz0Pp/ar0/QptKyGyPzIChjNQBsKUXkkvSxNjH0jLrqv638t1h/iUUqe5n3fLv/6XNGrl/2elTqLYdyXbXar2luJX8U2QICqu+AkMJdc1s9em3Bg8xeMk66XnMXAFp3iGz/cuP6gOtS8Cnr7p7eTt52a0xuiiyK1r6R0mtL9lyz7g6p4//6/yJDs0I2z4oIueVu4N/HGCnCgU/yDjhoht48MY71lfL0+hyb6g6PORTXuR4krRowlkkedbXwW38x5788442wXbG/HA4dWRd7RNb2nlP5+qqLSZfJ5HNK11nKWgzIW3nAehxwNSYZbPf3sSPvMddte4yF+Vq7Zd3tqUyZZnkrG+eZUsxLzCeitrWZmZvnvdKPAM6DBMBXbjkEqK/4b6u+rQWK99gB8P70A336x/1qZvKptFUi29I/1u4NPHnb9lIAdx7GNG8DQpPS5ea1fIC7rNC+X/W90ycOOdfVoSZ5et1O3moCu2zb71ssq8WZIjzDxN9u3sU+BoGyVQtJqdQFoHULeIv1F9UyT/XQ2GEHQG/jzJskv+8XAbSvcf3y13ttMkYGSisFke5Lrf+M1Jwhn7wdAF7vlWtfQW7S7DUJqE8EgJaDJ7h+8aun3T6fWksAZdZ2lKQ5+rkQ7YemUoPDdbDX+oaiknW8GG2DSG1v24wn1ALJTgj4ycaD289Lm8PNGSrmKqXo2g76nudZ312+lRVfEgTFa79S3yX3S4HenD2Bx87j7fadvCRuI+RmdfV/1CTfSyn6+c++1X/4+L1K+/x1vkoxq5i3RQOh4r4kEjY7y8a/y9oZBFy/+HUZk98c0tR2gWT9frbdPCVUd/zmrJxf9XKZ2jyfpxj42ky9LETvAri+r+vdyPwYCGg/Ox4SFm2Cd7lMKi+XuqqzlQbxqAFCZdZtYQcv/Tf+WjxTfKit6h93AERELQPw4UXlw0XTy2Xzs5kp5xyA9zL0H3qCvHk65xYBdDPZLHkx+Wxyly4fXpbBo1mqhLdSIetzXfpEIrYPfJ9o9u+zIufBK4HyfjCgB/pLP8zP65bwlzn0+99+o0mm0DrRU5nWPqInADYBv2iHjPEGfvQ1rF4967XXZu/tc23PdoRUlDIryrjKVfRbL5M+zLO+c2sHAvtSXCS9HgwXd2pArLsNWIn92Ov9EVm2IF600g+Z9byfjKyr/c31L/7kz/XvLy+K13rwh7ekTynrmCE/YxhAP/ygMyD6OSDpyyHttT3aTh7PFsi76Bpz3TNQJvnlRX/w7/9cP7xcFC8vKtNF7qXuEAnJpqIyz0OAvx826Zugn5P/feoEQH1+o5WCSpVykeZXXa+hotSf/It/ocnqWSDzPKuUUneLRkgWMhWF9ffL7d+TTBGep91te2B7qJ7uHhGylC5yeaTm60f91jff6eP/8q/0X/zN39HH6/f6+XffSa9zPQvGJYt1ntjLhX7q7Bk8Uuxmg77JDEXUkl7F6sr/nF/1X/9n/4m+vbheJlfMUcv+2ho3IMADnDwB8IOuDKhPcghcHtSFrfW/63bOUC0BMreab5cPro8uvXz3odaWjWhLflrwN3O71e/g72JA8OAA/yde0HVOWOsAL2c7RMjc5d++yL55UfnmwzLot+EQ6L4rAO9oIrB7VvuOnslcmReVjBYQDvlF+ublQ60kHO1wyKiJgFJKHTT6LtGYfUfBOiFsZ8dxfeD1KDHUa3wqpYvVetBzhqao/cbvf/hG330/63dfXnZ9iUmlLBOHOz0P12e62vHX3ctN4DhzkqXJc9Y331zaLpDdXM/u5BSPbgNi8Q+72k3ph1wDAm2pt1vR3N7t8/Uqv0yy8kH/7j/8uT5G0T/+138q90k+leV5n5c68PWA4B5cutcbkI778tcfNU7M1zq2d9P1+oOu+eeKD9/oX72+6sPv/Y7mkK7zVelt9X+mXBflYWrpx//9+A2N/z/RXUeESqmHvkZcZVk0qejn0wf96z/4A738uz/Vv/6DP9A3U10ENKnuDHCZfDLNc10+FrsWp/2fMwg8JmZCrpCplCJF6nUOXayuAP933/9K/+hv/p7+vr/qH/3v/kv98P0vVWS6mJQxK+bUNE3DGQC+63dYMf6U879daaA+j1/m9XM9t+tyuei7yfX3fu+v6Pr9L3W5XGQuRWSGzMynHBMBRrFn4HwJgLBtIJHr+7ruB369Pb29CNzWw936qp3Z113E/jLJLpPcTHPOtSTQkADwXc3X/f1CAuC5EwDLAKAFAJaP3eWXSeXDpPLNdPMzYzIA73EA2FZ0txWAbl5rQKvWfC8mXT5cZNaOEmxBJW+RpZJWt/1nquRxcrHjKMbnuB7eD7pziHtrv2+/uXzijio8VGd7Z2QZAkRrLecsvT78GmPu44dPVSLn+uWvkt2sxB2TeP0sD7O6U8PMdM26yrse+1D0B//2T/Wv//QXdQeoT5ozlObruTFxW14gfC3+ZeNAhFU5D796bD/vh7tn1Oe7+KRrXGXm0rc/yH/nr0htB6hlUXGXe10kdPw+wdP0459ol/p81jmdyxQxqbSzQOpejtS/++f/Qn/6z/4nXcylnFWiBgldKRtLRO0mHMz7nnDgr3quTwzj/0jJfZIiFXFVydRUTB6zfhUf9V/+t/9I/83f/5sypS7FVLKWh1GkrO0E7cmf7cLDaLuHnYTsO7gWa2fEROgaoUspmibX669+ocvk5raU/Vf7iK4eOHsCgH+Cr3zcMNb/7wFirbXiKfF8jva995+3WvD18/GMACcB8P7G/8NksE0ALOoE0NrOnjYo9Fb31yyXZ17WAsa23jdJB/Dun/818Lsv62WfHOXTBbzzIFG+HUFyHewsvPM51ye7fu77wCRPk3m9ZrsvIkJeJmWZFBntYNh2ynDr/8tUbst99ANDNZaAIdTyDFfzXYmwqCVgwtQO+a3JIPciny7L4fC1DnRbLdzafzz/Y58E+twNQvgNvtt7KNa25f56uywVobwu4ypmtdzfdZaiPv8fXl70odQigHmtZzqYW9shZkpFe4eshwf3px3PdBes470+0q+9QE/VpyYv8gh5pF580m9/960+/vArmWZ9KC63kMXcfmvKWqKwVwGMPm+oJwws48d+rgzXZ762VR19Ahiz5uusy+Uib/XiMmsxUWPiD3wVSAB89QGC1Hriez0Iavm8lY8YAwn7QgPMAB7cfj+infdtPvfSUG21fww7APrPMBZ4fzfCUvs52zVC6abIWvd1zmxBoDwMGBP0P+lUcfcsW2YNDOZPDCDj6R2V8M+xTEAclxZkMfV7KQGZS1v2s0DqtW/dr7X/M1MWtoaDUrqGlHJFSnM7NHZOq3+mBY/m6xL6US/7kFY/3y4TDK5PcLXcfl4D+67ZYjk4eI7adhm1Fb3dOxm5rPxfzn9wu/se4NXweNGf+YNSrWFSRsgyFUNJL5kUfVw4h+brR1mkLEJuRbaUfq3ngvR+Zbt0AE/R/q1H9/5Z6/973xySNLdywMWlmHWdX+VeE0HFTS+T1zOArrM0X+VLxrenDzZV5evHWXcAKNt7oIUKuD7fNZazfdoJLi5ZZK35X496VGZaZqZVOcQKeNSBkyIBQFBouZr6qt8+V1hXiC7X3Rd4Ozy6AT+vjd/6L0x1QJj1msMkgvj/Own0vfG9bJPBXtbrLZvkH969N9uxrQD/1L2Dk70eloPepGsr/2O2Pfjbdl+/e+W/h/3XX9DZ39PDmKyP6/oh3tmC+v2d7i6VUpRelNNUA4Vlknv9mjLbis9WdChNaT3ZsK4t5RDYJ3ve9+3hbadnWwQgM+U8K91lZVJaGXb7aRkfxG58v68APbY71aGf6H1/MPZvlRxlmUqlfNjt6wpNLennkib3mkTqVUDM2vO+TxD70BfgUcr2bdDma7Eu1DPXnLX3v5jLvZ7zUiLqboAMKWcpQxmv9X4oNSwUMSt7+dDx3rKo2cPsbxatCSKuT3U1mbnaiq+od4jbkibKTOvFfwj+A18ZEgBYBnfrav9W/zVzmUDixJPGIQm0TBp2hwfhfQX6QrbsAV8TPW1ll6+Jvb7TY1zNmW27aL/iHffrn9rFEynG+Wdu//v3hVTDuGOwb+wHPvuaXB9xHft+z3UteNq99u5JgXY+lKTXa+jjNTRnyPKqWSZTKNrJ4sX6oe9tR5n1/qIniuk7nolvxgDS/HodynnWccBr1KreOc/qJ8CMt1R63RXm7ncTyKbbJAGeY/wXmw56LO+47vTo58FZ1v9KKwVlMbfdQnVc6D4cLj6WFes7CoYyUXjQC74lYTxjuB9quxR3Zc61zfVad3koVNxklnLLpTzMpfRFgCnNUc+EK1PbVbbuAKtzxF2/YVyf8WpW93GslR4yXa60Wt7h/9/e3zZJsmSJYd45Hlnd987sAFhAWJKACTABBtGMhEgzmmg0/QiZfrY+i5IggAQImSjiRQtwF7s7L7e7wo8+eERkZFZWd9+5g1uZUc8z1jeqsrKqxsrDPdzP8ZfMtm3+vwb/19UAYTsgODQJAAGibaufcb2cAbxe57gcKdRVsIC3KsCvDAyWYP5alvvtfW69vn//vvy57+Jfr22rn+tGPmOrp3a9BdQyGLzVv9Pne0eBg8xoZaXPe4oXbCPDjHieX3+EfFPbLwB8F0+A/aq9Mfvv6hm+3wKozmcAnE6nse97n6JObTw/pha5bgGzRPf6GlxaT4yOcxCR+9Gvquw0TZFTu0gETzmC+9PTaWwFU7Ud9d5320f1XS9ie14sn877sYAm4L6GAXXZMlyfA3Qx3ouIbBHZz6tD27I/VF7sH9cvVvysc4j3fU7epMZv5X3euef8Wu/Pyzk/tW0F19bz32pJHNfynhHzjef5c0TvUX2cBRfRo6pd3QtWfjxKu9Da2Oen1u3d9uP+aYpdkH9NANRI/jUtOxyYBMB77jpkxClzWyYcu0OAzz3+lzPOar/U3J/xrr3Y9/tq+5/9e65XAPC49XpLDLQcg7td3W03Dg4bMZ16cZ84D+BY9f+6zKvXFhCU+Dn4YPCqTd+2+cvX7x2Pgbuv4NuHU+xnZZ+naJ6f67vtm+bL9qFijt5HcCDb+fmfN9t/N8Ujtv99CwD184SPqz7hdvhv1FcPmt6PBbiztn4pl+caW7hMLUdAdxz3G6fMqBeR+x5Veb4nWtvuGe68nq8J2qstmZ6fn2OapmU1z7z0A3pUtJjnOapVZEwRMS9jhVH20/QU+XGK5+e+Hveb+982vqdvT4j96kHX+7lW71sS4Hww+Kjj/UbnbncWQLTWqnfre+CoJADeyaD/1QM/X1viu585vksC6PA/XvnfnAG0GyjUrWF9pmH+A7rurm3lnVev+VN5LtQyw6vdqP8cMEpw2TjUcrxf/ykFrz/wdsX5jUXee0VrGXOvyCmj93EGQERE9eclMNRjGhv9jG0itgTA0G48W1r0Zedw7u2maLVOBBjnN8R5m4ftVIi14leNVYLzNwT9t8k/HhYPoS0Vvc5Z/uUsqOv+YN8C/z3mcRBw77uAchuHxu/ag6XHaQugty3hy/K4KotpGmt75t6jbeeALW89TTGvh8rnFNXniGoRrWLuOU6JHz89I1pdnPdQ629tWbk1M653ds3Wso+cT1a2Wpr4yhqbgl2t9s+lzRgnSUj+waFJAAAAwIP4Q23B2GKJBeeydUT2mzM91gnDPR3++Qja1aSddcXuuvXHCO4qx3fVZuRlm1EZ2yHBdZkX2AL7r036Evi/T32p7Ptz/S7K+kWZ5pLKrWWy39gKaNkQag0oj+RAbA+djOhV69nhrg95zTKFA94rCQB4x7LOA8P9Px4nCHQ96Dcw48cMFu30+U7LfjnXUXvxmP4we2+fg8C5BoYrttfaEvQZG4fc/n57gL9hHX5lH/Z97K/Vsq3Pdhpsj8jxPfuzg6q+vsLXzP/H7++/0prEetJbRYvKeRkHtMu+Zp5bjfX73BL30w7cHCPk7WTxSBC0m/dC7U94WGb7913St2VURHvl+3msEQDwLscQ/gRcdAr8CeCxG/U6D/QEZ4BXieg97tD990zc/F5JH4Gex6vaqvy7b9Zv9f/ajTrdl2Dwj93i1a10p+P4W6s3tvLOH9Fa3LpzPAsAHp0VANwcWGYaKMCjDPK/FOiXBOBLQzrt/Pst+7FdwE+YBSYwfLd9uFjq9jap/9W74Dqw08YmwtsTZp0Puivrevm7ePvy3rb9ueol9K2RXw7t3FZ2vBIOXFaGfm3Pf8+Ot3UdsL+1AnSdEJJf/CF1UZ55YzVI3mjvVf03Lv/zU3wp63ajPW5jW5+ryprVXqm/fdkd/nJt6H4csdtJSgsA8KBjQLg5iDOwg8d1q3O/DfD8eYCrwb3r41yvE7tf66/1vAzq9VhWAywHfK4rA9YfW5Hr5kAxgsiXX+ex+vYvE0Evt/AwWeA4bfmPSc68LPe2tTFZEj333cffJ3F3K4CrbYm+rRWvtnw9L37Gduh7Reb2/l5Zy+HQu23hUmQA4OFZAcBPol/4xh3AP9CAIZfCXGeElYJ9qMH9t9wndXPwgEGkv8H7fHZk5DKHMCt+v+vu+eH6815f7ZPlj+kXLMGjNZBU+92iR/Bom19a/aLT0VPA+O76Azfb9/0m4Bk9xxLfHuewYV71B+evPBv2B0Lz9s/ub62HX3rWj3a9Rda83C/t1e9tVn7dTV1fn8Vjpn9/sVor18zfjZUhbZ/iHYmDarvxX19reZ5zx7meD7weGs/jxm+03/BueYrz+s3h4Q7vZhD5tQEicLxnfF7NGP3R13B9i+t/zIfBCOyuISYHBT66HxPoEdR/P0P827P7hQUev2R/zHNifZD3b28d0jMB4JFZAXAg+477T5mdtc4wq1c6jPvBhLHCMe6bzN3ZD5b5Hy8A8COCApIA7+ze0Ii/z3Jf9osuszkf1mv7t+9ndq//2tUeMGMFR4+IvgvojHnhbVsC2COyolXf7SN/2U/k/m6Iixn6GZFVW9GPsq3fq3+QZv7f5bO7x2W5x8Xe8G1r8KutZVg3g7iVfZz/sa0iOv+My0nk3X1wFzdA+6a+3K1VYeuWbrfGg3WjYajRvqy3wbIKwCMA4BEZ+R2hD/DK6z+mc9Z+5N7gnvrwuAPG+kIbALwDWZ7kR+rM/957fvfLpO8+MJjnEwEu+ojZzQJ9tOr+4oX+6phBUtjw/uJ+8Mc8dP+/zl/Pq/fn9fsr3Q4AeggAAAAAAMDdkQAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgAAAAAAAIADkgB4z4Vf45r1477vx74fuAd9q7v5jY+EVOcfQtaPv3r4v3OV/gZ8863Ql/fsHwUeC3dQdq+UVc/b77t4PbsyPFid3epp3n693/wZ+UpIoH05TFDN9a2u1W7029vr7UK1V8oYgPfm5E/A12SdkwX7wYPwwTG0WspyuWZElFHhQ+jZbwzYxsD+og7HfqBfEZGXQf26/BltHShW2yr6eH/bfcw91eH+I6+51ndl+T6f6/4Ej69eKcw12JP7970s8co+nhU1+nYVIyi4BgZf9vt6xC643EIA+e37AOdyul3RMyoqekZkZlTvo4yvHvs9v94m1EVfQA7xbsr/XDtf//qte2QXRO6RMUUur40+4nX7Ui9+z/p+15/9utW/ir4UV1v76Fu/PbXPALyMG/gT8MUggd4DHLpCr4P4nkbzAI/k3H5/+/fceu+Lub9fXS3Gveh/4EL61n6/8cGh76rRJmRXzo82Pt8mANXN92vTAd43KwDA4DEyz9dMS/sfz5dzuZVxnt65e237dLfso/I8w+viPcug8PL3dX/6uxiqn8vtW68tI6omf7x3qmo0CV004FCt/r793jf7Pcaz/XIPn3UrifEduawMql2g6HIVQIuoMfN//X63zxvV3/Ue+EpQLyMjqsaqr8zoFZFLue2/Z10J2q9m+d+87+rb3sd/xPLfrdJZy2BfLhflWq/06XcrRdu6JiT70gDs5vtfrQ5pFx911ze4bm382h5Xv/mEyFga9KsJPk29BTB+gC91MoHHDBBsgZ5dfb5e+r8Ghmsd8MVl8L+HUP8jtNM/5qo83zmRu8N4bd/vL703Ygnwxznwf7E1WFwGiVqdg8Rmkt5B9d39/a/LYS2rffnty3R7/UYC51sDgwKIb99832rC92e75VX9Xc/+abvPIyuyKsYmQH15fZ3135ef91oPsLu+0XVLAeTLshnt9OXrbfk8q4cpXgDvmxUAfNVrwaIyAIS3rZtLDnfbk3k7JOxcOXv2mJYhwHVNfjH7dzkUcKwY6JfRg4joy89vKXx8BL3GSgDeZ9lzuFLd+my5NtzZo+e0zOp9rbLvD/tsL+JDWef9ptf3ZAkCv2lJ5/nR3F4tr/G1emVm+P7x/i2Pgevfo/zvoPzrdrlcf72+0F68+pp+3l27ONth2app9N3bZXnmrbZf2QK86+cH77sD+WNn+ZctYuB+63Vc7wvdfs+fYpIwHJoKfoyO/Fdm5F/P5P+Wn/XarSLoe19l/oeq2nU1LuA9PQf6zXHeuSfIccb7GnCA984KAH7cIMHg4GDl2ZZZ5LkMAHP5WCfxQbr1X/jsiyO+qFyDCJezg9YtIG5pV8GFMkPsbcft9VO+t23bf/D+tBgzg5sQz+PW/2Xn7svXlvJdmvVctn9+dRZwXa4M69fnBLzS73N+xB31Anaz/W+V161y6nl+ntc39vW1FPc5JutxWf778t7O//jCc76iReW8rP5skTmPdqTa1qDsZ5ar9/f5RF9X5vY8n/tV2SKqthHel9oEAN7PGBAuBnXA8e1ndO73gd7v77zu99xe2e4hy/WtrgL3oP2+tbd7u2ov9t+zvnf/tXVV53VQ6OYGIVaA3q3XAv1r334t44sA8e59a+DQRJ8HGKu9Uk77ld37r69lu+4MPz5v47UtuL8G+Jv74QHG6uejmpdyW9L5oz1vI/i/vX8t61SeAO+cFQDvoaNQFZn5za/3HDPGBJiOeQ/syzxrHPyVkbvrjSmA3O0gYO/lLv+XMjMyI6IqqmrZHjTPBzv2cSDcOrG/alkLUle/cft82Wx6XUTg+vNdv8Gt9n1/r0QvVf3AXiv/8TyIyF6RS5Cgqr7pvuF+3JrxexHc732s9HjuMZ1a9B7RThHP876/16N6nc8IWJYLVFVk5eXzJC8DxrYDuj8X90Jr+0ofVRW991G/M6NHxSlz6RfkRfvQ8+r7w5jgrtr2/XittiLenf0Rkdniufro021NwvJ5ZsxVkW2K1iMqn5ezQ8Y7576MGS5WlaT74N7GADnGcedCGZmbyvGM72uJVo32P1pEjo+/2I70HtnMEQU4IgmA99RR2A3w9x9vg4Z6OZCYdPQee5BwFfT/MYGdzHxxn3D/Wixx3YyYIpc9PzMieuQy9adlRouMtgRxsq3JgSky5sicovXnqGUAUBc//cYAMF3f5PoTAwitpcH8u3kWLDHepW3vsUsIbu39+b08QJnGdXmN4M766TS1Jej7yvP9Rh+wqkbQsFdMOe2+oS7fy33283f3xbwU/NaPm9oIALbRt2t5TgpU1Qj4L4H/niMI+OKHc1f2Y7frVT29P48yz4yWGRkjqN8yI1pGRIuqjKoeVREVFRUZU8uYpmkr//Oh4q/0/3ijup6RWUt5tPNZDrXM9p8jcsrRzxtrAKJFjf7+jeB+1cgUZS7lr5wBDkkC4F0FAPLFx68FeL818Kt/cOcdxGWmT99dt6Wjy4yw9T3761r+EgB3P/y7GJCtZzfUEuzLbCPAnzHKviKielSs5bzM9usZbZklNldF9h69nwOG10uGnQFwJ236T6yec+WWFOLw0YIXz/eq3J4Fl88Nf67HKNPcngLr4Y77mfnrc2DM/IyYl+jwWPxVIyiYGa1VVIvovSJbxTSvAcJlg4narSzL/gdJQPIf/3mQS1+/5zKbe4rzvn5X44C1DWgx+olT5qvnS3A3VX8r0lF2a3JuXQGQMWWLKduW5Nm+f+4xZUXVvPQVlz7hPGaTn06niwTAxf31Sr+Qtx0HRPTd3v8RvWdMax2PUcfnPkeLfLniry77Bq01A3yAg5IAeA+DgnV57xLgXZd45jYL5Nyna7v3rdt/6OM9dtnful7cF6+89/pj7rHTn1cD89wGhT1Hfe5LkH7KiKyKFucl/9kyamkDKsds8BanrV3IOM/+GkuN8yISkDFFZY+s9euuP9f1WyIyX6y/NQZ4ZvMdOEhU+3vhcgVA1YgYpUjOAxfwrmy35/f59eoR2ZaVXm2sDItpfH2appjnOaL36NVHkriv359bH3A9PDhrNxs4L38/d3U7jITNssVXTW2s/1u2gpmrL8G9ilqy/Jk5kkZzj741Gu1FJtCz4o7KOm+XSy57NlZGTNmiRUbMPWqeo6Ji3ek/e22rQKeMaNniFBlzfYrsEVXzWCGyzv6vFpnnHed7Ghvei1a5jQf6chNUtGhT263yzIj6HG1ZIdauKvNYEXbeImwkf2wBBHBEEgDvIghwufVPRV1s77LuB3qRGFiv6x7grxw2ZQ/Yx7Ev13NgsMcUNQb31aNl2/aKtQXQoxRs7WZx94uB4djHeXTjayv7PiYBLjM+5z4Gk2MFwHmj+R7r7MD1J4/3LL90Czf0yG2GqOvPd/1REaFbt030aNHE8I787I+r7Xx2SYBqY0a4Jv6BAz+xO6hzV+hXRT4Of42IOUZSYK6Iz/Mc0zTFqY2TQWsJGsa2MiCWfuFqbAe0rvoa7ZAA0V12CdYyr3n06SJiXmYAT5FxalM85RRRGafKOOUU87S8b0n0nKZTzPN8OQlIxPduTDfa+HNMt229s7VhmCLj4zQth4VXnNoUP/TniM+fx4zx6JE5xbSsEc519n/s+3/n3zNZBXBPQ4Bt+5/p4piuHhGnyKqIPkf2OVqOwE+ry1Xgy9hwTBN65XxAAI7hJMB3jEH+/nrxtRvL/vcfn/d7zei1DuzqYvbXrd933i/W3/+u7411659lVsd5ZsfLzt/+gLj969x5z7+uKv9uVmjPZX/fKSJ6RcVy4GOM+6CdnrYZobUs+W/Vxh6h0ZafsQwpXxwMnhevu/68129ZKRD9C18ft4SYzjvpH7zoE9Q5MMzj9/1u7cvfWlycG9LncZ0jorJF9nkcBL00BtVHn6/vAkCXbf5lgrkv/w+syHqb681A4O6+6PN8DuQtW/xNEdHmMfs/+7j2+XwqdK6HBLdlO5gw8/8e9RsrAPZHuY37Y5Rfq7EaNHvF/DxHn+fon36Ip8x4OrXIuUd/nqOyxpZCeTnxIyJiinkZD+bl/bceHh6uP+/1uvzrsu7n2PIp5x7VM1r07RyArIyoeRvr9d5jGueAnY+R3p0JBMCxnGR5Hzz+t/84X//6tuXH1Uz/1lq01rYlwK21ixUC09UWI3X1u6wAuPMAwX4gv5v5v5b71FpMbdwHcyyHwEVc7AnKA7QAU1wEYqJyXLMis8U0TctKgT7mhtW8DSL7uvVDr8gcZwBM2WLufdlaYvy811b8rK+7PtZ1Gcp/Mbije3DsANIcdnF5ZG0XCLyRm91WBqyP8ed1+54WcTqdRv8gKk7ZIqaxxUftV4euP3w76yWvEkbLliC5zBB2/VmvL+6Hq/Z6OrWxzV8tW7+0tpwL0aN//hS/+vCrqJyi5ooeNbaFauPg6NYrTpEvVxFxN3V/rYEvx2M5kvutLcm8iNOS8IvnOU6Z8f1338WfffohTlHxdJriuc/RekUb54ifJw3FuS1ZDwLeHSOxrAhqsdyZrj/bdd/cn1d65MUjoG2r/lvGCPJXRc5zzM+f4uNp2vb6r20FMABHd4rJEt6HDv8t+fqeryQAemzB38iIOrUxAzgzcmoxffwQTx8/LFM+euTULs4AmK5mgV1tAW6HwDu3JgBytwIg+9gD9unjKb7/eIqPTy1aO0WflqRQfDnwb+bdHe8JvxseVp5nAT21adkOaIp4niNqBID+9M9/HfN3H6Pm54jex96wVef9oddg4VVkaR1o9tyGoK53eM1s8aUZZB8/fryo1xywj3DVMdi37X0JEAioHONa0XbB+p2lg9h7j2maIqeM//DD7+Jv/PU/GgGiludDP1tGn5e+wMW9s/v55XoX11fHBeN+6JXRpoj5edT5aRr9gB+eP0ePin/1P/1PMVfGp+fPI+g/jZkEvd/aAmTMHK50vY/r5TjwohO4fD0z47l6tIqYWsbUI/r8Of7ou4/x/K//dfznf/tvxe+efxt/9N330Z+fY6qI0/Jzez2PFcPLKG/fz7zs//HWaaBW/aJdWMsscxpneizjwCkqqj9Hnz/Hf/0P/nfx3dPTGBv057VvMBZ/bCvAFTDAIRMAvU3+CgfQXwnirH34595jOj3Fpz5HTqdxXNDHj1FPU7RffBeVEU9tdBafpmnbJmYL9F91+FpcJgJ4owD/V4M/IwA8rbO6IrcDwD5+/1388mOLX/3i4xhL5lgJUvNIENxOAvSrwHMTgH/Ta79KALSrgO4UmRnzPEcuB8K17z9Eq4hf/8Vfxjy3+NM/+/MxOMjz987zvK0MujXgeNn6CMDdw7VdBYie+9gGpCqjao5oU1TNY6/fj6eITz/E9PHDMtA/B336shpofQ5cBBo4xFMiM8cB3plyZQ98zRtBodqV8XM9xymn6P15tPGf5+i/fY4/+uUv4heffog/+Xt/HPPn58g++gkxP48JAUtQ6DLQp529q4RPvtYuj69nTuN9y6HO87Il0Hff/Sr+2f/zf4wf/tf/EP/kn/yz+Pjh+zFOeH5eJopMN1aA9qW/53of13N/LNcA8NbkLxNAllUdNY9xwCnmyKj49Q+/i//i7/5J/G/bp/gv/pt/HPMPvxsrgaoiax6z/0/TMnv8ZZ9vWwfkDJD7cZ0gjGWb1xxrNrbtX7PHx9NTfPc0xd/7238c8w+/i6cPU2Rl9OoV2bJN07ov7FreedmVUO4AD50ASCsADjG2z3wlIt93Xz+1yLmiprGEM1qL6bsPcfruw3hry6jq0U7TdgDU9YyPzMtEg4DQGxd/fjnk05Y94KclqdPWLZ2q4unjKT5+aPH9U4vso2xbRswt4tRa9F7f8Pu0H/flZXm0ljG3dSZwLgHhiE9PT/Hv/uwv4y//4jfjrlg3fs2MmmusBur1SuKhvUhAuL7tHtCvtcU5te1Mj8yMeQn0t+8+RPvFh5jmy9fHFhGj/PcJAG39gWIFu63gbAN5gPJ8UTfH1i2RFXP1aO05olc8reeI9DmqRfwnf+0X8bc+RmQfSeGn5dyQ1pZt4dp+T2lbwN3b9cWz/mqLt338fi3TqohTi/h3H1r883/5/44/+6f/PKb2tOwFfpn4bdtRs04KudMh/FY2IwlQF1tAzjW294zeI6LHFBGn1uNUGZ+i4j//b/5h/B/+3n8WpzE8jKkqWvRtVdAYS1z1KbO/bG+syLnra8Y0VgbMERVztDzFh1OLz7/9dTydWrbIqtjOgjP1H+DovQeDvwcf+F1/8MoKgIzzGQCRL88AWKLF2zkA1wPLbeAnAXBXvpYAyOgXZbxPALTW4tRanNpuD9EY+4a2tm4HdB7kD9PVz+dtfWUFV8Wyp2u72CLsfFBcRs+MmHv0rIi5j41Ce49cJhvenn84m395B9f9rL/XzmPJdj7wOyO3Az6r96g6Tybua31eD3evcUjw134+j9tvGHv+asUftyDrRUdg/XA8s5djHzOXZMDY1rGmU5yeniLmHlO0mNpoU05rXW/XP2fpG9y4kdrSz3T9+a8vimP39f2Dvmo81mNN7FTE/Pk5vj99GKtCajkUuHLd4X3ZA14VexRtLe91tfZ2pltEZhvbxc5zxDzHdHqKX378EPOnH+IUER+fpsjqkfNztFySh7UeKtsvxwBLkmB8vI0Qlve73tM1twF6j4xzEjBqjvl5jqenp2hZS3EvqSNBIYDDOznk88HVVUDv+svbAKC25bz7a+9jtsccY+pQrz6uVysAYrcFUC1Lz9fAkSTAGxb/N64A2JZ/7hIA5/KPqGUFwHpgYFVEr74dClVf+B3c8f2xrtytyzah937e5mcZJK5RgvXzbCPk09ZZo653dx0JoH4zwLuV6ZbdG8nfXA8Gn9p4bXm9lghSj4pafn5vuQUXzAE9UNx4l/HdD/cd/P5wJRkRFdlu9w0yx2Gg0zTF3Pu2yivbCPJWzJF9JIfX5F9f9w2L8xYSa9+v1ct94c3Ev7/D3dcaPE05An7zEhCOpb4vQcCoHvncl/OBxpkxLUfmNyuiVent3XUHry4GaW0L16/Hui37v1dEm0Ydn5+f43mumD9/jlNGfDi1OLWM+XmO6s/RpoyMcXjwqPejLZi2W6DvEgDra6ZkvNEUkK/0/+eLZ3vLjBYVVePQ4CX3F1WVVVU51Pn2cjIUwBFJADx8B/CyH1Y3B4j7/uLl6r7crQbYIsD7169+Sl5NGMyXv4Kfefj/tRvkSxM6plwW+OZuj6fsMXaLP08j28/+7fmtv5v/2L42K7tXX5bx92i5nOuQEZnLti/V47nXmDCUGRkZFbnsGR8R1UcyoFos3+p6L9f40iGQS3LwHPOL5ez3LSfQaswLGzU9Y44xI7xqHWLmefuP3c/lCM+NNTE4nvnbM6K07I9jt/pn6wi27fk8mu8xC/Q5Knobh7tWjOtzn2PKMfv/tCYVx3ThOO8Mej5stOKVrYZsxfZ217h1tPvl+ODUdtV6mSHeWsRTm6JFjnMfqu1ahowpWkQu7YPe3h035GNAlhVbJret9bJGn25eJnM9xRSZEad2iqds8ZRT5NyjPn+O6hH1/Cmm6pFtWS2wTBzaRgHbasOLLYB2a016uv7s16+N/9bZ/eOjsQtArif9VmUuW/4I/gO8I7YAOkoA+LUtgNYZ37stgPYHxJ2vYybX9p4biaF+YwsR7n18kNve37kEeNfbZC33/Xu3LaNy6zreDDp3zcbD3g/nsq6IWA5+bhFtty/4vN47LXYtyO2mxvWtrlP0vEwC7OJ2433T2OZtXmd4Ti1qmQmcbawAqJZxUfFjWSWwHhZx63nDIdqCdAbAA9vNAt3NxL3Y6q33qMiInCKmWr5WY5uXda/3edrmlC6zQbeZ/vPys7ckQF22A2sXwfUNrvH6dQ3j9V4xTed+XV/Kd46I/jyPrf56nb8+92UV6NgiMstsj7u2r4/1cnB4WtqI3nv0eY6pamwFszzjp5ZjElC2aFNG61Ocphb1PEfVHFN7ir7uDb/bKDC3fkfVSB6t6UHXn/WaX14FkO28Anjd0mvb4WksAah1rL8G/9fVAGE7IIDDOvkTvN8g4NaHXKeUxnmroOvZRAK+Dzo+2G33VNsxT0u/fd0Watnwex34t/W16rt7ZXQ0K68CjbxtXf5icCjW+fxjLnddHujalmHEXOdtojKnqMqYK7fZ4JehheuStzHM21bw67b8qnSWWZy7Kh1V49yH7LEEgJYtwtZDgJf2ome8SAQ7B+Bg/YBzpveiX2Bl6IM+B+qyaajKmGMeW0H0OaLWSSB1DvLmee/4VmObn/Me8lft+7rXUH3t+cN//LZ/bf5vHdS+PP/zcouvKUZQsJbnf4tclobVi/tovwLMjJ/7vQciL89o61dt/KlNyw7wy1ZPa99gee6v44C2TgT7/BzVn89bh2acV4jk7sBhfcCHuD3aMpEj+7L8Z2kQelS0aYpdkH9NANTybNC8AxyULYCO8ISP3+8MgHVmR7/aA3hZH7gtG86rQSUPGCC4sQLgcsDIEbWvzPBdD4i+9RzY2oLL7/BHvefyvi7G3i/LM8aAvq0rwpYzIMYB8JcJgLhxX0gAPHBXoS63g7uu39cf6xs+0PP9xkeRETG1mKotq72mbeu3dQVg5ej/5dWMj6qI5xozw7/W57MVz9tdr4OvlS/7dGP277n//5Qj6bPvG5wnACyJg5bLuVHOALjzRj1iObNn3d9pX2KfPn06l/NuDLBf6T1HxVS1bAfXR0IhTzF9WJ//bdc2tLFFaJ37gePsiRZ9ed3157x++UyQep6jZ8SUbXu9Wi6Tf+pWH2E9CyBaa9W7qX8AR2QLoKMM/F7bqvOVfvvt4N5louBLgwoeL/izXwGQF/dBnFeSXiWDrgeY630gEXTv+jZgWw/0bq3FPM9L4DfOqz/miCmmcSbAPC97AC8zA2M38LvZoLgR7qOcX38+5FbMWzZ4BHhq3QM+o1Xbzoep9RDgnjcyyv7ij9tXuCrP3YE+mS/LOtXtByjUfvFcvq6itazuemoZtUzs6L1Hrzz3C5Zinq8ajd387/Pzvl42++tEEde3uX7xuZDjuNbKiDaNc3zmdXug7GMSUBuHvkaMREFrLSoq5urnFR/GiXfasV8O894dxrb9NyOytfUtUb0vh0BnPD8/jy3AquJ0OkXNo/aPw8I/x5Q5tgqMNtaPjmTT1micV4a0qIisGkdIu/7c1+UY6Feu2U7Va/k8W/bYzvseUf7dWH/d83+d+d+7lR0AR2ULIF72J3lHwQMzuuHQ1XwJ0rVlp7f5C+9bEwYC/fC49X105i5OCVj2/h6vb3vELysAepy3hNu2g9xdz+nkq/6i65teX+vDf2nCjgk972MMdytBtJ31cZHAW84JWFYEjYOfKka6YCQQxu3SthMhttsn21gwOELHrj/7dSRlasnW/9grAO+TBAAvO5D+BO/OutBzevGVths6SBA9jm9L7GT1yGVYuAWAb98hS+Nw9XPTLKF7lFdbw+2P+95v45PVo9VYSj6vGwovGYC88TRQ/Q90j2wnRYcZvg9ez2NXt683bVgTf/XaN9bL/l/l7Y7g+rNtBXYn/bZXnvb1lef/svAr+lqmtw53/kKDn8YK99KInwsiX+/bT6/cA/3WKvCMJfgf++D/tuXM5dIgRfDG/fz6abePLX4A3uXTw5+AH9uPq13HUv/vkQu9CejDUav3FwICXxwUatThQC63Cfq2kFF+sQ3BAI4HqPn5497n0Q8Ax2cFAD+ZTuPbyT9I+eXVT1wOAo39BKOmsB+47tVWpuc5/j3PMwEjekRmVPaozPMBYWb8P3zD8C07+uxnge5n/15v+S0geKx7RHE+ePu/nQGw7OG+b59fFG7/5qYja3nmXzUAa/Ig6w/YAeH3f/ZXG/u6f/1GebG1Wy7f215fDPLVclb899X/Ox8O/Q31vK5/Ql8KtO9XhOVyLNDVysFxSJT+gME7AI/HBBL2YwTAI4ADjOuuA//rft919a/v9vquNDaER+/H1YvVmX2r2/2qnrcluJfr2QDLF7POAd5Wtv25N1/esm/3PuV23Hugbr+21t3rOttufV/2aMthsFn9+mdVrjOEsi8TQHpE9Lr1ft5C/z2vALxXVgDwzYNKDly+cQ4O9Fx3hI/zTPDrLqf74S58PSjz5d16Ky4PiexxtV90vrbLMPc1+HutXo9IQC3/i8zoy2vtle+9Xv3TU/Dv6O0+Dyqv24F281l9XtVzrt2VEa23mz9ynAmyBArz5Q2TbqCH6iNUna/717NeBpHz1sfK+W7HZFui7urQ74tyvlGEF6s/sm/vyOjRatkdfh0GnH9Xjl/dtwODJQHe+hnQlyb9R1716wHeb9/Qn4CtH/GNnXyx3/dSxY36DjBM/PK98U1b+nhMPGqtV3LAqt/ovaW24thlrsN+4PHaT5/VvZ0N8novIn/KeBEAuC9WAHBzQFivdPSul44bW9yr/VygtuvM1/mafWsCzuW42zzkVnD4ak94M4PvrfK+VmZ1o5aPuj1mgo81H1UtWrWoUrCPU89vt+EtIqIqcinPioqMjBYVrdoXv/e6jmvnj/mcz1fKnAexPI9f9NGqbft5t1rfN79o+8fz4vaqgetHRu1vFGcA3Kl+8xlROVZ/rcXW+vleqRsrPF7cZsr5Tuv/a6V/uXSnLmZ937hT1j5ijvulr2cAVIvIVuvM8VpvoYtxQHN3vO09UBEtf/QVANEDBAOuB5K3PuedVG+HvR6ocvefeA95TDxSO34d1N3v433dpmfdfj1CbA8esg2o1/puP74dXwO/uoGP5TKw318G+mNN8qQVAgct/5e1trag/8uEzm4d0C64X7lrM+rWukKB5DsY5+XvdwXg3T45/AkAAAAAAOB4JAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAAAAAAAOCAJAAOLOvbPm/1yvd/w8/knvXf564Zl9I0HIay5JW2vNLfAQ7Z7Ofv+0UM8/QhHqtf126M2vLq6/r2AEDEyZ/gmL4W/P/q918PISqi57f9Lt5+0J8Xwf8eWRFZPVrmuYT3A4HKlwX5xYGCAMKdlPg3lFm+8n39J/92d8Fdlf7v9Xzo+XqIKL/y+5T/o99ATUk+9PN+bcPbK6XYomfEtPs8Yj5/XD+x86bv98Yd/Zfl/aJcaunf1SvfV23rOFZk1O6+qP2ToW70M5X/G9f/tbx7xNaF3wX6M6JHi2nt72dp6wHgnTMV4CAFqCPObT9hFQBHjBDA63dLuZvgMSprP9fH7N/UB1hXe+Z1gJhj+kLZXqz83W6IfuPe6T/6OcEbP6+3xG67WebKDwDeLysAeHXcsA/29C9Efqwmf8sBQFvK4LUAQLsYBfabw4JbEYG8DCy8mFluBPHwEYC7/+n8HAGEtvyb901Bna/X7Xy+1mzwWGUfEbm07ym187Atey4r/F4U7vqsr/FpRV8+GC+06KMCZ/tpNxH3Xcm/9KDOGvdBRES2yKpl9eitb+gvngOK/y3rf4ttde9SxmOldl0kBFtEZOUo0d1D3ew/AHif9AHecwdy6b3vg/v7YH7Fy+C+YP97CSsA76oz8LXZ/5oGuBtZ17Oz+0VdvVwd0GOEAOsbOv0q+vu4gW7N9n+t/Pf31hpEdp+8afFtiZu1HagloXP7Wb2+v72yqgMAeB+sAOCrw79b28NzZ2W1rQR4OWAbiZw2ynHbH/RbBof1crDoALE7H8THK+VU8W0Fz7toN15J5LYaE4Tn1243t8/BrO2HzP5DNv8VF/t6t+iXob281eT3177wyr2xuz3W54rb5c7q74uW/OWNkvlKkfdtJelIFI2zAPY/pb/6u/UH37T+R99m/kfeKpc1SbDW9/qGewcAODK9N8a4zp8ABA94P21+3k4EdME9XUAO28f7Yv1OPcL33AeoG1/tN54b+g53Vor59ef3rRXfAMD7YwXAux8VtvEvl9FfVVzsG1+vjCJzdCSbceKber0v/5W5WxmvF+wXf+GrpwhwVzeGFRvvsjm/qsVf36ihRc8WkS0qKjIzqirG/8ZrHLWNqCUo1JYZojyW3eqNZR//vnbb1sneFdGjj3KuXZ9vnBwQArnv/fk/2v+2PS/a+Jdfe8I024HeW2twUb/3ff22bP913XroGwLAe6QHAKD55+C+NvPva8mCNeCzrhwQAHpwkoOPXXxrsHbXjm91M1r0XOv8mORROYL+l3VXJX63z4M4p39eOwfspXyl7U/Xn/2a5wlcS/0e/9Y2IEdyf+nrjeOd1wSPth8A3qtTmvn10HI/hNt9cl7JPWZ1rv+q15jkv35Lq8h1Gn8un2dFVb/8QTcmiLcyfHx77QvDu4hayr/380y/3ns8teni89PUovfa3j/Pz3GzbdjOGqj19uJNvVIAtZvT11r03qP3Hq2N1+e5j5netc76HvfK+vX9e7lfa+DmeiVW3XrfbnZwbq/3aNmXgMHYJ3qd/7+9tvsZLS6DRe6QB+03LOUc+bTdL9ftfWncH6YNeLkS8yop0KbIHtFaRvTniL60A5nR2tgifnT5aukztqiyQuBxuwWj/KcpYp7X5/kUmePZH5VL+WZETlFV8bz0ETPPfYBpml7+6N25Q3lxv3XXn/UaVwOwyyRBZYuMiLn36NXjqbWI3mOe5/iw9AnXscHTNEXM42unaYqKeYwZDPAA4HBOBnkP3s+vy+M96zoCVLUN5vdlXVURvUYnbx4BoB5LoHjpFF4EBHa/pNIOsXd1A1x8vs7OqptBny0IeHU/XL8v83RODN0YWMYrgUd+bu32QcBroqZu3wettWitnRODdfvrXfznoe3b8MyMaHlxkO/aDvRde7C+9uKZEcvhwPV688M9Pypqux/Oib969b3cvzWxdy6uc+K3KqNNEdUr5nmO7BURPVpl9BxbPfb+HL1PkRHRMmLK3LaD6r1HTv7Gd//8/0KSZl5Oc5+mKdry1mlq0SpeBvdbRi5T+1trMU1TPD8/377n4nqLoe76Btd1G5/24uttSe6flj5ej9Yyctn2q7XRx7t4zi//ajlQeCSJAYCjcQbA0YcHyyzefbBv/bcG+VobZwBULh3/1raJH+tH+5mf+wSACSJv6yKYl9cDwzEgyGUi3xL/G/OHWuyCQRl9SQaN15bBwM09Q5Yg4TrLyAjhDdWtgr8spy3hE9ss/8y4CPb23pfZgLEMAPfB3y/XcAfK3YdXVwJcBX2jLoO7+2fAuupjLfvt46sW5bIB8rd/yOfGck+sfYHXvs6d9+9uVMPtXIflOX+qKabIJSCYMUWOEwDy/AzvtXxHXj/T28Wj5vrRw1tW4vhSyzyKqY97oCpifh7JoHUiyHju96j+HOtdMSYFPUfvOZIGuztrPfx32v/ydCO8Ze2flnJYEzexBe1HP2/un8dYL5azfXqP6P082euqva81ARD1YmIIAHAMEgDv3Lo1SF9nfPQefbcCoNflYcDXSQBhgjceA14H/F4UyNLJX04IOy2BvrXsWzuN2UA5ogXnwFC/GBi8+L3r+xTBG0cAvj5Cay0jYvpiWdbVyhAzgA9yh1yvANgFfiNirP6a+0gO9b4lic6BAJX8KG6uAOjPy3N8GiuJqrk+6nXZGqTW536O5H7058j2FC1rvDXmyIqYP3+K6RenaG3ZzrFirPiqETSepmYDoLuu0F9vm9cmvyqi99ptCTrK/NRGEDmzorVTVPTlvXOMHeHyC7/Y9W2vfev+5Vrn6zwoaDX69ZkRbVkpkjGe61k92pIE3P61tq0ElP8FgOOSADi4/T6PreVFYKeqokUux0NF9DbmEk1bnKhGYHgXBJqWYWYs+0ibAPS21vLpr8Tq1v1cK56XmUDLFi+ZcWpTzPMcvbclCJzbkv++JAwyb0cB+3kXcYVw10G/XAIAuQUC1mDA2O0rt4DAGjG4mDEu+vvwMsfC/31Spy/bfWRktKzxr436vv6vXTXuavqjtgF1bsF3SYCoipbtvOorKrIt789lQ0HXh7i29eN9HY+R1JtaxGnKqLmi1ejTtcz4cDqNWeC9LVt+xDYzfDv/RRLwziv3a43+VsWj93FtyxY/a8Jn3CRzRM1bnyBjzCsfW8RcbRG2TQKScLuPhN/5qTzSfv2ynHbnBFR/HuO8+VO06tGWjv5+wkfGuk2oCSAAcGQOAX704E585RDgjBdb/5xnfNRFWCcrIr+h89diTCgvt85DBQHX6zb7M+Zo+eEiANzWe2jZH/a15uG8RZRjQO9ZX7YAiBjX5YiPUXIXe8DGVeB/vdYXIw2GiXcWD7qxBdAIBqwz+5YVQDn2/56ixalyxBQqLpJELWJbHXbxTOHh+giXz4Lzx1NG5BY8qoial1rdXR/iOi/P4XnJ4Zzra4txiHdWRPTP0Z+fRx+vZUxtPLlrvnxGjCTA7uwXlf7hnwdru76eAfD8PGLI8zzHFBlPuW4F+ClqjphOp9Grm+tiBUBvI/A8kk3L4QLrdTuBzL+f79+5grYtaRu75/WyrWfPbQVwi4rWMqaskfxZnvFzzLFuHmTvfwA4NocAH6GDf9UFv4jMfaV8e+9j2W+MWcJVPaZo8bwkBtZvz6vtxmuZLWYFwBuXf9zeiqfvlgFHRPTdoY9VFTV/jv65Ij9+3PYAHnvCtrFsvF6b7zsiBf3qNuOt9Jvlc24fxiz+MeM/o/o5AJjRzrODlzNBIttFsii+luARILor12cAzMt+Hm1N7K7lvJz10moECnLXmmQu7cWyAswcgeM9NbY6H7UEfs5byLg+0vWyfxbRYrrctTHmmsdqj3heAv8Z9fk5fldzfPc3fxnTNPaKrxhB4uVIqBE4brfbeU3CnVuf8bvHd2vjUOB5jvgwRfzi++/jh9/9JrIqnk6neH5+jj7PMS3PgdptMRMR0eaRdKrst9uU6q4/53V5wp8Hf/2iB1hZMWWORQMx+vSnbJHRY6oe0Z/jw9O0rfapqmiZDvYCgIM71edP0Zf9IF0f6zoGd2tn7/JAzotA0Lqnf00x9zlyajFnRH3+FH/8y+/jr//iu+WbMj73Oaan08UBUZcDTDP/7yuWcyNAe2OAth7q2SJjnufIXvHdaYq/+PO/jE+np4g+x/Pz83l1SPUtYXBrZNm3cAP3EMx7LTSzBvbneb6IBGRO8Ve//m3E6SniNEVGi1xer5YR8/j8NWs7NCmAu7gD8tVyqhcH+/Z6jtZafHw6xV//5Xfx8eNyPkQ/z/hctwHJzC+297msBHO932tfZoGvn0fL8XmrVw8B5lG8/iTekvQ1RZsisk9xalNkr/jhd7+LX87P8c//yT+PfzNHfPrt7yKj4kNOFweAR3z5oHf98DsYB+z7e9Uuymvd/jMi4sM0gvzVe/zqF7+M//lf/Mv4h3/nP4mPv/7L+NUv/yiqKubn5/gwnZYVAS/PAOjXfczSA7wH7aqE+o2JIFPWssp7jpqf4x//o78fv/gwxcfTU1Sfx0qB6JmZy+LPFuPFJiMAAAdyis+/jatt3l0f5Hod/rt5XFfVMru/4nnZA35e5vz/tdN/GqfPv4m//f3T6PBnRMQU0TKqzrNCeDTTNhjInLZB4LhGTB+fIjPjz//9n0f/IeJf/es/jYiMaZq290W1i8FjXA/8uO8B4ZoYXPbxXcs2Yszu7j3i4y9/Eb+rT/HdH/+NmKtvdX3uPU7Thy/W/QyzQO9G3lqJ1aIyorWxDcCUI6CXFfEUU7TI+Ju//C7+5tMcf+sXp8jokZUxZUT0cSBk7+uMzy/8agH2B7yeEwLj36wOPW5Lv1xflmHl+bDnrDa2/3p+jjZFfP83fxX/43//T+Lzv/1N/N//H/80vv/4XbQaieIp22g/rtr/0Q509f/Orq/dF2v5nxPAc5xybAPzw29/E//7v/Mn8avPv47/8//pv4rf/fbXcYqKU7axjVTvo8+wJYHyqn9hXPBQXYT99o5V8fQ0xS8+TPH3/+SP4/l3v4mnp6eI6FlVNUdF5pT7E4PyxYBT4gcAHtXp+dMP/goHHhb2iIuZ3OugIDIinn+IX/3iY/yNX07bqs919lCv21s/XL9kGHC/QcGI2LZ8qZrG1h7Lfr9VEZ8/fhf/n3/1b+N//ff/IdY94ed139fK2ysA7Pn0GPV/V58vEgBLpZ6rx8cfnuOP/uRvRHw4bQP6yoinqsjTtM0av/VzDQHvw/Xs3LY7ALByOdS3erRxuuvY3qFXTBHx3YcW/5vvn+Jvfz/2fM6KOMUIEJyyxXP1WJqCF8u+rpPQ6fp416yYt6CuLXUe73rVF8uX78vlsM+xuqdFzOPzaYr41TTF//W//yfxT/9v/694mj6M58Mcy7NirAKa1hV/W4U3AeAee/rtqly2GeBtPex1jqweU0Z8aBUZPX7xu9/E/+W/+y/jH/+Dvxutz/HhlHGKMUO89x7Vlj7gxb223FfrygOH8d71tc/ncspW48znmKPlKT6c2gj+n1pOLaqP+H+kJWEAcGjOADiorVR3+77f6tdlr23/11qWFWeef8Aa98mrfWV5kBugzgG7th7wuRz89/zp8zI4zOWwuIp5nseMsRvLvy9vnKsbhLs0r0H8WlaBTOfTHjNzm+G3bvUytXFIbO62jbkZdrhKGPKW4Z+X5RK7BECr2BIA657vLWJs8bOEik5LWzEtz4GMiqkvs0fjZVm3rd6XrTge9RoZUfNuT2/Xx7peP/OXFV65dOiyR1tm8lefo7WnyGVFWPUen373Q3z//fdjtVcf395yWlYNjpWAuawmzO0ema7+P0gD34O83vpvPRx2ms7b+URG1RzzXPF0muL7j9/Fpx9+iKl6fHhqMWVE63NEzGNFWF/Lt5/b/yWwPLp/DuG+9+upTaP3n0sfb4roY6uf6HOPp6enaFm19PW2kV/mUsKlgw8AR3NqTQf+yIGh/VAxMy/2ETofCnsZQNoO+l1OFa5dQoADDBa3e6Bimk4xTdM287+1tgX9vjoRKEsC4M7rf0Rs2zrt/43tYUawv/c+gsUx2oM5KlrvX0wARK0BAX/ru1Lndr9y7PPee1/KagT/s49DHnvv0WrsB7+e7JGV0aq2mb/R+1bEeVH1czto3Gz6x7xG65Gtdge+uz7W9arqL4H/Kfp4T0VkfI7qGVU9sj4v9XrdDmyOFss2kX209b16fNuYoIXVAPfU7reb2zP2ft7ar7UW0Xs8f36OjLHa85QRT63FlBV9/hw1f45Ti5iqtj7BaOfb6FPk/qDZ2nUAtKp3ee1LWxAtcinHaT3nt3pkVvReY+q/4D8AvAtWABw7DhR9mfm/bQEUl+cCTO28Jcwa4Wm5vO8i4vMysBiGgA8h1w5/RORa3jGW+q+zw7YzAuZa3twiIl8JAPeXNwZ32QCMMwDGv3UHoFzqd18Ofc2pjT39M8ey/2Wqd39l1VAsbUNetTW8YR1/cc1XD2rIpUHIGm39KSpOkZHRxgqAyDhlRq77P+/KfH0CjDDisq+wc0EetI0YgeEaUeAlZuT6MNdXGv6L2lgVbenQZdRWp1tmnFouAeJYtgoaz/6R+M3x2s09v/ez/00gens3DuTNJUTfc3vOt6dpJPmnvj3vo1dkn8ey0Pk5Wo0VoG1aJwc9R1a7vOOyR97cDXSdEuB6L9cR2O9R1SOyltU9tfTtx27/NayTQ0ZZC/4DwGGd/Ane+dCh94h5zPapZaCwHhwa9W0BfuGfewj9LWOwV8s5orXcRnFVL2eGtyUTNBIDeQ4WvtDCFgD3bX8IcERsBwGuW/+sX1v3+Y1Ytv/a3UXfshWs4P8dtul5dTj8rsxzqfzra733qN5HwG9r8Ofo1aK29mF5uc4lvh0Fkj3MIXjUR0cfKzwU4GGcV2uen88jFrwE9+eKiDkyT8vs4NE+tFy3fOvbqtDX23+z/+/saf9qT3xb8Ve1rPiqi2f7qUVMWdEiY2oZraaYWkb2eUsE9ey1TCrP9aGf0ZcZRRe/u1zv69pyJPdG+Y+zH3KkgaJi2SMwRtw/Myszq6+HAaxfAAAO5eT5ftCx/e66BX/yvBdkj9q2e2ltbAPRW24zhPvyPdfh3f0ZsPXKqgDeutRfBnR6LDP/+5j1O0fEFDlmiM3ncyDG9gC5JQBeBof6Vz7nPiJB6+V8BkhVbdv81K5s5zh/bS3zzIwxP+zy+dCcBXLXbp3JMMp7CQCOYf94LSNOuTwDarTtbTkoZMo2tohZDwHOy/I/7/7VtP8PfK9URjS1+ZD1ftT9jLbfIX5L+LdlJdB43vfaJ/RzHCeQeT5KaJfwu+hrmCh8B92+NQmbF+U+inNZyRFzzPMcvc/RqkePjHmet8RA5lgVUr2ifx4rAioiTqcPy6yAdvHYb9ddTu7SPD+POh8xtnob4f6l514x5YetH3jeElbwHwCOzBZAB1UXg8DdXt7rdkAZW+d/PQA21wMCW74eEqjLj43/7i4UcDk23LZ/Gsmd2J3vsF8BsL53vO98KPDLMYACf4iYwI3qui/rqwHf1k7ExWoAZX2Ie2GdBRpxDv63vHg21HIKfEUf15wvt41bAwo1DhCu65uLB+wjjD3f+3JQtMORH+u6PfFzbbBvJP77uR63Wlb6bTOC+7l/sHxrWxIDreXFc2SfQNAfuDfT7pDmtVRGuTzPc0zTNJK8Y3eXmGKK09TidDrFHBVzVUxr32DZH7DlKaanFs/P/Qtn/ZwPB27Vomd3vbNrVEZMGVNM0fN5bO84jfJa2oBttn8fpwOP/X/GiuBaXwMAjsMWQO9t0L8L9o0Ab0RG36b0nM+HXd6n+3fn2jeVd2sZz889ptaW7YAu3zNN01gi3k5LYGB6ZWuI6+Xm5v8+QqhvO7av57leL8v3f8xEr341E9zw8I1rf329va+q6G2ZtV/rSoBz+eWS7Fm3B6qM7RDwynMZr5NM+0VWyQqgh24ZlqDfWrauD3SNXZ8t282zONrUtq2+op2i17o7SEbGtLX/uT0fzmdG3XwurFu+qPcPYZqmrZ82Pz/HlC0yKj5/Xmb/z2OWf82foveIKafoMUdGxPPzODx2TPS5OANi2RRoOwo4l82FXO/smq1Vr55jN6eWka2qelZlVY7R3fVM/7Zk/3pXxwHgiCQAAOAd6PkyZbcG/NfzRXP32vV5Auv70+z/h7du+RbRt0S/62NdL2vzKMt9UrbtNm1Zk77XKwh4r3aTAXKZOR4Ra7Z4nflfY4fQ3SZDbdlhaLuTls+b64NdTeEAgPdHAsAgIGqZ5bMbE4yZgfCCMwAeT53Lal+vf49ZnNeBI4Gk+yrhW632l1ZxVb58wzJB+EXg/yKweOMjHqwlz76s8FCGj1vxr2fkt4s2oW9nPo2vrVvD9Lgu9/6FFiR+0jODO+m3ZY/rVv3Ws6Eyou9m/o/g/z5x1D39DzP6AwDeGyM/ADiY9ZDXb31vxO79tW3vcPF1dP+4f98WmRXMf5eylrKvF3eCiD4AwLFZAcAYAHxjgGcNENkC4s5G+je3BLh6X934WvalMPNGcKBHxCRYcHC3FoK3Wg6Kvtrzn/tst/9w5dMiYh7/rfaiWVh/T64JAjOCD1H/edgW4Orp3C+7A8tnbanZt1d29pf9hlxWi31tz3/1/776geudkK/0977VuVwzMsaO/7W/o8bTp1LO4Bj3DQDwbsZ+/gS86BPmH/Z9wJ0+AK4GgKr0Mcb0P3bG/jmwf+4WtDgnegWJj1n382JLD9fHul7X398jGC+Af1y5TuL4UhmPr7ctcXT5/oxeWdf5pL49YV58DQCAu2YFwHt3NUuoYgkKvHI81BoIqu0/tod420HeN74t1/2AX9nWI+tqafhrM/+vP5dDPIL9KoC8Ud9fu93Ehe+sOf+xzUddl2xtgeG6cY/k1fMiS/1/2HtlDRBmRZTrw12X+rtOxGg3tnRpS83uy9eycqvL7eJZ/toZAK8Fj7vn/13p3/aeq6W7efHkGP2/jB6tcukPtIjoW5g/KzKqV44FglfPEB6w5+dPAACe/vDtQX3Bf4A7e7BfzOh/+freZRDoxtcFeI4vy/XRrlnqJ99Yv19PEJyPiP5xq0F0/QEAHo8VAAYGL3v1eQ4UvZjndb0ntL/gnbosuYyIih6t2jZ16yIYWMuJodniMhDY4pU7gSPdLbt6vT8R4nqPebGm+7IF+uOy/C6a9GX/5i+X3W72cPZo2ZYb4bLer3v+CzoeiL38Hrjo2vnZvM3avuwF5Nqpi/2zvV2t/myhhT/yjbKcAlH1ss9fyz1UbWnYW/SLsyJaRrV10W8tnUmNBgDAI8YP/AkAWAb4PLg1MvOl7Zv2X7vMA9oT/P3ouoC68fCF/kB7Gei37RsAgJEDAAAAAABwPyQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAAAAAAADggCQAiJ7jWnn1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";
function GemHex(){return <img src={GEM_ICON_DATA_URL} alt="" aria-hidden="true" style={{width:18,height:18,objectFit:'contain',display:'inline-block',verticalAlign:'-4px',marginRight:0}}/>}
const VISUAL_COLORS=[['none','none'],['red','#EF4444'],['orange','#F97316'],['yellow','#FACC15'],['green','#22C55E'],['turquoise','#14B8A6'],['blue','#3B82F6'],['purple','#8B5CF6'],['magenta','#EC4899'],['white','#F5F5F5']];
function ColorDot({value,selected,onClick,small=false,title}) {
  const isNone=value==='none';
  const c=isNone?'transparent':(VISUAL_COLORS.find(x=>x[0]===value)?.[1]||'#fff');
  return <button type="button" onClick={onClick} title={title||(isNone?'Без цвета':value)} aria-label={title||(isNone?'Без цвета':value)} className="press" style={{
    width:24,height:24,borderRadius:'50%',border:selected?'2px solid var(--text)':'1px solid var(--border)',
    background:c,position:'relative',padding:0
  }}>
    {isNone&&<span style={{position:'absolute',left:4,right:4,top:'50%',height:2,background:'#9AA2C2',transform:'rotate(-45deg)',transformOrigin:'center'}}/>}
  </button>
}

function AchievementFields({form,setForm}){
  if(!form.forAchievement)return null;
  const field=(key,label,placeholder,step='1')=>{
    const score=step==='0.1';
    const max=score?10:(key==='achievementGems'?2147483647:1000000);
    return <label style={{display:'block',marginBottom:8}}>
      <div style={{fontSize:11.5,color:'var(--text-muted)',marginBottom:4}}>{label}</div>
      <input type="number" min="0" max={max} value={form[key]??''} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))}
        placeholder={placeholder} inputMode={score?'decimal':'numeric'} step={step}
        style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:10,color:'var(--text)'}}/>
    </label>;
  };
  return <div style={{background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:12,padding:10,marginBottom:10}}>
    <div className="atlas-display" style={{fontSize:14,fontWeight:700,marginBottom:8}}>Настройки достижения</div>
    <div style={{fontSize:11.5,color:'var(--text-muted)',lineHeight:1.45,marginBottom:9}}>Все заполненные условия должны выполняться одновременно. Город получает достижение, когда текущий показатель больше или равен порогу. Пустое поле отключает условие; 0 — допустимый порог.</div>
    {field('achievementResidents','Количество жителей (основатель/мэр считается)','Например: 5')}
    {field('achievementGems','Потрачено на город самоцветов','Например: 100')}
    {field('achievementInspectorScore','Оценка от инспектора (0–10)','Например: 8.5','0.1')}
    {field('achievementPlayerScore','Оценка от игроков (0–10)','Например: 8.5','0.1')}
    {field('achievementScreenshots','Количество одобренных скриншотов','Например: 10')}
    {field('achievementComments','Количество комментариев','Например: 5')}
    {field('achievementVisuals','Количество визуалов в инвентаре города','Например: 3')}
  </div>;
}

function makeVisualForm(item={}){
  return {
    name:item?.name||'',categories:item?.categories_text||item?.category_name||'',price:String(item?.price??0),
    imageData:item?.image_data||'',color:item?.color||'white',forAchievement:!!item?.achievement_enabled,
    achievementResidents:item?.achievement_residents??'',achievementGems:item?.achievement_gems??'',
    achievementInspectorScore:item?.achievement_inspector_score??'',achievementPlayerScore:item?.achievement_player_score??'',
    achievementScreenshots:item?.achievement_screenshots??'',achievementComments:item?.achievement_comments??'',
    achievementVisuals:item?.achievement_visuals??'',governmentMarker:!!item?.government_marker
  };
}

async function validateCoverDataUrl(dataUrl){if(!dataUrl)return;const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Не удалось определить размеры изображения'));i.src=dataUrl});const ratio=img.width/img.height;if(!Number.isFinite(ratio)||Math.abs(ratio-(8/3))>0.001)throw new Error('Для визуала с тегом «Обложка» изображение должно иметь соотношение 8:3.')}

function VisualEditModal({item,onClose,onSaved,initData}){
  const [form,setForm]=useState(makeVisualForm(item)),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const { closing, requestClose } = useAnimatedClose(onClose, 175);
  async function pick(file){if(!file)return;try{const imageData=await readImageData(file);setForm(f=>({...f,imageData}));setError('')}catch(e){setError(safeCaughtError(e, 'Ошибка изображения'))}}
  async function save(){
    try{
      setSaving(true);setError('');
      const categories=form.categories.split(',').map(x=>x.trim()).filter(Boolean);
      if(!form.name.trim()||!categories.length)throw new Error('Укажите название и хотя бы один тег');
      if(!form.imageData)throw new Error('Загрузите изображение визуала');
      if(categories.some(x=>x.toLowerCase()==='обложка')) await validateCoverDataUrl(form.imageData);
      const r=await fetch(`${API_BASE}/api/customization/items/${encodeURIComponent(item.id)}`,{
        method:'PATCH',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},
        body:JSON.stringify({initData,name:form.name.trim(),categories,price:Number(form.price),imageData:form.imageData,color:form.color,
          achievementEnabled:form.forAchievement,achievementResidents:form.achievementResidents,achievementGems:form.achievementGems,
          achievementInspectorScore:form.achievementInspectorScore,achievementPlayerScore:form.achievementPlayerScore,
          achievementScreenshots:form.achievementScreenshots,achievementComments:form.achievementComments,achievementVisuals:form.achievementVisuals,
          governmentMarker:form.governmentMarker})
      });
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      onSaved?.();requestClose();
    }catch(e){setError(safeCaughtError(e, 'Не удалось сохранить визуал'))}finally{setSaving(false)}
  }
  return <div className={`atlas-overlay${closing ? ' atlas-closing' : ''}`} style={{position:'fixed',inset:0,zIndex:120,background:'rgba(0,0,0,.82)',display:'flex',alignItems:'center',justifyContent:'center'}} onClick={requestClose}>
    <div onClick={e=>e.stopPropagation()} className={`atlas-modal-shell${closing ? ' atlas-closing' : ''}`} style={{width:'100%',maxWidth:448,maxHeight:'90vh',overflowY:'auto',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:22,padding:18}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div className="atlas-display" style={{fontSize:18,fontWeight:700}}>Редактировать визуал</div>
        <button onClick={requestClose} className="press" style={iconBtn('var(--surface-2)','var(--text-muted)')}><X size={16}/></button>
      </div>
      <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Название" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:10,color:'var(--text)',marginBottom:8}}/>
      <input value={form.categories} onChange={e=>setForm(f=>({...f,categories:e.target.value}))} placeholder="Теги через запятую" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:10,color:'var(--text)',marginBottom:8}}/>
      <input value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value.replace(/\D/g,'')}))} placeholder="Цена" inputMode="numeric" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:10,color:'var(--text)',marginBottom:8}}/>
      <label style={{display:'flex',alignItems:'center',gap:9,fontSize:13,fontWeight:700,margin:'3px 0 8px',cursor:'pointer'}}>
        <input type="checkbox" checked={form.forAchievement} onChange={e=>setForm(f=>({...f,forAchievement:e.target.checked}))}/>
        За достижение
      </label>
      <label style={{display:'flex',alignItems:'center',gap:9,fontSize:13,fontWeight:700,margin:'0 0 10px',cursor:'pointer',color:form.governmentMarker?'var(--mint)':'var(--text)'}}>
        <input type="checkbox" checked={form.governmentMarker} onChange={e=>setForm(f=>({...f,governmentMarker:e.target.checked}))}/>
        Гос. терра
      </label>
      <AchievementFields form={form} setForm={setForm}/>
      <div style={{fontSize:11.5,color:'var(--text-muted)',marginBottom:6}}>Цвет визуала</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:9}}>{VISUAL_COLORS.map(([v])=><ColorDot key={v} value={v} selected={form.color===v} onClick={()=>setForm(f=>({...f,color:v}))}/>)}</div>
      <input type="file" accept="image/*" onChange={e=>pick(e.target.files?.[0])} style={{width:'100%',marginBottom:8}}/>
      {form.imageData&&<div style={{display:'flex',justifyContent:'center',padding:10,background:'var(--surface-2)',borderRadius:12,marginBottom:8}}><img src={form.imageData} alt={form.name} style={{maxWidth:160,maxHeight:170,objectFit:'contain'}}/></div>}
      {error&&<div style={{fontSize:12,color:'var(--red)',marginBottom:8}}>{error}</div>}
      <button onClick={save} disabled={saving} className="press" style={{width:'100%',padding:11,border:'none',borderRadius:10,background:'var(--gold)',color:'#06120D',fontWeight:700}}>{saving?'Сохранение…':'Сохранить изменения'}</button>
    </div>
  </div>;
}

function profileAccountLabel(scope,cities,tgUser,profile){
  if(scope==='personal') return profile?.nickname || tgUser?.mc_nickname || 'Ник не указан';
  const id=String(scope).startsWith('treasury:')?String(scope).slice(9):'';
  return `Казна: ${(cities||[]).find(c=>String(c.id)===id)?.name||'город'}`;
}
function CustomizationScreen({initData,tgUser,role,territories,profile}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[filters,setFilters]=useState({tag:'all',color:'all'}),[accountScope,setAccountScope]=useState('personal'),[accountLoading,setAccountLoading]=useState(false);
  const [form,setForm]=useState(makeVisualForm()),[saving,setSaving]=useState(false),[editingItem,setEditingItem]=useState(null),[rechecking,setRechecking]=useState(false),[recheckNotice,setRecheckNotice]=useState(''),[visibilityBusy,setVisibilityBusy]=useState(''),[purchaseToast,setPurchaseToast]=useState(null);
  const isMain=role==='main_inspector';
  const managerCities=(territories||[]).filter(t=>String(t.owner_telegram_id||'')===String(tgUser?.id||'')||(Array.isArray(t.manager_telegram_ids)&&t.manager_telegram_ids.map(String).includes(String(tgUser?.id||''))));
  const accountOptions=['personal',...managerCities.map(t=>`treasury:${t.id}`)];
  useEffect(()=>{if(!accountOptions.includes(accountScope))setAccountScope('personal')},[managerCities.length]);
  const canSwitchAccount=accountOptions.length>1&&!isMain;

  async function loadFull(){
    try{setError('');setAccountLoading(true);
      const r=await fetch(`${API_BASE}/api/customization?account=${encodeURIComponent(accountScope)}`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setData(d);
    }catch(e){setError(safeCaughtError(e, 'Не удалось загрузить визуалы'))}finally{setAccountLoading(false)}
  }
  async function loadAccountBalance(){
    try{setError('');setAccountLoading(true);
      const r=await fetch(`${API_BASE}/api/customization?lite=1&account=${encodeURIComponent(accountScope)}`,{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setData(prev=>prev?{...prev,...d}:d);
    }catch(e){setError(safeCaughtError(e, 'Не удалось загрузить счёт'))}finally{setAccountLoading(false)}
  }
  async function recheckAchievements(){
    if(!isMain||rechecking)return;
    try{
      setRechecking(true);setError('');setRecheckNotice('');
      const r=await fetch(`${API_BASE}/api/achievements/recheck`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData})});
      const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось перепроверить достижения.'));
      setRecheckNotice(`Проверено городов: ${Number(d.checked||0)}. Без основателя/мэра пропущено: ${Number(d.skipped||0)}. Новых выдач: ${Number(d.awarded||0)}. Ошибок: ${Number(d.errors||0)}.`);
      await loadFull();
    }catch(e){setError(safeCaughtError(e,'Не удалось перепроверить достижения.'))}finally{setRechecking(false)}
  }
  useEffect(()=>{loadFull()},[initData,territories?.length]);
  useEffect(()=>{if(data)loadFull()},[accountScope]);
  useEffect(()=>{const refresh=()=>{loadAccountBalance()};window.addEventListener('voxygen:currency-changed',refresh);return()=>window.removeEventListener('voxygen:currency-changed',refresh)},[accountScope]);

  async function create(){
    try{
      setSaving(true);setError('');
      const categories=form.categories.split(',').map(x=>x.trim()).filter(Boolean);
      if(!form.name.trim()||!categories.length)throw new Error('Укажите название и хотя бы один тег');
      if(categories.some(x=>x.toLowerCase()==='обложка')) await validateCoverDataUrl(form.imageData);
      const r=await fetch(`${API_BASE}/api/customization/items`,{
        method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},
        body:JSON.stringify({initData,name:form.name.trim(),categories,price:Number(form.price),imageData:form.imageData,color:form.color,
          achievementEnabled:form.forAchievement,achievementResidents:form.achievementResidents,achievementGems:form.achievementGems,
          achievementInspectorScore:form.achievementInspectorScore,achievementPlayerScore:form.achievementPlayerScore,
          achievementScreenshots:form.achievementScreenshots,achievementComments:form.achievementComments,achievementVisuals:form.achievementVisuals,governmentMarker:form.governmentMarker})
      });
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
      setForm(makeVisualForm());await loadFull();
    }catch(e){setError(safeCaughtError(e, 'Не удалось создать визуал'))}finally{setSaving(false)}
  }
  async function pick(file){if(!file)return;try{const imageData=await readImageData(file);setForm(f=>({...f,imageData}));setError('')}catch(e){setError(safeCaughtError(e, 'Ошибка изображения'))}}
  async function buy(id){
    try{const r=await fetch(`${API_BASE}/api/customization/purchase`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,itemId:id,accountScope})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));setError('');loadFull()}catch(e){const message=safeCaughtError(e, 'Не удалось купить визуал');if(/недостаточно самоцветов/i.test(message)){setError('');setPurchaseToast({id:Date.now(),message:'Недостаточно самоцветов'});}else setError(message)}
  }
  async function remove(id){
    if(!window.confirm('Удалить этот визуал?'))return;
    try{const r=await fetch(`${API_BASE}/api/customization/items/${encodeURIComponent(id)}`,{method:'DELETE',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData})}),d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));loadFull()}catch(e){setError(safeCaughtError(e, 'Не удалось удалить визуал'))}
  }
  async function toggleVisibility(item){
    if(!isMain||visibilityBusy)return;
    const hidden=Number(item.hidden_from_users||0)!==1;
    try{setVisibilityBusy(String(item.id));setError('');const r=await fetch(`${API_BASE}/api/customization/items/visibility`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,itemId:item.id,hiddenFromUsers:hidden})}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(apiErrorMessage(r,d,'Не удалось изменить видимость визуала.'));setData(v=>v?{...v,items:(v.items||[]).map(x=>String(x.id)===String(item.id)?{...x,hidden_from_users:Number(d.hidden_from_users??(hidden?1:0))}:x)}:v);}catch(e){setError(safeCaughtError(e,'Не удалось изменить видимость визуала.'));}finally{setVisibilityBusy('');}
  }
  async function reorderItems(id,direction){
    const items=[...(data?.items||[])];const idx=items.findIndex(x=>x.id===id);if(idx<0)return;
    const to=idx+direction;if(to<0||to>=items.length)return;
    [items[idx],items[to]]=[items[to],items[idx]];
    setData(v=>({...v,items}));
    try{
      const r=await fetch(`${API_BASE}/api/customization/items/reorder`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,itemIds:items.map(x=>x.id)})});
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
    }catch(e){setError(safeCaughtError(e, 'Не удалось изменить порядок визуалов'));loadFull()}
  }
  async function reorderTags(id,direction){
    const tags=[...(data?.categories||[])];const idx=tags.findIndex(x=>x.id===id);if(idx<0)return;
    const to=idx+direction;if(to<0||to>=tags.length)return;
    [tags[idx],tags[to]]=[tags[to],tags[idx]];
    setData(v=>({...v,categories:tags}));
    try{
      const r=await fetch(`${API_BASE}/api/customization/tags/reorder`,{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({initData,tagIds:tags.map(x=>x.id)})});
      const d=await r.json().catch(() => null);if(!r.ok||!d.ok)throw new Error(apiErrorMessage(r, d, "Операция не выполнена."));
    }catch(e){setError(safeCaughtError(e, 'Не удалось изменить порядок тегов'));loadFull()}
  }

  const allItems=(data?.items||[]).filter(item=>isMain||!item.government_marker);
  const tagNames=data?.categories||[];
  const filtered=allItems.filter(item=>{
    const cats=String(item.categories_text||item.category_name||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    return (filters.tag==='all'||cats.includes(filters.tag.toLowerCase()))&&(filters.color==='all'||String(item.color||'white')===filters.color);
  });

  const accountCardStyle={width:'100%',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:'14px 16px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center',textAlign:'left',color:'var(--text)'};
  const accountCardContent=<>
    <span style={{display:'flex',flexDirection:'column',gap:3}}><MinecraftText text={profileAccountLabel(accountScope,managerCities,tgUser,profile)} className="atlas-display" style={{fontSize:17,fontWeight:800,lineHeight:1.15}}/>{canSwitchAccount&&<span style={{fontSize:10.5,color:'var(--text-muted)'}}>Нажмите, чтобы переключить счёт</span>}</span>
    <span className="atlas-display atlas-account-balance" style={{fontSize:22,fontWeight:800,color:'var(--gem)',display:'flex',alignItems:'center',gap:6,lineHeight:1}}><span>{accountLoading?'…':(data?.balance??0)}</span><GemHex/></span>
  </>;
  return <div className="atlas-page atlas-page--customization" style={{padding:'18px 16px 100px'}}>
    <div className="atlas-display atlas-page-title" style={{fontSize:22,fontWeight:700,marginBottom:14}}>Визуал</div>

    {canSwitchAccount ? (
      <button type="button" onClick={()=>setAccountScope(v=>{const i=accountOptions.indexOf(v);const next=accountOptions[(i+1)%accountOptions.length];setData(prev=>prev?{...prev,accountScope:next,accountLabel:profileAccountLabel(next,managerCities,tgUser,profile)}:prev);return next})} className="press atlas-account-switcher atlas-account-switcher--interactive" style={accountCardStyle} aria-label="Переключить счёт">
        {accountCardContent}
      </button>
    ) : (
      <div className="atlas-account-switcher atlas-account-switcher--static" style={accountCardStyle} aria-label="Личный счёт">
        {accountCardContent}
      </div>
    )}

    {isMain&&<div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:14,marginBottom:14}}>
      <div className="atlas-display" style={{fontSize:16,fontWeight:700,marginBottom:10}}>Добавить визуал</div>
      <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Название" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:10,color:'var(--text)',marginBottom:8}}/>
      <input value={form.categories} onChange={e=>setForm(f=>({...f,categories:e.target.value}))} placeholder="Теги через запятую" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:10,color:'var(--text)',marginBottom:8}}/>
      <input value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value.replace(/\D/g,'')}))} placeholder="Цена" inputMode="numeric" style={{width:'100%',boxSizing:'border-box',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:10,padding:10,color:'var(--text)',marginBottom:8}}/>
      <div style={{display:'flex',alignItems:'center',gap:18,flexWrap:'wrap',margin:'3px 0 10px'}}>
        <label style={{display:'inline-flex',alignItems:'center',gap:9,fontSize:13,fontWeight:700,cursor:'pointer'}}>
          <input type="checkbox" checked={form.forAchievement} onChange={e=>setForm(f=>({...f,forAchievement:e.target.checked}))}/>
          За достижение
        </label>
        <label style={{display:'inline-flex',alignItems:'center',gap:9,fontSize:13,fontWeight:700,cursor:'pointer',color:form.governmentMarker?'var(--mint)':'var(--text)'}}>
          <input type="checkbox" checked={form.governmentMarker} onChange={e=>setForm(f=>({...f,governmentMarker:e.target.checked}))}/>
          Гос. терра
        </label>
      </div>
      {form.governmentMarker&&<div style={{fontSize:11.5,color:'var(--text-muted)',margin:'-2px 0 10px'}}>Этот визуал будет скрыт от обычных пользователей и автоматически применится к государственным территориям по своим тегам.</div>}
      <AchievementFields form={form} setForm={setForm}/>
      <div style={{fontSize:11.5,color:'var(--text-muted)',marginBottom:6}}>Цвет визуала</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:9}}>{VISUAL_COLORS.map(([v])=><ColorDot key={v} value={v} selected={form.color===v} onClick={()=>setForm(f=>({...f,color:v}))}/>)}</div>
      <input type="file" accept="image/*" onChange={e=>pick(e.target.files?.[0])} style={{width:'100%',marginBottom:8}}/>
      {form.imageData&&<div style={{display:'flex',justifyContent:'center',padding:10,background:'var(--surface-2)',borderRadius:12,marginBottom:8}}><img src={form.imageData} alt="preview" style={{maxWidth:160,maxHeight:170,objectFit:'contain'}}/></div>}
      <button onClick={create} disabled={saving} className="press" style={{width:'100%',padding:10,border:'none',borderRadius:10,background:'var(--gold)',color:'#06120D',fontWeight:700,marginTop:8}}>{saving?'Создание…':'Добавить визуал'}</button>
    </div>}

    {isMain&&<div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:12,marginBottom:14}}>
      <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.45,marginBottom:9}}>Проверить достижения у всех одобренных городов повторно. Это исправит пропущенные выдачи, например если достижение было добавлено до назначения основателя/мэра.</div>
      <button onClick={recheckAchievements} disabled={rechecking} className="press" style={{width:'100%',border:'1px solid var(--border)',borderRadius:10,padding:'10px 12px',background:'var(--surface-2)',color:'var(--text)',fontWeight:800}}>{rechecking?'Проверка достижений…':'Перепроверить достижения всех городов'}</button>
      {recheckNotice&&<div role="status" style={{fontSize:12,color:'var(--mint)',marginTop:8}}>{recheckNotice}</div>}
    </div>}

    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:12,marginBottom:14}}>
      <div style={{display:'flex',gap:7,overflowX:'auto',paddingBottom:7,alignItems:'center'}}>
        <button onClick={()=>setFilters(f=>({...f,tag:'all'}))} className="press" style={{border:'none',borderRadius:999,padding:'7px 10px',background:filters.tag==='all'?'var(--purple)':'var(--surface-2)',color:filters.tag==='all'?'#fff':'var(--text-muted)',fontSize:11.5,fontWeight:700}}>Все</button>
        {tagNames.map((c,i)=><div key={c.id} style={{display:'flex',alignItems:'center',gap:2,flex:'0 0 auto'}}>
          <button onClick={()=>setFilters(f=>({...f,tag:c.name}))} className="press" style={{border:'none',borderRadius:999,padding:'7px 10px',background:filters.tag.toLowerCase()===c.name.toLowerCase()?'var(--purple)':'var(--surface-2)',color:filters.tag.toLowerCase()===c.name.toLowerCase()?'#fff':'var(--text-muted)',fontSize:11.5,fontWeight:700,whiteSpace:'nowrap'}}><MinecraftText text={c.name}/></button>
          {isMain&&<span style={{display:'flex',gap:1}}>
            <button disabled={i===0} onClick={()=>reorderTags(c.id,-1)} className="press" style={{border:'none',background:'transparent',color:'var(--text-muted)',fontSize:10,padding:2}}><ChevronUp size={14}/></button>
            <button disabled={i===tagNames.length-1} onClick={()=>reorderTags(c.id,1)} className="press" style={{border:'none',background:'transparent',color:'var(--text-muted)',fontSize:10,padding:2}}>›</button>
          </span>}
        </div>)}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
        <ColorDot value="none" small selected={filters.color==='all'} title="Все цвета" onClick={()=>setFilters(f=>({...f,color:'all'}))}/>
        {VISUAL_COLORS.filter(([v])=>v!=='none').map(([v])=><ColorDot key={v} value={v} small selected={filters.color===v} onClick={()=>setFilters(f=>({...f,color:v}))}/>)}
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
      {filtered.map(item=>{
        const owned=(data?.owned||[]).some(x=>x.item_id===item.id);
        const idx=allItems.findIndex(x=>x.id===item.id);
        return <div key={item.id} className="atlas-visual-card-reveal atlas-visual-card" data-visual-color={String(item.color||'white').toLowerCase()} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:10,position:'relative',animationDelay:`${Math.min(idx*28,168)}ms`}}>
          {isMain&&<div style={{position:'absolute',right:7,top:7,zIndex:3,display:'flex',gap:3}}>
            <button disabled={idx===0} onClick={()=>reorderItems(item.id,-1)} className="press" title="Выше" style={{width:25,height:25,border:'none',borderRadius:'50%',background:'var(--surface-2)',color:'var(--text-muted)',fontWeight:700}}><ChevronUp size={14}/></button>
            <button disabled={idx===allItems.length-1} onClick={()=>reorderItems(item.id,1)} className="press" title="Ниже" style={{width:25,height:25,border:'none',borderRadius:'50%',background:'var(--surface-2)',color:'var(--text-muted)',fontWeight:700}}><ChevronDown size={14}/></button>
            <button type="button" onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setEditingItem(item)}} className="press" title="Редактировать" style={{width:36,height:36,border:'1px solid var(--purple-border)',borderRadius:10,background:'var(--purple-soft)',color:'var(--purple)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Pencil size={17}/></button>
            <button type="button" disabled={Boolean(visibilityBusy)} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();toggleVisibility(item)}} className="press" title={Number(item.hidden_from_users||0)===1?'Показать другим пользователям':'Скрыть от других пользователей'} style={{width:36,height:36,border:'1px solid var(--border)',borderRadius:10,background:Number(item.hidden_from_users||0)===1?'var(--surface-3)':'var(--surface-2)',color:Number(item.hidden_from_users||0)===1?'var(--text-muted)':'var(--text)',display:'flex',alignItems:'center',justifyContent:'center',cursor:visibilityBusy?'wait':'pointer',opacity:(visibilityBusy&&String(item.id)!==visibilityBusy)?0.55:1}}>{Number(item.hidden_from_users||0)===1?<EyeOff size={17}/>:<Eye size={17}/>}</button>
            <button type="button" onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();remove(item.id)}} className="press" title="Удалить" style={{width:36,height:36,border:'1px solid var(--red-border)',borderRadius:10,background:'var(--red-soft)',color:'var(--red)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><Trash2 size={17}/></button>
          </div>}
          {item.image_data&&<div style={{height:140,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface-2)',borderRadius:10}}><img src={item.image_data} alt={item.name} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',imageRendering:'pixelated'}}/></div>}
          <MinecraftText as="div" text={item.name} style={{fontSize:13,fontWeight:700,marginTop:7}}/>
          <div className="atlas-display atlas-visual-price" style={{fontSize:18,fontWeight:800,color:'var(--gem)',marginTop:6,display:'flex',alignItems:'center',gap:6,lineHeight:1}}><span>{item.price}</span><GemHex/></div>
          <button disabled={owned} onClick={()=>buy(item.id)} className="press" style={{width:'100%',marginTop:8,padding:9,border:'none',borderRadius:10,background:owned?'var(--surface-2)':'var(--purple)',color:owned?'var(--text-muted)':'#fff',fontWeight:700}}>{owned?'Получено':'Купить'}</button>
        </div>;
      })}
    </div>
    {!filtered.length&&!error&&<div style={{fontSize:12,color:'var(--text-muted)',padding:'20px 4px'}}>Визуалов по выбранным фильтрам нет.</div>}
    {error&&<div style={{fontSize:12,color:'var(--red)',marginTop:10}}>{error}</div>}
    {purchaseToast&&<FixedToast key={purchaseToast.id} message={purchaseToast.message} type="error"/>}
    {editingItem&&<VisualEditModal item={editingItem} initData={initData} onClose={()=>setEditingItem(null)} onSaved={loadFull}/>}
  </div>;
}
function BottomNav({screen,onNavigate}){const items=[{key:'customization',icon:Sparkles,label:'Визуал'},{key:'cities',icon:MapIcon,label:'Территории'},{key:'events',icon:CalendarDays,label:'Ивенты'},{key:'profile',icon:User,label:'Профиль'}];return <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:40,display:'flex',justifyContent:'center'}}><div className="atlas-nav-glow" style={{width:'100%',maxWidth:448,display:'flex',background:'rgba(10,11,16,.94)',backdropFilter:'blur(10px)',borderTop:'1px solid var(--border)',padding:'10px 6px 14px'}}>{items.map(it=>{const active=it.key===screen;return <button key={it.key} onClick={()=>onNavigate(it.key)} className={`press${active?' atlas-nav-active':''}`} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,color:active?'var(--purple)':'var(--text-muted)',background:'none',border:'none'}}><it.icon size={19} strokeWidth={active?2.4:2}/><span style={{fontSize:10.5,fontWeight:active?700:500}}>{it.label}</span></button>})}</div></div>}

// Root
// ---------------------------------------------------------------------------
export default function CityRatingApp() {
  const tgUser = getTelegramUser();
  const [role, setRole] = useState('user');
  const [timezoneOffset,setTimezoneOffset] = useState('UTC+3');
  const [mapZoomPercent,setMapZoomPercent] = useState(100);
  const [theme,setTheme] = useState('vox');
  const [timezoneReady,setTimezoneReady] = useState(false);
  const [timezoneLoadError,setTimezoneLoadError] = useState('');
  const [timezoneRetryToken,setTimezoneRetryToken] = useState(0);

  const [screen, setScreen] = useState('cities');
  const [mainTab, setMainTab] = useState('map');
  const [territoriesLoading, setTerritoriesLoading] = useState(true);
  const [territoriesHasLoaded, setTerritoriesHasLoaded] = useState(false);
  const territoriesLoadedRef = useRef(false);
  const [territoriesError, setTerritoriesError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [returnToEvents, setReturnToEvents] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState(null);
  const [territories, setTerritories] = useState(TERRITORIES);
  const territoriesRef = useRef(TERRITORIES);
  const [profile, setProfile] = useState(() => ({ nickname: '', status: 'none' }));
  const [profileLoadState, setProfileLoadState] = useState('loading');
  const [profileLoadError, setProfileLoadError] = useState(null);
  const profileLoadedOnceRef = useRef(false);
  const profileRequestRef = useRef(false);
  const profileRequestInitDataRef = useRef('');
  const profileAbortRef = useRef(null);
  const profileRequestVersionRef = useRef(0);
  const activeTelegramIdRef = useRef(String(tgUser?.id||''));
  const territoriesRequestRef = useRef(false);
  const territoriesRefreshQueuedRef = useRef(false);
  const mapImageLoadedRef = useRef(false);
  const [showAddTerritory, setShowAddTerritory] = useState(false);
  const [homeToast, setHomeToast] = useState(null);
  const [worldMapImage, setWorldMapImage] = useState(null);
  const [worldMapSource, setWorldMapSource] = useState(null);
  const [worldMapLoading, setWorldMapLoading] = useState(true);
  const [worldMapError, setWorldMapError] = useState('');
  const [voxView, setVoxView] = useState({ x: 0, y: 0, scale: 1 });
  const [markersReady, setMarkersReady] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqText, setFaqText] = useState('');
  const faqRequestRef = useRef(false);
  const [homeFeatureButton,setHomeFeatureButton]=useState({imageData:'',title:'Информация',subtitle:'',text:'',hidden:false});
  const [homeFeatureButtonReady,setHomeFeatureButtonReady]=useState(false);
  const [homeFeatureOpen,setHomeFeatureOpen]=useState(false);

  const selected = territories.find((t) => String(t.id) === String(selectedId));

  const refreshProfile = async () => {
    if (document.visibilityState === 'hidden') return;
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) {
      const message = 'Откройте Voxygen через Telegram, чтобы проверить профиль.';
      setProfileLoadError(message);
      if (!profileLoadedOnceRef.current) setProfileLoadState('error');
      return;
    }
    if(profileRequestRef.current && profileRequestInitDataRef.current===initData) return;
if(profileRequestRef.current && profileRequestInitDataRef.current!==initData) profileAbortRef.current?.abort();
    const requestVersion=++profileRequestVersionRef.current;
    const controller=new AbortController();
    profileAbortRef.current=controller;
    profileRequestRef.current = true;
    profileRequestInitDataRef.current=initData;
    let timedOut=false;
    const timeout=setTimeout(()=>{timedOut=true;controller.abort();},15000);
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({ initData }),
      });
      const data = await res.json().catch(() => null);
      if(requestVersion!==profileRequestVersionRef.current)return;
      if (!res.ok || !data?.ok) {
        const message = apiErrorMessage(res, data, 'Не удалось проверить профиль. Повторите попытку.');
        setProfileLoadError(message);
        if (!profileLoadedOnceRef.current) setProfileLoadState('error');
        console.warn('Voxygen profile refresh failed', { status: res.status, code: data?.code || 'PROFILE_REQUEST_FAILED', requestId: res.headers?.get('X-Request-ID') || null });
        return;
      }

      setRole(data.role || 'user');
      const responseUserId=String(data.user?.id||'');
      if(responseUserId && activeTelegramIdRef.current && responseUserId!==activeTelegramIdRef.current){
        activeTelegramIdRef.current=responseUserId;
        setTerritories(TERRITORIES);setTerritoriesHasLoaded(false);setTerritoriesError(null);
        loadTerritories();
      } else if(responseUserId) activeTelegramIdRef.current=responseUserId;
      if (data.profile) {
        const nextProfile = {
          nickname: data.profile.mc_nickname || '',
          status: data.profile.status || 'none',
          skinUrl: data.profile.skin_url || null,
          xuid: data.profile.xuid || null,
          skinTextureId: data.profile.skin_texture_id || null,
          city: data.city || null,
        };
        setProfile(nextProfile);
        if (nextProfile.status === 'verified' && nextProfile.nickname) setProfileLoadState('verified');
        else if (!nextProfile.nickname) setProfileLoadState('needs_nickname');
        else setProfileLoadState('loaded');
      } else if (data.role === 'inspector' || data.role === 'main_inspector') {
        setProfile({ nickname: '', status: 'verified', skinUrl: null, city: data.city || null });
        setProfileLoadState('verified');
      } else {
        // Only a successful /api/me response with an empty profile authorizes
        // the nickname-claim flow. Errors never fall through to this state.
        setProfile({ nickname: '', status: 'none', skinUrl: null, city: data.city || null });
        setProfileLoadState('needs_nickname');
      }
      profileLoadedOnceRef.current = true;
      setProfileLoadError(null);
    } catch (error) {
      if(requestVersion!==profileRequestVersionRef.current)return;
      if(error?.name==='AbortError'&&!timedOut)return;
      const message = error?.name==='AbortError'&&timedOut ? 'Сервер отвечает дольше обычного. Повторите попытку.' : safeCaughtError(error, 'Не удалось проверить профиль. Повторите попытку.');
      setProfileLoadError(message);
      if (!profileLoadedOnceRef.current) setProfileLoadState('error');
      console.warn('Voxygen profile refresh failed', { code: timedOut?'PROFILE_TIMEOUT':'PROFILE_NETWORK_ERROR' });
    } finally {
      clearTimeout(timeout);
      if(requestVersion===profileRequestVersionRef.current){profileRequestRef.current=false;profileAbortRef.current=null;profileRequestInitDataRef.current='';}
    }
  };

  useEffect(() => {
    refreshProfile();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshProfile(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(refreshProfile, 60000);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalTimer = null;
    let expiryTimer = null;
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) { setTimezoneReady(true); return () => { cancelled = true; }; }
    setTimezoneReady(false); setTimezoneLoadError('');
    const loadSettings = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      try {
        const response = await fetch(`${API_BASE}/api/user-settings`, { headers: { 'X-Telegram-Init-Data': initData }, cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || !data?.settings) throw new Error(apiErrorMessage(response, data, 'Settings fetch failed'));
        if (cancelled) return;
        const value = data.settings;
        setTimezoneOffset(normalizeTimezoneOffset(value.timezone));
        setMapZoomPercent(normalizeMapZoomPercent(value.mapZoomPercent));
        setTheme(normalizeTheme(value.theme || value.defaultTheme));
        setTimezoneReady(true); setTimezoneLoadError('');
        if (expiryTimer !== null) window.clearTimeout(expiryTimer);
        const expiries = [value.globalOverrides?.mapZoomPercent?.expiresAt, value.globalOverrides?.theme?.expiresAt].map(Number).filter(at => Number.isFinite(at) && at > Date.now());
        if (expiries.length) {
          const nextExpiry = Math.min(...expiries);
          expiryTimer = window.setTimeout(loadSettings, Math.min(2147480000, Math.max(500, nextExpiry - Date.now() + 250)));
        }
      } catch (error) {
        console.warn('Voxygen settings load failed', error);
        if (!cancelled) setTimezoneLoadError('Не удалось загрузить ваши настройки времени. Создание и редактирование ивентов временно недоступно.');
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') loadSettings(); };
    loadSettings();
    intervalTimer = window.setInterval(loadSettings, 60000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (intervalTimer !== null) window.clearInterval(intervalTimer);
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [timezoneRetryToken]);

  async function loadWorldMap() {
    if (mapImageLoadedRef.current) return;
    setWorldMapLoading(true);
    setWorldMapError('');
    try {
      // Prefer the published manifest. The small preview appears immediately;
      // VoxMap then requests only the high-detail tiles visible at the current zoom.
      try {
        const manifestResponse = await fetch(`${MAP_ASSETS_BASE}/world-map/manifest.json?check=${Date.now()}`, { cache: 'no-store' });
        if (manifestResponse.ok) {
          const manifest = await manifestResponse.json();
          const source = manifest?.source;
          if (!manifest?.mapVersion || !source || !['deepzoom', 'url-grid'].includes(source.type)) {
            throw new Error('Опубликованная карта имеет неподдерживаемый формат.');
          }
          if (Number(source.width) !== WORLD_MAP_GEOMETRY.width || Number(source.height) !== WORLD_MAP_GEOMETRY.height) {
            throw new Error('Размер карты не совпадает с калибровкой координат Voxygen (6001 × 6001).');
          }
          if (source.coordinateSystem && !coordinateGeometryMatchesManifest(source.coordinateSystem)) {
            throw new Error('Калибровка координат карты не совпадает с backend Voxygen.');
          }
          const previewPath = source.previewUrl || manifest.previewUrl;
          if (!previewPath) throw new Error('В манифесте карты отсутствует previewUrl.');
          const previewUrl = /^https?:\/\//i.test(previewPath) ? previewPath : new URL(previewPath, MAP_ASSETS_BASE).href;
          const preloadImage = new Image();
          preloadImage.decoding = 'async';
          preloadImage.fetchPriority = 'high';
          if (typeof preloadImage.decode === 'function') {
            preloadImage.src = previewUrl;
            await preloadImage.decode();
          } else {
            await new Promise((resolve, reject) => {
              if (preloadImage.complete) {
                if (preloadImage.naturalWidth > 0) resolve();
                else reject(new Error('Не удалось загрузить превью карты.'));
                return;
              }
              preloadImage.onload = resolve;
              preloadImage.onerror = () => reject(new Error('Не удалось загрузить превью карты.'));
              preloadImage.src = previewUrl;
            });
          }
          if (!preloadImage.naturalWidth || !preloadImage.naturalHeight) {
            throw new Error('Превью карты не удалось декодировать.');
          }
          setWorldMapImage(previewUrl);
          setWorldMapSource({ ...source, assetBase: MAP_ASSETS_BASE, mapVersion: manifest.mapVersion });
          mapImageLoadedRef.current = true;
          return;
        }
      } catch (manifestError) {
        console.warn('Deep Zoom manifest unavailable; using the legacy map endpoint:', String(manifestError?.message || manifestError));
      }

      // Compatibility fallback until the first Deep Zoom map has been published.
      const probe = await fetch(`${API_BASE}/api/map`, { method: 'HEAD', cache: 'no-store' });
      if (!probe.ok) {
        const errorData = await fetch(`${API_BASE}/api/map`, { cache: 'no-store' })
          .then(response => response.json().catch(() => null))
          .catch(() => null);
        throw new Error(errorData?.error || `Не удалось получить карту (HTTP ${probe.status}).`);
      }
      const contentType = String(probe.headers.get('Content-Type') || '').toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType.split(';')[0].trim())) {
        throw new Error('GitHub вернул неподдерживаемый формат карты. Загрузите PNG, JPG или WebP.');
      }
      const mapVersion = String(probe.headers.get('X-Map-Version') || '').trim();
      const mapUrl = `${API_BASE}/api/map${mapVersion ? `?v=${encodeURIComponent(mapVersion)}` : ''}`;
      const preloadImage = new Image();
      preloadImage.decoding = 'async';
      preloadImage.fetchPriority = 'high';
      preloadImage.src = mapUrl;
      if (typeof preloadImage.decode === 'function') {
        await preloadImage.decode();
      } else {
        await new Promise((resolve, reject) => {
          if (preloadImage.complete) {
            if (preloadImage.naturalWidth > 0) resolve();
            else reject(new Error('Не удалось загрузить изображение карты.'));
            return;
          }
          preloadImage.onload = resolve;
          preloadImage.onerror = () => reject(new Error('Не удалось загрузить изображение карты.'));
        });
      }
      if (!preloadImage.naturalWidth || !preloadImage.naturalHeight) {
        throw new Error('Изображение карты не удалось декодировать.');
      }
      setWorldMapSource(null);
      setWorldMapImage(mapUrl);
      mapImageLoadedRef.current = true;
    } catch (error) {
      setWorldMapImage(null);
      setWorldMapSource(null);
      setWorldMapError(safeCaughtError(error, 'Не удалось загрузить карту мира.'));
      console.error('Load world map error:', String(error?.message || error));
    } finally {
      setWorldMapLoading(false);
    }
  }

  function retryWorldMap() {
    mapImageLoadedRef.current = false;
    loadWorldMap();
  }

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

  async function loadTerritories() {
    if (document.visibilityState === 'hidden') return;
    if (territoriesRequestRef.current) {
      territoriesRefreshQueuedRef.current = true;
      return;
    }
    territoriesRequestRef.current = true;
    // This request fulfils any refresh queued while the app was hidden.
    territoriesRefreshQueuedRef.current = false;
    if (!territoriesLoadedRef.current) setTerritoriesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/territories?view=summary`, {
        headers: { 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || '' },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      const rows = Array.isArray(data) ? data : data?.territories;
      if (!res.ok || data?.ok === false || !Array.isArray(rows)) {
        const message = apiErrorMessage(res, data, 'Не удалось обновить список территорий.');
        setTerritoriesError(message);
        console.warn('Voxygen territories refresh failed', { status: res.status, code: data?.code || 'TERRITORIES_REQUEST_FAILED', requestId: res.headers?.get('X-Request-ID') || null });
        return;
      }
      const degradedAreas = new Set(Array.isArray(data?.degradedAreas) ? data.degradedAreas : []);
      const normalized = rows.map((row, index) => {
        const owner = row.owner ?? row.owner_input ?? 'Неизвестно';
        const coords = row.coords ?? '';
        const previous = territoriesRef.current.find(item => String(item.id) === String(row.id));
        const preservePrevious = (areas, field, value) => areas.some(area => degradedAreas.has(area)) && previous ? previous[field] : value;
        return {
          id: row.id,
          name: row.name || 'Без названия',
          owner,
          coords,
          x: finiteCoordinate(row.x) ?? (50 + ((index * 17) % 30) - 15),
          y: finiteCoordinate(row.y) ?? (50 + ((index * 23) % 30) - 15),
          accent: row.accent || 'var(--purple)',
          curator: preservePrevious(['inspector_ratings'], 'curator', Number(row.curator ?? 0)),
          community: preservePrevious(['ratings'], 'community', Number(row.community ?? 0)),
          votes: preservePrevious(['ratings'], 'votes', Number(row.votes ?? 0)),
          residents: preservePrevious(['members'], 'residents', Array.isArray(row.residents) ? row.residents : []),
          reviews: preservePrevious(['comments'], 'reviews', Array.isArray(row.reviews) ? row.reviews : []),
          screenshots: preservePrevious(['screenshots'], 'screenshots', Array.isArray(row.screenshots) ? row.screenshots.map(s => ({ ...s, url: s?.url ? (String(s.url).startsWith('http') ? s.url : `${API_BASE}${s.url}`) : s?.url })) : []),
          vox_x: finiteCoordinate(row.vox_x),
          vox_z: finiteCoordinate(row.vox_z),
          owner_telegram_id: row.owner_telegram_id ?? null,
          owner_telegram_username: row.owner_telegram_username || null,
          owner_mc_nickname: row.owner_mc_nickname || null,
          founder_mc_nickname: row.founder_mc_nickname || row.owner_mc_nickname || null,
          marker_url: row.marker_url || null,
          cover_url: row.cover_url || row.background_image || null,
          background_item_id: row.background_item_id || null,
          resident_count: preservePrevious(['members', 'managers'], 'resident_count', Number(row.resident_count ?? ((row.residents || []).length + (row.managers || []).length))),
          resident_telegram_ids: preservePrevious(['members'], 'resident_telegram_ids', Array.isArray(row.resident_telegram_ids) ? row.resident_telegram_ids : []),
          resident_rows: preservePrevious(['members'], 'resident_rows', Array.isArray(row.resident_rows) ? row.resident_rows : []),
          managers: preservePrevious(['managers'], 'managers', Array.isArray(row.managers) ? row.managers : []),
          manager_telegram_ids: preservePrevious(['managers'], 'manager_telegram_ids', Array.isArray(row.manager_telegram_ids) ? row.manager_telegram_ids : []),
          manager_count: preservePrevious(['managers'], 'manager_count', Number(row.manager_count ?? (Array.isArray(row.managers) ? row.managers.length : 0))),
          is_manager: preservePrevious(['managers'], 'is_manager', Boolean(row.is_manager)),
          recruitment_contact_username: row.recruitment_contact_username || null,
          recruitment_description: row.recruitment_description || '',
          recruitment_enabled: Number(row.recruitment_enabled || 0),
          additional_info: row.additional_info || '',
          is_government: row.is_government === true || Number(row.is_government || 0) === 1,
          my_rating: preservePrevious(['ratings', 'inspector_ratings', 'my_player_rating', 'my_inspector_rating'], 'my_rating', row.my_rating || { rated:false, next_at:null, values:null }),
        };
      });
      territoriesRef.current = normalized;
      setTerritories(normalized);
      territoriesLoadedRef.current = true;
      setTerritoriesHasLoaded(true);
      setTerritoriesError(data?.degraded ? 'Часть данных территорий временно не загрузилась. Повторите обновление.' : null);
      requestAnimationFrame(() => setMarkersReady(true));
    } catch (error) {
      setTerritoriesError(safeCaughtError(error, 'Не удалось обновить список территорий.'));
      console.warn('Voxygen territories refresh failed', { code: 'TERRITORIES_NETWORK_ERROR' });
    } finally {
      territoriesRequestRef.current = false;
      setTerritoriesLoading(false);
      if (territoriesRefreshQueuedRef.current && document.visibilityState !== 'hidden') {
        territoriesRefreshQueuedRef.current = false;
        Promise.resolve().then(() => loadTerritories());
      }
    }
  }

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
  }, [screen, selectedId]);

  useEffect(() => { if (screen === 'cities' && mainTab === 'map') loadWorldMap(); }, [screen, mainTab]);

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

  async function claimNickname(raw) {
    const nick = (raw || '').trim();
    if (!nick) return { ok: false, message: 'Введите ник.' };
    try {
      const initData = window.Telegram?.WebApp?.initData || '';
      if (!initData) return { ok: false, message: 'Откройте приложение через Telegram.' };
      const res = await fetch(`${API_BASE}/api/profile/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick, initData }),
      });
      const data = await parseApiResponse(res, 'Не удалось отправить заявку на никнейм.');
      setProfile((prev) => ({ ...prev, nickname: nick, status: data.status || 'pending' }));
      setProfileLoadState(data.status === 'verified' ? 'verified' : 'loaded');
      setProfileLoadError(null);
      profileLoadedOnceRef.current = true;
      return { ok: true };
    } catch (error) {
      return { ok: false, message: safeCaughtError(error, 'Не удалось отправить заявку.') };
    }
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
    <div className="atlas-root" data-theme={theme} style={{ minHeight: '100vh', width: '100%' }}>
      <FontsAndTheme />
      <div style={{ maxWidth: 448, margin: '0 auto', position: 'relative' }}>
        <div className="atlas-screen-transition" key={`${screen}-${selected?.id || 'none'}`}>
        {screen === 'profile' ? (
          <ProfileScreen profile={profile} profileLoadState={profileLoadState} profileLoadError={profileLoadError} claimNickname={claimNickname} role={role} tgUser={tgUser} refreshProfile={refreshProfile} territories={territories} onTerritoriesChanged={loadTerritories} onMapSaved={map=>{mapImageLoadedRef.current=true;setWorldMapImage(typeof map==='string'?map:map?.image||null);setWorldMapSource(typeof map==='string'?null:(map?.source||null));setWorldMapError('');setWorldMapLoading(false)}} onFaqSaved={setFaqText} onSettingsSaved={settings=>{setTimezoneOffset(normalizeTimezoneOffset(settings.timezone));setMapZoomPercent(normalizeMapZoomPercent(settings.mapZoomPercent));setTheme(normalizeTheme(settings.theme||settings.defaultTheme));setTimezoneReady(true);setTimezoneLoadError('');}} />
        ) : screen === 'customization' ? (
          <CustomizationScreen initData={window.Telegram?.WebApp?.initData || ''} tgUser={tgUser} role={role} territories={territories} profile={profile} />
        ) : screen === 'events' ? (
          <EventsScreen initData={window.Telegram?.WebApp?.initData || ''} territories={territories} tgUser={tgUser} isMainInspector={role==='main_inspector'} expandedEventId={expandedEventId} setExpandedEventId={setExpandedEventId} timezoneOffset={timezoneOffset} timezoneReady={timezoneReady} timezoneLoadError={timezoneLoadError} onRetryTimezone={()=>setTimezoneRetryToken(value=>value+1)} onSelectTerritory={id=>{setReturnToEvents(true);setScreen('cities');setMainTab('map');setSelectedId(id)}} />
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
          />
        ) : (
          <>
            <div style={{ padding: '18px 16px 10px', display: 'flex', flexWrap:'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, rowGap:8 }}>
              <div>
                <div className="atlas-display" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Multi-Punk</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{territories.length} {pluralizeTerritories(territories.length)}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:7,flexShrink:0,marginTop:2,marginLeft:'auto'}}>{homeFeatureButtonReady&&(role==='main_inspector'||!homeFeatureButton.hidden)&&<button type="button" onClick={()=>setHomeFeatureOpen(true)} className="press" aria-label="Информация от главного инспектора" title={homeFeatureButton.title||'Информация'} style={{width:36,height:36,padding:0,overflow:'hidden',border:'1px solid var(--border)',borderRadius:'50%',background:'var(--surface)',color:'var(--purple)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{homeFeatureButton.imageData?<img src={homeFeatureButton.imageData} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<ImagePlus size={17}/>}</button>}<button onClick={openFaq} className="press" style={{height:36,boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 12px',borderRadius:999,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontWeight:700,fontSize:13}}>ЧиВо</button>{(profile.status==='verified'||role==='main_inspector') && <button onClick={()=>setShowAddTerritory(true)} className="press" style={{display:'flex',alignItems:'center',gap:6,padding:'9px 14px',borderRadius:999,border:'none',background:'var(--purple)',color:'#fff',fontWeight:700,fontSize:13}}><Plus size={15}/> Добавить</button>}</div>
            </div>

            <MainTabs tab={mainTab} onChange={changeMainTab} />

            {territoriesError && (
                  <div role="status" style={{ margin: '0 16px 10px', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{flex:1}}>{String(territoriesError).startsWith('Часть данных')?territoriesError:`Не удалось обновить территории. Показаны последние успешно загруженные данные. ${territoriesError}`}</span>
                    <button onClick={loadTerritories} className="press" style={{padding:'7px 9px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontWeight:700,flexShrink:0}}>Повторить</button>
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
                  />
                )}
          </>
        )}
        </div>
        <BottomNav screen={screen} onNavigate={navigate} />

        {showAddTerritory && (
          <AddTerritoryModal onClose={() => setShowAddTerritory(false)} onSubmit={submitTerritoryRequest} isMainInspector={role==='main_inspector'} />
        )}
        {faqOpen && <FaqModal text={faqText} onClose={()=>setFaqOpen(false)} />}
        {homeFeatureOpen&&<HomeFeatureButtonModal mode={role==='main_inspector'?'edit':'view'} config={homeFeatureButton} initData={window.Telegram?.WebApp?.initData||''} onClose={()=>setHomeFeatureOpen(false)} onSaved={setHomeFeatureButton}/>}

        {homeToast && <FixedToast key={homeToast} message={homeToast}/>}
      </div>
    </div>
  );
}
