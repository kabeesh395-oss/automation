
const { chromium } = require('playwright');
const { exec } = require('child_process');

(async () => {
  // Start dev server
  const server = exec('npm start', { cwd: __dirname });
  
  // Wait for server to boot (naive wait)
  await new Promise(r => setTimeout(r, 5000));

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    const response = await page.goto('http://localhost:5001', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Initial State
    const initialHtml = await page.content();
    let stateChanged = false;
    let interaction = null;

    // Try interacting
    const button = page.locator('button').first();
    const input = page.locator('input').first();
    
    if (await button.isVisible()) {
      await button.click();
      interaction = 'clicked button';
    } else if (await input.isVisible()) {
      await input.fill('test');
      interaction = 'filled input';
    }
    
    if (interaction) {
      await page.waitForTimeout(1000); // Wait for potential state changes
      const newHtml = await page.content();
      stateChanged = initialHtml !== newHtml;
      if (stateChanged && newHtml.length === initialHtml.length) {
         // same length, different content?
         console.log("HTML slightly changed!");
      }
    }
    
    await page.screenshot({ path: 'E:\\automation\\acceptance_tests\\test_web\\jarvis_web_screenshot.png' });
    
    const html = await page.content();
    
    console.log(JSON.stringify({
      ok: response.ok() && errors.length === 0 && (interaction === null || stateChanged),
      status: response.status(),
      errors,
      interaction,
      stateChanged,
      htmlLength: html.length,
      htmlSnippet: html.substring(0, 1000)
    }));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }));
  } finally {
    if (browser) await browser.close();
    try {
      if (server && server.pid) {
        if (process.platform === 'win32') {
          require('child_process').execSync('taskkill /F /T /PID ' + server.pid, { stdio: 'ignore' });
        } else {
          server.kill('SIGINT');
        }
      }
    } catch(e) {}
    process.exit(0);
  }
})();
    