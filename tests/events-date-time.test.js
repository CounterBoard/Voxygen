import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_DATE_LIMIT_MESSAGE, EVENT_TIME_ZONE, addUtcCalendarMonths,
  defaultEventDateParts, defaultGlobalExpiryDateParts, eventDateLabel,
  eventDatePartsFromTimestamp, eventDatePartsTimestamp, eventZonedParts,
  formatEventCoords, globalExpiryDatePartsFromTimestamp, globalExpiryPartsTimestamp,
  normalizeTimezoneOffset, pluralRu, reminderUnitLabel, sanitizeEventCoords,
  timezoneOffsetToMinutes,
} from "../src/features/events/date-time.js";
import { readFileSync } from "node:fs";

const dateFieldsSource=readFileSync(new URL("../src/features/events/DateTimeFields.jsx",import.meta.url),"utf8");

test("timezone offsets are normalized and bounded to valid quarter-hour offsets",()=>{
  assert.equal(normalizeTimezoneOffset("UTC+5:30"),"UTC+5:30");
  assert.equal(normalizeTimezoneOffset("-03:45"),"UTC-3:45");
  assert.equal(normalizeTimezoneOffset("UTC+14"),"UTC+14");
  assert.equal(normalizeTimezoneOffset("UTC-12"),"UTC-12");
  assert.equal(normalizeTimezoneOffset("UTC+14:15"),"UTC+3");
  assert.equal(normalizeTimezoneOffset("UTC-12:15"),"UTC+3");
  assert.equal(normalizeTimezoneOffset("UTC+3:10"),"UTC+3");
  assert.equal(normalizeTimezoneOffset("not-a-timezone"),"UTC+3");
  assert.equal(timezoneOffsetToMinutes("UTC+5:30"),330);
  assert.equal(timezoneOffsetToMinutes("UTC-3:30"),-210);
});

test("event wall-clock parts support fixed UTC offsets and IANA time zones",()=>{
  const timestamp=Date.parse("2026-01-15T12:30:00.000Z");
  assert.deepEqual(eventZonedParts(timestamp,"UTC+3"),{year:2026,month:1,day:15,hour:15,minute:30,second:0});
  assert.deepEqual(eventZonedParts(timestamp,"Europe/Berlin"),{year:2026,month:1,day:15,hour:13,minute:30,second:0});
  assert.equal(eventZonedParts(Number.NaN,"UTC+3"),null);
  assert.equal(EVENT_TIME_ZONE,"Europe/Moscow");
});

test("event timestamp conversion round-trips future wall-clock time",()=>{
  const target=Math.ceil((Date.now()+48*60*60*1000)/60000)*60000;
  const parts=eventZonedParts(target,"UTC+3");
  const restored=eventDatePartsTimestamp({day:parts.day,month:parts.month,hour:parts.hour,minute:parts.minute},"UTC+3");
  assert.equal(restored,target);
  assert.equal(eventDatePartsTimestamp({day:31,month:2,hour:12,minute:0},"UTC+3"),null);
  assert.equal(eventDatePartsTimestamp({day:1,month:1,hour:25,minute:0},"UTC+3"),null);
});

test("global expiry date conversion validates calendar values and future timestamps",()=>{
  const target=Math.ceil((Date.now()+3*60*60*1000)/60000)*60000;
  const parts=eventZonedParts(target,"UTC+3");
  const form={year:parts.year,month:parts.month,day:parts.day,hour:parts.hour,minute:parts.minute};
  assert.equal(globalExpiryPartsTimestamp(form,"UTC+3"),target);
  assert.equal(globalExpiryPartsTimestamp({...form,day:32},"UTC+3"),null);
  assert.deepEqual(globalExpiryDatePartsFromTimestamp(target,"UTC+3"),form);
});

test("default date helpers return valid calendar parts",()=>{
  const eventParts=defaultEventDateParts("UTC+3");
  const expiryParts=defaultGlobalExpiryDateParts("UTC+3");
  assert.ok(eventParts.minute>=0&&eventParts.minute<=59);
  assert.ok(expiryParts.minute>=0&&expiryParts.minute<=59);
  assert.equal(typeof eventParts.day,"number");
  assert.equal(typeof expiryParts.year,"number");
  assert.ok(EVENT_DATE_LIMIT_MESSAGE.includes("2 месяца"));
  assert.deepEqual(eventDatePartsFromTimestamp(Date.now()+86400000,"UTC+3").day>0,true);
});

test("UTC month arithmetic clamps to the destination month's last day",()=>{
  assert.equal(new Date(addUtcCalendarMonths(Date.parse("2026-01-31T12:00:00Z"),1)).toISOString(),"2026-02-28T12:00:00.000Z");
  assert.equal(new Date(addUtcCalendarMonths(Date.parse("2024-01-31T12:00:00Z"),1)).toISOString(),"2024-02-29T12:00:00.000Z");
});

test("event labels, coordinates and reminder units preserve user-facing formats",()=>{
  assert.match(eventDateLabel(Date.parse("2026-01-01T00:00:00Z"),"UTC+3"),/03:00/);
  assert.equal(sanitizeEventCoords(" X 930\u0000 / Z 1260 ")," X 930 / Z 1260 ");
  assert.equal(formatEventCoords("X 930 / Z 1260"),"930 / 1260");
  assert.equal(formatEventCoords("930, 1260"),"930 / 1260");
  assert.equal(formatEventCoords("not coordinates"),"not coordinates");
  assert.equal(pluralRu(1,"час","часа","часов"),"час");
  assert.equal(pluralRu(2,"час","часа","часов"),"часа");
  assert.equal(pluralRu(11,"час","часа","часов"),"часов");
  assert.equal(reminderUnitLabel(1,"hours"),"час");
  assert.equal(reminderUnitLabel(5,"hours"),"часов");
  assert.equal(reminderUnitLabel(1,"minutes"),"минуту");
  assert.equal(reminderUnitLabel(2,"minutes"),"минуты");
});

test("date wheel component retains scroll snapping, touch settling and date-field constraints",()=>{
  assert.match(dateFieldsSource,/scrollSnapType:'y mandatory'/);
  assert.match(dateFieldsSource,/onTouchEnd={endInteraction}/);
  assert.match(dateFieldsSource,/scrollTop\/rowHeight/);
  assert.match(dateFieldsSource,/daysInSelectedMonth/);
  assert.match(dateFieldsSource,/includeYear\?/);
  assert.match(dateFieldsSource,/function EventDateTimeFields\(/);
});
