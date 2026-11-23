const fs = require('node:fs');
const path = require('node:path');
const directory = process.env.LATENCY_EVIDENCE_DIR || 'C:/Users/Admin/AppData/Local/Temp/bookora-promotion-sync';
function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return n ? { n, min: sorted[0], median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2, p95: sorted[Math.ceil(n * .95) - 1], max: sorted[n - 1] } : { n: 0 };
}
const output = {};
for (const phase of ['before-browser-initial', 'before-browser', 'after']) {
  const read = suffix => JSON.parse(fs.readFileSync(path.join(directory, `${phase}${suffix}.json`), 'utf8'));
  if (!fs.existsSync(path.join(directory, `${phase}-notifications.json`))) continue;
  const promotions = read('-promotions'), notifications = read('-notifications'), observations = read('').observations;
  output[phase] = {};
  for (const type of ['COUPON_ACTIVE', 'FLASH_SALE_ACTIVE']) {
    // The first ten pairs were declared as the foreground performance cohort
    // before later hidden-filter/recovery/browser-switch acceptance scenarios.
    const cohort = phase === 'after' ? promotions.campaigns.slice(0, 10) : promotions.campaigns;
    const samples = cohort.map(campaign => {
      const reference = type === 'COUPON_ACTIVE' ? campaign.couponId : campaign.saleId;
      const due = Date.parse(campaign.startAt);
      const candidates = notifications.filter(row => row.referenceId === reference);
      const notification = candidates.find(row => observations.some(event => event.kind === 'bell-visible' && event.id === row.id));
      const visible = notification && observations.find(event => event.kind === 'bell-visible' && event.id === notification.id);
      const socket = notification && observations.find(event => event.kind === 'socket' && event.id === notification.id);
      const emitted = notification && promotions.events.find(event => event.data.id === notification.id);
      const batch = notification && promotions.batches?.find(row => row.notificationId === notification.id);
      const calibrated = event => typeof event?.uncertainty === 'number' && Number.isFinite(event.uncertainty);
      const cached = observations.find(event => event.kind === 'rest-cache' && event.key[0] === 'notifications' && event.at >= (socket?.at ?? Infinity) && JSON.stringify(event.data).includes(notification?.id ?? 'no-id'));
      return {
        reference, type, due, notificationId: notification?.id, recipients: candidates.length,
        dueToClaim: batch?.claimedAt ? batch.claimedAt - due : null,
        claimToCommit: batch?.claimedAt ? batch.committedAt - batch.claimedAt : null,
        commitToEmit: batch && emitted ? emitted.at - batch.committedAt : null,
        dueToEmit: emitted ? emitted.at - due : null,
        emitToSocket: emitted && calibrated(socket) ? socket.at - emitted.at : null,
        socketToRest: cached && socket ? cached.at - socket.at : null,
        dueToBell: calibrated(visible) ? visible.at - due : null,
        browserCalibrated: calibrated(visible),
        foreground: visible?.visibility === 'visible', uncertainty: visible?.uncertainty,
      };
    });
    output[phase][type] = { samples, stats: Object.fromEntries(['dueToClaim', 'claimToCommit', 'commitToEmit', 'dueToEmit', 'emitToSocket', 'socketToRest', 'dueToBell'].map(key => [key, stats(samples.map(row => row[key] === null ? NaN : row[key]))])) };
  }
  if (phase === 'after') {
    const boundary = promotions.campaigns[10];
    const start = Date.parse(boundary.startAt), end = Date.parse(boundary.endAt);
    const search = String(start - 65000);
    output[phase].adminHidden = {};
    for (const key of ['admin-coupons', 'admin-flash-sales']) {
      const cache = observations.filter(event => event.kind === 'rest-cache' && event.key[0] === key && event.key[1]?.search?.includes(search));
      const before = cache.find(event => event.at < start && event.data.totalItems === 0 && event.data.nextTransitionAt === boundary.startAt);
      const active = cache.find(event => event.at >= start && event.data.totalItems === 1);
      const empty = cache.find(event => event.at >= end && event.data.totalItems === 0 && event.data.nextTransitionAt === null);
      const activeDom = observations.find(event => event.kind === 'dom' && event.session === active?.session && event.at >= active.at && event.rows?.some(row => row?.includes(search)));
      const emptyDom = observations.find(event => event.kind === 'dom' && event.session === empty?.session && event.at >= empty.at && !event.rows?.some(row => row?.includes(search)));
      const idleStart = end + 1000, idleEnd = idleStart + 120000;
      output[phase].adminHidden[key] = { wasEmptyBeforeStart: Boolean(before), startToRest: active ? active.at - start : null, startToDom: activeDom ? activeDom.at - start : null, endToRest: empty ? empty.at - end : null, endToDom: emptyDom ? emptyDom.at - end : null, idleStart, idleEnd, idleExtraResponses: observations.filter(event => event.kind === 'rest-cache' && event.key[0] === key && event.at >= idleStart && event.at <= idleEnd).length, idleWindowElapsed: Date.now() >= idleEnd };
    }
  }
}
fs.writeFileSync(path.join(directory, 'latency-summary.json'), JSON.stringify(output, null, 2));
for (const [phase, types] of Object.entries(output)) for (const [type, result] of Object.entries(types)) console.log(phase, type, result.stats ?? result);
