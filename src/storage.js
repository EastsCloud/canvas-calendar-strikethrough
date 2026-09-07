(() => {
  "use strict";
  const app = globalThis.CanvasManualComplete;
  if (!app || app.storage) return;
  const PREFIX = "cmc:v1:";
  const cache = new Set();
  const subscribers = new Set();
  const queues = new Map();
  const changedDuringLoad = new Map();
  let loading = true;

  // Callback APIs also work in MV3 and retain compatibility with older Chromium builds.
  function call(method, argument) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local[method](argument, result => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(result);
        });
      } catch (error) { reject(error); }
    });
  }
  function publish(key, value) {
    const previous = cache.has(key);
    if (value) cache.add(key); else cache.delete(key);
    if (previous !== value) {
      for (const subscriber of subscribers) subscriber(key, value);
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [storageKey, change] of Object.entries(changes)) {
      if (!storageKey.startsWith(PREFIX)) continue;
      const key = storageKey.slice(PREFIX.length);
      const value = change.newValue === true;
      if (loading) changedDuringLoad.set(key, value);
      publish(key, value);
      app.log("存储通知（包含跨标签页同步）", key, value);
    }
  });
  // Register the listener before reading, then replay concurrent changes over the snapshot.
  const ready = call("get", null).then(values => {
    for (const [key, value] of Object.entries(values)) {
      if (key.startsWith(PREFIX) && value === true) cache.add(key.slice(PREFIX.length));
    }
    for (const [key, value] of changedDuringLoad) {
      if (value) cache.add(key); else cache.delete(key);
    }
    changedDuringLoad.clear();
    loading = false;
  });
  function enqueue(key, operation) {
    const previous = queues.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => ready).then(operation);
    queues.set(key, next);
    const cleanup = () => { if (queues.get(key) === next) queues.delete(key); };
    next.then(cleanup, cleanup);
    return next;
  }
  async function write(key, value) {
    // One storage entry per item prevents unrelated edits in other tabs being overwritten.
    if (value) await call("set", {[PREFIX + key]: true});
    else await call("remove", PREFIX + key);
    // UI changes come ONLY from onChanged. Write callbacks never restore a stale value.
    app.log("本地写入成功", key, value);
    return value;
  }
  app.storage = Object.freeze({
    ready,
    isCompleted: key => cache.has(key),
    setCompleted: (key, value) => enqueue(key, () => write(key, Boolean(value))),
    toggleCompleted: key => enqueue(key, async () => {
      const values = await call("get", PREFIX + key);
      return write(key, values[PREFIX + key] !== true);
    }),
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); }
  });
})();
