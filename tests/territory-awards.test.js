import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGemWithdrawalCommand, parseTelegramEmojiSetName, isTelegramCustomEmojiSet, getTelegramStickerFormat, getTelegramStickerFileExtension, isTelegramStickerExtensionAllowed, isSafeTelegramTgsAnimation } from "../bot/src/worker.js";
import { serveTelegramAwardSticker } from "../bot/src/features/territory-awards/sticker-delivery.js";

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
  const service=readFileSync(new URL("../bot/src/features/territory-awards/award-management.js",import.meta.url),"utf8");
  const worker=readFileSync(new URL("../bot/src/worker.js",import.meta.url),"utf8");
  const start=service.indexOf("export async function grantTerritoryAward(");
  const end=service.indexOf("export async function deleteTerritoryAwardById(",start);
  assert.ok(start>=0&&end>start);
  const handler=service.slice(start,end);
  assert.ok(handler.indexOf("const notificationText")>handler.indexOf("if (!Number(inserted.meta?.changes || 0))"));
  assert.ok(handler.includes("»\n\n<i>Экипированные награды появляются на странице территории</i>"), "guidance must be a separate italic paragraph");
  assert.match(handler,/await notifyTerritoryManagers\(env, territoryId, notificationText\)/);
  assert.doesNotMatch(worker,/function parseTerritoryAwardCommand|handleTerritoryAwardBankMessage/);
});

test("Telegram TGS animation validation requires bounded vector dimensions and rejects remote assets",()=>{
  const valid={w:512,h:512,layers:[],assets:[{id:"comp_1",layers:[]}]};
  assert.equal(isSafeTelegramTgsAnimation(valid),true);
  assert.equal(isSafeTelegramTgsAnimation({...valid,w:0}),false);
  assert.equal(isSafeTelegramTgsAnimation({...valid,h:513}),false);
  assert.equal(isSafeTelegramTgsAnimation({...valid,assets:[{u:"https://example.com/",p:"image.png"}]}),false);
  assert.equal(isSafeTelegramTgsAnimation({...valid,layers:null}),false);
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


test("Telegram file paths may omit extensions while known suffixes stay format-checked",()=>{
  assert.equal(getTelegramStickerFileExtension("stickers/file_344"),"");
  assert.equal(getTelegramStickerFileExtension("stickers/pack.v2/file_344"),"");
  assert.equal(getTelegramStickerFileExtension("stickers/file_344.TGS"),"tgs");
  assert.equal(getTelegramStickerFileExtension("stickers/file_344.WEBP"),"webp");
  assert.equal(isTelegramStickerExtensionAllowed("image",""),true);
  assert.equal(isTelegramStickerExtensionAllowed("tgs",""),true);
  assert.equal(isTelegramStickerExtensionAllowed("webm",""),true);
  assert.equal(isTelegramStickerExtensionAllowed("image","webp"),true);
  assert.equal(isTelegramStickerExtensionAllowed("image","tgs"),false);
  assert.equal(isTelegramStickerExtensionAllowed("tgs","webp"),false);
  assert.equal(isTelegramStickerExtensionAllowed("webm","webm"),true);
  assert.equal(isTelegramStickerExtensionAllowed("image","svg"),false);
});

test("Telegram sticker set validation accepts the Bot API sticker_type field",()=>{
  assert.equal(isTelegramCustomEmojiSet({sticker_type:"custom_emoji"}),true);
  assert.equal(isTelegramCustomEmojiSet({sticker_type:"regular"}),false);
  assert.equal(isTelegramCustomEmojiSet({type:"custom_emoji"}),true);
  assert.equal(isTelegramCustomEmojiSet(null),false);
});


test("public territory and profile award responses include each saved sticker thumbnail id",()=>{
  const worker=readFileSync(new URL("../bot/src/worker.js",import.meta.url),"utf8");
  assert.match(worker,/SELECT id,territory_id,name,emoji,awarded_by_telegram_id,awarded_at,slot_index,sticker_format,sticker_thumbnail_file_id,sticker_set_name FROM territory_awards WHERE slot_index IS NOT NULL/);
  assert.match(worker,/SELECT id,name,emoji,awarded_by_telegram_id,awarded_at,slot_index,sticker_format,sticker_thumbnail_file_id,sticker_set_name FROM territory_awards WHERE territory_id=\?/);
});

test("one sticker endpoint resolves either a pack sticker or an issued award; AnimatedEmojies is removed",()=>{
  const worker=readFileSync(new URL("../bot/src/worker.js",import.meta.url),"utf8");
  const stickerDelivery=readFileSync(new URL("../bot/src/features/territory-awards/sticker-delivery.js",import.meta.url),"utf8");
  assert.match(stickerDelivery,/SELECT file_id,format,thumbnail_file_id FROM telegram_award_pack_stickers WHERE id=\?/);
  assert.match(stickerDelivery,/SELECT sticker_file_id AS file_id,sticker_format AS format,sticker_thumbnail_file_id AS thumbnail_file_id FROM territory_awards WHERE id=\?/);
  assert.match(worker,/if \(url\.pathname === "\/api\/telegram-sticker" && request\.method === "GET"\)/);
  assert.match(worker,/return serveTelegramAwardSticker\(request, env, \{ TELEGRAM_API, withCors, ensureWorldTables, telegram \}\)/);
  assert.doesNotMatch(worker,/serveTelegramEmoji|\/api\/telegram-emoji|AnimatedEmojies/);
});

test("award sticker delivery exposes safe diagnostic error codes and never caches failures",()=>{
  const stickerDelivery=readFileSync(new URL("../bot/src/features/territory-awards/sticker-delivery.js",import.meta.url),"utf8");
  const start=stickerDelivery.indexOf("export async function serveTelegramAwardSticker(");
  const end=stickerDelivery.indexOf("\n}\n",start)+2;
  assert.ok(start>=0&&end>start);
  const handler=stickerDelivery.slice(start,end);
  for(const reason of [
    "invalid_query","record_not_found","preview_unavailable","file_id_missing",
    "telegram_getfile_http","telegram_getfile_api","telegram_file_path_invalid",
    "file_extension_mismatch","telegram_file_http","file_size_invalid",
    "tgs_decompression_failed","tgs_json_invalid","tgs_validation_failed","internal_error"
  ]) assert.ok(handler.includes(reason), "missing diagnostic reason: "+reason);
  assert.match(handler,/X-Voxygen-Sticker-Error/);
  assert.match(handler,/Cache-Control': 'no-store'/);
  assert.ok(handler.includes("console.warn('[award-sticker]'"));
  const logStart=handler.indexOf("console.warn('[award-sticker]'");
  const logEnd=handler.indexOf("}));",logStart);
  const logPayload=handler.slice(logStart,logEnd);
  assert.ok(logPayload);
  assert.doesNotMatch(logPayload,/awardId|packStickerId|requestedFileId|BOT_TOKEN|filePath|token/i);
  assert.ok(!handler.includes("error: String"), "raw upstream error details must not be logged");
});
