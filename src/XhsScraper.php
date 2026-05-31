<?php

namespace App;

class XhsScraper
{
    private string $scraperPath;
    private string $dataPath;
    
    public function __construct(string $scraperPath = null, string $dataPath = null)
    {
        $this->scraperPath = $scraperPath ?? dirname(__DIR__) . '/scraper.js';
        $this->dataPath = $dataPath ?? dirname(__DIR__) . '/data';
    }
    
    /**
     * Search for user by username or ID
     */
    public function searchUser(string $cookies, string $query, string $type = 'username'): array
    {
        // Validate search type
        $searchType = in_array($type, ['username', 'id']) ? $type : 'username';
        
        // Build command - pass cookies as file to avoid escaping issues
        $dataDir = $this->dataPath;
        if (!is_dir($dataDir)) {
            mkdir($dataDir, 0755, true);
        }
        
        $cookieFile = $dataDir . '/temp_cookies_' . uniqid() . '.txt';
        
        // If cookies is USE_BUILT_IN, write empty file (scraper will use built-in)
        // Otherwise write the cookies to file
        if ($cookies === 'USE_BUILT_IN' || empty(trim($cookies))) {
            file_put_contents($cookieFile, '');
        } else {
            file_put_contents($cookieFile, $cookies);
        }
        
        $command = sprintf(
            'timeout 60 xvfb-run -a node %s %s %s %s 2>&1',
            escapeshellarg($this->scraperPath),
            escapeshellarg($cookieFile),
            escapeshellarg($query),
            escapeshellarg($searchType)
        );
        
        $output = shell_exec($command);
        
        // Clean up temp file
        @unlink($cookieFile);
        
        if ($output === null) {
            return ['success' => false, 'error' => '执行爬虫失败，请检查Node.js是否正确安装'];
        }
        
        // Filter out debug logs, keep only JSON output
        $output = trim($output);
        
        // If output contains multiple lines, find the JSON part
        if (strpos($output, "\n") !== false || strpos($output, "\r") !== false) {
            $lines = preg_split('/[\r\n]+/', $output);
            foreach ($lines as $line) {
                $line = trim($line);
                // Skip debug logs
                if (preg_match('/^(Using|Error|Page|Fetching|Stealth|Navigating|Parsed|Extracted|Cookie)/', $line)) {
                    continue;
                }
                // Found JSON line
                if (strpos($line, '{') === 0 || strpos($line, '[') === 0) {
                    $output = $line;
                    break;
                }
            }
        }
        
        if (empty(trim($output))) {
            return ['success' => false, 'error' => '爬虫无有效输出'];
        }
        
        // Check if output starts with { or [
        $trimmed = trim($output);
        if (strpos($trimmed, '{') !== 0 && strpos($trimmed, '[') !== 0) {
            return [
                'success' => false, 
                'error' => '爬虫执行失败: ' . substr($output, 0, 500)
            ];
        }
        
        $result = json_decode($output, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'success' => false, 
                'error' => '解析结果失败: ' . substr($output, 0, 500)
            ];
        }
        
        return $result;
    }
    
    /**
     * Save cookies to session file
     */
    public function saveCookies(string $cookies): bool
    {
        $sessionFile = $this->getSessionFile();
        
        try {
            $data = json_decode($cookies, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                return false;
            }
            
            $session = [
                'cookies' => $data,
                'created_at' => time(),
                'expires_at' => time() + (7 * 24 * 60 * 60)
            ];
            
            return file_put_contents($sessionFile, json_encode($session, JSON_UNESCAPED_UNICODE)) !== false;
        } catch (\Exception $e) {
            return false;
        }
    }
    
    /**
     * Get saved cookies
     */
    public function getCookies(): ?array
    {
        $sessionFile = $this->getSessionFile();
        
        if (!file_exists($sessionFile)) {
            return null;
        }
        
        $content = file_get_contents($sessionFile);
        $session = json_decode($content, true);
        
        if (!$session || !isset($session['cookies'])) {
            return null;
        }
        
        if (isset($session['expires_at']) && $session['expires_at'] < time()) {
            unlink($sessionFile);
            return null;
        }
        
        return $session['cookies'];
    }
    
    /**
     * Clear cookies
     */
    public function clearCookies(): bool
    {
        $sessionFile = $this->getSessionFile();
        
        if (file_exists($sessionFile)) {
            return unlink($sessionFile);
        }
        
        return true;
    }
    
    private function getSessionFile(): string
    {
        $dir = $this->dataPath;
        
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        
        return $dir . '/session.json';
    }
}