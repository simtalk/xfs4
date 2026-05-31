<?php

require_once __DIR__ . '/../vendor/autoload.php';

use App\XhsScraper;
use App\Router;

// Set headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$scraper = new XhsScraper();
$router = new Router();

// Home route
$router->get('/', function() {
    $baseDir = __DIR__ . '/..';
    readfile($baseDir . '/templates/index.html');
});

// Set cookies
$router->post('/api/cookies', function() use ($scraper) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['cookies'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '缺少cookies参数']);
        return;
    }
    
    if ($scraper->saveCookies($input['cookies'])) {
        echo json_encode(['success' => true, 'message' => 'Cookie保存成功']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Cookie保存失败']);
    }
});

// Get cookies status
$router->get('/api/cookies', function() use ($scraper) {
    $cookies = $scraper->getCookies();
    
    echo json_encode([
        'success' => true,
        'hasCookies' => $cookies !== null,
        'count' => $cookies ? count($cookies) : 0
    ]);
});

// Clear cookies
$router->delete('/api/cookies', function() use ($scraper) {
    if ($scraper->clearCookies()) {
        echo json_encode(['success' => true, 'message' => 'Cookie已清除']);
    } else {
        echo json_encode(['success' => false, 'error' => 'Cookie清除失败']);
    }
});

// Search user by username
$router->post('/api/search/username', function() use ($scraper) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['username'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '缺少用户名参数']);
        return;
    }
    
    // Try to get saved cookies first, then fallback to provided cookies
    $cookies = $scraper->getCookies();
    if (!$cookies && isset($input['cookies'])) {
        $cookies = json_decode($input['cookies'], true);
    }
    
    if (!$cookies) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '请先设置Cookie']);
        return;
    }
    
    $result = $scraper->searchUser(json_encode($cookies), $input['username'], 'username');
    echo json_encode($result);
});

// Search user by ID
$router->post('/api/search/id', function() use ($scraper) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['userId'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '缺少用户ID参数']);
        return;
    }
    
    // Try to get saved cookies first, then fallback to provided cookies
    $cookies = $scraper->getCookies();
    if (!$cookies && isset($input['cookies'])) {
        $cookies = json_decode($input['cookies'], true);
    }
    
    if (!$cookies) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => '请先设置Cookie']);
        return;
    }
    
    $result = $scraper->searchUser(json_encode($cookies), $input['userId'], 'id');
    echo json_encode($result);
});

// Dispatch request
$router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);