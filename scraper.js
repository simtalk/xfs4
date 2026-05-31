const { chromium } = require('playwright');
const https = require('https');

async function fetchUserData(cookiesJson, searchQuery, searchType) {
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-web-security'
        ]
    });
    
    try {
        // Parse cookies
        const cookies = typeof cookiesJson === 'string' ? JSON.parse(cookiesJson) : cookiesJson;
        
        // Build cookie string for API
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        // Build user ID from search query
        const userId = searchType === 'id' ? searchQuery : null;
        
        console.log(`Fetching user data for: ${userId || searchQuery}`);
        
        // Create context with cookies
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        
        // Add cookies to context - try multiple domains
        const domains = ['.xiaohongshu.com', 'xiaohongshu.com', 'www.xiaohongshu.com'];
        
        for (const c of cookies) {
            for (const domain of domains) {
                try {
                    await context.addCookies([{
                        name: c.name,
                        value: c.value,
                        domain: c.domain || domain,
                        path: c.path || '/',
                        secure: true
                    }]);
                } catch (e) {}
            }
        }
        
        const page = await context.newPage();
        const url = `https://www.xiaohongshu.com/user/profile/${userId || searchQuery}`;
        
        console.log(`Navigating to: ${url}`);
        
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
            await page.waitForTimeout(10000);
        } catch (navError) {
            console.log(`Navigation error: ${navError.message}`);
        }
        
        // Get cookies from browser context to verify
        const browserCookies = await context.cookies();
        console.log(`Browser has ${browserCookies.length} cookies`);
        
        // Try to extract data
        const userData = await extractProfileData(page, userId || searchQuery);
        await browser.close();
        
        // If we got avatar but no nickname, try API with browser cookies
        if (!userData.nickname && userData.avatar) {
            const apiData = await fetchFromAPI(browserCookies.map(c => `${c.name}=${c.value}`).join('; '), userId);
            if (apiData && apiData.nickname) {
                return { success: true, data: apiData };
            }
        }
        
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

async function fetchFromAPI(cookieStr, userId) {
    return new Promise((resolve) => {
        // Try user info API - multiple endpoints
        const endpoints = [
            `/api/sns/web/v1/user_profile_info?user_id=${userId}&source=note_user_profile&image_formats=jpg,webp,avif`,
            `/api/sns/web/v1/user_profile?user_id=${userId}&source=pc_web`
        ];
        
        const tryEndpoint = (index) => {
            if (index >= endpoints.length) {
                resolve(null);
                return;
            }
            
            const path = endpoints[index];
            const options = {
                hostname: 'www.xiaohongshu.com',
                path: path,
                method: 'GET',
                headers: {
                    'Cookie': cookieStr,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': `https://www.xiaohongshu.com/user/profile/${userId}`,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Origin': 'https://www.xiaohongshu.com'
                }
            };
            
            console.log(`Trying API endpoint ${index + 1}: ${options.hostname}${path}`);
            
            const req = https.request(options, (res) => {
                let data = '';
                
                console.log(`API Response status: ${res.statusCode}`);
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    console.log(`API Response raw (first 500 chars): ${data.substring(0, 500)}`);
                    
                    try {
                        // Skip if response is HTML or redirect
                        if (data.trim().startsWith('<') || data.trim().startsWith('{') === false) {
                            console.log('Response is not JSON, trying next endpoint');
                            tryEndpoint(index + 1);
                            return;
                        }
                        
                        const json = JSON.parse(data);
                        
                        if (json.data?.user_info) {
                            const info = json.data.user_info;
                            resolve({
                                nickname: info.nickname || '',
                                userId: info.user_id || userId,
                                avatar: info.basic_info?.avatar || info.avatar || '',
                                description: info.description || '',
                                followers: info.interaction_data?.follower_count || '',
                                following: info.interaction_data?.following_count || '',
                                liked: info.interaction_data?.liked_count || '',
                                gender: info.gender || '',
                                location: info.location || ''
                            });
                            return;
                        }
                        
                        // Try alternative data structure
                        if (json.data?.nickname) {
                            resolve({
                                nickname: json.data.nickname || '',
                                userId: json.data.user_id || userId,
                                avatar: json.data.avatar || json.data.basic_info?.avatar || '',
                                description: json.data.description || '',
                                followers: json.data.follower_count || '',
                                following: json.data.following_count || '',
                                liked: json.data.liked_count || '',
                                gender: json.data.gender || '',
                                location: json.data.location || ''
                            });
                            return;
                        }
                        
                        tryEndpoint(index + 1);
                    } catch (e) {
                        console.log('API parse error:', e.message);
                        tryEndpoint(index + 1);
                    }
                });
            });
            
            req.on('error', (e) => {
                console.log('API request error:', e.message);
                tryEndpoint(index + 1);
            });
            
            req.setTimeout(10000, () => {
                req.destroy();
                tryEndpoint(index + 1);
            });
            
            req.end();
        };
        
        tryEndpoint(0);
    });
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
            
            // Method 1: Try __INITIAL_SSR_STATE__
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
                        } catch (e) {}
                    }
                }
            } catch (e) {}
            
            // Method 2: Try window.__INITIAL_STATE__
            if (!data.nickname) {
                try {
                    const stateMatch = document.body.innerHTML.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s);
                    if (stateMatch && stateMatch[1]) {
                        const state = JSON.parse(stateMatch[1]);
                        if (state.author) {
                            data.nickname = state.author.nickname || '';
                            data.avatar = state.author.avatar || state.author.image || '';
                            data.userId = state.author.userId || state.author.user_id || '';
                        }
                    }
                } catch (e) {}
            }
            
            // Method 3: DOM selectors for rendered content
            if (!data.nickname) {
                const nameSelectors = [
                    '.user-name',
                    '.profile-user-name',
                    '.author-name',
                    '.nickname',
                    'h1.title',
                    '[class*="user-name"]',
                    '[class*="author-name"]',
                    '[class*="nickname"]'
                ];
                
                for (const selector of nameSelectors) {
                    try {
                        const el = document.querySelector(selector);
                        if (el && el.textContent?.trim() && el.textContent.trim().length < 50) {
                            const text = el.textContent.trim();
                            if (!text.includes('{{') && !text.includes('undefined')) {
                                data.nickname = text;
                                break;
                            }
                        }
                    } catch (e) {}
                }
            }
            
            // Method 4: Get avatar from various sources
            if (!data.avatar) {
                const avatarSelectors = [
                    'img[class*="avatar"]',
                    '.user-avatar img',
                    '.author-avatar img',
                    '[class*="avatar"] img'
                ];
                
                for (const selector of avatarSelectors) {
                    try {
                        const el = document.querySelector(selector);
                        if (el && el.src && !el.src.includes('data:')) {
                            data.avatar = el.src;
                            break;
                        }
                    } catch (e) {}
                }
            }
            
            // Method 5: Stats from DOM
            const statsNodes = document.querySelectorAll('[class*="count"], [class*="num"]');
            for (const node of statsNodes) {
                const text = node.textContent?.trim() || '';
                if (text && !text.includes('{{')) {
                    if (text.includes('粉丝') && !data.followers) {
                        data.followers = text.replace(/粉丝/g, '').trim();
                    } else if (text.includes('关注') && !data.following) {
                        data.following = text.replace(/关注/g, '').trim();
                    } else if (text.includes('获赞') && !data.liked) {
                        data.liked = text.replace(/获赞/g, '').trim();
                    }
                }
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