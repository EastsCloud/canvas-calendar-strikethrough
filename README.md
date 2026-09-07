# Canvas Calendar Strikethrough

A lightweight browser extension that lets you manually mark Canvas Calendar items as complete. It works with Opera, Chrome, and Edge, including Canvas sites on custom domains such as `canvas.cmu.edu`.

Completed titles are struck through and muted. Times, icons, and event borders keep their original colors. Your marks survive page reloads and browser restarts, and updates appear automatically in other tabs using the same browser profile.

**All completion marks are local. The extension does not submit assignments or change your completion status in Canvas.**

## Installation

1. Download this repository using **Code > Download ZIP**, then extract it to a permanent folder. You can also clone the repository.
2. Open your browser's extensions page:
   - Opera: `opera://extensions`
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Open or refresh your Canvas Calendar, for example `https://canvas.cmu.edu/calendar`.

No build step or additional software is required. Keep the extension folder in place while using it.

## Usage

- **Mark complete:** Hover over a calendar item and click the small checkmark button on its right. The title becomes muted and gains a strikethrough.
- **Undo:** Hover over the item and click the button again.
- **Shortcut:** Hold **Alt** and left-click an item to toggle its local completion mark.
- **Keyboard:** Press **Tab** to focus a completion button, then **Space** or **Enter** to toggle it.

Buttons stay hidden when the pointer is away, even on completed items. They also appear when focused using the keyboard. No hover text box is shown.

Normal clicks still open Canvas event details. If Canvas already marks an item complete, removing your local mark leaves Canvas's own completion styling intact.

Marks are restored when you change dates, switch supported calendar views, or toggle course calendars. The same item stays in sync across open tabs without a reload. Items with the same title are tracked separately when they have different identifiers.

## Supported Sites

The extension supports Canvas Calendar pages at `/calendar` on any HTTP or HTTPS domain, including `*.instructure.com` and custom school domains. No per-school configuration is needed.

Your browser may show a broad website-access permission because schools host Canvas on different domains. The extension only attempts to add controls on calendar pages with recognized Canvas page elements.

Some customized Canvas layouts or items without a reliable identifier may not show a button. If controls are missing, check that the extension is enabled, open the Calendar page, and refresh it. Deployments using a different path, such as `/canvas/calendar`, are not supported by default.

## Local Data and Privacy

- Completion marks are stored locally in your browser profile and remain after you restart the browser.
- Tabs in the same profile synchronize automatically. Different browsers, profiles, devices, and Canvas domains do not share marks.
- Accounts used on the same Canvas domain in the same browser profile share local marks.
- The extension stores the Canvas domain, item identifier, and completion mark. It does not store titles, course content, or credentials, and sends no data to external servers.
- There are no analytics, telemetry, or backend services. The extension does not call the Canvas API.
- Uninstalling the extension or clearing its storage removes your saved marks.

## Updating

Replace the files in your existing extension folder with the latest version, or run `git pull` if you cloned the repository. Then open your browser's extensions page, click **Reload** for **Canvas Calendar Strikethrough**, and refresh all open Canvas Calendar tabs.

Do not uninstall and reinstall to update: reloading the existing extension keeps your local completion marks.
