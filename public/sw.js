// 3선탄 통합관리 — 서비스워커 (오프라인 지원)
// 동일 출처(앱 셸/정적 자산)만 캐시한다. Supabase·CDN 등 교차 출처 요청은 건드리지 않는다.
// 전략: stale-while-revalidate (캐시 즉시 응답 + 백그라운드 갱신)
const CACHE = 'samseontan-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 교차 출처(Supabase/CDN)는 그대로 통과

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || (req.mode === 'navigate' ? cache.match('/') : undefined));
      return cached || network;
    })
  );
});
