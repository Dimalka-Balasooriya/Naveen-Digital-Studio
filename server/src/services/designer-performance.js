// All instants are epoch milliseconds from MySQL UNIX_TIMESTAMP, never local Date parsing.
export const DAY = 86400000;
const OFFSET = 19800000;
export const colomboDay = ms => new Date(ms + OFFSET).toISOString().slice(0, 10);
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function reportRange(input = {}, now = Date.now()) {
  const start = input.start || colomboDay(now), end = input.end || start;
  const parse = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Use dates in YYYY-MM-DD format.');
    const ms = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) fail('Invalid calendar date.');
    return ms - OFFSET;
  };
  const from = parse(start), until = parse(end) + DAY;
  if (until <= from || until - from > 93 * DAY || end > colomboDay(now)) fail('Select a past or current range of up to 93 days.');
  const designerId = input.designer_id ? Number(input.designer_id) : null;
  if (designerId !== null && (!Number.isSafeInteger(designerId) || designerId < 1)) fail('Invalid designer.');
  return { start, end, from, until: Math.min(until, now + 1), now, designerId, timezone: 'Asia/Colombo' };
}
const group = rows => {
  const result = new Map();
  for (const row of rows) { const list = result.get(row.order_id) || []; list.push(row); result.set(row.order_id, list); }
  return result;
};
const stats = values => ({ average: values.length ? values.reduce((a,b) => a+b,0)/values.length : null,
  minimum: values.length ? values.reduce((a,b)=>Math.min(a,b)) : null, maximum: values.length ? values.reduce((a,b)=>Math.max(a,b)) : null, samples: values.length });
const blank = () => ({ assigned: new Set(), completed: new Set(), corrections: new Set(), completion_events: 0, correction_events: 0,
  pending_new: 0, pending_editing: 0, pending_correction: 0, total: [], waiting: [], editing: [] });
const publicStats = row => ({ assigned_orders: row.assigned.size, completed_orders: row.completed.size,
  completion_events: row.completion_events, correction_orders: row.corrections.size, correction_events: row.correction_events,
  pending_new: row.pending_new, pending_editing: row.pending_editing, pending_correction: row.pending_correction,
  total_duration: stats(row.total), waiting_duration: stats(row.waiting), editing_duration: stats(row.editing) });

