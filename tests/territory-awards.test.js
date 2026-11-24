import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGemWithdrawalCommand, parseTelegramEmojiSetName, isTelegramCustomEmojiSet, getTelegramStickerFormat, normalizeTelegramEmoji, findTelegramAnimatedEmojiSticker, getTelegramAnimatedEmojiPreview, isTelegramAnimatedEmojiSticker, isSafeTelegramTgsAnimation } from "../bot/src/worker.js";

test("gem withdrawal parser accepts compact, spaced and slash-prefixed personal debit commands",()=>{
  for(const command of ["-250","- 250","/-250","/ - 250"]){
    assert.deepEqual(parseGemWithdrawalCommand(command),{personal:true,territory:null,amount:250});
  }
});

test("gem withdrawal parser accepts compact and spaced territory debit commands",()=>{
  for(const command of ["Новая Территория -250","Новая Территория - 250","/Новая Территория -250","/ Новая Территория - 250"]){
    assert.deepEqual(parseGemWithdrawalCommand(command),{personal:false,territory:"Новая Территория",amount:250});
  }
});

test("gem withdrawal parser rejects incomplete and unrelated commands",()=>{
  for(const command of ["-","/","/hello","Новая Территория -"])assert.equal(parseGemWithdrawalCommand(command),null);
  assert.deepEqual(parseGemWithdrawalCommand("- 0"),{personal:true,territory:null,amount:0},"zero is parsed and rejected by the withdrawal handler's amount validation");
});

test("main-inspector award grants send notices through territory notification preferences",()=>{
  const worker=readFileSync(new URL("../bot/src/worker.js",import.meta.url),"utf8");
  const start=worker.indexOf("async function grantTerritoryAward(");
  const end=worker.indexOf("async function deleteTerritoryAwardById(",start);
  assert.ok(start>=0&&end>start);
  const handler=worker.slice(start,end);
  assert.ok(handler.indexOf("const notificationText")>handler.indexOf("if (!Number(inserted.meta?.changes || 0))"));
  assert.match(handler,/🏆 <b>\$\{escapeHtml\(territory\.name\)\}<\/b> получил\(а\) награду «\$\{escapeHtml\(name\)\}»\s*<i>Экипированные награды появляются на странице территории<\/i>/);
  assert.match(handler,/await notifyTerritoryManagers\(env, territoryId, notificationText\)/);
  assert.doesNotMatch(worker,/function parseTerritoryAwardCommand|handleTerritoryAwardBankMessage/);
});

test("Telegram emoji matching normalizes presentation selectors but preserves the exact emoji sequence",()=>{
  assert.equal(normalizeTelegramEmoji("❤️"),normalizeTelegramEmoji("❤"));
  assert.equal(normalizeTelegramEmoji("👩‍🚀"),"👩‍🚀");
  assert.notEqual(normalizeTelegramEmoji("👍🏻"),normalizeTelegramEmoji("👍🏿"));
});

test("Telegram emoji lookup only accepts matching AnimatedEmojies TGS stickers",()=>{
  const stickers=[
    {emoji:"❤️",file_id:"heart-static",is_animated:false,is_video:false,thumbnail:{file_id:"heart-static-thumb"}},
    {emoji:"❤️",file_id:"heart-tgs",is_animated:true,is_video:false,thumbnail:{file_id:"heart-tgs-thumb"}},
    {emoji:"🏆",file_id:"trophy-static",is_animated:false,is_video:false},
    {emoji:"👍🏻",file_id:"thumb-video",is_animated:false,is_video:true},
    {emoji:"🎉",file_id:"confetti-tgs",is_animated:true,is_video:false,thumbnail:{file_id:"confetti-thumb"}},
  ];
  assert.equal(findTelegramAnimatedEmojiSticker(stickers,"❤")?.file_id,"heart-tgs");
  assert.equal(findTelegramAnimatedEmojiSticker(stickers,"🏆"),null,"static matches are rejected");
  assert.equal(findTelegramAnimatedEmojiSticker(stickers,"👍🏻"),null,"video stickers are rejected");
  assert.equal(findTelegramAnimatedEmojiSticker(stickers,"🎉")?.file_id,"confetti-tgs");
  assert.equal(findTelegramAnimatedEmojiSticker(stickers,"🏅"),null);
  assert.equal(findTelegramAnimatedEmojiSticker([], "🏆"),null);
  assert.equal(getTelegramAnimatedEmojiPreview(stickers[1])?.file_id,"heart-tgs-thumb");
  assert.equal(getTelegramAnimatedEmojiPreview(stickers[0]),null,"static duplicate preview is rejected");
  assert.equal(getTelegramAnimatedEmojiPreview(stickers[4])?.file_id,"confetti-thumb");
});

