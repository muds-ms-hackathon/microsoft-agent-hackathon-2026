from fastapi import APIRouter, WebSocket

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"type": "connected"})

    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            await websocket.send_json({"echo": message})
    except Exception:
        pass
