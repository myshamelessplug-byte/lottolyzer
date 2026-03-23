const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeData() {
    console.log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    console.log('Navigating to site...');
    await page.goto('https://www.lottong-pinong.com/', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
    });

    try {
        // 1. Wait for hydration
        console.log('Waiting for page hydration...');
        await new Promise(r => setTimeout(r, 3000));

        // 2. Force History section visibility
        console.log('Forcing History section visibility...');
        await page.evaluate(() => {
            const section = document.querySelector('#section-history');
            if (section) section.classList.remove('hidden');
        });

        // 3. Select Game (e.g., 6/55)
        console.log('Selecting game...');
        await page.evaluate(() => {
            const select = document.querySelector('#gameSelect');
            const option = select.querySelector('option[value="6/55"]');
            if (option) {
                option.selected = true;
                select.value = '6/55';
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        // 4. Select "From" Date (Earliest Available)
        // We select the last option in the Year dropdown to get the earliest year.
        console.log('Selecting date range...');
        await page.evaluate(() => {
            // Set FROM Year to the last option (e.g., 2016)
            const fromYearSelect = document.querySelector('#fromYearSelect');
            const options = fromYearSelect.querySelectorAll('option');
            if (options.length > 0) {
                const earliestYear = options[options.length - 1].value; // Last option usually earliest
                fromYearSelect.value = earliestYear;
                fromYearSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            // Set FROM Month to January (value="0")
            const fromMonthSelect = document.querySelector('#fromMonthSelect');
            fromMonthSelect.value = "0";
            fromMonthSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 5. Click Search
        console.log('Clicking Fetch Results...');
        await page.evaluate(() => document.querySelector('#searchBtn').click());

        // 6. Wait for initial results
        console.log('Waiting for initial results...');
        await page.waitForFunction(
            () => !document.querySelector('#tableBody').innerText.includes('Click "Fetch Results"'),
            { timeout: 20000 }
        );
        console.log('Initial results loaded.');

        // 7. PAGINATION LOOP
        let allResults = [];
        let hasNextPage = true;
        let pageNum = 1;

        while (hasNextPage) {
            console.log(`Scraping page ${pageNum}...`);
            
            // A. Extract Data on current page
            const newResults = await page.evaluate(() => {
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

            allResults.push(...newResults);
            console.log(`Found ${newResults.length} rows. Total: ${allResults.length}`);

            // B. Check if Next Page exists
            const isDisabled = await page.evaluate(() => {
                const nextBtn = document.querySelector('#nextBtn');
                // Check if button is disabled (logic might vary by site, usually a class or attribute)
                // The HTML snippet didn't show a disabled class, so we check the PageInfo text
                const pageInfo = document.querySelector('#pageInfo').innerText; // e.g., "Page 1 / 5"
                const parts = pageInfo.split('/');
                const current = parseInt(parts[0].replace('Page', '').trim());
                const total = parseInt(parts[1].trim());
                
                return current >= total;
            });

            if (isDisabled) {
                console.log('Last page reached.');
                hasNextPage = false;
            } else {
                // C. Click Next
                await page.evaluate(() => document.querySelector('#nextBtn').click());
                
                // D. Wait for new rows to load
                // We wait for the number of rows to be greater than 0 again
                await page.waitForFunction(() => {
                    const rows = document.querySelectorAll('#tableBody > div, #tableBody > tr');
                    return rows.length > 0;
                }, { timeout: 10000 });
                
                // Small delay to ensure data rendered
                await new Promise(r => setTimeout(r, 500)); 
                pageNum++;
            }
        }

        console.log(`Scraping finished. Total results: ${allResults.length}`);

        if (allResults.length > 0) {
            fs.writeFileSync('data/results.json', JSON.stringify(allResults, null, 2));
            console.log('Data saved to data/results.json');
        } else {
            console.log('No data extracted.');
        }

    } catch (error) {
        console.log('Error: ' + error.message);
        await page.screenshot({ path: 'error_debug.png' });
    }

    await browser.close();
}

scrapeData().catch(console.error);
