// Optional: identify the track playing from a short audio clip using AudD (https://audd.io).
// Set AUDD_API_TOKEN to enable. Without it, type the track in on the dashboard.
export const recognitionEnabled = () => Boolean(process.env.AUDD_API_TOKEN);

export async function recognizeClip(buffer, mimeType = 'audio/webm') {
  if (!recognitionEnabled()) throw new Error('Song recognition is off (no AUDD_API_TOKEN)');
  const form = new FormData();
  form.append('api_token', process.env.AUDD_API_TOKEN);
  form.append('return', 'apple_music,spotify');
  form.append('file', new Blob([buffer], { type: mimeType }), 'clip');
  const res = await fetch('https://api.audd.io/', { method: 'POST', body: form });
  const json = await res.json();
  if (json.status !== 'success') throw new Error(json.error?.error_message || 'Recognition failed');
  if (!json.result) return null;
  const r = json.result;
  return {
    title: r.title,
    artist: r.artist,
    year: (r.release_date || '').slice(0, 4),
    album: r.album || '',
    source: 'recognised',
  };
}
