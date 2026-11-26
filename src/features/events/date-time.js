export function normalizeTimezoneOffset(value){
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

export function timezoneOffsetToMinutes(value) {
  const normalized = normalizeTimezoneOffset(value || 'UTC+3');
  const match = normalized.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return 180;
  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === '-' ? -minutes : minutes;
}
export function eventDateLabel(value, timezoneOffset = 'UTC+3') {
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

export const VOXYGEN_EVENT_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export const EVENT_TIME_ZONE = 'Europe/Moscow';
export function eventZonedParts(timestamp, timeZone = EVENT_TIME_ZONE) {
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
export function eventDatePartsFromTimestamp(value, timeZone = EVENT_TIME_ZONE) {
  const parts = eventZonedParts(Number(value), timeZone);
  if (!parts) return defaultEventDateParts(timeZone);
  return { day:parts.day, month:parts.month, hour:parts.hour, minute:parts.minute };
}
export function defaultEventDateParts(timeZone = EVENT_TIME_ZONE) {
  // Round up to the next full minute so the default is immediately publishable.
  return eventDatePartsFromTimestamp(Math.floor(Date.now() / 60000) * 60000 + 60000, timeZone);
}
export function globalExpiryDatePartsFromTimestamp(timestamp, timeZone = EVENT_TIME_ZONE) {
  const parts = eventZonedParts(Number(timestamp), timeZone);
  if (!parts) return defaultGlobalExpiryDateParts(timeZone);
  return { year:parts.year, day:parts.day, month:parts.month, hour:parts.hour, minute:parts.minute };
}
export function defaultGlobalExpiryDateParts(timeZone = EVENT_TIME_ZONE) {
  const timestamp = Math.ceil((Date.now() + 60 * 60000) / 60000) * 60000;
  return globalExpiryDatePartsFromTimestamp(timestamp, timeZone);
}
export function globalExpiryPartsTimestamp(parts, timeZone = EVENT_TIME_ZONE) {
  const year=Number(parts?.year),day=Number(parts?.day),month=Number(parts?.month),hour=Number(parts?.hour),minute=Number(parts?.minute);
  if (![year,day,month,hour,minute].every(Number.isInteger) || year<2000 || year>2200 || month<1 || month>12 || day<1 || day>new Date(Date.UTC(year,month,0)).getUTCDate() || hour<0 || hour>23 || minute<0 || minute>59) return null;
  const targetUtc=Date.UTC(year,month-1,day,hour,minute,0,0);
  let candidate=targetUtc;
  for(let attempt=0;attempt<5;attempt++){
    const zoned=eventZonedParts(candidate,timeZone);
    if(!zoned)return null;
    const representedUtc=Date.UTC(zoned.year,zoned.month-1,zoned.day,zoned.hour,zoned.minute,zoned.second||0,0);
    const delta=targetUtc-representedUtc;
    candidate+=delta;
    if(delta===0)break;
  }
  const check=eventZonedParts(candidate,timeZone);
  if(!check||check.year!==year||check.month!==month||check.day!==day||check.hour!==hour||check.minute!==minute||candidate<=Date.now())return null;
  return candidate;
}
export const EVENT_DATE_LIMIT_MESSAGE='Создавать ивенты можно максимум за 2 месяца до начала';
export function addUtcCalendarMonths(timestamp,months=2){
  const date=new Date(Number(timestamp));
  if(!Number.isFinite(date.getTime()))return NaN;
  const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);
  const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,lastDay));return date.getTime();
}
export function eventDatePartsTimestamp(parts, timeZone = EVENT_TIME_ZONE) {
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

export function sanitizeEventCoords(value) { return String(value??'').replace(/[\u0000-\u001F\u007F]/g,'').slice(0,180); }
export function formatEventCoords(value) {
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
export function pluralRu(value, one, few, many) { const n=Math.abs(Math.trunc(Number(value)||0)),lastTwo=n%100,last=n%10; if(lastTwo>=11&&lastTwo<=14)return many; if(last===1)return one; if(last>=2&&last<=4)return few; return many; }
export function reminderUnitLabel(value, unit) { return unit==='hours'?pluralRu(value,'час','часа','часов'):pluralRu(value,'минуту','минуты','минут'); }
