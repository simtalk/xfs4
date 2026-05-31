const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ============================================
// 请在这里填写你的小红书Cookie
// ============================================
const BUILT_IN_COOKIE = 'gid=yjKD402fd4Wfyj24W2YdS2dDj2W91EYxEu6DvfuAqVyMIU28TE3CMd888qW428y8KDySWf0D; customerClientId=233169599715501; x-user-id-creator.xiaohongshu.com=5e91af5c00000000010002c2; a1=19d875ee8dfpm4nd9a6iosaehbc4jt5blzo4oeq2m50000399971; webId=470623b6d73fd91e53f2195440aefa14; abRequestId=470623b6d73fd91e53f2195440aefa14; ets=1780067153812; webBuild=6.13.7; customer-sso-sid=68c5176457192537115361327mfcuzjybaa4afl7; access-token-creator.xiaohongshu.com=customer.creator.AT-68c517645719253711536133pu4aq2zeduypa9j6; galaxy_creator_session_id=e2g1yT7o3obx5i9mqV8et5O3An6kTPzHvCaH; galaxy.creator.beaker.session.id=1780157735805065929011; xsecappid=xhs-pc-web; websectiga=82e85efc5500b609ac1166aaf086ff8aa4261153a448ef0be5b17417e4512f28; sec_poison_id=862bbd7f-c9d1-47c5-96d2-ece4cfb3a0cd; acw_tc=0a00d2a717802392684135727ebc18ba68d6682a83518bb0ad635f9c99c75d; loadts=1780239269620; web_session=040069b166876e56d597a30329384b23483a77; id_token=VjEAANYltQBtW1LnFG85gmO86xFVZIou++Yza5tJIajQ78MLPBJPvH4oQ4FPKnUxPfGEdFyac3ojFCyyLCrlDyEKxKBsnOXRgkXb3SfPnWpQ26NJKtOMziZKZaJPZuJdnSbaUAEZ; x-rednote-datactry=CN; x-rednote-holderctry=CN; unread={%22ub%22:%226a1b8ab5000000000803d479%22%2C%22ue%22:%226a0d40e4000000003501c572%22%2C%22uc%22:34}';

// Proxy configuration
const PROXY = {
    host: process.env.PROXY_HOST || '49.7.119.243',
    port: process.env.PROXY_PORT || '2022',
    username: process.env.PROXY_USER || 'xays31m1',
    password: process.env.PROXY_PASS || 'mPvkAeQ6'
};

// Read cookies from file if path is passed as argument
function parseCookiesArg(cookiesArg) {
    // If the argument is a file path
    if (fs.existsSync(cookiesArg)) {
        const content = fs.readFileSync(cookiesArg, 'utf-8').trim();
        // If file is empty, use built-in cookie
        if (!content) {
            console.log('Cookie file is empty, using built-in cookie');
            return BUILT_IN_COOKIE;
        }
        return content;
    }
    return cookiesArg;
}

async function fetchUserData(cookiesJson, searchQuery, searchType) {
    // Use proxy if configured
    const launchOptions = { 
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox'
        ]
    };
    
    // Add proxy to launch args if proxy is configured
    if (PROXY.host) {
        launchOptions.proxy = {
            server: `http://${PROXY.host}:${PROXY.port}`,
            username: PROXY.username,
            password: PROXY.password
        };
        console.log(`Using proxy: ${PROXY.host}:${PROXY.port}`);
    }
    
    const browser = await chromium.launch(launchOptions);
    
    try {
        // Parse cookies - could be string or array
        let cookies;
        if (!cookiesJson || cookiesJson.trim() === '') {
            // Use built-in cookie
            cookiesJson = BUILT_IN_COOKIE;
            console.log('Using built-in cookie');
        }
        
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
                try {
                    cookies = JSON.parse(cookiesJson);
                } catch (e) {
                    cookies = [];
                }
            }
        } else {
            cookies = cookiesJson || [];
        }
        
        console.log(`Parsed ${cookies.length} cookies`);
        
        console.log(`Fetching user data for: ${searchQuery} (type: ${searchType})`);
        
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
        
        let url;
        // Determine search type based on query format
        const isNumericId = /^\d+$/.test(searchQuery);
        const isUidFormat = /^[a-f0-9]{24,}$/i.test(searchQuery);
        
        if (isUidFormat) {
            // Looks like a UID - direct profile access
            url = `https://www.xiaohongshu.com/user/profile/${searchQuery}`;
        } else {
            // Treat as 小红书号 or keyword - use search page
            url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(searchQuery)}&type=51`;
        }
        
        console.log(`Navigating to: ${url}`);
        
        try {
            await page.goto(url, { waitUntil: 'load', timeout: 30000 });
            await page.waitForTimeout(3000);
        } catch (navError) {
            console.log(`Navigation error: ${navError.message}`);
        }
        
        let userData;
        if (isUidFormat) {
            userData = await extractProfileData(page, searchQuery);
        } else {
            // For search results, get top 10 users
            const results = await extractUsersFromSearch(page, searchQuery);
            
            // If looking for specific redId, filter to exact match
            if (isNumericId && results.length > 0) {
                const exactMatch = results.find(u => u.redId === searchQuery);
                if (exactMatch) {
                    // Get full profile for exact match
                    const profileUrl = `https://www.xiaohongshu.com/user/profile/${exactMatch.userId}`;
                    await page.goto(profileUrl, { waitUntil: 'load', timeout: 30000 });
                    await page.waitForTimeout(2000);
                    userData = await extractProfileData(page, exactMatch.userId);
                } else {
                    userData = results;
                }
            } else {
                userData = results;
            }
        }
        
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

