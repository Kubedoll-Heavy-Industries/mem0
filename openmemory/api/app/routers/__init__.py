from .apps import router as apps_router
from .backup import router as backup_router
from .config import router as config_router
from .memories import router as memories_router
from .stats import router as stats_router

__all__ = ["apps_router", "backup_router", "config_router", "memories_router", "stats_router"]
