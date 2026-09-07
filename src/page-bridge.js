(() => {
  "use strict";
  // MAIN world, intentionally isolated from storage and extension APIs. Canvas uses
  // FullCalendar 3, whose jQuery `fc-seg` data can be the ONLY stable ID on grid items.
  // Read existing metadata; never call Canvas/FullCalendar mutating methods or APIs.
  if (window.__canvasManualCompleteBridge || !/^\/calendar(?:\/|$)/.test(location.pathname)) return;
  window.__canvasManualCompleteBridge = true;
  const CANVAS_PAGE = "#calendar-app, #global_nav_dashboard_link";
  const ROOT = "#calendar-app, #calendar, .fc";
  const ITEM = ".fc-event, .fc-list-item, .fc-list-event";
  const ATTRIBUTE = "data-cmc-event-id";
  const VALID_ID = /^(assignment|calendar_event|planner_note|override|sub_assignment|sub_assignment_override|discussion_topic|quiz|wiki_page)_\d+$/;
  let timer = null;

  function segmentEvent(segment) {
    // FullCalendar 3.10: footprint.eventDef.rawId; older versions: segment.event.id.
    const definition = segment?.footprint?.eventDef;
    return definition ? {id: definition.rawId ?? definition.id} : segment?.event;
  }
  function readEvent(element) {
    // Modern jQuery stores its data cache on the DOM element. This also works when
    // Canvas's bundled jQuery isn't exposed as window.jQuery.
    for (const name of Object.getOwnPropertyNames(element)) {
      if (!/^jQuery\d+$/.test(name)) continue;
      const data = Object.getOwnPropertyDescriptor(element, name)?.value;
      if (data && typeof data === "object") {
        const event = segmentEvent(data.fcSeg || data["fc-seg"]) || data.calendarEvent;
        if (event) return event;
      }
    }
    const jq = window.jQuery;
    if (jq?.fn?.jquery && typeof jq.data === "function") {
      return segmentEvent(jq.data(element, "fc-seg")) || jq.data(element, "calendarEvent");
    }
    return null;
  }
  function scan() {
    timer = null;
    if (!document.querySelector(CANVAS_PAGE)) return;
    const elements = new Set();
    for (const root of document.querySelectorAll(ROOT)) {
      for (const element of root.querySelectorAll(ITEM)) elements.add(element);
    }
    for (const element of elements) {
      try {
        const event = readEvent(element);
        const id = typeof event?.id === "string" && VALID_ID.test(event.id) ? event.id : null;
        if (id) {
          if (element.getAttribute(ATTRIBUTE) !== id) element.setAttribute(ATTRIBUTE, id);
        } else if (element.hasAttribute(ATTRIBUTE)) {
          element.removeAttribute(ATTRIBUTE);
        }
      } catch {
        // Unexpected page implementation: leave DOM/URL extraction as the fallback.
        element.removeAttribute(ATTRIBUTE);
      }
    }
  }
  function schedule() { if (timer === null) timer = setTimeout(scan, 60); }
  new MutationObserver(mutations => {
    if (mutations.some(mutation => {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (target?.closest(".cmc-toggle, .cmc-notice")) return false;
      if (target?.closest(ROOT)) return true;
      return [...mutation.addedNodes].some(node => node instanceof Element &&
        (node.matches(`${ROOT}, ${CANVAS_PAGE}`) || node.querySelector(`${ROOT}, ${CANVAS_PAGE}`)));
    })) schedule();
  }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["href", "class", "data-event-id"]});
  window.addEventListener("pageshow", schedule);
  scan();
})();
