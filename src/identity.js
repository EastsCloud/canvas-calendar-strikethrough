(() => {
  "use strict";
  if (globalThis.CanvasManualComplete) return;

  // Canvas adapters live here. Unknown DOM/ambiguous IDs are deliberately skipped.
  const SELECTORS = Object.freeze({
    canvasPage: "#calendar-app, #global_nav_dashboard_link",
    calendarRoot: "#calendar-app, #calendar, #calendar_list, #undated-events, #undated_events_list, .agenda-container, .fc",
    calendarItem: ".fc-event, .fc-list-item, .fc-list-event, .agenda-event__item, .agenda-event, .agenda-item, .undated_event",
    eventLink: "a[href]",
    title: ".fc-title, .fc-event-title, .fc-list-item-title, .fc-list-event-title, .agenda-event__title, .undated_event_title, .event_title, .event-title",
    identityNode: "[data-assignment-id], [data-calendar-event-id], [data-planner-note-id], [data-event-id], [data-event-type], [data-item-type]",
    ignore: ".fc-mirror, .fc-helper, .fc-bgevent, .fc-bg-event"
  });
  const ID_ATTRIBUTES = Object.freeze({
    "data-assignment-id": "assignment",
    "data-calendar-event-id": "calendar_event",
    "data-planner-note-id": "planner_note"
  });
  const TYPE_ALIASES = Object.freeze({
    assignment: "assignment", calendar_event: "calendar_event",
    event: "calendar_event", planner_note: "planner_note"
  });

  function normalizedId(value) {
    if (!/^[0-9]+$/.test(value || "")) return null;
    const id = value.replace(/^0+(?=\d)/, "");
    return id === "0" ? null : id; // Keep IDs as strings; Canvas IDs can exceed 2^53.
  }
  function makeIdentity(type, value, location = globalThis.location) {
    const id = normalizedId(value);
    return id ? {key: `canvas:${location.host.toLowerCase()}:${type}:${id}`, type, id} : null;
  }
  function typedIdentity(value, location) {
    const match = /^(?:event_)?(assignment|calendar_event|planner_note|override|sub_assignment|sub_assignment_override|discussion_topic|quiz|wiki_page)[_:](\d+)$/.exec(value || "");
    return match ? makeIdentity(match[1], match[2], location) : null;
  }
  function identityFromUrl(href, location = globalThis.location) {
    if (!href || href.startsWith("#")) return null;
    let url;
    try { url = new URL(href, location.href); } catch { return null; }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null;
    // Match item detail routes only, never submissions, edit pages or external links.
    const route = /^\/(?:courses\/\d+\/|groups\/\d+\/|users\/\d+\/)?(assignments|calendar_events|planner_notes)\/(\d+)\/?$/.exec(url.pathname);
    if (route) {
      const types = {assignments: "assignment", calendar_events: "calendar_event", planner_notes: "planner_note"};
      return makeIdentity(types[route[1]], route[2], location);
    }
    if (/^\/calendar\/?$/.test(url.pathname)) {
      return typedIdentity(url.searchParams.get("event_id"), location);
    }
    return null;
  }
  function uniqueIdentity(identities) {
    const unique = new Map(identities.filter(Boolean).map(identity => [identity.key, identity]));
    return unique.size === 1 ? unique.values().next().value : null;
  }
  function getItemIdentity(element, location = globalThis.location) {
    // FullCalendar's rendered segment ID is more precise than a parent assignment URL.
    const bridged = typedIdentity(element.getAttribute("data-cmc-event-id"), location);
    if (bridged) return bridged;
    const nodes = [element, ...element.querySelectorAll(SELECTORS.identityNode)];
    const explicit = [];
    for (const node of nodes) {
      for (const [attribute, type] of Object.entries(ID_ATTRIBUTES)) {
        explicit.push(makeIdentity(type, node.getAttribute(attribute), location));
      }
      const eventId = node.getAttribute("data-event-id");
      explicit.push(typedIdentity(eventId, location));
      const type = TYPE_ALIASES[node.getAttribute("data-event-type") || node.getAttribute("data-item-type")];
      if (type) explicit.push(makeIdentity(type, eventId, location));
    }
    // Explicit typed metadata describes the item, even if its description links elsewhere.
    if (explicit.some(Boolean)) return uniqueIdentity(explicit);
    const links = [...element.querySelectorAll(SELECTORS.eventLink)];
    if (element.matches(SELECTORS.eventLink)) links.unshift(element);
    const linked = links.map(link => identityFromUrl(link.getAttribute("href"), location));
    if (linked.some(Boolean)) return uniqueIdentity(linked);
    // Compatibility fallback: semantic typed IDs/classes, never generic numeric data-id.
    return uniqueIdentity([element.id, ...element.classList].map(token => typedIdentity(token, location)));
  }

  globalThis.CanvasManualComplete = {
    DEBUG: false, SELECTORS, ID_ATTRIBUTES,
    getItemIdentity, identityFromUrl,
    log(...args) { if (this.DEBUG) console.debug("[Canvas Manual Complete]", ...args); }
  };
})();
