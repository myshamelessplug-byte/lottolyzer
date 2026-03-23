const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeData() {
    console.log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Block resources to speed up
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
        // 1. Wait for the page to be fully interactive (Frameworks like Alpine/Vue need time)
        console.log('Waiting for page hydration...');
        await new Promise(r => setTimeout(r, 3000)); 

        // 2. Force History section visibility
        console.log('Forcing History section visibility...');
        await page.evaluate(() => {
            const section = document.querySelector('#section-history');
            if (section) section.classList.remove('hidden');
        });

        // 3. Robust Selection Method
        console.log('Selecting game...');
        const selectedValue = await page.evaluate(() => {
            const select = document.querySelector('#gameSelect');
            const option = select.querySelector('option[value="6/55"]');
            
            if (option) {
                // 1. Mark the option as selected
                option.selected = true;
                
                // 2. Update the select's value
                select.value = '6/55';
                
                // 3. Fire BOTH 'input' and 'change' events (Framework friendly)
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
                
                return select.value;
            }
            return null;
        });

        console.log(`Attempted to select. Current value: ${selectedValue}`);

        // If selection failed to stick, we try a fallback
        if (selectedValue !== '6/55') {
             console.log('Value did not stick, trying fallback...');
             // Fallback: Puppeteer's native select
             await page.select('#gameSelect', '6/55');
        }

        // 4. Click Search Button
        console.log('Clicking Fetch Results...');
        await page.evaluate(() => {
            document.querySelector('#searchBtn').click();
        });

        // 5. Wait for results
        console.log('Waiting for results...');
        await page.waitForFunction(
            () => !document.querySelector('#tableBody').innerText.includes('Click "Fetch Results"'),
            { timeout: 25000 } // Increased timeout slightly
        );
        console.log('Results loaded.');

    } catch (error) {
        console.log('Error: ' + error.message);
        await page.screenshot({ path: 'error_debug.png' });
        
        // DEBUG: What is in the dropdown?
        const debugVal = await page.evaluate(() => document.querySelector('#gameSelect').value);
        console.log(`DEBUG: Final Select Value = ${debugVal}`);

        const tableText = await page.evaluate(() => document.querySelector('#tableBody').innerText);
        console.log(`DEBUG: Table Text = ${tableText}`);
        
        await browser.close();
        return;
    }

    // 6. Extract Data
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
