const { chromium } = require('playwright');

async function fetchUserData(cookiesJson, searchQuery, searchType) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    
    try {
        // Parse cookies
        const cookies = typeof cookiesJson === 'string' ? JSON.parse(cookiesJson) : cookiesJson;
        
        // Set cookies for the context
        await context.addCookies(cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain || '.xiaohongshu.com',
            path: c.path || '/',
            secure: c.secure !== false,
            httpOnly: c.httpOnly || false,
            sameSite: c.sameSite || 'Lax'
        })));
        
        const page = await context.newPage();
        
        // Determine URL based on search type
        let url;
        if (searchType === 'id') {
            // Search by user ID
            url = `https://www.xiaohongshu.com/user/profile/${searchQuery}`;
        } else {
            // Search by username - try to find the user first
            url = `https://www.xiaohongshu.com/search?keyword=${encodeURIComponent(searchQuery)}&type=51`;
        }
        
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Wait for page to load
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
        // Try to get page source for debugging
        const html = await page.content();
        
        // Extract user information using JavaScript
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
            
            // Try to find the data from __INITIAL_SSR_STATE__ or similar
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent;
                if (text && (text.includes('nickname') || text.includes('user_info'))) {
                    try {
                        // Try to extract JSON from script
                        const match = text.match(/window\.__INITIAL_SSR_STATE__\s*=\s*(\{.*?\});/s);
                        if (match) {
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
            
            // Fallback: try DOM extraction
            if (!data.nickname) {
                const nameEl = document.querySelector('.name-wrapper .name, .user-nickname, [class*="nickname"]');
                if (nameEl) data.nickname = nameEl.textContent.trim();
            }
            
            if (!data.avatar) {
                const avatarEl = document.querySelector('.avatar-wrapper img, .user-avatar img, img[class*="avatar"]');
                if (avatarEl) data.avatar = avatarEl.src;
            }
            
            return data;
        });
        
        userData.userId = userId;
        return userData;
        
    } catch (error) {
        return { error: error.message };
    }
}

async function extractFromSearchResults(page, username) {
    try {
        // Wait for search results to load
        await page.waitForSelector('[class*="user-card"], [class*="search-user"]', { timeout: 10000 }).catch(() => {});
        
        const userData = await page.evaluate(() => {
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
            
            return { error: 'User not found' };
        });
        
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