const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeData() {
    console.log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    console.log('Navigating to site...');
    await page.goto('https://www.lottong-pinoy.com/', { waitUntil: 'networkidle2' });

    try {
        // --- FIX: UNHIDE THE SECTION ---
        // The HTML you provided had 'hidden' on the section. We remove it using JavaScript.
        console.log('Forcing History section to be visible...');
        await page.evaluate(() => {
            const section = document.querySelector('#section-history');
            if (section) {
                section.classList.remove('hidden');
            }
        });
        // --------------------------------

        // Now wait for the button to be visible
        console.log('Waiting for button...');
        await page.waitForSelector('#searchBtn', { visible: true, timeout: 5000 });

        // Click "Fetch Results"
        console.log('Clicking Fetch Results...');
        await page.click('#searchBtn');

        // Wait for rows to appear
        console.log('Waiting for table rows...');
        await page.waitForSelector('#tableBody tr', { timeout: 15000 });
        
    } catch (error) {
        console.log('Error during interaction: ' + error.message);
        // Take a screenshot if it fails so we can see what happened
        await page.screenshot({ path: 'error_debug.png' });
        console.log('Saved screenshot to error_debug.png for debugging.');
        await browser.close();
        return;
    }

    // Extract Data
    const results = await page.evaluate(() => {
        const rows = document.querySelectorAll('#tableBody tr');
        const data = [];

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
                data.push({
                    date: cells[0].innerText.trim(),
                    combination: cells[1].innerText.trim(),
                    prize: cells[2].innerText.trim(),
                    winners: cells[3].innerText.trim()
                });
            }
        });
        return data;
    });

    console.log(`Scraped ${results.length} results.`);

    if (results.length > 0) {
        fs.writeFileSync('data/results.json', JSON.stringify(results, null, 2));
        console.log('Data saved to data/results.json');
    } else {
        console.log('No data extracted. The table might be empty.');
    }

    await browser.close();
}

scrapeData().catch(console.error);