async function extractProfileData(page, searchQuery) {
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
                redId: '',  // 小红书号
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
                                    data.redId = info.red_id || info.basic_info?.red_id || '';
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
                            data.redId = state.author.redId || '';
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
                if (parts[i].match(/^\d+$/) && parts[i+1] && parts[i+1].includes('红薯')) data.redId = parts[i];
            }
            
            return data;
        });
        
        userData.userId = searchQuery;
        console.log(`Extracted data:`, JSON.stringify(userData));
        
        if (!userData.nickname && !userData.avatar) {
            return { 
                userId: searchQuery,
                error: '未获取到用户信息，可能需要登录或Cookie已过期',
                hint: '请确保Cookie有效且包含登录凭证'
            };
        }
        
        return userData;
        
    } catch (error) {
        return { error: error.message, userId: searchQuery };
    }
}

// Extract multiple users from search results (up to 10)
async function extractUsersFromSearch(page, searchQuery) {
    try {
        const users = await page.evaluate(() => {
            const results = [];
            const seenIds = new Set();
            
            // Try to find user data from __INITIAL_STATE__ or scripts first
            const scripts = document.querySelectorAll('script');
            
            for (const script of scripts) {
                const text = script.textContent || '';
                if (text.includes('userId') || text.includes('nickname')) {
                    // Try to find user data in script
                    const match = text.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s);
                    if (match) {
                        try {
                            const state = JSON.parse(match[1]);
                            // Look for user notes in state
                            const items = state.noteList || state.feeds?.notes || state.feeds || [];
                            for (const item of items.slice(0, 15)) {
                                const user = item.user || item.author || item;
                                if (user && user.userId && !seenIds.has(user.userId)) {
                                    seenIds.add(user.userId);
                                    results.push({
                                        nickname: user.nickname || user.name || '',
                                        userId: user.userId || '',
                                        avatar: user.avatar || '',
                                        redId: user.redId || user.basicInfo?.redId || ''
                                    });
                                }
                            }
                        } catch (e) {}
                    }
                }
            }
            
            // Also try to find from page data attributes
            if (results.length === 0) {
                const cards = document.querySelectorAll('[data-user-id], [data-author-id]');
                cards.forEach(card => {
                    const userId = card.dataset.userId || card.dataset.authorId;
                    const img = card.querySelector('img');
                    const name = card.querySelector('[class*="name"], h3, h4, .nickname');
                    
                    if (userId && !seenIds.has(userId)) {
                        seenIds.add(userId);
                        results.push({
                            nickname: name?.textContent?.trim() || '',
                            userId: userId,
                            avatar: img?.src || img?.dataset.src || '',
                            redId: ''
                        });
                    }
                });
            }
            
            // Try to get from note card links
            if (results.length < 3) {
                const links = document.querySelectorAll('a[href*="/user/profile/"]');
                links.forEach(link => {
                    const href = link.href;
                    const match = href.match(/\/user\/profile\/([a-f0-9]+)/i);
                    if (match) {
                        const userId = match[1];
                        if (!seenIds.has(userId)) {
                            seenIds.add(userId);
                            const img = link.querySelector('img') || link.closest('[class*="card"]')?.querySelector('img');
                            const name = link.querySelector('[class*="name"], h3, h4');
                            
                            results.push({
                                nickname: name?.textContent?.trim() || '用户' + userId.substring(0, 6),
                                userId: userId,
                                avatar: img?.src || img?.dataset.src || '',
                                redId: ''
                            });
                        }
                    }
                });
            }
            
            return results.slice(0, 10);
        });
        
        console.log(`Found ${users.length} unique users in search results`);
        return users;
        
    } catch (error) {
        console.log(`Search extraction error: ${error.message}`);
        return [];
    }
}

// Extract single user from search results - returns first result
async function extractUserFromSearch(page, searchQuery) {
    const users = await extractUsersFromSearch(page, searchQuery);
    return users.length > 0 ? users[0] : { nickname: '', userId: '', avatar: '' };
}

// Main entry point
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node scraper.js [cookies_or_file] <search_query> <search_type(id|username)>');
    console.error('If no cookies provided, built-in cookie will be used.');
    process.exit(1);
}

const cookiesArg = args[0];
const searchQuery = args[1];
const searchType = args[2] || 'id';

const cookiesJson = parseCookiesArg(cookiesArg);

fetchUserData(cookiesJson, searchQuery, searchType)
    .then(result => {
        // Only output the final JSON result, no debug logs
        console.log(JSON.stringify(result));
        process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
        console.error(JSON.stringify({ success: false, error: error.message }));
        process.exit(1);
    });