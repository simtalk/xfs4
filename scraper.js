const { chromium } = require('playwright');

async function fetchUserData(cookiesJson, searchQuery, searchType) {
    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox'
        ]
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
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
            url = `https://www.xiaohongshu.com/user/profile/${searchQuery}`;
        } else {
            url = `https://www.xiaohongshu.com/user/profile/${searchQuery}`;
        }
        
        console.log(`Navigating to: ${url}`);
        
        // Navigate with better error handling
        try {
            await page.goto(url, { 
                waitUntil: 'load',
                timeout: 30000 
            });
            
            // Wait for page to stabilize
            await page.waitForTimeout(5000);
            
            // Try to wait for any dynamic content
            try {
                await page.waitForFunction(() => {
                    return document.querySelector('#detail-app') !== null || 
                           document.querySelector('.user-detail') !== null ||
                           document.querySelector('[data-v-sm]') !== null ||
                           document.body.innerHTML.length > 10000;
                }, { timeout: 10000 }).catch(() => {});
            } catch (e) {}
            
        } catch (navError) {
            console.log(`Navigation error: ${navError.message}`);
        }
        
        // Wait additional time for JS to render
        await page.waitForTimeout(3000);
        
        let userData = {};
        
        if (searchType === 'id') {
            userData = await extractProfileData(page, searchQuery);
        } else {
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
        // Check for page content
        let html = '';
        try {
            html = await page.content();
        } catch (e) {
            console.log('Could not get page content');
        }
        
        console.log(`Page HTML length: ${html.length}`);
        
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
            
            // Method 1: Try __INITIAL_SSR_STATE__
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
            
            // Method 3: Try data from script tags
            if (!data.nickname) {
                try {
                    const allScripts = document.querySelectorAll('script[type="application/json"]');
                    for (const script of allScripts) {
                        try {
                            const jsonData = JSON.parse(script.textContent);
                            if (jsonData.nickname || jsonData.author?.nickname) {
                                data.nickname = jsonData.nickname || jsonData.author?.nickname || '';
                                data.avatar = jsonData.avatar || jsonData.author?.avatar || '';
                                data.userId = jsonData.userId || jsonData.user_id || '';
                                break;
                            }
                        } catch (e) {}
                    }
                } catch (e) {}
            }
            
            // Method 4: Try React component data
            if (!data.nickname) {
                const reactRoot = document.querySelector('#detail-app, [id*="app"], [data-v-sm]');
                if (reactRoot) {
                    // Check for data in parent elements
                    let el = reactRoot;
                    while (el && el !== document.body) {
                        const parent = el.parentElement;
                        if (parent) {
                            const dataAttr = parent.getAttribute('data-props') || 
                                           parent.getAttribute('data-state') ||
                                           parent.getAttribute('data-init');
                            if (dataAttr) {
                                try {
                                    const parsed = JSON.parse(dataAttr);
                                    data.nickname = parsed.nickname || parsed.author?.nickname || '';
                                    data.avatar = parsed.avatar || parsed.author?.avatar || '';
                                    if (data.nickname) break;
                                } catch (e) {}
                            }
                        }
                        el = parent;
                    }
                }
            }
            
            // Method 5: DOM selectors for rendered content
            if (!data.nickname) {
                const nameSelectors = [
                    '.user-name',
                    '.profile-user-name',
                    '.author-name',
                    '.nickname',
                    'h1.title',
                    '.user-info-name',
                    '[class*="user-name"]',
                    '[class*="author-name"]',
                    '[class*="nickname"]',
                    'div[class*="name"] span',
                    '.info-name'
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
            
            // Method 6: Get avatar from various sources
            if (!data.avatar) {
                const avatarSelectors = [
                    'img[class*="avatar"]',
                    '.user-avatar img',
                    '.author-avatar img',
                    '.profile-avatar img',
                    'img[alt*="头像"]',
                    '[class*="avatar"] img'
                ];
                
                for (const selector of avatarSelectors) {
                    try {
                        const el = document.querySelector(selector);
                        if (el && el.src && !el.src.includes('data:') && !el.src.includes('placeholder')) {
                            data.avatar = el.src;
                            break;
                        }
                    } catch (e) {}
                }
            }
            
            // Method 7: Get from meta tags
            if (!data.avatar) {
                const ogImage = document.querySelector('meta[property="og:image"]');
                if (ogImage) {
                    data.avatar = ogImage.content;
                }
            }
            
            // Method 8: Stats from DOM
            const statsNodes = document.querySelectorAll('[class*="count"], [class*="num"], [class*="stat"]');
            for (const node of statsNodes) {
                const text = node.textContent?.trim() || '';
                if (text && !text.includes('{{')) {
                    if (text.includes('粉丝') && !data.followers) {
                        data.followers = text.replace(/粉丝/g, '').trim();
                    } else if (text.includes('关注') && !data.following) {
                        data.following = text.replace(/关注/g, '').trim();
                    } else if ((text.includes('获赞') || text.includes('点赞')) && !data.liked) {
                        data.liked = text.replace(/获赞/g, '').replace(/点赞/g, '').trim();
                    }
                }
            }
            
            // Get numbers from specific spans
            const numberSpans = document.querySelectorAll('span[class*="number"], span[class*="count"]');
            numberSpans.forEach(span => {
                const text = span.textContent?.trim() || '';
                const parent = span.closest('[class*="stat"]') || span.parentElement;
                const parentText = parent?.textContent?.trim() || '';
                
                if (parentText.includes('粉丝') && !data.followers) {
                    data.followers = text;
                } else if (parentText.includes('关注') && !data.following) {
                    data.following = text;
                } else if (parentText.includes('赞') && !data.liked) {
                    data.liked = text;
                }
            });
            
            return data;
        });
        
        userData.userId = userId;
        
        console.log(`Extracted data:`, JSON.stringify(userData));
        
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