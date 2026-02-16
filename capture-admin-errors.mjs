import { chromium } from 'playwright';

const results = {
  failedEndpoints: [],
  consoleErrors: [],
  pageVisited: []
};

async function captureAdminErrors() {
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track all network requests to /api/admin/*
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/admin/')) {
      const status = response.status();
      const method = response.request().method();
      
      if (status >= 400) {
        let responseBody = '';
        try {
          const text = await response.text();
          responseBody = text.length > 2000 ? text.substring(0, 2000) + '...' : text;
        } catch (e) {
          responseBody = `[Could not read response body: ${e.message}]`;
        }

        results.failedEndpoints.push({
          page: page.url(),
          method,
          url,
          status,
          responseBody
        });

        console.log(`\n❌ Failed Request on ${page.url()}:`);
        console.log(`   ${method} ${url} - Status: ${status}`);
        console.log(`   Response: ${responseBody.substring(0, 200)}...`);
      }
    }
  });

  // Track console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      results.consoleErrors.push({
        page: page.url(),
        message: msg.text()
      });
      console.log(`\n🔴 Console Error on ${page.url()}:`, msg.text());
    }
  });

  try {
    console.log('\n🌐 Navigating to http://localhost:3002...');
    await page.goto('http://localhost:3002', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Check if we're on a login page
    if (currentUrl.includes('/login')) {
      console.log('\n🔐 Login page detected.');
      console.log('🖐️  Please manually log in within 60 seconds...');
      console.log('    (The browser window should be open)');
      
      // Wait for navigation away from login page
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds
      
      while (attempts < maxAttempts) {
        await page.waitForTimeout(1000);
        const checkUrl = page.url();
        if (!checkUrl.includes('/login')) {
          console.log('✓ Login successful! Proceeding...');
          break;
        }
        attempts++;
        if (attempts % 10 === 0) {
          console.log(`   Still waiting... (${maxAttempts - attempts}s remaining)`);
        }
      }
      
      if (page.url().includes('/login')) {
        console.log('❌ Login timeout. Exiting.');
        await browser.close();
        return;
      }
    }

    // Wait for dashboard to load
    await page.waitForTimeout(2000);
    results.pageVisited.push({ path: page.url(), name: 'Dashboard' });
    console.log('\n📊 Dashboard loaded');

    // Find all navigation items
    const navItems = [
      { selector: 'a[href*="jobs"]:not([href*="draft"])', name: 'Jobs' },
      { selector: 'a[href*="contractors"]', name: 'Contractors' },
      { selector: 'a[href*="job-draft"], a[href*="draft"]', name: 'Job Drafts' },
      { selector: 'a[href*="payout"]', name: 'Payout Requests' },
      { selector: 'a[href*="routing"], a[href*="assignment"]', name: 'Routing/Assignments' },
      { selector: 'a[href*="support"]', name: 'Support' },
      { selector: 'a[href*="settings"]', name: 'Settings' },
      { selector: 'a[href*="audit"]', name: 'Audit Logs' },
      { selector: 'a[href*="stats"]', name: 'Stats' }
    ];

    for (const item of navItems) {
      try {
        const selectors = item.selector.split(',').map(s => s.trim());
        let navElement = null;
        
        for (const selector of selectors) {
          try {
            navElement = await page.waitForSelector(selector, { timeout: 1000 });
            if (navElement) break;
          } catch (e) {
            // Try next selector
          }
        }

        if (navElement) {
          console.log(`\n📍 Clicking navigation: ${item.name}`);
          await navElement.click();
          await page.waitForTimeout(4000); // Wait for page load and API calls
          
          results.pageVisited.push({ path: page.url(), name: item.name });
          console.log(`   Current path: ${page.url()}`);
        } else {
          console.log(`⚠️  Could not find navigation item: ${item.name}`);
        }
      } catch (e) {
        console.log(`⚠️  Error navigating to ${item.name}: ${e.message}`);
      }
    }

    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('📋 SUMMARY OF FAILED API ENDPOINTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (results.failedEndpoints.length === 0) {
      console.log('✅ No failed API endpoints detected!');
    } else {
      results.failedEndpoints.forEach((item, index) => {
        console.log(`\n${index + 1}. FAILED REQUEST`);
        console.log(`   Page: ${item.page}`);
        console.log(`   Method: ${item.method}`);
        console.log(`   URL: ${item.url}`);
        console.log(`   Status: ${item.status}`);
        console.log(`   Response Body:`);
        console.log(`   ${item.responseBody}`);
        console.log(`   ${'─'.repeat(60)}`);
      });
    }

    if (results.consoleErrors.length > 0) {
      console.log('\n\n═══════════════════════════════════════════════════════════');
      console.log('🔴 CONSOLE ERRORS');
      console.log('═══════════════════════════════════════════════════════════\n');
      
      results.consoleErrors.forEach((item, index) => {
        console.log(`${index + 1}. ${item.page}`);
        console.log(`   ${item.message}`);
      });
    }

    // Write results to JSON file
    const fs = await import('fs');
    fs.writeFileSync(
      'admin-error-report.json',
      JSON.stringify(results, null, 2)
    );
    console.log('\n\n💾 Full report saved to: admin-error-report.json');

  } catch (error) {
    console.error('\n❌ Error during execution:', error);
  } finally {
    await browser.close();
  }
}

captureAdminErrors().catch(console.error);
