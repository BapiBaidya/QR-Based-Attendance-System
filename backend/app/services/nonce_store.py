import asyncio
import logging
import multiprocessing
from typing import Optional
from cachetools import TTLCache
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)


class NonceStore:
    """
    Production-grade single-use Nonce manager.
    - Uses Redis when available.
    - Automatically falls back to a thread-safe, auto-expiring in-memory TTLCache
      so memory is automatically purged after the 30-second expiry window.
    """

    def __init__(self):
        self._memory_cache = TTLCache(maxsize=50_000, ttl=settings.QR_EXPIRY_SECONDS + 15)
        self._lock = asyncio.Lock()
        self._redis_client: Optional[aioredis.Redis] = None

    async def _get_redis(self) -> Optional[aioredis.Redis]:
        if self._redis_client is None and settings.REDIS_URL:
            try:
                client = aioredis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=0.5
                )
                await client.ping()
                self._redis_client = client
                logger.info("NonceStore: Connected to Redis successfully.")
            except Exception:
                worker_count = multiprocessing.cpu_count()
                if worker_count > 1:
                    logger.warning(
                        "NonceStore: Redis unavailable. Falling back to in-memory TTLCache. "
                        "WARNING: In-memory cache is NOT shared across multiple Uvicorn workers. "
                        "QR replay protection may be bypassed in multi-worker deployments. "
                        "Set REDIS_URL in your .env to enable Redis for production use."
                    )
                else:
                    logger.info("NonceStore: Redis not available, using in-memory TTLCache (safe for single worker).")
                self._redis_client = None
        return self._redis_client

    async def burn_nonce(self, nonce: str) -> bool:
        """
        Attempts to atomically burn a nonce.
        Returns:
            True if nonce was fresh and successfully burned.
            False if nonce was already burned (replay detected).
        """
        redis = await self._get_redis()
        ttl_seconds = settings.QR_EXPIRY_SECONDS + settings.QR_DRIFT_TOLERANCE_SECONDS + 5

        if redis:
            try:
                # Atomic SETNX with TTL in Redis
                was_set = await redis.set(f"qr:nonce:{nonce}", "1", ex=ttl_seconds, nx=True)
                return bool(was_set)
            except Exception:
                # If Redis connection drops, fallback to in-memory cache
                pass

        async with self._lock:
            if nonce in self._memory_cache:
                return False
            self._memory_cache[nonce] = True
            return True


nonce_store = NonceStore()
