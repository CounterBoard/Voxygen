import test from "node:test";
import assert from "node:assert/strict";
import { formatTelegramNickname } from "../bot/src/telegram/formatting.js";

test("Telegram nicknames are rendered as escaped inline code for copyable text", () => {
  assert.equal(formatTelegramNickname("CounterBoard"), "<code>CounterBoard</code>");
  assert.equal(formatTelegramNickname("<Admin>"), "<code>&lt;Admin&gt;</code>");
  assert.equal(formatTelegramNickname("  "), "<code>Ник не указан</code>");
});
