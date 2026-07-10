const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    } else if (msg.type() === 'warning') {
      console.log('BROWSER WARN:', msg.text());
    } else {
      console.log('BROWSER LOG:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE UNCAUGHT ERROR:', error.message);
  });

  try {
    await page.goto('http://localhost:9005', { waitUntil: 'networkidle2', timeout: 10000 });
    // Fill login form
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', 'gravitydenim@gmail.com');
    await page.type('input[type="password"]', 'gravitydenim123'); // assuming standard password
    await page.click('button[type="submit"]');
    
    // Wait for the main page to load
    await new Promise(r => setTimeout(r, 5000));
  } catch (e) {
    console.log('Navigation/Login error:', e.message);
  }

  await browser.close();
})();
