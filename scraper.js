const { chromium } = require('playwright');

async function fetchUserData(cookiesJson, searchQuery, searchType) {
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    try {
        // Parse cookies
        const cookies = typeof cookiesJson === 'string' ? JSON.parse(cookiesJson) : cookiesJson;
        
        // Set cookies for the context
        for (const c of cookies) {
            try {
                await context.addCookies([{
                    name: c.name,
                    value: c.value,
                    domain: c.domain || '.xiaohongshu.com',
                    path: c.path || '/',
                    secure: c.secure !== false,
                    httpOnly: c.httpOnly || false,
                    sameSite: c.sameSite || 'Lax'
                }]);
            } catch (e) {
                // Skip invalid cookies
            }
        }
        
        const page = await context.newPage();
        
        // Determine URL based on search type
        let url;
        if (searchType === 'id') {
            // Search by user ID
            url = `https://www.xiaohongshu.com/user/profile/${searchQuery}`;
        } else {
            // Search by username - try to find the user first
            url = `https://www.xiaohongshu.com/user/profile/${searchQuery}`;
        }
        
        console.log(`Navigating to: ${url}`);
        
        // Navigate with better error handling
        try {
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            // Wait for any redirects to complete
            await page.waitForTimeout(3000);
            
            // Wait for main content to load
            try {
                await page.waitForSelector('body', { timeout: 10000 });
            } catch (e) {
                // Continue anyway
            }
            
        } catch (navError) {
            console.log(`Navigation error: ${navError.message}`);
        }
        
        // Small delay to let page settle
        await page.waitForTimeout(2000);
        
        let userData = {};
        
        if (searchType === 'id') {
            // Extract user info from profile page
            userData = await extractProfileData(page, searchQuery);
        } else {
            // For username search, look for user in search results
            userData = await extractFromSearchResults(page, searchQuery);
        }
        
        await browser.close();
        
        return {
            success: true,
            data: userData
        };
        
    } catch (error) {
        await browser.close();
        return {
            success: false,
            error: error.message
        };
    }
}

async function extractProfileData(page, userId) {
    try {
        // Get page content safely
        let html = '';
        try {
            html = await page.content();
        } catch (e) {
            console.log('Could not get page content');
        }
        
        // Extract user information using JavaScript with better error handling
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
            
            // Try to find from __INITIAL_SSR_STATE__
            try {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const text = script.textContent || '';
                    if (text.includes('nickname') || text.includes('user_info')) {
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
                                    data.gender = info.gender || '';
                                    data.location = info.location || '';
                                }
                            }
                        } catch (e) {
                            // Continue to next script
                        }
                    }
                }
            } catch (e) {}
            
            // Try DOM extraction as fallback
            if (!data.nickname) {
                const nameSelectors = [
                    '.user-nickname',
                    '.name-wrapper .name',
                    '[class*="nickname"]',
                    'h1.user-name',
                    '.profile-user-name'
                ];
                
                for (const selector of nameSelectors) {
                    const el = document.querySelector(selector);
                    if (el && el.textContent.trim()) {
                        data.nickname = el.textContent.trim();
                        break;
                    }
                }
            }
            
            if (!data.avatar) {
                const avatarSelectors = [
                    '.user-avatar img',
                    '.avatar img',
                    '[class*="avatar"] img',
                    'img[class*="user"]'
                ];
                
                for (const selector of avatarSelectors) {
                    const el = document.querySelector(selector);
                    if (el && el.src) {
                        data.avatar = el.src;
                        break;
                    }
                }
            }
            
            // Try to find stats
            const statsSelectors = [
                '[class*="follower"]',
                '[class*="following"]',
                '[class*="like"]',
                '[class*="fans"]'
            ];
            
            for (const selector of statsSelectors) {
                const els = document.querySelectorAll(selector);
                els.forEach(el => {
                    const text = el.textContent || '';
                    if (text.includes('粉丝') && !data.followers) {
                        data.followers = text.replace(/[^0-9]/g, '') || el.querySelector('span')?.textContent || '';
                    }
                    if (text.includes('关注') && !data.following) {
                        data.following = text.replace(/[^0-9]/g, '') || el.querySelector('span')?.textContent || '';
                    }
                    if (text.includes('赞') && !data.liked) {
                        data.liked = text.replace(/[^0-9]/g, '') || el.querySelector('span')?.textContent || '';
                    }
                });
            }
            
            return data;
        });
        
        userData.userId = userId;
        
        // If still no data, return error message
        if (!userData.nickname && !userData.avatar) {
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

async function extractFromSearchResults(page, username) {
    try {
        // Wait for search results to load
        await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
        
        const userData = await page.evaluate((searchName) => {
            const userCards = document.querySelectorAll('[class*="user-card"], [class*="search-user"], [class*="author"]');
            
            for (const card of userCards) {
                const nameEl = card.querySelector('[class*="name"], [class*="nickname"]');
                if (nameEl && nameEl.textContent.includes('{{') === false) {
                    return {
                        nickname: nameEl.textContent.trim(),
                        avatar: card.querySelector('img')?.src || '',
                        description: card.querySelector('[class*="desc"]')?.textContent || ''
                    };
                }
            }
            
            return { error: '用户未找到: ' + searchName };
        }, username);
        
        return userData;
        
    } catch (error) {
        return { error: error.message };
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