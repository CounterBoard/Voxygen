export function createCustomizationAdminService({
  requireMainInspector,
  ensureWorldTables,
  json,
  achievementPayload,
  achievementRequirementError,
  cleanupCustomizationCategories,
  evaluateAchievementsForTerritory,
  reconcileTerritoryVisualEquipment,
  createId = () => crypto.randomUUID(),
} = {}) {
  function isMarkerTag(categories){return categories.some(x=>String(x).trim().toLowerCase()==='метка');}
  async function syncGovernmentVisual(env,itemId,categories,governmentEnabled){
    const id=String(itemId||'').trim(),isMarker=isMarkerTag(categories);
    const govs=await env.DB.prepare(`SELECT id FROM territories WHERE status='approved' AND is_government=1`).all();
    if(!governmentEnabled){
      await env.DB.prepare(`UPDATE city_customization SET marker_item_id=NULL,updated_at=? WHERE marker_item_id=? AND territory_id IN (SELECT id FROM territories WHERE status='approved' AND is_government=1)`).bind(Date.now(),id).run();
      return;
    }
    for(const row of govs.results||[])if(isMarker){
      await env.DB.prepare(`INSERT INTO city_customization(territory_id,marker_item_id,updated_at) VALUES(?,?,?) ON CONFLICT(territory_id) DO UPDATE SET marker_item_id=excluded.marker_item_id,updated_at=excluded.updated_at`).bind(row.id,id,Date.now()).run();
    }
    if(!isMarker)await env.DB.prepare(`UPDATE city_customization SET marker_item_id=NULL,updated_at=? WHERE marker_item_id=? AND territory_id IN (SELECT id FROM territories WHERE status='approved' AND is_government=1)`).bind(Date.now(),id).run();
  }
  
  function normalizeTagList(value) {
    const arr = Array.isArray(value)
      ? value.map(x=>String(x||'').trim()).filter(Boolean)
      : String(value||'').split(',').map(x=>x.trim()).filter(Boolean);
    const seen=new Set();
    return arr.filter(x=>{
      const key=x.toLowerCase();
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }
  
  async function upsertTags(env, categories, createdBy) {
    const categoryIds=[];
    for(const categoryName of categories){
      const existing=await env.DB.prepare('SELECT id FROM customization_categories WHERE lower(name)=lower(?)').bind(categoryName).first();
      const categoryId=existing?.id||createId();
      if(!existing){
        const maxRow=await env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1) AS max_order FROM customization_categories').first();
        await env.DB.prepare('INSERT INTO customization_categories (id,name,created_by,created_at,sort_order) VALUES (?,?,?,?,?)')
          .bind(categoryId,categoryName,createdBy,Date.now(),Number(maxRow?.max_order??-1)+1).run();
      }
      categoryIds.push(categoryId);
    }
    return categoryIds;
  }
  
  async function createCustomizationItem(request, env) {
    const auth=await requireMainInspector(request,env); if(auth.error)return auth.error;
    await ensureWorldTables(env);
    let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
    const name=String(body?.name||'').trim();
    const categories=normalizeTagList(body?.categories||body?.tags);
    const price=Number(body?.price);
    const imageData=String(body?.imageData||'').trim();
    const color=String(body?.color||'white').trim().toLowerCase();
    const governmentMarker=!!body?.governmentMarker;
    const achievement=achievementPayload(body);
    const achievementError=achievementRequirementError(achievement); if(achievementError)return json({ok:false,error:achievementError},400);
    if(achievement.enabled && !categories.some(x=>x.toLowerCase()==='за достижение')) categories.push('За достижение');
    if(!achievement.enabled) {
      for(let i=categories.length-1;i>=0;i--) if(categories[i].toLowerCase()==='за достижение') categories.splice(i,1);
    }
    const allowedColors=new Set(['none','red','orange','yellow','green','turquoise','blue','purple','magenta','white','black']);
    const isMarker=isMarkerTag(categories);
    if(!name||!categories.length||!Number.isSafeInteger(price)||price<0)return json({ok:false,error:'Название, теги и корректная цена обязательны'},400);
    if(!allowedColors.has(color))return json({ok:false,error:'Некорректный цвет'},400);
    if(!imageData.startsWith('data:image/'))return json({ok:false,error:'Загрузите изображение визуала'},400);
    if(governmentMarker&&!isMarker)return json({ok:false,error:'Для государственного визуала необходимо указать тег «Метка»'},400);
    if(governmentMarker&&achievement.enabled)return json({ok:false,error:'Государственный визуал нельзя выдавать как достижение'},400);
  
    if(imageData.length>1_000_000)return json({ok:false,error:'Изображение слишком большое'},413);
    if(achievement.enabled && ![achievement.residents,achievement.gems,achievement.inspectorScore,achievement.playerScore,achievement.screenshots,achievement.comments,achievement.visuals].some(v=>v!==null)){
      return json({ok:false,error:'Укажите хотя бы одно условие достижения'},400);
    }
    try{
      const categoryIds=await upsertTags(env,categories,Number(auth.user.id));
      const maxRow=await env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1) AS max_order FROM customization_items WHERE active=1').first();
      const itemId=crypto.randomUUID();
      await env.DB.prepare(`
        INSERT INTO customization_items
        (id,category_id,name,price,image_data,active,created_by,created_at,categories_text,color,sort_order,
         achievement_enabled,achievement_residents,achievement_gems,achievement_inspector_score,achievement_player_score,
         achievement_screenshots,achievement_comments,achievement_visuals,government_marker)
        VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        itemId,categoryIds[0],name,price,imageData,Number(auth.user.id),Date.now(),categories.join(', '),color,
        Number(maxRow?.max_order??-1)+1,achievement.enabled?1:0,achievement.residents,achievement.gems,
        achievement.inspectorScore,achievement.playerScore,achievement.screenshots,achievement.comments,achievement.visuals,governmentMarker?1:0
      ).run();
      await cleanupCustomizationCategories(env).catch(error=>console.error('Customization category cleanup after item creation:',error));
      await syncGovernmentVisual(env,itemId,categories,governmentMarker).catch(error=>console.error('Government visual synchronization after item creation:',error));
      if(achievement.enabled){
        try {
          const territories=await env.DB.prepare(`SELECT id FROM territories WHERE status='approved'`).all();
          for(const t of territories.results||[]) {
            try { await evaluateAchievementsForTerritory(env,t.id); }
            catch(error) { console.error('Achievement evaluation after item creation:',String(t.id),error); }
          }
        } catch(error) { console.error('Achievement territory scan after item creation failed:',error); }
      }
      return json({ok:true,item:{id:itemId,category_id:categoryIds[0],categories_text:categories.join(', '),name,price,image_data:imageData,color,sort_order:Number(maxRow?.max_order??-1)+1,achievement_enabled:achievement.enabled?1:0,government_marker:governmentMarker?1:0}});
    }catch(error){
      console.error('Create customization item error:',error);
      return json({ok:false,error:'Не удалось добавить визуал'},500);
    }
  }
  
  async function updateCustomizationItem(request,env,itemId){
    const auth=await requireMainInspector(request,env);if(auth.error)return auth.error;
    await ensureWorldTables(env);
    const id=String(itemId||'').trim();
    if(!id)return json({ok:false,error:'Визуал не найден'},404);
    const current=await env.DB.prepare(`
      SELECT id,name,price,image_data,category_id,color,categories_text,sort_order,achievement_enabled,
             achievement_residents,achievement_gems,achievement_inspector_score,achievement_player_score,
             achievement_screenshots,achievement_comments,achievement_visuals,government_marker
      FROM customization_items WHERE id=? AND active=1
    `).bind(id).first();
    if(!current)return json({ok:false,error:'Визуал не найден'},404);
    let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
    const name=String(body?.name??current.name).trim();
    const categories=normalizeTagList(body?.categories??body?.tags??current.categories_text);
    const price=Number(body?.price??current.price);
    const imageData=String(body?.imageData??current.image_data??'').trim();
    const color=String(body?.color??current.color??'white').trim().toLowerCase();
    const allowedColors=new Set(['none','red','orange','yellow','green','turquoise','blue','purple','magenta','white','black']);
    if(!allowedColors.has(color))return json({ok:false,error:'Некорректный цвет'},400);
    const enabled=body?.achievementEnabled===undefined?!!current.achievement_enabled:!!body.achievementEnabled;
    const governmentMarker=body?.governmentMarker===undefined?!!current.government_marker:!!body.governmentMarker;
    const isMarker=isMarkerTag(categories);
    if(governmentMarker&&!isMarker)return json({ok:false,error:'Для государственного визуала необходимо указать тег «Метка»'},400);
    if(governmentMarker&&enabled)return json({ok:false,error:'Государственный визуал нельзя выдавать как достижение'},400);
    const achievement=achievementPayload({...body,achievementEnabled:enabled,
      achievementResidents:body?.achievementResidents??current.achievement_residents,
      achievementGems:body?.achievementGems??current.achievement_gems,
      achievementInspectorScore:body?.achievementInspectorScore??current.achievement_inspector_score,
      achievementPlayerScore:body?.achievementPlayerScore??current.achievement_player_score,
      achievementScreenshots:body?.achievementScreenshots??current.achievement_screenshots,
      achievementComments:body?.achievementComments??current.achievement_comments,
      achievementVisuals:body?.achievementVisuals??current.achievement_visuals});
    const achievementError=achievementRequirementError(achievement); if(achievementError)return json({ok:false,error:achievementError},400);
    if(achievement.enabled && !categories.some(x=>x.toLowerCase()==='за достижение')) categories.push('За достижение');
    if(!achievement.enabled) {
      for(let i=categories.length-1;i>=0;i--) if(categories[i].toLowerCase()==='за достижение') categories.splice(i,1);
    }
    if(!name||!categories.length||!Number.isSafeInteger(price)||price<0)return json({ok:false,error:'Название, теги и корректная цена обязательны'},400);
    if(!imageData.startsWith('data:image/'))return json({ok:false,error:'Загрузите изображение визуала'},400);
    if(imageData.length>1_000_000)return json({ok:false,error:'Изображение слишком большое'},413);
  
    if(achievement.enabled && ![achievement.residents,achievement.gems,achievement.inspectorScore,achievement.playerScore,achievement.screenshots,achievement.comments,achievement.visuals].some(v=>v!==null)){
      return json({ok:false,error:'Укажите хотя бы одно условие достижения'},400);
    }
    const categoryIds=await upsertTags(env,categories,Number(auth.user.id));
    await env.DB.prepare(`
      UPDATE customization_items SET category_id=?,name=?,price=?,image_data=?,categories_text=?,color=?,
        achievement_enabled=?,achievement_residents=?,achievement_gems=?,achievement_inspector_score=?,
        achievement_player_score=?,achievement_screenshots=?,achievement_comments=?,achievement_visuals=?,government_marker=?
      WHERE id=?
    `).bind(categoryIds[0],name,price,imageData,categories.join(', '),color,achievement.enabled?1:0,achievement.residents,
      achievement.gems,achievement.inspectorScore,achievement.playerScore,achievement.screenshots,achievement.comments,achievement.visuals,governmentMarker?1:0,id).run();
    await cleanupCustomizationCategories(env).catch(error=>console.error('Customization category cleanup after item update:',error));
    await syncGovernmentVisual(env,id,categories,governmentMarker).catch(error=>console.error('Government visual synchronization after item update:',error));
    // Reconcile ordinary territories too: changing a visual into a government-only
    // visual must not leave it equipped outside government territories.
    const equippedTerritories=await env.DB.prepare(`SELECT territory_id FROM city_customization WHERE marker_item_id=?`).bind(id).all();
    for(const row of equippedTerritories.results||[]) {
      try { await reconcileTerritoryVisualEquipment(env,row.territory_id); }
      catch(error) { console.error('Equipment reconciliation after visual update:',error); }
    }
    if(achievement.enabled) {
      try {
        const territories=await env.DB.prepare(`SELECT id FROM territories WHERE status='approved'`).all();
        for(const t of territories.results||[]) {
          try { await evaluateAchievementsForTerritory(env,t.id); }
          catch(error) { console.error('Achievement evaluation after item update:',String(t.id),error); }
        }
      } catch(error) { console.error('Achievement territory scan after item update failed:',error); }
    }
    return json({ok:true,item:{id,name,price,image_data:imageData,category_id:categoryIds[0],categories_text:categories.join(', '),color,achievement_enabled:achievement.enabled?1:0}});
  }
  
  async function setCustomizationItemVisibility(request, env) {
    const auth=await requireMainInspector(request,env); if(auth.error)return auth.error;
    await ensureWorldTables(env);
    let body; try { body=await request.json(); } catch { return json({ok:false,error:'Invalid JSON'},400); }
    const itemId=String(body?.itemId||'').trim();
    const flag=body?.hiddenFromUsers;
    if(!itemId || ![true,false,0,1].includes(flag)) return json({ok:false,error:'Укажите визуал и состояние видимости'},400);
    const item=await env.DB.prepare(`SELECT id FROM customization_items WHERE id=? AND active=1 LIMIT 1`).bind(itemId).first();
    if(!item) return json({ok:false,error:'Визуал не найден'},404);
    const hidden=(flag===true||flag===1)?1:0;
    await env.DB.prepare(`UPDATE customization_items SET hidden_from_users=? WHERE id=?`).bind(hidden,itemId).run();
    return json({ok:true,itemId,hidden_from_users:hidden});
  }
  
  async function deleteCustomizationItem(request,env,itemId){
    const auth=await requireMainInspector(request,env);if(auth.error)return auth.error;
    await ensureWorldTables(env);
    const id=String(itemId||'').trim();
    const item=await env.DB.prepare('SELECT id FROM customization_items WHERE id=? AND active=1').bind(id).first();
    if(!item)return json({ok:false,error:'Визуал не найден'},404);
    const affected=await env.DB.prepare(`SELECT territory_id FROM city_customization WHERE marker_item_id=?`).bind(id).all();
    const deletedAt=Date.now();
    // Keep achievement_awards history: an achievement must never notify the founder twice.
    await env.DB.batch([
      env.DB.prepare(`UPDATE city_customization SET marker_item_id=NULL,updated_at=? WHERE marker_item_id=?`).bind(deletedAt,id),
      env.DB.prepare(`DELETE FROM city_items WHERE item_id=?`).bind(id),
      env.DB.prepare(`UPDATE customization_items SET active=0 WHERE id=?`).bind(id),
    ]);
    for(const row of affected.results||[])await reconcileTerritoryVisualEquipment(env,row.territory_id).catch(error=>console.error('Equipment reconciliation after visual deletion:',error));
    await cleanupCustomizationCategories(env).catch(error=>console.error('Customization category cleanup after item deletion:',error));
    return json({ok:true});
  }
  
  async function reorderCustomizationItems(request,env){
    const auth=await requireMainInspector(request,env);if(auth.error)return auth.error;
    await ensureWorldTables(env);
    let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
    const ids=Array.isArray(body?.itemIds)?body.itemIds.map(String):[];
    for(let i=0;i<ids.length;i++) await env.DB.prepare('UPDATE customization_items SET sort_order=? WHERE id=? AND active=1').bind(i,ids[i]).run();
    return json({ok:true});
  }
  
  async function reorderCustomizationTags(request,env){
    const auth=await requireMainInspector(request,env);if(auth.error)return auth.error;
    await ensureWorldTables(env);
    let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
    const ids=Array.isArray(body?.tagIds)?body.tagIds.map(String):[];
    for(let i=0;i<ids.length;i++) await env.DB.prepare('UPDATE customization_categories SET sort_order=? WHERE id=?').bind(i,ids[i]).run();
    return json({ok:true});
  }

  return { createCustomizationItem, updateCustomizationItem, setCustomizationItemVisibility, deleteCustomizationItem, reorderCustomizationItems, reorderCustomizationTags };
}