(() => {
  "use strict";
  const app = globalThis.CanvasManualComplete;
  if (!app || app.started || !/^\/calendar(?:\/|$)/.test(location.pathname)) return;
  app.started = true;
  const S = app.SELECTORS;
  const ITEM_CLASS = "cmc-item";
  const DONE_CLASS = "canvas-manual-completed";
  const TITLE_CLASS = "cmc-title";
  const BUTTON_CLASS = "cmc-toggle";
  const records = new Map();
  const byKey = new Map();
  const pending = new Set();
  const skipped = new WeakSet();
  const statistics = {scans: 0, supported: 0};
  let timer = null;
  let observer;
  let notice;

  function showError(error) {
    console.error("[Canvas Manual Complete]", error);
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "cmc-notice";
      notice.setAttribute("role", "alert");
      const message = document.createElement("span");
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "关闭";
      close.addEventListener("click", () => { notice.remove(); notice = null; });
      notice.append(message, close);
      document.body.append(notice);
    }
    notice.firstChild.textContent = "手动完成标记保存失败。请刷新页面后重试，并检查扩展是否已启用。";
  }
  function setAttribute(node, name, value) {
    if (node.getAttribute(name) !== value) node.setAttribute(name, value);
  }
  function paint(record) {
    const done = app.storage.isCompleted(record.key);
    record.element.classList.toggle(DONE_CLASS, done);
    const text = done ? "取消本地完成标记" : "标记为本地已完成";
    setAttribute(record.button, "aria-pressed", String(done));
    setAttribute(record.button, "aria-label", text);
    setAttribute(record.button, "title", `${text}（也可 Alt + 单击事项）`);
    record.button.disabled = pending.has(record.key);
  }
  function untrack(element) {
    const record = records.get(element);
    if (!record) return;
    record.button.remove();
    record.title.classList.remove(TITLE_CLASS);
    element.classList.remove(ITEM_CLASS, DONE_CLASS);
    records.delete(element);
    const group = byKey.get(record.key);
    group.delete(record);
    if (!group.size) byKey.delete(record.key);
  }
  function processCalendarItems() {
    timer = null;
    statistics.scans += 1;
    // Disconnect while mutating our own DOM: no recursive observer loop or class churn.
    observer.disconnect();
    try {
      const candidates = new Set();
      if (/^\/calendar(?:\/|$)/.test(location.pathname) && document.querySelector(S.canvasPage)) {
        for (const root of document.querySelectorAll(S.calendarRoot)) {
          for (const element of root.querySelectorAll(S.calendarItem)) {
            if (!element.closest(S.ignore)) candidates.add(element);
          }
        }
      }
      for (const element of records.keys()) {
        if (!candidates.has(element) || !element.isConnected) untrack(element);
      }
      for (const element of candidates) {
        // If a renderer nests a matched event inside a matched list row, use the inner event.
        if ([...element.querySelectorAll(S.calendarItem)].some(child => candidates.has(child))) {
          untrack(element);
          continue;
        }
        const identity = app.getItemIdentity(element);
        const title = element.querySelector(S.title);
        if (!identity || !title) {
          untrack(element);
          if (!skipped.has(element)) {
            skipped.add(element);
            app.log("跳过事项：缺少唯一的稳定 ID 或标题节点；请核对 SELECTORS/getItemIdentity。", element);
          }
          continue;
        }
        let record = records.get(element);
        if (record && (record.key !== identity.key || record.title !== title || !element.contains(record.button))) {
          untrack(element);
          record = null;
        }
        if (!record) {
          // A cloned Canvas event may contain our old decorations but has no live record.
          element.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => button.remove());
          element.querySelectorAll(`.${TITLE_CLASS}`).forEach(node => node.classList.remove(TITLE_CLASS));
          const button = document.createElement("button");
          button.type = "button";
          button.className = BUTTON_CLASS;
          button.textContent = "✓";
          // List views use table rows; keep the control in the title cell, not directly in <tr>.
          const host = element.tagName === "TR" ? title.closest("td") : element;
          if (!host) continue;
          host.append(button);
          record = {element, title, button, key: identity.key};
          records.set(element, record);
          if (!byKey.has(record.key)) byKey.set(record.key, new Set());
          byKey.get(record.key).add(record);
        }
        element.classList.add(ITEM_CLASS);
        title.classList.add(TITLE_CLASS);
        paint(record);
      }
      if (statistics.supported !== records.size) {
        statistics.supported = records.size;
        app.log("已识别日历事项", records.size);
      }
    } finally {
      observer.observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeOldValue: true,
        attributeFilter: ["href", "id", "class", "data-cmc-event-id", "data-event-id", "data-event-type", "data-item-type", ...Object.keys(app.ID_ATTRIBUTES)]
      });
    }
  }
  function scheduleScan() {
    // A bounded trailing scan every 80 ms even during continuous external mutations.
    if (timer === null) timer = setTimeout(processCalendarItems, 80);
  }
  function isRelevant(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    if (target?.closest(`.${BUTTON_CLASS}, .cmc-notice`)) return false;
    if (mutation.type === "attributes" && mutation.attributeName === "class") {
      // paint() may run from a storage event outside the observer's disconnected scan.
      const strip = value => (value || "").split(/\s+/).filter(token => token && ![ITEM_CLASS, DONE_CLASS, TITLE_CLASS].includes(token)).sort().join(" ");
      // Old values are requested below; comparing semantic classes ignores our decoration.
      if (strip(mutation.oldValue) === strip(target?.getAttribute("class"))) return false;
    }
    if (target?.closest(S.calendarRoot) || target?.closest(`.${ITEM_CLASS}`)) return true;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node instanceof Element &&
      (node.matches(`${S.calendarRoot}, ${S.canvasPage}`) || node.querySelector(`${S.calendarRoot}, ${S.canvasPage}`)));
  }
  async function toggle(record) {
    if (pending.has(record.key)) return;
    pending.add(record.key);
    byKey.get(record.key)?.forEach(paint);
    try {
      await app.storage.toggleCompleted(record.key);
      app.log("手动切换事项", record.key);
    } catch (error) { showError(error); }
    finally {
      pending.delete(record.key);
      byKey.get(record.key)?.forEach(paint);
    }
  }
  function getInteraction(event) {
    if (!(event.target instanceof Element)) return null;
    const button = event.target.closest(`.${BUTTON_CLASS}`);
    const element = event.target.closest(`.${ITEM_CLASS}`);
    const record = records.get(element);
    if (!record) return null;
    if (button === record.button) return {record, button: true};
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
        !event.target.closest("button, input, select, textarea, [contenteditable=true]")) {
      return {record, button: false};
    }
    return null;
  }
  function intercept(event) {
    // Canvas drag prevention uses programmatic focus, which Chromium may treat as
    // :focus-visible even after a mouse click. Track input mode so that pointer
    // focus never keeps a completion button visible after the pointer leaves.
    if (event.type === "pointerdown" || event.type === "mousedown") {
      document.documentElement.classList.remove("cmc-keyboard-navigation");
    } else if (event.type === "keydown" && ["Tab", "Enter", " "].includes(event.key)) {
      document.documentElement.classList.add("cmc-keyboard-navigation");
    }
    const interaction = getInteraction(event);
    if (!interaction || ("button" in event && event.button !== 0)) return;
    if (event.type.startsWith("key")) {
      if (!interaction.button || !["Enter", " "].includes(event.key)) return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "pointerdown" && interaction.button) interaction.record.button.focus();
    if (event.type === "click" || (event.type === "keydown" && !event.repeat)) void toggle(interaction.record);
  }

  app.storage.ready.then(() => {
    observer = new MutationObserver(mutations => {
      if (mutations.some(isRelevant)) scheduleScan();
    });
    app.storage.subscribe(key => byKey.get(key)?.forEach(paint));
    for (const type of ["click", "dblclick", "pointerdown", "pointerup", "mousedown", "mouseup", "keydown", "keyup"]) {
      document.addEventListener(type, intercept, true);
    }
    window.addEventListener("pageshow", scheduleScan);
    window.addEventListener("popstate", scheduleScan);
    window.addEventListener("hashchange", scheduleScan);
    app.statistics = statistics;
    processCalendarItems();
    app.log("扩展初始化完成");
  }).catch(showError);
})();
