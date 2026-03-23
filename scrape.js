const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeData() {
    console.log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Block images/fonts to speed up loading
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
        // 1. Force History section to be visible
        console.log('Forcing History section visibility...');
        await page.evaluate(() => {
            const section = document.querySelector('#section-history');
            if (section) section.classList.remove('hidden');
        });

        // 2. Interact with the Form
        console.log('Filling out form...');

        // Wait for the Game Select dropdown
        await page.waitForSelector('#gameSelect', { visible: true, timeout: 5000 });

        // Select a specific game. 
        // Options from your HTML: '6/58', '6/55', '6/49', '6/45', '6/42'
        // Let's pick '6/55' (Grand Lotto) as an example.
        await page.select('#gameSelect', '6/55');
        console.log('Selected Game: Grand Lotto 6/55');

        // Optional: If you want to select "Digit Game", you would do:
        // await page.click('input[name="catRadio"][value="digit"]');
        // await page.waitForSelector('#scheduleContainer', { visible: true });

        // 3. Click the Search Button
        console.log('Clicking Fetch Results...');
        await page.click('#searchBtn');

        // 4. Wait for results to load
        // We wait for the placeholder text "Click Fetch Results" to disappear
        console.log('Waiting for results...');
        await page.waitForFunction(
            () => !document.querySelector('#tableBody').innerText.includes('Click "Fetch Results"'),
            { timeout: 20000 }
        );
        console.log('Results loaded.');

    } catch (error) {
        console.log('Error: ' + error.message);
        await page.screenshot({ path: 'error_debug.png' });
        
        // Log the current state of the form for debugging
        const selectedGame = await page.evaluate(() => document.querySelector('#gameSelect').value);
        console.log(`Current selected game value: ${selectedGame}`);
        
        const tableText = await page.evaluate(() => document.querySelector('#tableBody').innerText);
        console.log(`Table Body Text: ${tableText}`);

        await browser.close();
        return;
    }

    // 5. Extract Data
    const results = await page.evaluate(() => {
        const container = document.querySelector('#tableBody');
        const rows = container.children; // Gets all direct children (tr or div)
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
