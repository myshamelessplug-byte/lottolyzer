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
        // 1. Setup
        console.log('Waiting for page hydration...');
        await new Promise(r => setTimeout(r, 3000));

        console.log('Forcing History section visibility...');
        await page.evaluate(() => {
            const section = document.querySelector('#section-history');
            if (section) section.classList.remove('hidden');
        });

        // 2. Select Game
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

        // 3. Select Date Range (Earliest)
        console.log('Selecting date range...');
        await page.evaluate(() => {
            const fromYearSelect = document.querySelector('#fromYearSelect');
            const options = fromYearSelect.querySelectorAll('option');
            if (options.length > 0) {
                // Select the last option (earliest year)
                fromYearSelect.value = options[options.length - 1].value;
                fromYearSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const fromMonthSelect = document.querySelector('#fromMonthSelect');
            fromMonthSelect.value = "0"; // January
            fromMonthSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 4. Initial Search
        console.log('Clicking Fetch Results...');
        await page.evaluate(() => document.querySelector('#searchBtn').click());

        await page.waitForFunction(
            () => !document.querySelector('#tableBody').innerText.includes('Click "Fetch Results"'),
            { timeout: 20000 }
        );
        console.log('Initial results loaded.');

        // 5. Pagination Loop
        let allResults = [];
        let safetyCounter = 0;
        const MAX_PAGES = 200; // Safety break: Stop after 200 pages

        while (safetyCounter < MAX_PAGES) {
            safetyCounter++;
            
            // A. Get current page info for logging
            const pageStatus = await page.evaluate(() => {
                const info = document.querySelector('#pageInfo');
                return info ? info.innerText : 'Unknown Page';
            });
            console.log(`Scraping ${pageStatus}...`);

            // B. Extract Data
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
            console.log(`Found ${newResults.length} rows. Total accumulated: ${allResults.length}`);

            // C. Try to go to Next Page
            const navigationResult = await page.evaluate(() => {
                const nextBtn = document.querySelector('#nextBtn');
                const pageInfo = document.querySelector('#pageInfo');
                
                if (!nextBtn || !pageInfo) return { finished: true, reason: "Elements missing" };

                // Check if we are on the last page
                const text = pageInfo.innerText; // e.g., "Page 1 / 5"
                const parts = text.split('/');
                if (parts.length === 2) {
                    const current = parseInt(parts[0].replace('Page', '').trim());
                    const total = parseInt(parts[1].trim());
                    if (current >= total) return { finished: true, reason: "Last page reached" };
                }

                // Check if button is disabled
                if (nextBtn.classList.contains('disabled') || nextBtn.getAttribute('disabled')) {
                    return { finished: true, reason: "Next button disabled" };
                }

                // Try clicking
                nextBtn.click();
                return { finished: false, reason: "Clicked next" };
            });

            if (navigationResult.finished) {
                console.log(`Finished: ${navigationResult.reason}`);
                break;
            }

            // D. Wait for the page number to CHANGE
            // This is the crucial step to prevent infinite loops
            try {
                await page.waitForFunction(
                    (prevStatus) => {
                        const info = document.querySelector('#pageInfo');
                        if(!info) return false;
                        return info.innerText !== prevStatus;
                    },
                    { timeout: 5000 }, 
                    pageStatus
                );
                // Small buffer for data to load
                await new Promise(r => setTimeout(r, 1000)); 
            } catch (e) {
                console.log("Page did not change after clicking Next. Assuming end.");
                break;
            }
        }

        if (safetyCounter >= MAX_PAGES) {
            console.log(`Warning: Reached safety limit of ${MAX_PAGES} pages.`);
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
