// SkidSpace Service Worker - PWA Functionality
const CACHE_NAME = 'skidspace-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/dashboard',
  '/mobile/scan',
  '/mobile/find',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Network-first resources (API calls, dynamic content)
const NETWORK_FIRST_PATTERNS = [
  /^https:\/\/api\.skidspace\.com/,
  /\/api\//,
  /\/auth\//,
  /\/stripe\//,
  /\/webhook\//
];

// Cache-first resources (static assets)
const CACHE_FIRST_PATTERNS = [
  /\.(?:js|css|html|png|jpg|jpeg|svg|gif|webp|woff|woff2)$/,
  /\/icons\//,
  /\/static\//,
  /\/_next\/static\//
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('[SW] Precaching assets...');
        await cache.addAll(PRECACHE_ASSETS);
        console.log('[SW] Assets cached successfully');

        // Skip waiting to activate immediately
        await self.skipWaiting();
      } catch (error) {
        console.error('[SW] Failed to cache assets:', error);
      }
    })()
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    (async () => {
      try {
        // Clean up old caches
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );

        // Take control of all clients
        await self.clients.claim();
        console.log('[SW] Service worker activated');
      } catch (error) {
        console.error('[SW] Activation failed:', error);
      }
    })()
  );
});

// Fetch event - handle requests with appropriate strategies
self.addEventListener('fetch', (event) => {
  // Skip non-HTTP requests
  if (!event.request.url.startsWith('http')) return;

  // Skip POST requests for caching
  if (event.request.method !== 'GET') {
    // Handle POST requests (API calls) with network-only strategy
    if (isNetworkFirstPattern(event.request.url)) {
      event.respondWith(handleNetworkOnly(event.request));
    }
    return;
  }

  event.respondWith(handleRequest(event.request));
});

// Handle different caching strategies
async function handleRequest(request) {
  const url = request.url;

  try {
    // Network-first strategy for API calls
    if (isNetworkFirstPattern(url)) {
      return await handleNetworkFirst(request);
    }

    // Cache-first strategy for static assets
    if (isCacheFirstPattern(url)) {
      return await handleCacheFirst(request);
    }

    // Default: Stale-while-revalidate for HTML pages
    return await handleStaleWhileRevalidate(request);

  } catch (error) {
    console.error('[SW] Request handling failed:', error);
    return handleOffline(request);
  }
}

// Network-first strategy (for API calls)
async function handleNetworkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline response for failed API calls
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'This action requires an internet connection.'
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Cache-first strategy (for static assets)
async function handleCacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // Update cache in background
    updateCacheInBackground(request);
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first failed:', error);
    throw error;
  }
}

// Stale-while-revalidate strategy (for HTML pages)
async function handleStaleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Start network request regardless of cache status
  const networkPromise = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse.ok) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch((error) => {
      console.log('[SW] Network failed:', error);
      return null;
    });

  // Return cached version immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }

  // Wait for network if no cache
  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  throw new Error('No cached version and network failed');
}

// Handle network-only requests (POST, PUT, DELETE)
async function handleNetworkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.error('[SW] Network-only request failed:', error);
    return new Response(
      JSON.stringify({
        error: 'Network Error',
        message: 'Unable to complete request. Please check your connection.'
      }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Handle offline scenarios
async function handleOffline(request) {
  // For navigation requests, return offline page
  if (request.mode === 'navigate') {
    const offlineResponse = await caches.match(OFFLINE_URL);
    return offlineResponse || new Response('Offline', { status: 503 });
  }

  // For other requests, return error
  return new Response('Offline', { status: 503 });
}

// Update cache in background
function updateCacheInBackground(request) {
  fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response);
      }
    })
    .catch(() => {
      // Silently fail background updates
    });
}

// Pattern matching helpers
function isNetworkFirstPattern(url) {
  return NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url));
}

function isCacheFirstPattern(url) {
  return CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url));
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'inventory-sync') {
    event.waitUntil(syncInventoryData());
  } else if (event.tag === 'user-actions-sync') {
    event.waitUntil(syncUserActions());
  }
});

// Sync inventory data when back online
async function syncInventoryData() {
  try {
    console.log('[SW] Syncing inventory data...');

    // Get stored offline data
    const db = await openIndexedDB();
    const offlineData = await getOfflineInventoryData(db);

    if (offlineData.length > 0) {
      // Send to server
      const response = await fetch('/api/inventory/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: offlineData })
      });

      if (response.ok) {
        // Clear synced data
        await clearSyncedInventoryData(db, offlineData);
        console.log('[SW] Inventory sync completed');

        // Notify clients
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SYNC_COMPLETE', data: 'inventory' });
          });
        });
      }
    }
  } catch (error) {
    console.error('[SW] Inventory sync failed:', error);
  }
}

// Sync user actions when back online
async function syncUserActions() {
  try {
    console.log('[SW] Syncing user actions...');

    const db = await openIndexedDB();
    const pendingActions = await getPendingUserActions(db);

    if (pendingActions.length > 0) {
      for (const action of pendingActions) {
        try {
          const response = await fetch(action.endpoint, {
            method: action.method,
            headers: action.headers,
            body: action.body
          });

          if (response.ok) {
            await removePendingAction(db, action.id);
          }
        } catch (error) {
          console.error('[SW] Failed to sync action:', action.id, error);
        }
      }

      console.log('[SW] User actions sync completed');
    }
  } catch (error) {
    console.error('[SW] User actions sync failed:', error);
  }
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);

  const options = {
    body: 'New warehouse activity requires your attention',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    tag: 'warehouse-notification',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Details',
        icon: '/icons/action-view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/action-dismiss.png'
      }
    ]
  };

  if (event.data) {
    try {
      const notificationData = event.data.json();
      options.title = notificationData.title || 'SkidSpace Notification';
      options.body = notificationData.body || options.body;
      options.data = { ...options.data, ...notificationData.data };
    } catch (error) {
      console.error('[SW] Failed to parse push data:', error);
      options.title = 'SkidSpace Notification';
    }
  } else {
    options.title = 'SkidSpace Notification';
  }

  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click received:', event);

  event.notification.close();

  const urlToOpen = event.action === 'view'
    ? '/dashboard/notifications'
    : '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }

      // Open new window if app not open
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// IndexedDB helpers for offline storage
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('skidspace-offline', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('inventory')) {
        db.createObjectStore('inventory', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('actions')) {
        db.createObjectStore('actions', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function getOfflineInventoryData(db) {
  const transaction = db.transaction(['inventory'], 'readonly');
  const store = transaction.objectStore('inventory');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getPendingUserActions(db) {
  const transaction = db.transaction(['actions'], 'readonly');
  const store = transaction.objectStore('actions');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function clearSyncedInventoryData(db, syncedData) {
  const transaction = db.transaction(['inventory'], 'readwrite');
  const store = transaction.objectStore('inventory');

  for (const item of syncedData) {
    store.delete(item.id);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function removePendingAction(db, actionId) {
  const transaction = db.transaction(['actions'], 'readwrite');
  const store = transaction.objectStore('actions');

  return new Promise((resolve, reject) => {
    const request = store.delete(actionId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

console.log('[SW] Service worker script loaded');