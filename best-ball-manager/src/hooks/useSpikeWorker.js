import { useState, useEffect, useRef } from 'react';

export function useSpikeWorker(rosters) {
  const [spikeData, setSpikeData] = useState({});
  const [isComplete, setIsComplete] = useState(false);
  const workerRef = useRef(null);

  useEffect(() => {
    if (!rosters || rosters.length === 0) {
      setSpikeData({});
      setIsComplete(true);
      return;
    }

    setIsComplete(false);
    setSpikeData({});

    const worker = new Worker(
      new URL('../workers/spikeWorker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.type === 'result') {
        setSpikeData(prev => ({
          ...prev,
          [e.data.entry_id]: e.data.result,
        }));
      }
      if (e.data.type === 'batchComplete') {
        setIsComplete(true);
      }
    };

    // Serialize only the fields needed for calculation
    const payload = rosters.map(r => ({
      entry_id: r.entry_id,
      players: r.players.map(p => ({
        name: p.name,
        position: p.position,
        team: p.team,
        projectedPoints: p.projectedPoints,
      })),
    }));

    worker.postMessage({ type: 'calculateBatch', rosters: payload });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [rosters]);

  return { spikeData, isComplete };
}
