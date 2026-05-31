const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function fetchUserData(cookiesJson, searchQuery, searchType) {
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox'
        ]
    });
    
    try {
        // Parse cookies - could be string or array
        let cookies;
        if (typeof cookiesJson === 'string') {
            if (cookiesJson.includes('=') && !cookiesJson.startsWith('[')) {
                cookies = cookiesJson.split(';').map(pair => {
                    const [name, ...valueParts] = pair.trim().split('=');
                    return {
                        name: name.trim(),
                        value: valueParts.join('='),
                        domain: '.xiaohongshu.com',
                        path: '/'
                    };
                }).filter(c => c.name);
            } else {
                cookies = JSON.parse(cookiesJson);
            }
        } else {
            cookies = cookiesJson;
        }
        
        console.log(`Parsed ${cookies.length} cookies`);
        
        const userId = searchType === 'id' ? searchQuery : null;
        console.log(`Fetching user data for: ${userId || searchQuery}`);
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        
        // Load and inject stealth.min.js for anti-detection
        const stealthPath = path.join(__dirname, 'stealth.min.js');
        if (fs.existsSync(stealthPath)) {
            await context.addInitScript({ path: stealthPath }).catch(() => {});
            console.log('Stealth mode enabled');
        }
        
        // Add cookies
        for (const c of cookies) {
            try {
                await context.addCookies([{
                    name: c.name,
                    value: c.value,
                    domain: c.domain || '.xiaohongshu.com',
                    path: c.path || '/',
                    secure: true
                }]);
            } catch (e) {}
        }
        
        const page = await context.newPage();
        const url = `https://www.xiaohongshu.com/user/profile/${userId || searchQuery}`;
        
        console.log(`Navigating to: ${url}`);
        
        try {
            await page.goto(url, { waitUntil: 'load', timeout: 30000 });
            await page.waitForTimeout(3000);
        } catch (navError) {
            console.log(`Navigation error: ${navError.message}`);
        }
        
        const userData = await extractProfileData(page, userId || searchQuery);
        await browser.close();
        
        return {
            success: true,
            data: userData
        };
        
    } catch (error) {
        await browser.close().catch(() => {});
        return {
            success: false,
            error: error.message
        };
    }
}

async function extractProfileData(page, userId) {
    try {
        let html = await page.content().catch(() => '');
        console.log(`Page HTML length: ${html.length}`);
        
        const userData = await page.evaluate(() => {
            const data = {
                nickname: '',
                userId: '',
                avatar: '',
                description: '',
                followers: '',
                following: '',
                liked: '',
                gender: '',
                location: '',
                tags: []
            };
            
            // Try __INITIAL_SSR_STATE__
            try {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const text = script.textContent || '';
                    if (text.includes('nickname') || text.includes('user_info') || text.includes('UserPage')) {
                        try {
                            const match = text.match(/window\.__INITIAL_SSR_STATE__\s*=\s*(\{.*?\});/s);
                            if (match && match[1]) {
                                const jsonData = JSON.parse(match[1]);
                                if (jsonData.UserPage?.user_info) {
                                    const info = jsonData.UserPage.user_info;
                                    data.nickname = info.nickname || '';
                                    data.userId = info.user_id || '';
                                    data.avatar = info.basic_info?.avatar || info.avatar || '';
                                    data.description = info.description || '';
                                    data.followers = info.interaction_data?.follower_count || '';
                                    data.following = info.interaction_data?.following_count || '';
                                    data.liked = info.interaction_data?.liked_count || '';
                                }
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {}
            
            // Try __INITIAL_STATE__
            if (!data.nickname) {
                try {
                    const match = document.body.innerHTML.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s);
                    if (match && match[1]) {
                        const state = JSON.parse(match[1]);
                        if (state.author) {
                            data.nickname = state.author.nickname || '';
                            data.avatar = state.author.avatar || '';
                            data.userId = state.author.userId || '';
                        }
                    }
                } catch (e) {}
            }
            
            // Get avatar from img src
            if (!data.avatar) {
                const imgs = document.querySelectorAll('img');
                for (const img of imgs) {
                    const src = img.src || '';
                    const className = img.className || '';
                    if (src.includes('avatar') || src.includes('sns-avatar') || className.includes('avatar')) {
                        data.avatar = src;
                        break;
                    }
                }
            }
            
            // Get nickname from visible elements
            if (!data.nickname) {
                const nameEls = document.querySelectorAll('[class*="name"], h1, h2');
                for (const el of nameEls) {
                    const text = el.textContent?.trim() || '';
                    if (text && text.length > 0 && text.length < 50 && !text.includes('{{')) {
                        data.nickname = text;
                        break;
                    }
                }
            }
            
            // Get stats
            const allText = document.body.innerText || '';
            const parts = allText.split(/\s+/);
            for (let i = 0; i < parts.length; i++) {
                if (parts[i].includes('粉丝') && i > 0) data.followers = parts[i-1];
                if (parts[i].includes('关注') && i > 0) data.following = parts[i-1];
                if (parts[i].includes('赞') && i > 0 && !data.liked) data.liked = parts[i-1];
            }
            
            return data;
        });
        
        userData.userId = userId;
        console.log(`Extracted data:`, JSON.stringify(userData));
        
        if (!userData.nickname && !userData.avatar) {
            return { 
                userId: userId,
                error: '未获取到用户信息，可能需要登录或Cookie已过期',
                hint: '请确保Cookie有效且包含登录凭证'
            };
        }
        
        return userData;
        
    } catch (error) {
        return { error: error.message, userId: userId };
    }
}

// Main entry point
const args = process.argv.slice(2);
if (args.length < 3) {
    console.error('Usage: node scraper.js <cookies_json> <search_query> <search_type(id|username)>');
    process.exit(1);
}

const [cookiesJson, searchQuery, searchType] = args;

fetchUserData(cookiesJson, searchQuery, searchType)
    .then(result => {
        console.log(JSON.stringify(result));
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error(JSON.stringify({ success: false, error: error.message }));
        process.exit(1);
    });