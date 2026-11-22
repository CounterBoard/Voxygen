import test from "node:test";
import assert from "node:assert/strict";
import { parseTerritoryAwardCommand, normalizeTelegramEmoji, findTelegramAnimatedEmojiSticker } from "../bot/src/worker.js";

const cities=[
  {id:"city-1",name:"Новая Территория"},
  {id:"city-2",name:"Новая Территория Север"},
];

test("banker award add command recognizes emoji, multi-word territory and award names",()=>{
  assert.deepEqual(parseTerritoryAwardCommand("🏆 Новая Территория Север Лучшая территория 2026",cities),{
    mode:"add",territoryId:"city-2",territoryName:"Новая Территория Север",name:"Лучшая территория 2026",emoji:"🏆"
  });
});

test("banker award remove command recognizes territory and exact award name",()=>{
  assert.deepEqual(parseTerritoryAwardCommand("Новая Территория -Лучшая территория 2026",cities),{
    mode:"remove",territoryId:"city-1",territoryName:"Новая Территория",name:"Лучшая территория 2026",emoji:null
  });
});

test("banker award parser chooses the longest territory-name match",()=>{
  const result=parseTerritoryAwardCommand("🥇 Новая Территория Север Лучший дизайн",cities);
  assert.equal(result?.territoryId,"city-2");
  assert.equal(result?.name,"Лучший дизайн");
});

test("banker award parser ignores numeric bank debits, unknown and incomplete commands",()=>{
  assert.equal(parseTerritoryAwardCommand("Новая Территория -250",cities),null);
  assert.equal(parseTerritoryAwardCommand("🏆 Неизвестная территория Награда",cities),null);
  assert.equal(parseTerritoryAwardCommand("Новая Территория -",cities),null);
  assert.equal(parseTerritoryAwardCommand("Новая Территория",cities),null);
});

test("Telegram emoji matching normalizes presentation selectors but preserves the exact emoji sequence",()=>{
  assert.equal(normalizeTelegramEmoji("❤️"),normalizeTelegramEmoji("❤"));
  assert.equal(normalizeTelegramEmoji("👩‍🚀"),"👩‍🚀");
  assert.notEqual(normalizeTelegramEmoji("👍🏻"),normalizeTelegramEmoji("👍🏿"));
});

test("Telegram emoji preview lookup selects the sticker with the matching emoji",()=>{
  const stickers=[
    {emoji:"❤️",file_id:"heart-red"},
    {emoji:"🏆",file_id:"trophy-gold"},
    {emoji:"👍🏻",file_id:"thumb-light"},
  ];
  assert.equal(findTelegramAnimatedEmojiSticker(stickers,"❤")?.file_id,"heart-red");
  assert.equal(findTelegramAnimatedEmojiSticker(stickers,"🏆")?.file_id,"trophy-gold");
  assert.equal(findTelegramAnimatedEmojiSticker(stickers,"🏅"),null);
  assert.equal(findTelegramAnimatedEmojiSticker([], "🏆"),null);
});
