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
        // FIX: The site uses DIVs, not TRs. We wait for a div inside tableBody.
        // We also wait for the 'p' tag (placeholder) to disappear or check for content.
        console.log('Waiting for data to load...');
        
        // We wait for the "grid" div which represents a row to appear
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
        // Select the direct children divs (the rows)
        const rows = document.querySelectorAll('#tableBody > div');
        const data = [];

        rows.forEach(row => {
            // In a grid layout, often the direct children are the cells
            // The HTML showed: <div class="grid grid-cols-12...">
            // So we look for the inner divs
            const cells = row.querySelectorAll('div');
            
            // Based on your HTML: 
            // Col 1: Date, Col 2: Combination, Col 3: Prize, Col 4: Winners
            // Note: Grid layouts can be tricky. We check if we have enough cells.
            
            if (cells.length >= 4) {
                // Sometimes the first cell is empty or acts as a spacer, 
                // but usually in this framework the data is direct.
                // Let's try to map them safely.
                
                // Helper to get text
                const getText = (el) => el ? el.innerText.trim() : '';

                data.push({
                    // Adjust indices if needed based on the actual grid columns
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
        console.log('No data extracted. Check if site structure matches selectors.');
    }

    await browser.close();
}

scrapeData().catch(console.error);
