<?php

namespace App;

class XhsScraper
{
    private string $scraperPath;
    
    public function __construct(string $scraperPath = null)
    {
        $this->scraperPath = $scraperPath ?? dirname(__DIR__) . '/scraper.js';
    }
    
    /**
     * Search for user by username or ID
     */
    public function searchUser(string $cookies, string $query, string $type = 'username'): array
    {
        if (empty($cookies)) {
            return ['success' => false, 'error' => '请先输入Cookie'];
        }
        
        // Validate cookies JSON
        $decodedCookies = json_decode($cookies, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return ['success' => false, 'error' => 'Cookie格式错误，请检查JSON格式'];
        }
        
        // Validate search type
        $searchType = in_array($type, ['username', 'id']) ? $type : 'username';
        
        // Escape the cookies for command line
        $escapedCookies = escapeshellarg($cookies);
        $escapedQuery = escapeshellarg($query);
        $escapedType = escapeshellarg($searchType);
        
        $command = sprintf(
            'node %s %s %s %s 2>&1',
            escapeshellarg($this->scraperPath),
            $escapedCookies,
            $escapedQuery,
            $escapedType
        );
        
        $output = shell_exec($command);
        
        if ($output === null) {
            return ['success' => false, 'error' => '执行爬虫失败'];
        }
        
        $result = json_decode($output, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            return [
                'success' => false, 
                'error' => '解析结果失败: ' . ($output ?: '未知错误')
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
                'expires_at' => time() + (7 * 24 * 60 * 60) // 7 days
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
        
        // Check expiration
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
        $dir = dirname(__DIR__) . '/data';
        
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        
        return $dir . '/session.json';
    }
}