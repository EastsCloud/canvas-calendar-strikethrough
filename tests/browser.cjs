"use strict";
// Optional developer verification. The unpacked extension itself has no Node dependencies.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const results = path.join(root, "test-results");
fs.mkdirSync(results, {recursive: true});
const profile = fs.mkdtempSync(path.join(results, "browser-profile-"));
const fixture = fs.readFileSync(path.join(__dirname, "calendar.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["storage"]);
for (const entry of manifest.content_scripts) {
  assert.deepEqual(entry.matches, ["*://*/calendar*"]);
  for (const file of [...(entry.js || []), ...(entry.css || [])]) assert.ok(fs.existsSync(path.join(root, file)), file);
}
const failures = [];
const launch = () => chromium.launchPersistentContext(profile, {
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {channel: "msedge"}),
  headless: true, viewport: {width: 1100, height: 980},
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
});
async function tab(context, hostname = "canvas.cmu.edu", pathname = "/calendar", html = fixture, protocol = "https") {
  const page = await context.newPage();
  page.on("pageerror", error => failures.push(error.message));
  await page.route("**/*", route => {
    if (route.request().isNavigationRequest()) return route.fulfill({contentType: "text/html", body: html});
    return route.abort();
  });
  await page.goto(`${protocol}://${hostname}${pathname}`);
  return page;
}
async function state(page, selector, completed) {
  await page.waitForFunction(({selector, completed}) =>
    document.querySelector(selector)?.classList.contains("canvas-manual-completed") === completed,
  {selector, completed}, {timeout: 5000});
}
async function click(page, selector) {
  await page.locator(selector).hover();
  await page.locator(`${selector} .cmc-toggle`).click();
}

(async () => {
  let context = await launch();
  try {
    const a = await tab(context), b = await tab(context);
    await a.locator("#bridge-event .cmc-toggle").waitFor({state: "attached"});
    await b.locator("#assignment-a .cmc-toggle").waitFor({state: "attached"});
    assert.equal(await a.locator(".cmc-toggle").count(), 7);
    assert.equal(await a.locator("#unknown-event .cmc-toggle, #ambiguous-event .cmc-toggle").count(), 0);
    console.log("PASS: manifest paths, extension loading, FullCalendar bridge, agenda and undated items");

    await click(a, "#assignment-a");
    await state(b, "#assignment-a", true);
    await state(a, "#agenda-event", true);
    await state(a, "#assignment-b", false);
    assert.equal(await a.evaluate(() => window.canvasClicks), 0);
    assert.ok(await a.locator("#assignment-a .fc-title").evaluate(node => getComputedStyle(node).textDecorationLine.includes("line-through")));
    await a.mouse.move(1050, 950);
    assert.equal(await a.locator('#assignment-a .cmc-toggle').evaluate(node => getComputedStyle(node).opacity), '0', 'Completed buttons must hide when the pointer leaves after a click');
    await a.locator('#assignment-a').hover();
    assert.equal(await a.locator('#assignment-a .cmc-toggle').evaluate(node => getComputedStyle(node).opacity), '1');
    await click(b, "#assignment-a");
    await state(a, "#assignment-a", false);
    await a.locator("#assignment-a .fc-title").click();
    assert.equal(await a.evaluate(() => window.canvasClicks), 1);
    await a.locator("#assignment-a .fc-title").click({modifiers: ["Alt"]});
    await state(b, "#assignment-a", true);
    assert.equal(await a.evaluate(() => window.canvasClicks), 1);
    console.log("PASS: bidirectional tab sync, undo, same-title isolation, normal clicks and Alt-click");

    const scans = await a.evaluate(() => {
      window.cmcMutationCount = 0;
      window.cmcTestObserver = new MutationObserver(records => window.cmcMutationCount += records.length);
      window.cmcTestObserver.observe(document.querySelector('#calendar-app'), {attributes: true, childList: true, subtree: true});
      return window.cmcMutationCount;
    });
    await a.waitForTimeout(500);
    assert.equal(await a.evaluate(() => window.cmcMutationCount), scans, "MutationObserver must not loop while idle");
    await a.evaluate(() => {
      for (let i = 0; i < 25; i++) {
        const node = document.createElement('span');
        document.querySelector('#calendar').append(node); node.remove();
      }
      const event = document.querySelector('#assignment-a');
      event.replaceWith(event.cloneNode(true));
    });
    await a.waitForTimeout(250);
    assert.equal(await a.locator(".cmc-toggle").count(), 7);
    await state(a, "#assignment-a", true);
    await a.evaluate(() => {
      document.querySelector('#assignment-a').setAttribute('href', '/courses/1/assignments/120');
      document.querySelector('#bridge-event').jQuery3710002.fcSeg.footprint.eventDef.rawId = 'calendar_event_121';
      document.querySelector('#bridge-event .fc-title').textContent = 'Re-rendered event';
    });
    await state(a, "#assignment-a", false);
    await a.waitForFunction(() => document.querySelector('#bridge-event').getAttribute('data-cmc-event-id') === 'calendar_event_121');
    await click(a, "#bridge-event");
    await state(b, "#bridge-event", false);
    await a.reload();
    await state(a, "#assignment-a", true);
    await state(a, "#bridge-event", false);
    console.log("PASS: idempotency, no idle loops, cloned nodes, reused IDs and page reloads");

    await click(a, "#native-event");
    await click(a, "#native-event");
    assert.ok(await a.locator('#native-event .fc-title').evaluate(node => node.classList.contains('calendar__event--completed')));
    assert.ok(await a.locator('#native-event .fc-title').evaluate(node => getComputedStyle(node).textDecorationLine.includes('line-through')));
    await a.locator('#undated-event .cmc-toggle').focus();
    await a.keyboard.press('Space');
    await state(b, '#undated-event', true);
    assert.equal(await a.locator('#undated-event .cmc-toggle').evaluate(node => getComputedStyle(node).opacity), '1', 'Buttons must remain visible during keyboard navigation');
    await a.keyboard.press('Enter');
    await state(b, '#undated-event', false);
    const other = await tab(context, 'canvas.custom.example');
    await other.locator('#assignment-a .cmc-toggle').waitFor({state: 'attached'});
    await state(other, '#assignment-a', false);
    const originalDomain = await tab(context, 'fixture.instructure.com');
    await originalDomain.locator('#bridge-event .cmc-toggle').waitFor({state: 'attached'});
    const httpSite = await tab(context, 'canvas.local.example', '/calendar', fixture, 'http');
    await httpSite.locator('#bridge-event .cmc-toggle').waitFor({state: 'attached'});
    const notCanvas = await tab(context, 'unrelated.example', '/calendar', fixture.replace('id="calendar-app"', 'id="ordinary-calendar"'));
    await notCanvas.waitForTimeout(300);
    assert.equal(await notCanvas.locator('.cmc-toggle, [data-cmc-event-id]').count(), 0);
    await notCanvas.evaluate(() => {
      const canvasMarker = document.createElement('a');
      canvasMarker.id = 'global_nav_dashboard_link';
      document.body.append(canvasMarker);
    });
    await notCanvas.locator('#bridge-event .cmc-toggle').waitFor({state: 'attached'});
    const outside = await tab(context, 'fixture.instructure.com', '/courses');
    assert.equal(await outside.locator('.cmc-toggle').count(), 0);
    await click(a, '#bridge-event');
    await state(b, '#bridge-event', true);
    await a.screenshot({path: path.join(results, 'calendar.png'), fullPage: true});
    console.log('PASS: CMU, custom domains, Instructure, HTTP, non-Canvas filtering, delayed Canvas markers, domain isolation and keyboard controls');

    await context.close();
    context = await launch();
    const restarted = await tab(context);
    await state(restarted, '#assignment-a', true);
    await state(restarted, '#bridge-event', true);
    await click(restarted, '#assignment-a');
    await restarted.reload();
    await restarted.locator('#assignment-a .cmc-toggle').waitFor({state: 'attached'});
    await state(restarted, '#assignment-a', false);
    assert.deepEqual(failures, []);
    console.log('PASS: persistence after browser restart, reload after undo, and no page script errors');
    fs.writeFileSync(path.join(results, 'browser-results.txt'), 'PASS: all browser integration checks\n');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
