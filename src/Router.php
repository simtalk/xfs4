<?php

namespace App;

class Router
{
    private array $routes = [];
    
    public function get(string $path, callable $handler): self
    {
        $this->routes['GET'][$path] = $handler;
        return $this;
    }
    
    public function post(string $path, callable $handler): self
    {
        $this->routes['POST'][$path] = $handler;
        return $this;
    }
    
    public function delete(string $path, callable $handler): self
    {
        $this->routes['DELETE'][$path] = $handler;
        return $this;
    }
    
    public function dispatch(string $method, string $uri): mixed
    {
        $method = strtoupper($method);
        
        if (!isset($this->routes[$method])) {
            return $this->notFound();
        }
        
        // Remove query string
        $path = parse_url($uri, PHP_URL_PATH);
        
        foreach ($this->routes[$method] as $route => $handler) {
            $pattern = $this->convertToRegex($route);
            if (preg_match($pattern, $path, $matches)) {
                array_shift($matches);
                return call_user_func_array($handler, $matches);
            }
        }
        
        return $this->notFound();
    }
    
    private function convertToRegex(string $route): string
    {
        $pattern = preg_replace('/\{([a-zA-Z_]+)\}/', '(?P<$1>[^/]+)', $route);
        return '#^' . $pattern . '$#';
    }
    
    private function notFound(): void
    {
        http_response_code(404);
        echo json_encode(['error' => 'Not Found']);
    }
}