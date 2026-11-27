function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

export function formatTelegramNickname(value, fallback = "Ник не указан") {
  const nickname = String(value ?? "").trim() || fallback;
  return `<code>${escapeHtml(nickname)}</code>`;
}
