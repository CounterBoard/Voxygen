import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../bot/src/worker.js", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/features/territory-management/CityManagementProfile.jsx", import.meta.url), "utf8");

test("a demotion with no eligible voters is applied immediately instead of creating an impossible vote", () => {
  const start = worker.indexOf("async function demoteManager(");
  const end = worker.indexOf("\nasync function getTerritories(", start);
  assert.ok(start >= 0 && end > start, "demoteManager handler exists");
  const handler = worker.slice(start, end);
  assert.match(handler, /const voterCount=Math\.max\(0,managers\.length-excludedVoters\)/);
  assert.match(handler, /if\(voterCount===0\)\{[\s\S]*?applyManagerChange\(env,\{territoryId,targetId,action:'demote',initiatorId:Number\(auth\.user\.id\)\}\)/);
  assert.match(handler, /return json\(\{ok:true,immediate:true\}\)/);
  assert.ok(handler.indexOf("if(voterCount===0)") < handler.indexOf("await ensureManagerChangeTables(env)"), "the immediate path does not create a pending vote");
});

test("larger groups retain the existing manager voting flow", () => {
  const start = worker.indexOf("async function demoteManager(");
  const end = worker.indexOf("\nasync function getTerritories(", start);
  const handler = worker.slice(start, end);
  assert.match(handler, /INSERT INTO manager_change_requests/);
  assert.match(handler, /\.bind\(id,territoryId,targetId,Number\(auth\.user\.id\),'demote',required,voterCount,'pending'/);
  assert.match(handler, /manager_vote:yes:/);
  assert.match(handler, /return json\(\{ok:true,pending:true\}\)/);
});

test("the confirmed demotion UI distinguishes immediate completion from a pending vote", () => {
  assert.match(panel, /window\.confirm\('Понизить этого основателя\/мэра до жителя\?'\)/);
  assert.match(panel, /data=>data\.immediate\?'Основатель\/мэр понижен до жителя':'Голосование за понижение запущено'/);
});
