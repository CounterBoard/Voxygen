import test from "node:test";
import assert from "node:assert/strict";
import { parseTerritoryAwardCommand } from "../bot/src/worker.js";

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
