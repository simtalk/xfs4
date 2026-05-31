const { chromium } = require('playwright');

async function fetchUserData(cookiesJson, searchQuery, searchType) {
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-setuid-sandbox',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-translate',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection'
        ]
    });
    
    try {
        // Parse cookies - could be string or array
        let cookies;
        if (typeof cookiesJson === 'string') {
            // If it's raw cookie string, parse it
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
            viewport: { width: 1920, height: 1080 },
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai'
        });
        
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
            } catch (e) {
                // Skip
            }
        }
        
        const page = await context.newPage();
        
        // Inject anti-detection scripts before navigation
        await page.addInitScript(() => {
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
                configurable: true
            });
            
            // Add permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
                configurable: true
            });
            
            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en-US', 'en'],
                configurable: true
            });
            
            // Mock chrome runtime
            window.chrome = { runtime: {} };
        });
        
        const url = `https://www.xiaohongshu.com/user/profile/${userId || searchQuery}`;
        
        console.log(`Navigating to: ${url}`);
        
        try {
            // First visit main page to establish session
            await page.goto('https://www.xiaohongshu.com', { waitUntil: 'load', timeout: 30000 });
            await page.waitForTimeout(2000);
            
            // Then navigate to profile
            await page.goto(url, { waitUntil: 'load', timeout: 45000 });
            await page.waitForTimeout(5000);
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
        
        // Check for captcha or verification page
        const pageTitle = await page.title().catch(() => '');
        console.log(`Page title: ${pageTitle}`);
        
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
            
            // Try SSR state first
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
            
            // Get avatar from any img with avatar class or src
            if (!data.avatar) {
                const imgs = document.querySelectorAll('img');
                for (const img of imgs) {
                    const src = img.src || '';
                    const alt = img.alt || '';
                    const className = img.className || '';
                    
                    if (src.includes('avatar') || src.includes('sns-avatar') || className.includes('avatar')) {
                        data.avatar = src;
                        break;
                    }
                }
            }
            
            // Get nickname from any visible element
            if (!data.nickname) {
                const nameEls = document.querySelectorAll('[class*="name"], h1, h2, [class*="nickname"], [class*="user-name"]');
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
            const textParts = allText.split(/\s+/);
            
            for (let i = 0; i < textParts.length; i++) {
                const part = textParts[i];
                if (part.includes('粉丝') && i > 0 && !data.followers) {
                    data.followers = textParts[i-1] || '';
                }
                if (part.includes('关注') && i > 0 && !data.following) {
                    data.following = textParts[i-1] || '';
                }
                if ((part.includes('获赞') || part.includes('赞')) && i > 0 && !data.liked) {
                    data.liked = textParts[i-1] || '';
                }
            }
            
            return data;
        });
        
        userData.userId = userId;
        
        console.log(`Extracted data:`, JSON.stringify(userData));
        
        if (!userData.nickname && !userData.avatar) {
            // Save screenshot for debugging
            try {
                await page.screenshot({ path: '/www/wwwroot/www.zhiyiai.cn/ces/debug.png' });
                console.log('Screenshot saved to /www/wwwroot/www.zhiyiai.cn/ces/debug.png');
            } catch (e) {}
            
            return { 
                userId: userId,
                error: '未获取到用户信息，可能需要登录或Cookie已过期',
                hint: '请确保Cookie有效且包含登录凭证'
            };
        }
        
        return userData;
        
    } catch (error) {
        return { 
            error: error.message,
            userId: userId
        };
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