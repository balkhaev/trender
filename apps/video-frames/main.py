"""
Video Frames Extraction Service
Provides HTTP API for extracting frames from video files using FFmpeg
Returns frames as base64 JPEG images
"""

import os
import subprocess
import tempfile
import base64
import struct
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# Configuration
DEFAULT_INTERVAL_SEC = float(os.getenv("FRAME_INTERVAL_SEC", "2.0"))
MAX_FRAMES = int(os.getenv("MAX_FRAMES", "30"))
JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "85"))


class FramesResponse(BaseModel):
    """Response with extracted frames"""
    success: bool
    frames: list[str]  # base64 encoded JPEG images
    count: int
    duration_sec: Optional[float] = None
    interval_sec: float
    error: Optional[str] = None


class StatusResponse(BaseModel):
    """Service status"""
    status: str
    ffmpeg_version: Optional[str] = None


def get_ffmpeg_version() -> Optional[str]:
    """Get FFmpeg version string"""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        first_line = result.stdout.split("\n")[0]
        return first_line
    except Exception:
        return None


def get_video_duration(video_path: str) -> Optional[float]:
    """Get video duration in seconds using ffprobe"""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                video_path
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        return float(result.stdout.strip())
    except Exception:
        return None


def extract_frames_ffmpeg(
    video_path: str,
    output_dir: str,
    interval_sec: float = 2.0,
    max_frames: int = 30
) -> list[str]:
    """
    Extract frames from video using FFmpeg
    
    Args:
        video_path: Path to video file
        output_dir: Directory to save frames
        interval_sec: Interval between frames in seconds
        max_frames: Maximum number of frames to extract
    
    Returns:
        List of paths to extracted frame files
    """
    # Calculate fps filter value (1 frame per interval_sec seconds)
    fps_value = 1.0 / interval_sec
    
    output_pattern = os.path.join(output_dir, "frame_%04d.jpg")
    
    # Build FFmpeg command
    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-vf", f"fps={fps_value}",
        "-frames:v", str(max_frames),
        "-q:v", str(max(1, min(31, 31 - JPEG_QUALITY // 3))),  # FFmpeg quality scale
        "-f", "image2",
        output_pattern,
        "-y"  # Overwrite output files
    ]
    
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120  # 2 minute timeout
    )
    
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {result.stderr}")
    
    # Collect extracted frame files
    frames = []
    for i in range(1, max_frames + 1):
        frame_path = os.path.join(output_dir, f"frame_{i:04d}.jpg")
        if os.path.exists(frame_path):
            frames.append(frame_path)
        else:
            break
    
    return frames


def frames_to_base64(frame_paths: list[str]) -> list[str]:
    """Convert frame files to base64 encoded strings"""
    result = []
    for path in frame_paths:
        with open(path, "rb") as f:
            data = f.read()
            encoded = base64.b64encode(data).decode("utf-8")
            result.append(encoded)
    return result


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Check FFmpeg availability on startup"""
    version = get_ffmpeg_version()
    if version:
        print(f"FFmpeg available: {version}")
    else:
        print("WARNING: FFmpeg not found!")
    yield


app = FastAPI(
    title="Video Frames Extraction Service",
    description="Extract frames from video files using FFmpeg",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check"""
    return {"status": "ok"}


@app.get("/status", response_model=StatusResponse)
async def status():
    """Get service status"""
    return StatusResponse(
        status="ok",
        ffmpeg_version=get_ffmpeg_version()
    )


@app.post("/extract-frames", response_model=FramesResponse)
async def extract_frames(
    video: UploadFile = File(...),
    interval_sec: float = Form(default=DEFAULT_INTERVAL_SEC),
    max_frames: int = Form(default=MAX_FRAMES)
):
    """
    Extract frames from uploaded video file
    
    - **video**: Video file (mp4, webm, etc.)
    - **interval_sec**: Interval between frames in seconds (default: 2.0)
    - **max_frames**: Maximum number of frames to extract (default: 30)
    
    Returns list of frames as base64 encoded JPEG images
    """
    if interval_sec <= 0:
        raise HTTPException(status_code=400, detail="interval_sec must be positive")
    
    if max_frames <= 0 or max_frames > 100:
        raise HTTPException(status_code=400, detail="max_frames must be between 1 and 100")
    
    try:
        # Save uploaded video to temp file
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, "input_video.mp4")
            
            # Write video to temp file
            content = await video.read()
            with open(video_path, "wb") as f:
                f.write(content)
            
            # Get video duration
            duration = get_video_duration(video_path)
            
            # Extract frames
            frame_paths = extract_frames_ffmpeg(
                video_path,
                tmpdir,
                interval_sec=interval_sec,
                max_frames=max_frames
            )
            
            if not frame_paths:
                return FramesResponse(
                    success=False,
                    frames=[],
                    count=0,
                    duration_sec=duration,
                    interval_sec=interval_sec,
                    error="No frames extracted from video"
                )
            
            # Convert to base64
            frames_base64 = frames_to_base64(frame_paths)
            
            return FramesResponse(
                success=True,
                frames=frames_base64,
                count=len(frames_base64),
                duration_sec=duration,
                interval_sec=interval_sec
            )
    
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Video processing timed out")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")


@app.post("/extract-frames-from-bytes")
async def extract_frames_from_bytes(
    video: bytes,
    interval_sec: float = DEFAULT_INTERVAL_SEC,
    max_frames: int = MAX_FRAMES
) -> FramesResponse:
    """
    Extract frames from video bytes (for internal service-to-service calls)
    
    This endpoint accepts raw video bytes in the request body.
    """
    if interval_sec <= 0:
        raise HTTPException(status_code=400, detail="interval_sec must be positive")
    
    if max_frames <= 0 or max_frames > 100:
        raise HTTPException(status_code=400, detail="max_frames must be between 1 and 100")
    
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, "input_video.mp4")
            
            with open(video_path, "wb") as f:
                f.write(video)
            
            duration = get_video_duration(video_path)
            
            frame_paths = extract_frames_ffmpeg(
                video_path,
                tmpdir,
                interval_sec=interval_sec,
                max_frames=max_frames
            )
            
            if not frame_paths:
                return FramesResponse(
                    success=False,
                    frames=[],
                    count=0,
                    duration_sec=duration,
                    interval_sec=interval_sec,
                    error="No frames extracted from video"
                )
            
            frames_base64 = frames_to_base64(frame_paths)
            
            return FramesResponse(
                success=True,
                frames=frames_base64,
                count=len(frames_base64),
                duration_sec=duration,
                interval_sec=interval_sec
            )
    
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Video processing timed out")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8002"))
    reload = os.getenv("RELOAD", "true").lower() == "true"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)

