export function createCityAppearanceService({
  requireUser,
  ensureWorldTables,
  isTerritoryManager,
  visualHasTag,
  getTerritoryManagerRows,
  json,
} = {}) {
  async function updateCityCustomization(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim();
  const hasMarkerField=Object.prototype.hasOwnProperty.call(body,'markerItemId');
  const hasBannerColorField=Object.prototype.hasOwnProperty.call(body,'bannerColor');
  const hasBannerGradientField=Object.prototype.hasOwnProperty.call(body,'bannerGradient');
  const markerItemId=hasMarkerField&&body?.markerItemId?String(body.markerItemId):null;
  const bannerColor=hasBannerColorField?String(body?.bannerColor||'none').trim().toLowerCase():'none';
  const bannerGradient=hasBannerGradientField?String(body?.bannerGradient||'aurora').trim().toLowerCase():'aurora';
  const allowedBannerColors=new Set(['none','red','orange','yellow','green','turquoise','blue','purple','magenta','white']);
  const allowedBannerGradients=new Set(['aurora','prism','nebula','sunset','crystal','horizon','ribbons','velvet','orbit','flare']);
  const territory=await env.DB.prepare(`SELECT id,owner_telegram_id,is_government FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  if(Number(territory.is_government||0)===1)return json({ok:false,error:'Государственной территорией нельзя управлять через оформление города'},403);
  if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Только основатель/мэр может менять оформление города'},403);
  async function validateMarker(itemId){
    const item=await env.DB.prepare(`SELECT i.id,i.categories_text,c.name AS category_name,i.government_marker,i.hidden_from_users FROM customization_items i LEFT JOIN customization_categories c ON c.id=i.category_id WHERE i.id=? AND i.active=1`).bind(itemId).first();
    if(!item)throw new Error('Метка не найдена');
    if(Number(item.government_marker||0)===1)throw new Error('Государственную метку нельзя экипировать на обычный город');
    if(!visualHasTag(item,'метка'))throw new Error('Метка должна иметь тег «метка»');
    const allowed=await env.DB.prepare(`
      SELECT 1 FROM city_items WHERE territory_id=? AND item_id=?
      UNION SELECT 1 FROM user_items WHERE telegram_id=? AND item_id=?
      UNION SELECT 1 FROM user_items ui JOIN city_memberships cm ON cm.telegram_id=ui.telegram_id WHERE cm.territory_id=? AND ui.item_id=?
      UNION SELECT 1 FROM user_items ui JOIN territory_managers tm ON tm.telegram_id=ui.telegram_id WHERE tm.territory_id=? AND ui.item_id=?
      UNION SELECT 1 FROM user_items ui JOIN territories ot ON ot.owner_telegram_id=ui.telegram_id WHERE ot.id=? AND ot.status='approved' AND ui.item_id=?
      LIMIT 1
    `).bind(territoryId,itemId,Number(auth.user.id),itemId,territoryId,itemId,territoryId,itemId,territoryId,itemId).first();
    if(!allowed)throw new Error('Метка недоступна вашему городу');
  }
  try{
    if(!hasMarkerField&&!hasBannerColorField&&!hasBannerGradientField)return json({ok:false,error:'Выберите цвет баннера или метку'},400);
    if(hasBannerColorField&&!allowedBannerColors.has(bannerColor))return json({ok:false,error:'Некорректный цвет баннера'},400);
    if(hasBannerGradientField&&!allowedBannerGradients.has(bannerGradient))return json({ok:false,error:'Некорректный шаблон градиента'},400);
    const columns=['territory_id'],values=['?'],binds=[territoryId],updates=[];
    if(hasMarkerField){
      if(markerItemId)await validateMarker(markerItemId);
      columns.push('marker_item_id');values.push('?');binds.push(markerItemId);updates.push('marker_item_id=excluded.marker_item_id');
    }
    if(hasBannerColorField){
      columns.push('banner_color');values.push('?');binds.push(bannerColor);updates.push('banner_color=excluded.banner_color');
    }
    if(hasBannerGradientField||hasBannerColorField){
      columns.push('banner_gradient');values.push('?');binds.push(bannerGradient);updates.push('banner_gradient=excluded.banner_gradient');
    }
    columns.push('updated_at');values.push('?');binds.push(Date.now());updates.push('updated_at=excluded.updated_at');
    await env.DB.prepare(`INSERT INTO city_customization(${columns.join(',')}) VALUES(${values.join(',')}) ON CONFLICT(territory_id) DO UPDATE SET ${updates.join(',')}`).bind(...binds).run();
    return json({ok:true,...(hasMarkerField?{markerItemId}:{}),...(hasBannerColorField?{bannerColor}:{}),...((hasBannerGradientField||hasBannerColorField)?{bannerGradient}:{})});
  }catch(error){return json({ok:false,error:error?.message||'Не удалось обновить оформление'},400)}
}

  async function getCityCustomizationData(request, env, url) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env);
  const territoryId=String(url.searchParams.get('territoryId')||'').trim();
  const territory=await env.DB.prepare(`SELECT id,owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403);
  const city=await env.DB.prepare('SELECT marker_item_id,banner_color,banner_gradient FROM city_customization WHERE territory_id=?').bind(territoryId).first();
  const managers=await getTerritoryManagerRows(env,territoryId);
  const members=await env.DB.prepare('SELECT telegram_id FROM city_memberships WHERE territory_id=?').bind(territoryId).all();
  const ids=[...managers.map(r=>Number(r.telegram_id)),...(members.results||[]).map(r=>Number(r.telegram_id))].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i),ph=ids.map(()=>'?').join(',')||'NULL';
  const [cityItems,userItems]=await Promise.all([
    env.DB.prepare(`SELECT ci.item_id,i.name,i.image_data,c.name AS category_name,i.categories_text,i.hidden_from_users,ci.source FROM city_items ci JOIN customization_items i ON i.id=ci.item_id LEFT JOIN customization_categories c ON c.id=i.category_id WHERE ci.territory_id=?`).bind(territoryId).all(),
    env.DB.prepare(`SELECT ui.telegram_id,ui.item_id,i.name,i.image_data,c.name AS category_name,i.categories_text,i.hidden_from_users,ui.source FROM user_items ui JOIN customization_items i ON i.id=ui.item_id LEFT JOIN customization_categories c ON c.id=i.category_id WHERE ui.telegram_id IN (${ph})`).bind(...ids).all(),
  ]);
  let recruitmentUsername=''; try{const r=await env.DB.prepare(`SELECT contact_username,enabled FROM recruitment WHERE territory_id=?`).bind(territoryId).first(); recruitmentUsername=Number(r?.enabled||0)===1?(r?.contact_username||''):'';}catch{}
  const availableMarkers=[...(cityItems.results||[]),...(userItems.results||[])];
  const territoryAwards=(await env.DB.prepare(`SELECT id,name,emoji,awarded_by_telegram_id,awarded_at,slot_index,sticker_format,sticker_set_name FROM territory_awards WHERE territory_id=? ORDER BY awarded_at DESC,id ASC`).bind(territoryId).all()).results||[];
  return json({ok:true,markerItemId:city?.marker_item_id||null,bannerColor:city?.banner_color||'none',bannerGradient:city?.banner_gradient||'aurora',availableMarkers,territoryAwards,equippedAwards:territoryAwards.filter(award=>award.slot_index!==null&&award.slot_index!==undefined).sort((a,b)=>Number(a.slot_index)-Number(b.slot_index)),recruitmentUsername});
}

  return { getCityCustomizationData, updateCityCustomization };
}
