const puppeteer = require('fs');
const fs = require('fs');

async function scrapeData() {
    // Launch browser
    const browser = await puppeteer.launch({
        headless: 'new', // Run in background
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for GitHub Actions
    });
    
    const page = await browser.newPage();
    
    // Go to the site
    console.log('Navigating to site...');
    await page.goto('https://www.lottong-pinoy.com/', { waitUntil: 'networkidle2' });

    // 1. Click the "History" section or ensure we are on the right tab
    // The HTML you sent has id="section-history", usually hidden. 
    // We might need to click a nav button first.
    // Assuming we are already on the view or need to click a button to show it:
    try {
        // Example: If there is a button to show history, click it.
        // await page.click('#btn-history'); 
        // await page.waitForSelector('#section-history:not(.hidden)');
    } catch (e) {
        console.log('History section handling skipped or already visible');
    }

    // 2. Click "Fetch Results" button based on the HTML ID you provided
    console.log('Clicking Fetch Results...');
    await page.click('#searchBtn');

    // 3. Wait for the table body to populate
    // We wait for a row (tr) to appear inside the tableBody div
    await page.waitForSelector('#tableBody tr', { timeout: 10000 });

    // 4. Extract Data
    const results = await page.evaluate(() => {
        const rows = document.querySelectorAll('#tableBody tr'); // Or divs if they changed structure
        const data = [];

        rows.forEach(row => {
            // Helper to get text safely
            const getText = (selector) => {
                const el = row.querySelector(selector);
                return el ? el.innerText.trim() : '';
            };

            // Based on the HTML structure provided:
            // It uses grid cols. We can try to extract based on assumed structure or generic text
            // Since the HTML snippet showed the HEADER structure, we assume rows follow similar order:
            // Date | Combination | Prize | Winners
            
            // Note: If the site uses <tr>, we use 'td'. 
            // If they use <div class="grid..."> inside #tableBody, we query that.
            // The HTML provided was the HEADER. Let's assume standard table rows <tr> for now.
            
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
    fs.writeFileSync('data/results.json', JSON.stringify(results, null, 2));

    await browser.close();
}

scrapeData().catch(console.error);
