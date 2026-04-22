from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_json({"type": "connected"})

    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            await websocket.send_json({"echo": message})
    except WebSocketDisconnect:
        pass
