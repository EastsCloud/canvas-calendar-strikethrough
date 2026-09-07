"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../src/storage.js"), "utf8");

function backend(initial = {}) {
  const values = {...initial};
  const listeners = [];
  const api = {values, failNextWrite: false, beforeSnapshot: null};
  api.emit = (changes, area = "local") => listeners.forEach(listener => listener(changes, area));
  api.tab = () => {
    const chrome = {runtime: {lastError: null}, storage: {
      onChanged: {addListener(listener) { listeners.push(listener); }},
      local: {
        get(key, callback) {
          const snapshot = key === null ? {...values} : {[key]: values[key]};
          queueMicrotask(() => {
            if (key === null && api.beforeSnapshot) { const hook = api.beforeSnapshot; api.beforeSnapshot = null; hook(); }
            callback(snapshot);
          });
        },
        set(input, callback) { mutate(input, callback); },
        remove(key, callback) { mutate({[key]: undefined}, callback); }
      }
    }};
    function mutate(input, callback) {
      queueMicrotask(() => {
        if (api.failNextWrite) {
          api.failNextWrite = false;
          chrome.runtime.lastError = {message: "quota exceeded"};
          callback();
          chrome.runtime.lastError = null;
          return;
        }
        const changes = {};
        for (const [key, value] of Object.entries(input)) {
          const oldValue = values[key];
          if (value === undefined) delete values[key]; else values[key] = value;
          if (oldValue !== value) changes[key] = {oldValue, newValue: value};
        }
        api.emit(changes);
        callback();
      });
    }
    const context = vm.createContext({chrome, CanvasManualComplete: {log() {}}, console});
    vm.runInContext(source, context);
    return context.CanvasManualComplete.storage;
  };
  return api;
}

test("Concurrent edits to different items preserve both changes and synchronize undo", async () => {
  const db = backend();
  const a = db.tab(), b = db.tab();
  await Promise.all([a.ready, b.ready]);
  await Promise.all([a.toggleCompleted("a"), b.toggleCompleted("b")]);
  assert.equal(a.isCompleted("b"), true);
  assert.equal(b.isCompleted("a"), true);
  await b.toggleCompleted("a");
  assert.equal(a.isCompleted("a"), false);
  assert.equal(db.values["cmc:v1:b"], true);
});
test("The initial snapshot cannot overwrite an undo received during loading", async () => {
  const db = backend({"cmc:v1:a": true});
  db.beforeSnapshot = () => db.emit({"cmc:v1:a": {oldValue: true}});
  const tab = db.tab();
  await tab.ready;
  assert.equal(tab.isCompleted("a"), false);
});
test("Rapid toggles of the same item run in order", async () => {
  const tab = backend().tab();
  await tab.ready;
  await Promise.all([tab.toggleCompleted("a"), tab.toggleCompleted("a")]);
  assert.equal(tab.isCompleted("a"), false);
});
test("A failed write leaves no false completion state and can be retried", async () => {
  const db = backend();
  const tab = db.tab();
  await tab.ready;
  db.failNextWrite = true;
  await assert.rejects(tab.toggleCompleted("a"), /quota exceeded/);
  assert.equal(tab.isCompleted("a"), false);
  await tab.toggleCompleted("a");
  assert.equal(tab.isCompleted("a"), true);
});
test("Reloading restores storage, ignores unrelated changes, and avoids notification loops", async () => {
  const db = backend();
  const a = db.tab();
  await a.setCompleted("a", true);
  const b = db.tab();
  await b.ready;
  let calls = 0;
  b.subscribe(() => calls++);
  db.emit({"cmc:v1:a": {}}, "sync");
  db.emit({"unrelated": {newValue: true}});
  await a.setCompleted("a", true);
  assert.equal(calls, 0);
  assert.equal(b.isCompleted("a"), true);
  await a.setCompleted("a", false);
  assert.equal(calls, 1);
});
