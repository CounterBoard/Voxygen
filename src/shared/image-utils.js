export async function readEventImage(file) {
  if (!file) return null;
  if (!String(file.type || '').startsWith('image/')) throw new Error('Выберите файл изображения.');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1200 / img.width, 900 / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Не удалось обработать изображение.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => reject(new Error('Файл не удалось открыть как изображение.'));
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
  if (dataUrl.length > 1_400_000) throw new Error('Изображение слишком большое. Выберите изображение меньшего размера.');
  return dataUrl;
}
