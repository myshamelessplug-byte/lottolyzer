const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeData() {
    console.log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Block resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    console.log('Navigating to site...');
    await page.goto('https://www.lottong-pinoy.com/', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
    });

    try {
        // 1. Force History section visible
        console.log('Forcing History section to be visible...');
        await page.evaluate(() => {
            const section = document.querySelector('#section-history');
            if (section) section.classList.remove('hidden');
        });

        // 2. Click the button using JavaScript evaluation (more reliable than .click())
        console.log('Clicking Fetch Results via JS...');
        await page.evaluate(() => {
            document.querySelector('#searchBtn').click();
        });

        // 3. Wait for the "Loading..." or placeholder text to disappear
        // We wait until the #tableBody does NOT contain the text "Click"
        console.log('Waiting for data to populate...');
        await page.waitForFunction(
            () => !document.querySelector('#tableBody').innerText.includes('Click "Fetch Results"'),
            { timeout: 20000 }
        );
        console.log('Data loaded.');

    } catch (error) {
        console.log('Error during interaction: ' + error.message);
        await page.screenshot({ path: 'error_debug.png' });
        console.log('Saved screenshot to error_debug.png for debugging.');
        
        // Dump HTML for debugging if it fails
        const html = await page.evaluate(() => document.querySelector('#tableBody').innerHTML);
        console.log("Current Table Body Content: " + html);
        
        await browser.close();
        return;
    }

    // 4. Extract Data
    const results = await page.evaluate(() => {
        const container = document.querySelector('#tableBody');
        // We grab all direct children regardless of tag (tr, div, etc)
        const rows = container.children; 
        const data = [];

        for (let row of rows) {
            // Get all cells (td or div)
            const cells = row.querySelectorAll('td, div');
            
            if (cells.length >= 4) {
                const getText = (el) => el ? el.innerText.trim() : '';
                
                // Simple mapping: usually Date, Combo, Prize, Winners
                data.push({
                    date: getText(cells[0]),
                    combination: getText(cells[1]),
                    prize: getText(cells[2]),
                    winners: getText(cells[3])
                });
            }
        }
        return data;
    });

    console.log(`Scraped ${results.length} results.`);

    if (results.length > 0) {
        fs.writeFileSync('data/results.json', JSON.stringify(results, null, 2));
        console.log('Data saved to data/results.json');
    } else {
        console.log('No data extracted. Check logs.');
    }

    await browser.close();
}

scrapeData().catch(console.error);
