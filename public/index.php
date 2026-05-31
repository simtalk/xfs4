<?php

require_once __DIR__ . '/../vendor/autoload.php';

use App\XhsScraper;
use App\Router;

$scraper = new XhsScraper();
$router = new Router();

// Helper function to save cookies (handles both raw string and JSON)
function saveCookiesHelper($scraper, $cookiesStr) {
    $cookiesStr = trim($cookiesStr);
    
    // If it's raw cookie string (contains = but doesn't start with [)
    if (strpos($cookiesStr, '=') !== false && strpos($cookiesStr, '[') !== 0) {
        // Parse raw cookie string to JSON format
        $cookies = [];
        $pairs = explode(';', $cookiesStr);
        foreach ($pairs as $pair) {
            $pair = trim($pair);
            if (strpos($pair, '=') !== false) {
                list($name, $value) = explode('=', $pair, 2);
                $cookies[] = [
                    'name' => trim($name),
                    'value' => trim($value),
                    'domain' => '.xiaohongshu.com',
                    'path' => '/'
                ];
            }
        }
        return $scraper->saveCookies(json_encode($cookies));
    }
    
    // It's already JSON
    return $scraper->saveCookies($cookiesStr);
}

// Helper function to get cookies for search (returns raw string)
function getCookiesForSearch($scraper) {
    $cookies = $scraper->getCookies();
    if (!$cookies) {
        return null;
    }
    
    // Convert JSON cookies back to raw string for scraper
    $parts = [];
    foreach ($cookies as $c) {
        $parts[] = $c['name'] . '=' . $c['value'];
    }
    return implode('; ', $parts);
}

// Home route
$router->get('/', function() {
    readfile(__DIR__ . '/../templates/index.html');
});

// Set cookies
$router->post('/api/cookies', function() use ($scraper) {
    header('Content-Type: application/json; charset=utf-8');
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['cookies'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '缺少cookies参数']);
        return;
    }
    
    if (saveCookiesHelper($scraper, $input['cookies'])) {
        echo json_encode(['success' => true, 'message' => 'Cookie保存成功']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Cookie保存失败']);
    }
});

// Get cookies status
$router->get('/api/cookies', function() use ($scraper) {
    header('Content-Type: application/json; charset=utf-8');
    $cookies = $scraper->getCookies();
    
    echo json_encode([
        'success' => true,
        'hasCookies' => $cookies !== null,
        'count' => $cookies ? count($cookies) : 0
    ]);
});

// Clear cookies
$router->delete('/api/cookies', function() use ($scraper) {
    header('Content-Type: application/json; charset=utf-8');
    if ($scraper->clearCookies()) {
        echo json_encode(['success' => true, 'message' => 'Cookie已清除']);
    } else {
        echo json_encode(['success' => false, 'error' => 'Cookie清除失败']);
    }
});

// Search user by username
$router->post('/api/search/username', function() use ($scraper) {
    header('Content-Type: application/json; charset=utf-8');
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['username'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '缺少用户名参数']);
        return;
    }
    
    // Get saved cookies as raw string
    $cookies = getCookiesForSearch($scraper);
    
    // If no saved cookies, try to use provided cookies
    if (!$cookies && isset($input['cookies'])) {
        $cookies = $input['cookies'];
    }
    
    if (!$cookies) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '请先设置Cookie']);
        return;
    }
    
    $result = $scraper->searchUser($cookies, $input['username'], 'username');
    echo json_encode($result);
});

// Search user by ID
$router->post('/api/search/id', function() use ($scraper) {
    header('Content-Type: application/json; charset=utf-8');
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['userId'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '缺少用户ID参数']);
        return;
    }
    
    // Get saved cookies as raw string
    $cookies = getCookiesForSearch($scraper);
    
    // If no saved cookies, try to use provided cookies
    if (!$cookies && isset($input['cookies'])) {
        $cookies = $input['cookies'];
    }
    
    if (!$cookies) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '请先设置Cookie']);
        return;
    }
    
    $result = $scraper->searchUser($cookies, $input['userId'], 'id');
    echo json_encode($result);
});

// Dispatch request
$router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);
