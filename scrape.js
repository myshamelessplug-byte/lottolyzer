const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeData() {
    console.log('Launching browser...');
    
    // Launch browser
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for GitHub Actions
    });
    
    const page = await browser.newPage();
    
    // Go to the site
    console.log('Navigating to site...');
    await page.goto('https://www.lottong-pinoy.com/', { waitUntil: 'networkidle2' });

    try {
        // 1. Wait for the table body to be present (even if empty initially)
        // We wait for the container to ensure the page structure is loaded
        await page.waitForSelector('#tableBody', { timeout: 5000 });
        
        // 2. Click "Fetch Results"
        console.log('Clicking Fetch Results...');
        await page.click('#searchBtn');

        // 3. Wait for rows to appear (Timeout 15 seconds)
        console.log('Waiting for results to load...');
        await page.waitForSelector('#tableBody tr', { timeout: 15000 });
        
    } catch (error) {
        console.log('Warning: Could not find results rows or button. The site might have changed or no results found.');
        console.log(error);
        // Close browser and exit if no data found
        await browser.close();
        return;
    }

    // 4. Extract Data
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

    // 5. Save to JSON
    if (results.length > 0) {
        fs.writeFileSync('data/results.json', JSON.stringify(results, null, 2));
        console.log('Data saved to data/results.json');
    } else {
        console.log('No data extracted.');
    }

    await browser.close();
}

scrapeData().catch(console.error);
