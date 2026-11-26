import React, { useRef } from 'react';
import { API_BASE } from '../../config/api.js';
import { Camera, Plus, Trash2 } from 'lucide-react';

function compressScreenshotFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const ratio = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('Не удалось подготовить скриншот'));
          const name = String(file?.name || 'screenshot.jpg').replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.70);
      };
      img.onerror = () => reject(new Error('Не удалось прочитать скриншот'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

export function TerritoryScreenshotsPanel({
  approved = [],
  territoryId,
  initData,
  hasNickname,
  isOwner,
  isGovernment,
  isMainInspector,
  onTerritoryChange,
  onOpenShot,
  onCloseLightbox,
  onFlash,
  ui = {},
}) {
  const { apiErrorMessage, safeCaughtError, SectionTitle, ShotThumb } = ui;
  const fileInputRef = useRef(null);
  const canDeleteShot = isMainInspector || (!isGovernment && isOwner);

  async function deleteShot(id) {
    try {
      const r = await fetch(`${API_BASE}/api/screenshots/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, 'Операция не выполнена.'));
      onTerritoryChange?.(v => ({ ...v, screenshots: (v.screenshots || []).filter(s => s.id !== id) }));
      onCloseLightbox?.();
      onFlash?.('Скрин удалён');
    } catch (e) {
      onFlash?.(safeCaughtError(e, 'Не удалось удалить скрин'));
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const prepared = await compressScreenshotFile(file);
      const fd = new FormData();
      fd.append('territoryId', territoryId);
      fd.append('photo', prepared, prepared.name);
      fd.append('initData', initData);
      const r = await fetch(`${API_BASE}/api/screenshots`, {
        method: 'POST',
        headers: { 'X-Telegram-Init-Data': initData },
        body: fd,
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d.ok) throw new Error(apiErrorMessage(r, d, 'Операция не выполнена.'));
      onFlash?.(isGovernment ? 'Скрин опубликован' : 'Скрин отправлен основателю/мэру на одобрение');
    } catch (e) {
      onFlash?.(safeCaughtError(e, 'Не удалось отправить скрин'));
    }
  }

  return (
    <>
      <SectionTitle icon={<Camera size={15} />} title="Скрины" count={approved.length} />
      <div className="atlas-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
        {approved.map((shot, shotIndex) => (
          <div key={shot.id} className="atlas-shot-reveal" style={{ position: 'relative', flexShrink: 0, animationDelay: `${Math.min(shotIndex * 35, 175)}ms` }}>
            <ShotThumb shot={shot} onOpen={() => onOpenShot?.(approved.findIndex(item => item.id === shot.id), shot)} />
            {canDeleteShot && <button onClick={() => deleteShot(shot.id)} className="press" style={{ position: 'absolute', right: 3, top: 3, width: 24, height: 24, border: 'none', borderRadius: '50%', background: 'rgba(0,0,0,.72)', color: 'var(--theme-color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} /></button>}
          </div>
        ))}
        {hasNickname && (!isOwner || isGovernment) && <>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          <button onClick={() => fileInputRef.current?.click()} className="press" style={{ flexShrink: 0, width: 96, height: 68, borderRadius: 12, border: '1px dashed var(--theme-color-border)', background: 'transparent', color: 'var(--theme-color-text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11 }}><Plus size={16} /> Добавить</button>
        </>}
      </div>
    </>
  );
}
