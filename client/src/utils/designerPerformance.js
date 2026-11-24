export const colomboDate = (now = Date.now()) => new Date(now + 19800000).toISOString().slice(0,10);
export function presetDates(preset, now = Date.now()) {
  const date = colomboDate(now - (preset === 'yesterday' ? 86400000 : 0));
  return {start:date,end:date};
}
export const durationText = value => value == null ? 'N/A' : `${(value/3600000).toFixed(2)} h`;
export const reportTime = value => value == null ? 'N/A' : new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Colombo',hour12:false});
