const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeData() {
    console.log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // OPTIONAL: Block unnecessary resources (images, stylesheets, fonts) to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    console.log('Navigating to site...');
    // FIX: Change waitUntil to 'domcontentloaded' or 'load' instead of 'networkidle2'
    try {
        await page.goto('https://www.lottong-pinoy.com/', { 
            waitUntil: 'domcontentloaded', // Faster, doesn't wait for ads/tracking
            timeout: 60000 // Increase timeout to 60 seconds just in case
        });
    } catch (e) {
        console.log("Navigation warning: " + e.message);
        // Continue anyway, the HTML might be there
    }

    try {
        // 1. Force History section to be visible
        console.log('Forcing History section to be visible...');
        await page.evaluate(() => {
            const section = document.querySelector('#section-history');
            if (section) {
                section.classList.remove('hidden');
            }
        });

        // 2. Wait for and Click "Fetch Results"
        console.log('Waiting for button...');
        await page.waitForSelector('#searchBtn', { visible: true, timeout: 5000 });
        
        console.log('Clicking Fetch Results...');
        await page.click('#searchBtn');

        // 3. Wait for results
        console.log('Waiting for data to load...');
        await page.waitForSelector('#tableBody > div', { timeout: 15000 });
        
    } catch (error) {
        console.log('Error during interaction: ' + error.message);
        await page.screenshot({ path: 'error_debug.png' });
        console.log('Saved screenshot to error_debug.png for debugging.');
        await browser.close();
        return;
    }

    // 4. Extract Data
    const results = await page.evaluate(() => {
        const rows = document.querySelectorAll('#tableBody > div');
        const data = [];

        rows.forEach(row => {
            const cells = row.querySelectorAll('div');
            
            if (cells.length >= 4) {
                const getText = (el) => el ? el.innerText.trim() : '';

                data.push({
                    date: getText(cells[0]),
                    combination: getText(cells[1]),
                    prize: getText(cells[2]),
                    winners: getText(cells[3])
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
        console.log('No data extracted.');
    }

    await browser.close();
}

scrapeData().catch(console.error);
