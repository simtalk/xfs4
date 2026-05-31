# 小红书用户数据查询工具

一个基于 PHP + Playwright 的网页应用，用于获取小红书用户数据。

## 功能特点

- 🔐 Cookie 管理 - 前端手动输入小红书 Cookie（JSON格式）
- 🔍 按用户名搜索 - 输入小红书用户名检索用户
- 🏷️ 按 UID 搜索 - 直接输入用户 ID 访问个人主页
- 📊 用户信息展示 - 显示头像、昵称、UID、粉丝数、关注数、获赞数等

## 技术栈

- PHP 8.0+ (后端 API)
- Node.js + Playwright (浏览器自动化)
- HTML/CSS/JavaScript (前端界面)

## 安装

```bash
# 安装 PHP 依赖
composer install

# 安装 Node.js 依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium
```

## 运行

```bash
php -S localhost:8080 -t public
```

然后访问 http://localhost:8080/

## 使用步骤

1. 打开浏览器开发者工具（F12）
2. 登录小红书官网 (https://www.xiaohongshu.com)
3. 在开发者工具的 Application/Network 中找到 Cookie
4. 复制 Cookie（格式为 JSON 数组）
5. 粘贴到页面中，点击"保存Cookie"
6. 输入用户名或 UID 进行搜索

## 项目结构

```
├── templates/index.html     # 前端页面
├── public/index.php         # API 入口
├── src/
│   ├── XhsScraper.php       # 爬虫核心类
│   └── Router.php           # 路由处理
├── scraper.js               # Playwright 脚本
├── package.json             # Node 依赖
└── composer.json            # PHP 依赖
```

## 注意事项

- 请确保已安装 Chrome/Chromium 浏览器
- Cookie 有效期为 7 天，过期后需重新设置
- 请遵守小红书的使用条款和隐私政策