test("Telegram animated emoji accepts TGS stickers but excludes static and video stickers",()=>{
  assert.equal(isTelegramAnimatedEmojiSticker({is_animated:true,is_video:false}),true);
  assert.equal(isTelegramAnimatedEmojiSticker({is_animated:true,is_video:true}),false);
  assert.equal(isTelegramAnimatedEmojiSticker({is_animated:false,is_video:false}),false);
  assert.equal(isTelegramAnimatedEmojiSticker(null),false);
});

test("Telegram TGS animation validation requires bounded vector dimensions and rejects remote assets",()=>{
  const valid={w:512,h:512,layers:[],assets:[{id:"comp_1",layers:[]}]};
  assert.equal(isSafeTelegramTgsAnimation(valid),true);
  assert.equal(isSafeTelegramTgsAnimation({...valid,w:0}),false);
  assert.equal(isSafeTelegramTgsAnimation({...valid,h:513}),false);
  assert.equal(isSafeTelegramTgsAnimation({...valid,assets:[{u:"https://example.com/",p:"image.png"}]}),false);
  assert.equal(isSafeTelegramTgsAnimation({...valid,layers:null}),false);
});

test("Telegram emoji lookup prefers an animated TGS entry over a static duplicate",()=>{
  const stickers=[
    {emoji:"🎉",file_id:"static-confetti",is_animated:false,is_video:false,thumbnail:{file_id:"static-thumb"}},
    {emoji:"🎉",file_id:"animated-confetti",is_animated:true,is_video:false},
  ];
  assert.equal(findTelegramAnimatedEmojiSticker(stickers,"🎉")?.file_id,"animated-confetti");
  assert.equal(isTelegramAnimatedEmojiSticker(findTelegramAnimatedEmojiSticker(stickers,"🎉")),true);
});


test("Telegram custom emoji pack links are restricted to public t.me addemoji URLs",()=>{
  assert.equal(parseTelegramEmojiSetName("https://t.me/addemoji/voxygen_awards"),"voxygen_awards");
  assert.equal(parseTelegramEmojiSetName("https://telegram.me/addemoji/MyPack_2?start=share"),"MyPack_2");
  assert.equal(parseTelegramEmojiSetName("http://t.me/addemoji/pack"),null);
  assert.equal(parseTelegramEmojiSetName("https://t.me.evil.example/addemoji/pack"),null);
  assert.equal(parseTelegramEmojiSetName("https://t.me/addstickers/pack"),null);
  assert.equal(parseTelegramEmojiSetName("https://t.me/addemoji/../admin"),null);
  assert.equal(parseTelegramEmojiSetName("https://example.com/addemoji/pack"),null);
  assert.equal(parseTelegramEmojiSetName("not a url"),null);
});

test("Telegram custom emoji formats distinguish TGS, WEBM and static image",()=>{
  assert.equal(getTelegramStickerFormat({is_animated:true,is_video:false}),"tgs");
  assert.equal(getTelegramStickerFormat({is_animated:false,is_video:true}),"webm");
  assert.equal(getTelegramStickerFormat({is_animated:false,is_video:false}),"image");
  assert.equal(getTelegramStickerFormat(null),"image");
});


test("Telegram sticker set validation accepts the Bot API sticker_type field",()=>{
  assert.equal(isTelegramCustomEmojiSet({sticker_type:"custom_emoji"}),true);
  assert.equal(isTelegramCustomEmojiSet({sticker_type:"regular"}),false);
  assert.equal(isTelegramCustomEmojiSet({type:"custom_emoji"}),true);
  assert.equal(isTelegramCustomEmojiSet(null),false);
});
