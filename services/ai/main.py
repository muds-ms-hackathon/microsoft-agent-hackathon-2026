from fastapi import FastAPI

from routers.health import router as health_router
from routers.ws import router as ws_router

app = FastAPI(title="AI Service")

app.include_router(health_router)
app.include_router(ws_router)