export function calculatePerformance({ designers, orders, assignments, history }, range) {
  const designerMap = new Map(designers.map(d => [Number(d.id), d]));
  const selected = designers.filter(d => !range.designerId || Number(d.id) === range.designerId);
  if (range.designerId && !selected.length) fail('Designer not found.');
  const metrics = new Map(selected.map(d => [Number(d.id), blank()])), team = blank();
  const assignmentMap = group(assignments), historyMap = group(history), details = [], gaps = [], daily = [];
  const include = id => metrics.has(Number(id));
  const targets = id => include(id) ? [metrics.get(Number(id)), team] : [];
  const inRange = time => time >= range.from && time < range.until;
  const noteGap = (order, reason, date = null) => gaps.push({ order_id: order.id, order_number: order.order_number, date, reason });
  for (let start = range.from; start < range.until; start += DAY) {
    const date = colomboDay(start), cutoff = Math.min(start + DAY, range.until);
    const row = { date, as_of: new Date(cutoff - 1).toISOString(), pending_new: 0, pending_editing: 0, pending_correction: 0, unknown_orders: 0, designers: {} };
    for (const d of selected) row.designers[d.id] = { pending_new: 0, pending_editing: 0, pending_correction: 0 };
    daily.push(row);
  }
  for (const order of orders) {
    // Task assignments can overlap and are not authoritative main-designer assignments.
    const spans = (assignmentMap.get(order.id) || []).filter(a => a.task_id == null).sort((a,b) => a.start-b.start || a.id-b.id);
    const events = (historyMap.get(order.id) || []).sort((a,b) => a.time-b.time || a.id-b.id);
    const assignmentAt = time => {
      // Cross-table event ordering is unknowable if reassignment and status change share a second.
      if (spans.some(a => a.end === time) && spans.some(a => a.start === time)) return null;
      const matches = spans.filter(a => a.start <= time && (a.end == null || a.end > time));
      return matches.length === 1 ? matches[0] : null;
    };
    for (const a of spans) if (inRange(a.start)) for (const target of targets(a.designer_id)) target.assigned.add(order.id);
    let previous = null, cycleStart = null, editingStart = null, firstEditing = null, cycleAssignment = null, invalid = false;
    for (const e of events) {
      if (e.time >= range.until) break;
      const assignment = assignmentAt(e.time);
      const designerId = assignment?.designer_id;
      const reassigned = assignment?.id !== cycleAssignment;
      if (reassigned) { cycleStart = assignment?.start ?? null; editingStart = null; firstEditing = null; invalid = false; cycleAssignment = assignment?.id; }
      const gap = previous && e.from !== previous.to;
      // Duplicate/same-status writes do not create a completion or restart a timer.
      if (e.from === e.to || previous?.to === e.to) { previous = e; continue; }
      if (gap) { cycleStart = null; editingStart = null; firstEditing = null; invalid = true; }
      if (e.to === 'New') { cycleStart = assignment ? Math.max(e.time, assignment.start) : null; editingStart = null; firstEditing = null; invalid = false; }
      if (e.to === 'Editing') { editingStart = e.time; firstEditing ??= e.time; }
      if (e.to === 'Editing Done' || e.to === 'Correction Done') {
        const correction = e.to === 'Correction Done';
        // Shared corrections always belong to the actual designer actor; never substitute assignee.
        const credited = correction ? (designerMap.has(Number(e.actor_id)) ? e.actor_id : null)
          : (designerMap.has(Number(e.actor_id)) ? e.actor_id : designerId);
        const sameDesigner = Number(credited) === Number(designerId);
        const validCycle = !invalid && sameDesigner && cycleStart != null && cycleStart <= e.time;
        const total = !correction && validCycle ? e.time-cycleStart : null;
        const editing = !correction && sameDesigner && !invalid && e.from === 'Editing' && editingStart != null ? e.time-editingStart : null;
        const waiting = !correction && validCycle && firstEditing != null && firstEditing >= cycleStart ? firstEditing-cycleStart : null;
        if (inRange(e.time)) {
          if (!credited) noteGap(order, 'Completion has no reliable designer attribution.');
          for (const target of targets(credited)) {
            target[correction ? 'corrections' : 'completed'].add(order.id);
            target[correction ? 'correction_events' : 'completion_events']++;
            if (!correction) for (const [key,value] of [['total',total],['waiting',waiting],['editing',editing]]) if (value != null) target[key].push(value);
          }
          if (include(credited)) details.push({ order_id: order.id, order_number: order.order_number, event_id: e.id,
            kind: correction ? 'Correction Done' : 'Editing Done', designer_id: Number(credited), designer: designerMap.get(Number(credited))?.name,
            assigned_designer: designerMap.get(Number(designerId))?.name || 'N/A', actor_id: e.actor_id,
            assignment_at: assignment?.start ?? null, cycle_start: correction ? null : cycleStart,
            editing_start: correction ? null : editingStart, completed_at: e.time, total_duration: total, waiting_duration: waiting, editing_duration: editing,
            limitation: correction ? 'Credited to the completing designer; assignment preserved.' : total == null || editing == null || waiting == null ? 'Some timestamps or cycle attribution are unavailable; N/A durations are excluded.' : '' });
        }
        if (!correction) { cycleStart = null; editingStart = null; firstEditing = null; }
      } else if (!['New','Editing'].includes(e.to)) { editingStart = null; }
      previous = e;
    }
    for (const day of daily) {
      const cutoff = Date.parse(day.as_of) + 1, at = cutoff - 1;
      if (order.created >= cutoff || (order.deleted != null && order.deleted < cutoff)) continue;
      const today = day.date === colomboDay(range.now);
      if (today && (order.is_deleted || order.archived)) continue;
      const a = assignmentAt(at);
      let designerId = a?.designer_id;
      if (today && designerMap.has(Number(order.assigned_employee_id))) designerId = order.assigned_employee_id;
      const prior = events.filter(e => e.time < cutoff), last = prior.at(-1), next = events.find(e => e.time >= cutoff);
      let status = today ? order.status : last?.to;
      let uncertain = !today && (!last || (next && next.from !== last.to) || (!next && status !== order.status) || order.archived || (order.is_deleted && !order.deleted));
      if (!designerId && (status === 'New' || status === 'Editing' || status === 'Correction')) uncertain = true;
      if (uncertain) { day.unknown_orders++; noteGap(order, 'End-of-day status, assignment or archive history is incomplete.', day.date); continue; }
      const key = { New: 'pending_new', Editing: 'pending_editing', Correction: 'pending_correction' }[status];
      if (key && include(designerId)) { day[key]++; day.designers[designerId][key]++; }
    }
  }
  const final = daily.at(-1);
  if (final) for (const key of ['pending_new','pending_editing','pending_correction']) {
    team[key] = final[key];
    for (const [id, row] of metrics) row[key] = final.designers[id][key];
  }
  return { range, designers, summary: publicStats(team), rows: selected.map(d => ({ ...d, ...publicStats(metrics.get(Number(d.id))) })),
    daily, details: details.sort((a,b) => b.completed_at-a.completed_at || b.event_id-a.event_id), gaps,
    limitations: [
      'Pending figures are reconstructed known counts, not current-status projections. Unknown orders are listed separately; unknowns are team-wide even when one designer is selected.',
      'Range pending totals are the final day snapshot; daily snapshots must not be summed. Durations average valid Editing Done events, not distinct orders.',
      'Existing records have second precision. Missing, conflicting, task-only or unrecorded assignments/statuses cannot establish durations. No timestamps are backfilled.',
      'Designer membership uses existing employee roles. Deleted history, past role/name changes and unrecorded archive changes cannot be fully reconstructed.'
    ] };
}
