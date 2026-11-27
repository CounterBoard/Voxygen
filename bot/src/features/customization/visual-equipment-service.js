export function visualHasTag(row, target) {
  const wanted = String(target || '').trim().toLocaleLowerCase('ru-RU');
  const fields = [row?.category_name, row?.categories_text];
  return fields.some(value => String(value || '').split(',').map(x => x.trim()).some(tag => tag.toLocaleLowerCase('ru-RU') === wanted));
}

export function createVisualEquipmentService({
  getTerritoryManagerRows,
} = {}) {
  async function ensureFirstCityMarker(env, territoryId) {
    const id = String(territoryId || '').trim();
    if (!id) return null;
  
    const territory = await env.DB.prepare(`SELECT id,is_government FROM territories WHERE id=? AND status='approved'`).bind(id).first();
    if (!territory) return null;
    const isGovernment = Number(territory.is_government || 0) === 1;
    const current = await env.DB.prepare(`SELECT marker_item_id FROM city_customization WHERE territory_id=?`).bind(id).first();
  
    const managers = await getTerritoryManagerRows(env, id);
    const managerIds = managers.map(m => Number(m.telegram_id)).filter(Boolean);
    const members = await env.DB.prepare(`SELECT telegram_id FROM city_memberships WHERE territory_id=?`).bind(id).all();
    const ids = [...new Set([...managerIds, ...(members.results || []).map(m => Number(m.telegram_id)).filter(Boolean)])];
    const ph = ids.length ? ids.map(() => '?').join(',') : 'NULL';
  
    if (current?.marker_item_id) {
      const active = await env.DB.prepare(`
        SELECT i.id,i.name,i.image_data,i.categories_text,i.government_marker,c.name AS category_name
        FROM customization_items i
        LEFT JOIN customization_categories c ON c.id=i.category_id
        WHERE i.id=? AND i.active=1
      `).bind(current.marker_item_id).first();
      const markerTypeMatches = active && (isGovernment
        ? Number(active.government_marker || 0) === 1
        : Number(active.government_marker || 0) !== 1);
  
      if (active && markerTypeMatches && visualHasTag(active, 'метка')) {
        if (isGovernment) return active;
        const [cityOwned, residentOwned] = await Promise.all([
          env.DB.prepare(`SELECT 1 AS owned FROM city_items WHERE territory_id=? AND item_id=? LIMIT 1`).bind(id, current.marker_item_id).first(),
          ids.length
            ? env.DB.prepare(`SELECT 1 AS owned FROM user_items WHERE item_id=? AND telegram_id IN (${ph}) LIMIT 1`).bind(current.marker_item_id, ...ids).first()
            : Promise.resolve(null),
        ]);
        if (cityOwned || residentOwned) return active;
      }
      // Do not leave a city equipped with an inactive, mismatched, or no-longer-accessible visual.
      await env.DB.prepare(`UPDATE city_customization SET marker_item_id=NULL,updated_at=? WHERE territory_id=?`).bind(Date.now(), id).run();
    }
  
    // Government territories use only the visuals explicitly marked for government use.
    // syncGovernmentVisual assigns those automatically; never borrow a regular resident's marker.
    if (isGovernment) return null;
  
    const [cityItems, userItems] = await Promise.all([
      env.DB.prepare(`
        SELECT ci.item_id,ci.acquired_at,i.sort_order,i.name,i.image_data,i.categories_text,i.government_marker,c.name AS category_name
        FROM city_items ci
        JOIN customization_items i ON i.id=ci.item_id
        LEFT JOIN customization_categories c ON c.id=i.category_id
        WHERE ci.territory_id=? AND i.active=1 AND COALESCE(i.government_marker,0)=0
      `).bind(id).all(),
      env.DB.prepare(`
        SELECT ui.item_id,ui.acquired_at,i.sort_order,i.name,i.image_data,i.categories_text,i.government_marker,c.name AS category_name
        FROM user_items ui
        JOIN customization_items i ON i.id=ui.item_id
        LEFT JOIN customization_categories c ON c.id=i.category_id
        WHERE ui.telegram_id IN (${ph}) AND i.active=1 AND COALESCE(i.government_marker,0)=0
      `).bind(...ids).all(),
    ]);
  
    const candidates = [...(cityItems.results || []), ...(userItems.results || [])]
      .filter(row => visualHasTag(row, 'метка'))
      .sort((a,b) => Number(a.acquired_at||0)-Number(b.acquired_at||0) || Number(a.sort_order||0)-Number(b.sort_order||0) || String(a.item_id).localeCompare(String(b.item_id)));
    const first = candidates[0];
    if (!first) return null;
  
    await env.DB.prepare(`
      INSERT INTO city_customization(territory_id,marker_item_id,updated_at) VALUES(?,?,?)
      ON CONFLICT(territory_id) DO UPDATE SET marker_item_id=excluded.marker_item_id,updated_at=excluded.updated_at
    `).bind(id, first.item_id, Date.now()).run();
  
    return { ...first, id: first.item_id };
  }

  async function territoryCanUseVisual(env, territoryId, itemId, requiredTag) {
    const cityId=String(territoryId||'').trim(),visualId=String(itemId||'').trim();
    if(!cityId||!visualId)return false;
    const [territory,visual]=await Promise.all([
      env.DB.prepare(`SELECT is_government,status FROM territories WHERE id=? LIMIT 1`).bind(cityId).first(),
      env.DB.prepare(`SELECT i.id,i.active,i.government_marker,i.categories_text,c.name AS category_name FROM customization_items i LEFT JOIN customization_categories c ON c.id=i.category_id WHERE i.id=? LIMIT 1`).bind(visualId).first()
    ]);
    if(!territory||territory.status!=='approved'||!visual||Number(visual.active||0)!==1||Number(visual.government_marker||0)!==Number(territory.is_government||0)||!visualHasTag(visual,requiredTag))return false;
    const row=await env.DB.prepare(`
      SELECT 1 FROM city_items WHERE territory_id=? AND item_id=?
      UNION SELECT 1 FROM user_items ui WHERE ui.item_id=? AND ui.telegram_id IN (
        SELECT telegram_id FROM city_memberships WHERE territory_id=?
        UNION SELECT telegram_id FROM territory_managers WHERE territory_id=?
        UNION SELECT owner_telegram_id FROM territories WHERE id=? AND owner_telegram_id IS NOT NULL
      ) LIMIT 1
    `).bind(cityId,visualId,visualId,cityId,cityId,cityId).first();
    return !!row;
  }
  
  async function firstAchievementCityMarker(env, territoryId) {
    const cityId=String(territoryId||'').trim(); if(!cityId)return null;
    const rows=await env.DB.prepare(`
      SELECT ci.item_id,ci.acquired_at,i.created_at,i.sort_order,i.categories_text,c.name AS category_name
      FROM city_items ci
      JOIN customization_items i ON i.id=ci.item_id AND i.active=1
      LEFT JOIN customization_categories c ON c.id=i.category_id
      WHERE ci.territory_id=? AND COALESCE(i.government_marker,0)=0
      ORDER BY ci.acquired_at ASC,i.created_at ASC,i.sort_order ASC,ci.item_id ASC
    `).bind(cityId).all();
    const first=(rows.results||[]).find(row=>visualHasTag(row,'метка')&&visualHasTag(row,'за достижение'));
    return first?.item_id||null;
  }
  
  async function reconcileTerritoryVisualEquipment(env, territoryId) {
    const cityId=String(territoryId||'').trim(); if(!cityId)return;
    const current=await env.DB.prepare(`SELECT marker_item_id FROM city_customization WHERE territory_id=?`).bind(cityId).first();
    if(!current)return;
    const markerAvailable=current.marker_item_id ? await territoryCanUseVisual(env,cityId,current.marker_item_id,'метка') : false;
    let marker=markerAvailable?current.marker_item_id:null;
    if(!marker) marker=await firstAchievementCityMarker(env,cityId);
    if(marker!==current.marker_item_id){
      await env.DB.prepare(`UPDATE city_customization SET marker_item_id=?,updated_at=? WHERE territory_id=?`).bind(marker,Date.now(),cityId).run();
    }
  }

  return {
    ensureFirstCityMarker,
    territoryCanUseVisual,
    reconcileTerritoryVisualEquipment,
  };
}
