const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeData() {
    console.log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
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
        console.log('Forcing History section visibility...');
        await page.evaluate(() => {
            const section = document.querySelector('#section-history');
            if (section) section.classList.remove('hidden');
        });

        // 2. Select Game using evaluate (THE FIX)
        console.log('Selecting game manually...');
        await page.evaluate(() => {
            const selectElement = document.querySelector('#gameSelect');
            selectElement.value = '6/55'; // Set the value directly
            
            // Create and dispatch the 'change' event so the site knows it changed
            const event = new Event('change', { bubbles: true });
            selectElement.dispatchEvent(event);
        });

        // Verify selection
        const currentVal = await page.evaluate(() => document.querySelector('#gameSelect').value);
        console.log(`Current game selection confirmed: ${currentVal}`);

        // 3. Click Search Button via evaluate (More reliable)
        console.log('Clicking Fetch Results...');
        await page.evaluate(() => {
            document.querySelector('#searchBtn').click();
        });

        // 4. Wait for results
        console.log('Waiting for results...');
        await page.waitForFunction(
            () => !document.querySelector('#tableBody').innerText.includes('Click "Fetch Results"'),
            { timeout: 20000 }
        );
        console.log('Results loaded.');

    } catch (error) {
        console.log('Error: ' + error.message);
        await page.screenshot({ path: 'error_debug.png' });
        
        const tableText = await page.evaluate(() => document.querySelector('#tableBody').innerText);
        console.log(`DEBUG Table Text: ${tableText}`);
        
        await browser.close();
        return;
    }

    // 5. Extract Data
    const results = await page.evaluate(() => {
        const container = document.querySelector('#tableBody');
        const rows = container.children;
        const data = [];

        for (let row of rows) {
            const cells = row.querySelectorAll('td, div');
            
            if (cells.length >= 4) {
                const getText = (el) => el ? el.innerText.trim() : '';
                
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
        console.log('No data extracted.');
    }

    await browser.close();
}

scrapeData().catch(console.error);
