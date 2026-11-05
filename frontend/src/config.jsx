import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from './api';

const ConfigContext = createContext(null);
const FALLBACK = { stages: [], repColumns: [], exportEnabled: true, readOnly: false, repsReadOnly: false };

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    const token = localStorage.getItem('crm_token');
    if (!token) {
      setLoaded(true);
      return Promise.resolve();
    }
    return api
      .get('/config')
      .then((r) => setConfig(r.data.config))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return <ConfigContext.Provider value={{ config, reload, loaded }}>{children}</ConfigContext.Provider>;
}

// Config + derived stage helpers used across the app.
export function useConfig() {
  const ctx = useContext(ConfigContext) || { config: FALLBACK, reload: () => {}, loaded: true };
  const config = ctx.config || FALLBACK;
  const stages = config.stages || [];
  const orderedIds = stages.map((s) => s.id);
  const byId = Object.fromEntries(stages.map((s) => [s.id, s]));
  return {
    ...ctx,
    config,
    stages,
    orderedIds,
    stageName: (id) => (byId[id] ? byId[id].name : id),
    stageColor: (id) => (byId[id] ? byId[id].color : '#8c8c8c'),
    nextStageId: (id) => {
      const i = orderedIds.indexOf(id);
      return i >= 0 && i < orderedIds.length - 1 ? orderedIds[i + 1] : null;
    },
    prevStageId: (id) => {
      const i = orderedIds.indexOf(id);
      return i > 0 ? orderedIds[i - 1] : null;
    },
    stageIndex: (id) => orderedIds.indexOf(id),
    exportEnabled: config.exportEnabled,
    readOnly: config.readOnly,
    repsReadOnly: config.repsReadOnly,
    repColumns: config.repColumns || [],
    ageingThresholdDays: config.ageingThresholdDays ?? 20,
  };
}
