import { calculateSpikeWeekProjection } from '../utils/spikeWeekProjection.js';

self.onmessage = (e) => {
  const { type, rosters } = e.data;
  if (type === 'calculateBatch') {
    const results = {};
    for (const { entry_id, players } of rosters) {
      const result = calculateSpikeWeekProjection(players);
      results[entry_id] = result;
      self.postMessage({ type: 'result', entry_id, result });
    }
    self.postMessage({ type: 'batchComplete', results });
  }
};
