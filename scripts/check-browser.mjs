import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium, devices } from 'playwright';

const base = (process.env.QA_BASE_URL || 'http://127.0.0.1:4321/rear-view/').replace(/\/?$/, '/');
const report = { checkedAt: new Date().toISOString(), basePath: new URL(base).pathname, browser: 'Existing Google Chrome (headless)', tests: [], pageErrors: [], networkFailures: [], ignoredExternalFailures: [], screenshots: [], limitations: ['Physical AR placement and headset VR were not tested. Mobile checks use an emulated viewport and touch input.'] };
const ownOrigin = new URL(base).origin;
const executablePath = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromium.executablePath()].find(existsSync);
assert.ok(executablePath, 'No existing Chrome or Chromium executable was found.');
mkdirSync('docs', { recursive: true });
let browser;
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
function track(page) {
  page.on('pageerror', error => report.pageErrors.push({ page: new URL(page.url()).pathname, message: error.message }));
  page.on('requestfailed', request => {
    const failure = { url: request.url().replace(ownOrigin, ''), error: request.failure()?.errorText };
    if (failure.error === 'net::ERR_ABORTED') return;
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) report.ignoredExternalFailures.push(failure);
    else report.networkFailures.push(failure);
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(ownOrigin)) report.networkFailures.push({ url: response.url().replace(ownOrigin, ''), status: response.status() });
  });
}
async function check(name, action) {
  const start = Date.now();
  try { const detail = await action(); report.tests.push({ name, passed: true, seconds: +((Date.now() - start) / 1000).toFixed(2), ...detail }); console.log(`PASS ${name}`); }
  catch (error) { report.tests.push({ name, passed: false, seconds: +((Date.now() - start) / 1000).toFixed(2), error: error.message.replaceAll(process.cwd(), '.') }); console.error(`FAIL ${name}: ${error.message.replaceAll(process.cwd(), '.')}`); }
}
async function visibleCount(page) { return page.locator('[data-v3-card]:visible').count(); }
async function waitCount(page, count) { await page.waitForFunction(n => [...document.querySelectorAll('[data-v3-card]')].filter(el => !el.hidden).length === n, count); }
async function shot(page, path, options = {}) { await page.screenshot({ path, ...options }); report.screenshots.push(path); }
async function loadWork(page, slug) {
  await page.goto(`${base}works/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('[data-stage].is-live canvas.viewer-canvas').waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForFunction(() => (window.__qaViewerReady || 0) > 0, null, { timeout: 10000 });
  const model = await page.locator('[data-stage]').getAttribute('data-glb');
  assert.ok(model?.startsWith(`${new URL(base).pathname}models/previews/`), `Model escapes same-origin gallery: ${model}`);
  const canvas = await page.locator('canvas.viewer-canvas').evaluate(c => ({ width: c.width, height: c.height }));
  assert.ok(canvas.width > 100 && canvas.height > 100);
  return { slug, model, canvas };
}

try {
  browser = await chromium.launch({ executablePath, headless: true, timeout: 120000, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    window.__qaViewerReady = 0;
    document.addEventListener('atrium:viewer-ready', () => window.__qaViewerReady++, true);
  });
  const page = await context.newPage(); track(page); page.setDefaultTimeout(15000);
  await check('Gallery shows 50 works and loads every thumbnail', async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('[data-studio-saved-toggle]').waitFor();
    assert.equal(await page.locator('[data-v3-card]').count(), 50);
    assert.equal(await visibleCount(page), 50);
    for (let n = 0; n < 50; n += 3) { await page.locator('[data-v3-card]').nth(n).scrollIntoViewIfNeeded(); await page.waitForTimeout(80); }
    await page.locator('[data-v3-card]').last().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-v3-card] img')].every(img => img.complete && img.naturalWidth > 0), null, { timeout: 30000 });
    await page.evaluate(() => scrollTo(0, 0));
    await shot(page, 'docs/preview-desktop.png', { fullPage: false });
    return { visibleWorks: 50, loadedThumbnails: await page.locator('[data-v3-card] img').count() };
  });
  await check('Search matches a known work, handles no results, and resets', async () => {
    await page.locator('[data-v3-search]').fill('callipyge'); await waitCount(page, 1);
    assert.match(await page.locator('[data-v3-card]:visible h3').innerText(), /Callipyge/i);
    await page.locator('[data-v3-search]').fill('no-work-has-this-title-738594'); await waitCount(page, 0);
    assert.equal(await page.locator('[data-v3-empty]').isVisible(), true);
    await page.locator('[data-v3-empty-reset]').click(); await waitCount(page, 50);
    return { knownMatch: 1, noResultsState: true, resetCount: 50 };
  });
  await check('Era filter narrows the collection and clear restores it', async () => {
    const filter = page.locator('[data-v3-filter="era"]');
    await filter.selectOption({ label: 'Ancient' });
    await page.waitForFunction(() => { const n = [...document.querySelectorAll('[data-v3-card]')].filter(el => !el.hidden).length; return n > 0 && n < 50; });
    const count = await visibleCount(page);
    assert.equal(await page.locator('[data-v3-card]:visible').filter({ hasText: 'Sleeping Hermaphroditus' }).count(), 1);
    assert.equal(await page.locator('[data-v3-card]:visible').filter({ hasText: 'Winter' }).count(), 0);
    await page.locator('[data-v3-reset]').click(); await waitCount(page, 50);
    return { era: 'Ancient', visibleWorks: count, restoredWorks: 50 };
  });
  await check('Saved works persist after reload and can be removed', async () => {
    const save = page.locator('[data-v3-card]').first().locator('[data-studio-save]');
    await save.click(); assert.equal(await save.getAttribute('aria-pressed'), 'true');
    await page.locator('[data-studio-saved-toggle]').click(); await waitCount(page, 1);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('[data-studio-saved-toggle]').waitFor(); await waitCount(page, 1);
    const persisted = await page.locator('[data-v3-card]:visible h3').innerText();
    await page.locator('[data-v3-card]:visible [data-studio-save]').click(); await waitCount(page, 0);
    assert.equal(await page.locator('[data-v3-empty]').isVisible(), true);
    await page.locator('[data-v3-empty-reset]').click(); await waitCount(page, 50);
    return { persistedTitle: persisted, persistedAfterReload: true, removable: true };
  });
  await check('Explicit 3D miniature renders and closes', async () => {
    const first = page.locator('[data-v3-card]').first();
    await first.locator('.studio-peek-trigger').click();
    await first.locator('iframe.studio-peek-frame.is-ready').waitFor({ timeout: 45000 });
    const frame = await first.locator('iframe').elementHandle();
    const framePage = await frame.contentFrame();
    assert.equal(await framePage.locator('canvas.viewer-canvas').count(), 1);
    const work = new URL(framePage.url()).pathname;
    await first.locator('.studio-peek-trigger').click();
    assert.equal(await first.locator('iframe').count(), 0);
    return { renderedWork: work, closed: true };
  });
  const selection = JSON.parse(readFileSync('src/data/selection.json', 'utf8'));
  const previews = JSON.parse(readFileSync('src/data/previews.json', 'utf8'));
  const extensionWorks = new Map();
  for (const slug of selection) {
    const filename = previews[slug].url.split('/').at(-1);
    const bytes = readFileSync(`public/models/previews/${slug}/${filename}`);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim());
    for (const extension of gltf.extensionsUsed || []) if (!extensionWorks.has(extension)) extensionWorks.set(extension, slug);
  }
  const modelSlugs = [...new Set([selection[0], 'europe/winter-houdon-met', extensionWorks.get('KHR_draco_mesh_compression'), extensionWorks.get('EXT_meshopt_compression')].filter(Boolean))];
  for (const slug of modelSlugs) await check(`Actual 3D model loads: ${slug}`, () => loadWork(page, slug));
  await check('Orbit, zoom, reset and mesh controls change the rendered sculpture', async () => {
    await loadWork(page, selection[0]);
    const rotate = page.locator('[data-tool-rotate]');
    if (await rotate.getAttribute('aria-pressed') === 'true') await rotate.click();
    const canvas = page.locator('canvas.viewer-canvas');
    await page.waitForTimeout(400);
    const before = hash(await canvas.screenshot());
    await canvas.hover(); await page.mouse.wheel(0, -350); await page.waitForTimeout(400);
    const zoomed = hash(await canvas.screenshot()); assert.notEqual(zoomed, before, 'Zoom did not change rendered canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .72, box.y + box.height * .58, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(600);
    const orbited = hash(await canvas.screenshot()); assert.notEqual(orbited, zoomed, 'Orbit did not change rendered canvas');
    await page.locator('[data-tool-reset]').click(); await page.waitForTimeout(600);
    const reset = hash(await canvas.screenshot()); assert.notEqual(reset, orbited, 'Reset did not change rendered canvas');
    await page.locator('[data-tool-wire]').click(); assert.equal(await page.locator('[data-tool-wire]').getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(250); assert.notEqual(hash(await canvas.screenshot()), reset, 'Mesh toggle did not change rendered canvas');
    await page.locator('[data-tool-wire]').click();
    await shot(page, 'docs/preview-work-desktop.png');
    return { zoomChangedCanvas: true, orbitChangedCanvas: true, resetChangedCanvas: true, meshChangedCanvas: true };
  });
  await check('AR / VR panel gives desktop device handoff and closes', async () => {
    await page.locator('[data-spatial-open]').click();
    await page.locator('dialog[data-spatial-dialog][open]').waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-spatial-ar]').disabled);
    assert.match(await page.locator('[data-spatial-ar]').innerText(), /AR phone/);
    await page.locator('[data-spatial-ar]').click();
    assert.equal(await page.locator('[data-spatial-handoff]').getAttribute('open'), '');
    const shared = await page.locator('[data-spatial-url]').inputValue();
    assert.ok(shared.includes('/rear-view/works/'));
    await page.locator('[data-spatial-close]').click();
    assert.equal(await page.locator('dialog[data-spatial-dialog]').getAttribute('open'), null);
    return { desktopFallback: 'Use an AR phone', handoffUrlPath: new URL(shared).pathname, physicalSessionStarted: false };
  });
  const mobileContext = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  await mobileContext.addInitScript(() => { window.__qaViewerReady = 0; document.addEventListener('atrium:viewer-ready', () => window.__qaViewerReady++, true); });
  const mobile = await mobileContext.newPage(); track(mobile); mobile.setDefaultTimeout(15000);
  await check('Mobile collection and work view fit the viewport', async () => {
    await mobile.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mobile.locator('[data-studio-saved-toggle]').waitFor();
    assert.equal(await mobile.locator('[data-v3-card]').count(), 50);
    let widths = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(widths.scroll <= widths.client + 1, `Mobile gallery overflows: ${JSON.stringify(widths)}`);
    await shot(mobile, 'docs/preview-mobile.png');
    const model = await loadWork(mobile, selection[0]);
    widths = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(widths.scroll <= widths.client + 1, `Mobile detail overflows: ${JSON.stringify(widths)}`);
    await shot(mobile, 'docs/preview-work-mobile.png');
    return { viewport: mobile.viewportSize(), horizontalOverflow: false, model: model.slug };
  });
  await context.close(); await mobileContext.close();
} catch (error) { report.tests.push({ name: 'Browser setup or navigation', passed: false, error: error.message.replaceAll(process.cwd(), '.') }); console.error(error.message.replaceAll(process.cwd(), '.')); }
finally {
  if (browser) await browser.close();
  report.passed = report.tests.length > 0 && report.tests.every(test => test.passed) && report.pageErrors.length === 0 && report.networkFailures.length === 0;
  writeFileSync('docs/browser-qa.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, checks: report.tests.length, failedChecks: report.tests.filter(test => !test.passed).length, pageErrors: report.pageErrors.length, networkFailures: report.networkFailures.length }));
  if (!report.passed) process.exitCode = 1;
}
