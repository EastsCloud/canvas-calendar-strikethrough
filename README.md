# Canvas 日历手动完成

一个可直接加载的 Manifest V3 浏览器扩展。为 Canvas 日历添加可撤销的本地完成标记：标题划线、重新打开浏览器后保留、同一浏览器配置中的标签页自动同步。

**只改变本地显示。不会提交作业、修改课程完成状态或调用 Canvas API。** 无后台服务器、分析统计、遥测、外部请求或登录要求。扩展 API 权限只有 `storage`；内容脚本匹配任意 HTTP／HTTPS 域名的日历路径，因此浏览器可能显示访问所有网站的权限提示。没有构建步骤，也不需要 npm、框架或后台服务。

## 在 Opera 安装

1. 在地址栏输入 `opera://extensions`，打开扩展管理页面。
2. 打开 **开发者模式 / Developer Mode**。
3. 点击 **加载解压的扩展 / Load unpacked**（某些版本显示为 “Load Unpacked Extension…”）。
4. 选择包含 `manifest.json` 的目录：本项目为 **`E:\Canvas`**。
5. 打开或刷新学校的 Canvas 日历，例如 `https://canvas.cmu.edu/calendar`。

步骤参照 [Opera 官方安装与调试说明](https://help.opera.com/en/extensions/testing/)。Chrome、Edge 可分别从 `chrome://extensions`、`edge://extensions` 加载同一目录。需要支持 MV3 MAIN world 内容脚本的 Chromium 111 或更新内核。

更新代码后，在扩展管理页点击该扩展的“重新加载”，然后刷新所有已打开的 Canvas 日历标签页。不要通过卸载再安装来更新，否则本地标记会被清除。

## 使用

- 鼠标移到可识别的日历事项上，右侧显示小勾选按钮。点击即可标记完成，标题出现删除线，事项的课程颜色、图标和边框会降低饱和度与亮度，呈现更暗沉的完成状态。
- 无论是否已完成，鼠标移开后勾选按钮都会隐藏。使用 Tab 键聚焦按钮时也会显示，方便键盘操作。
- 再次点击取消本地标记。也可以 **Alt＋鼠标左键单击事项**。
- 普通单击继续交给 Canvas。键盘用户可用 Tab 聚焦勾选按钮，再按空格或 Enter 切换。
- 按钮提示和 `aria-pressed` 表示的是“本地完成”。它不改变 Canvas 原本的完成状态；若 Canvas 自身已经划线，取消本地标记后原生删除线仍会保留。
- 同一事项在月视图、议程视图或多个标签页中出现时会同步显示。无需刷新，也没有定时轮询。

## 本地存储与同步

使用 `chrome.storage.local`，每个事项单独存储一条 `true`，取消时删除这一条。例如：

```json
{
  "cmc:v1:canvas:school.instructure.com:assignment:987654": true,
  "cmc:v1:canvas:school.instructure.com:calendar_event:123456": true
}
```

标题、课程正文、凭据都不会被保存。域名与类型隔离标识；数字 ID 始终按字符串处理，避免大整数精度丢失。

逐项写入避免不同标签页修改不同事项时覆盖整个完成列表。初始化先注册 `chrome.storage.onChanged`，再读取缓存，确保读取期间收到的变更不会被旧快照覆盖。UI 只响应存储变更，不把同步事件再次写回。写入失败会显示中文提示，保留原有状态。

同一标签页的存储操作按事项排队；**不同标签页在完全同时操作同一事项时，以最后落盘的写入为准**，不保证两个并发切换一定互相抵消。正常的“标签 A 勾选 → 标签 B 取消”会即时同步。

标记属于当前浏览器配置与 Canvas 域名。同域名切换 Canvas 账号时会共用本地标记；不同电脑、浏览器配置及域名之间不会同步。浏览器刷新、关闭和重启不清除标记；卸载扩展或清除扩展存储会清除它们。[Chrome 官方存储文档](https://developer.chrome.com/docs/extensions/reference/api/storage)

## 首先测试这些

1. **双标签页：**打开同一个 Canvas 日历两次。在 A 勾选一个普通事件，确认 B 立即划线；在 B 取消，确认 A 立即恢复。
2. **持久化：**勾选一个事项，刷新页面；完全退出 Opera，再重新启动并访问日历，确认仍然划线。
3. **动态渲染：**切到下个月再切回来，测试上个月、周／日视图（若可用）、议程视图及课程日历筛选。确认完成状态恢复，且每个事项只有一个按钮。
4. **同名隔离：**找到两个标题相同但 ID 不同的事项，只标记其中一个，确认另一个没有变化。
5. **原生交互：**普通单击应正常打开 Canvas 详情；点勾选按钮应只切换本地状态，不打开详情、不触发拖动。测试 Alt＋单击、Tab、空格和 Enter。
6. **原生完成：**对 Canvas 自身已完成的事项勾选再取消，确认 Canvas 原有样式仍保留。

学校真实页面与 Opera 版本仍需以上实测。本项目已在独立无头 Edge 配置中，使用合成页面与真实扩展 API 验证双向同步、取消、浏览器进程重启持久化、动态重渲染、键盘操作、域名隔离和无重复按钮。合成页面参考官方模板，但不等同于你学校的完整 Canvas 页面。

## Canvas DOM 适配说明

实现核对了 Canvas 官方公开源码：

- [月／周视图](https://github.com/instructure/canvas-lms/blob/master/ui/features/calendar/jquery/index.js)：FullCalendar 事件与 `.fc-title` 标题。
- [议程模板](https://github.com/instructure/canvas-lms/blob/master/ui/features/calendar/jst/agendaView.handlebars)：`.agenda-event__item[data-event-id]` 与 `.agenda-event__title`。
- [无日期模板](https://github.com/instructure/canvas-lms/blob/master/ui/features/calendar/jst/undatedEvents.handlebars)：`.undated_event[data-event-id]` 与 `.undated_event_title`。
- [FullCalendar 3.10.5](https://github.com/fullcalendar/fullcalendar/blob/v3.10.5/dist/fullcalendar.js)：jQuery 的 `fc-seg` 缓存与 `footprint.eventDef.rawId`。

这些是公开实现参考，并非对学校版本的保证。

识别顺序：

1. 月／周视图优先使用只读适配得到的实际事项 ID，避免作业子事项误用父作业 URL。
2. 明确类型的 DOM 属性，例如 `data-assignment-id`、`data-calendar-event-id`、`data-event-id="assignment_123"`。
3. 同源作业／事件详情 URL，例如 `/courses/42/assignments/123`、`/calendar_events/456`、`/calendar?event_id=assignment_123`。
4. 包含明确类型和 ID 的语义 class 或 id，如 `assignment_123`。

不能只凭数字 `data-event-id="123"`、标题或出现顺序认定事项。缺少稳定标识、标识冲突或缺少标题节点时，不添加按钮、不保存不可靠记录。同一 ID 的重复展示共用状态；不同 ID 的重复事件各自独立。

**为什么需要 `page-bridge.js`？** Canvas 的某些月／周视图既没有详情链接，也没有 DOM ID 属性。该脚本通过 Manifest 的 `world: "MAIN"` 在页面环境读取已经存在的 FullCalendar jQuery 数据，只将经过格式验证的事项 ID 写到 `data-cmc-event-id`。兼容 `fcSeg.footprint.eventDef.rawId` 和旧版 `fcSeg.event.id`；不执行事件对象方法、不读取账号或页面正文、不访问扩展存储。存储及交互脚本仍在默认隔离环境运行，无须 `scripting` 或额外主机权限。

如果页面没有按钮，优先检查以下位置：

- `src/identity.js` 顶部的 **`SELECTORS`**：日历容器、事项容器、标题节点及链接。
- 同文件的 **`getItemIdentity()` / `identityFromUrl()` / `typedIdentity()`**：学校是否采用不同 DOM 属性、URL 或事项类型。
- `src/page-bridge.js` 顶部的 **`ROOT` / `ITEM` / `VALID_ID`** 和 **`segmentEvent()` / `readEvent()`**：学校是否升级了 FullCalendar 或使用不同的缓存结构。它是 MAIN world 独立入口，因此保留少量专用选择器；调整月／周事项选择器时同时核对这里。
- 样式位于 `src/styles.css`；周视图保留 FullCalendar 的绝对定位。若学校主题修改了容器的溢出、层级或标题位置，可能需要调整按钮位置。事项详情弹窗、尚未渲染的事项以及未知的学校定制组件不强行处理。

日历 DOM 变化会触发合并后的扫描：隔离脚本约 80 ms，页面桥接约 60 ms。扫描期间隔离脚本暂停自己的观察器，存储通知导致的自有 class 变化被过滤；删除节点会移出索引。无须修改 Canvas 的内联样式或事件处理器。

## 任意 Canvas 域名

从 1.1.0 起，默认支持任意 HTTP／HTTPS 域名，无须逐个添加学校地址，也无须点击扩展按钮单独授权。包括 `canvas.cmu.edu`、`*.instructure.com` 和其他自定义域名。`manifest.json` 两组内容脚本统一使用：

```json
"matches": ["*://*/calendar*"]
```

更新后，在 `opera://extensions` 重新加载扩展（若浏览器要求确认新的网站访问范围，按提示启用），然后刷新所有 Canvas 日历标签页。已有本地完成记录保留，不要卸载重装。

脚本仍检查 `/calendar` 路径和 Canvas 页面标识（`#calendar-app` 或 `#global_nav_dashboard_link`），不因某个页面使用了 FullCalendar 就添加按钮。页面标识是兼容性判断，并非网站真实性验证；学校深度定制页面可能需要调整 `src/identity.js` 的 `SELECTORS.canvasPage` 及 `src/page-bridge.js` 的 `CANVAS_PAGE`。

自定义部署如使用路径前缀（例如 `/canvas/calendar`）而非 `/calendar`，仍需调整匹配路径、两个入口的路径检查与 URL 解析规则。从其他页面进入日历后若站点未发生真正页面导航，可刷新日历以确保注入。

## 调试与开发测试

默认关闭日常日志。在 `src/identity.js` 中将 `DEBUG: false` 改为 `DEBUG: true`，重新加载扩展并刷新页面。浏览器开发者工具的 Console 中筛选 `[Canvas Manual Complete]`，需要时开启 Verbose／调试级别。日志包含初始化、已识别数量、跳过原因、切换、存储通知和写入结果；同一未知节点不会反复打印。

存储逻辑测试只需要 Node.js，无需安装依赖：

```powershell
node tests/storage.test.cjs
```

可选浏览器集成测试使用已安装的 Playwright 和本机 Edge：

```powershell
$env:PLAYWRIGHT_MODULE = '你的 Playwright 模块绝对路径'
node tests/browser.cjs
```

可用 `BROWSER_EXECUTABLE` 指定支持加载扩展的 Chromium 可执行文件。测试采用 `test-results/` 下新建的独立配置，拦截导航并提供 `tests/calendar.html` 合成内容，不使用真实账号或日常浏览器配置。测试夹具的浏览器内数据对象仅用于验证页面桥接；扩展不需要这些测试文件。输出截图和结果位于 `test-results/`，该目录已被 Git 忽略。

## 上架 Chrome Web Store

项目采用 Manifest V3，可以作为 Chrome 扩展提交审核；当前版本可解压加载，但尚未准备完整的商店素材或实际提交审核。

发布前需要完成以下事项：

1. 注册 Chrome Web Store 开发者账号，支付一次性注册费并完成账号设置。[官方注册说明](https://developer.chrome.com/docs/webstore/register)
2. 准备扩展图标、商店截图、名称和功能描述，以及审核人员可复现的测试步骤。[扩展准备说明](https://developer.chrome.com/docs/webstore/prepare)、[商店信息](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
3. 发布隐私政策，说明只在本地读取域名／事项标识和保存完成状态，不上传数据。仅本地保存也需要提供隐私政策。[官方隐私 FAQ 第 14 条](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
4. 填写单一用途和权限用途：`storage` 用于保存完成状态，任意域名匹配用于支持学校自建 Canvas。商店要求权限范围与实际功能相符，需要说明域名范围的必要性；是否通过以审核结果为准。[权限政策](https://developer.chrome.com/docs/webstore/program-policies/permissions)
5. 将运行文件打包为 ZIP，确保 `manifest.json` 位于 ZIP 根目录，并包含 `src/` 和届时添加的图标。不要包含 `.git/`、`tests/`、`test-results/` 或临时浏览器配置。上传到开发者控制台、完善资料后提交审核。[发布流程](https://developer.chrome.com/docs/webstore/publish)

## 文件清单

```text
manifest.json            MV3 权限与两个内容脚本入口
src/identity.js          Canvas 选择器与稳定 ID 提取
src/page-bridge.js       只读 FullCalendar ID 适配
src/storage.js           本地存储、缓存与变更订阅
src/content.js           按钮、交互、观察器与视觉状态
src/styles.css           局部样式与键盘焦点
tests/calendar.html      合成日历测试夹具
tests/storage.test.cjs   存储并发、初始化竞态与失败处理测试
tests/browser.cjs        真实扩展 API 浏览器集成测试
README.md                中文安装、使用、测试与适配说明
.gitignore               排除测试产物和临时配置
```
