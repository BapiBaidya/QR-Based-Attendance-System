import asyncio
import pytest
from app.core.database import engine


@pytest.fixture(autouse=True)
def cleanup_db_engine():
    """
    Disposes of the SQLAlchemy connection pool after each test so connections
    are not leaked across separate event loops.
    """
    yield
    try:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(engine.dispose())
        loop.close()
    except Exception:
        pass
