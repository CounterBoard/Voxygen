export function createTerritoryAwardPlacementService({
  requireUser,
  ensureWorldTables,
  isTerritoryManager,
  json,
} = {}) {
  async function toggleTerritoryAwardPlacement(request, env) {
    const auth=await requireUser(request,env); if(auth.error)return auth.error;
    await ensureWorldTables(env);
    let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
    const territoryId=String(body?.territoryId||'').trim(),awardId=String(body?.awardId||'').trim();
    if(!territoryId||!awardId)return json({ok:false,error:'Укажите территорию и награду'},400);
    const territory=await env.DB.prepare(`SELECT id,is_government FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
    if(!territory)return json({ok:false,error:'Территория не найдена'},404);
    if(Number(territory.is_government||0)===1)return json({ok:false,error:'Нельзя менять награды государственной территории'},403);
    if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Только основатель/мэр может размещать награды'},403);
    const award=await env.DB.prepare(`SELECT id,slot_index FROM territory_awards WHERE id=? AND territory_id=?`).bind(awardId,territoryId).first();
    if(!award)return json({ok:false,error:'Награда не найдена в инвентаре территории'},404);
    if(award.slot_index!==null&&award.slot_index!==undefined){
      const slot=Number(award.slot_index);
      await env.DB.batch([
        env.DB.prepare(`UPDATE territory_awards SET slot_index=NULL WHERE id=? AND territory_id=?`).bind(awardId,territoryId),
        env.DB.prepare(`UPDATE territory_awards SET slot_index=slot_index-1 WHERE territory_id=? AND slot_index>?`).bind(territoryId,slot),
      ]);
      return json({ok:true,equipped:false,awardId});
    }
    const updated=await env.DB.prepare(`UPDATE territory_awards
      SET slot_index=(SELECT COALESCE(MAX(slot_index),-1)+1 FROM territory_awards WHERE territory_id=? AND slot_index IS NOT NULL)
      WHERE id=? AND territory_id=? AND slot_index IS NULL
        AND (SELECT COUNT(*) FROM territory_awards WHERE territory_id=? AND slot_index IS NOT NULL)<4`).bind(territoryId,awardId,territoryId,territoryId).run();
    if(!Number(updated.meta?.changes||0)){
      const current=await env.DB.prepare(`SELECT slot_index FROM territory_awards WHERE id=? AND territory_id=?`).bind(awardId,territoryId).first();
      if(current?.slot_index!==null&&current?.slot_index!==undefined)return json({ok:true,equipped:true,awardId,slotIndex:Number(current.slot_index)});
      return json({ok:false,error:'Максимум 4 награды на странице территории'},409);
    }
    const placed=await env.DB.prepare(`SELECT slot_index FROM territory_awards WHERE id=? AND territory_id=?`).bind(awardId,territoryId).first();
    return json({ok:true,equipped:true,awardId,slotIndex:Number(placed?.slot_index??0)});
  }

  return { toggleTerritoryAwardPlacement };
}
