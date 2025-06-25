// Draw Party Service Worker
// Enables offline play after first load

const CACHE_NAME = 'draw-party-v1';
const CACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json'
    // Skip CDN resources for local development to avoid CORS issues
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching files');
                // For local development, only cache local files
                return cache.addAll(CACHE_URLS).catch((error) => {
                    console.log('Service Worker: Some files failed to cache (expected in local dev):', error);
                    return Promise.resolve(); // Don't fail the installation
                });
            })
            .catch((error) => {
                console.error('Service Worker: Cache failed', error);
            })
    );
    
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    
    // Claim any clients immediately
    self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip PeerJS server requests - these need to be online
    if (event.request.url.includes('peerjs-server') || 
        event.request.url.includes('peerjs.com') ||
        event.request.url.includes('herokuapp.com')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // Return cached version if available
                if (cachedResponse) {
                    console.log('Service Worker: Serving from cache', event.request.url);
                    return cachedResponse;
                }
                
                // Otherwise fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Don't cache if not a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone the response
                        const responseToCache = response.clone();
                        
                        // Add to cache for future use
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch((error) => {
                        console.error('Service Worker: Fetch failed', error);
                        
                        // If it's a navigation request and we're offline, 
                        // return the cached index.html
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }
                        
                        throw error;
                    });
            })
    );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Background sync for reconnecting to games
self.addEventListener('sync', (event) => {
    if (event.tag === 'reconnect-game') {
        event.waitUntil(
            // Attempt to reconnect to the game
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({
                        type: 'RECONNECT_GAME'
                    });
                });
            })
        );
    }
});

// Handle push notifications (for future features)
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data: data.data,
        actions: [
            {
                action: 'join',
                title: 'Join Game',
                icon: '/icon-192.png'
            },
            {
                action: 'dismiss',
                title: 'Dismiss'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'join') {
        // Open the game
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

console.log('Service Worker: Loaded');