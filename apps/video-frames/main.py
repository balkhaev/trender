"""
Video Frames Extraction Service
Provides HTTP API for extracting frames from video files using FFmpeg
Returns frames as base64 JPEG images
Supports scene detection via PySceneDetect
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
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# PySceneDetect imports
from scenedetect import detect, ContentDetector


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


class TrimResponse(BaseModel):
    """Response with trimmed video info"""
    success: bool
    duration_sec: Optional[float] = None
    error: Optional[str] = None


class StatusResponse(BaseModel):
    """Service status"""
    status: str
    ffmpeg_version: Optional[str] = None


class SceneInfo(BaseModel):
    """Detected scene info"""
    index: int
    start_time: float      # Start time in seconds
    end_time: float        # End time in seconds
    duration: float        # Duration in seconds
    start_frame: int       # Starting frame number
    end_frame: int         # Ending frame number
    thumbnail_base64: Optional[str] = None  # Preview frame (optional)


class SceneDetectionResponse(BaseModel):
    """Response with detected scenes"""
    success: bool
    scenes: list[SceneInfo]
    total_scenes: int
    video_duration: Optional[float] = None
    error: Optional[str] = None


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


def get_video_dimensions(video_path: str) -> Optional[tuple[int, int]]:
    """Get video width and height using ffprobe"""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=s=x:p=0",
                video_path
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        parts = result.stdout.strip().split("x")
        if len(parts) == 2:
            return int(parts[0]), int(parts[1])
        return None
    except Exception:
        return None


def resize_video_ffmpeg(
    video_path: str,
    output_path: str,
    target_width: int
) -> bool:
    """
    Resize video to target width while maintaining aspect ratio

    Args:
        video_path: Path to input video file
        output_path: Path for output resized video
        target_width: Target width in pixels (height calculated automatically)

    Returns:
        True if successful
    """
    # scale=WIDTH:-2 maintains aspect ratio and ensures even height
    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-vf", f"scale={target_width}:-2",
        "-c:v", "libx264",
        "-preset", "fast",
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_path,
        "-y"
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=300  # 5 minute timeout
    )

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg resize failed: {result.stderr}")

    return True


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


def trim_video_ffmpeg(
    video_path: str,
    output_path: str,
    start_time: float,
    end_time: float
) -> bool:
    """
    Trim video between start_time and end_time using FFmpeg

    Args:
        video_path: Path to input video file
        output_path: Path for output trimmed video
        start_time: Start time in seconds
        end_time: End time in seconds

    Returns:
        True if successful
    """
    # Use -ss before -i for fast seek, then -t for duration
    duration = end_time - start_time

    cmd = [
        "ffmpeg",
        "-ss", str(start_time),
        "-i", video_path,
        "-t", str(duration),
        "-c:v", "libx264",
        "-c:a", "aac",
        "-preset", "fast",
        "-movflags", "+faststart",
        output_path,
        "-y"
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=300  # 5 minute timeout
    )

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg trim failed: {result.stderr}")

    return True


def detect_scenes_pyscene(
    video_path: str,
    threshold: float = 27.0,
    min_scene_len_sec: float = 1.0
) -> list[tuple]:
    """
    Detect scenes using PySceneDetect ContentDetector

    Args:
        video_path: Path to video file
        threshold: Detection threshold (lower = more sensitive, default 27.0)
        min_scene_len_sec: Minimum scene length in seconds

    Returns:
        List of (start_timecode, end_timecode) tuples
    """
    # ContentDetector detects cuts based on changes in content
    # min_scene_len is in frames, assuming ~30fps
    min_scene_len_frames = int(min_scene_len_sec * 30)

    scene_list = detect(
        video_path,
        ContentDetector(threshold=threshold, min_scene_len=min_scene_len_frames)
    )
    return scene_list


def extract_frame_at_time(
    video_path: str,
    timestamp: float,
    output_path: str
) -> bool:
    """
    Extract a single frame at specific timestamp

    Args:
        video_path: Path to video file
        timestamp: Time in seconds
        output_path: Path for output JPEG

    Returns:
        True if successful
    """
    cmd = [
        "ffmpeg",
        "-ss", str(timestamp),
        "-i", video_path,
        "-frames:v", "1",
        "-q:v", str(max(1, min(31, 31 - JPEG_QUALITY // 3))),
        output_path,
        "-y"
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=30
    )

    return result.returncode == 0


def extract_frames_in_range(
    video_path: str,
    output_dir: str,
    start_time: float,
    end_time: float,
    max_frames: int = 5
) -> list[str]:
    """
    Extract frames from a specific time range

    Args:
        video_path: Path to video file
        output_dir: Directory to save frames
        start_time: Start time in seconds
        end_time: End time in seconds
        max_frames: Maximum frames to extract

    Returns:
        List of paths to extracted frame files
    """
    duration = end_time - start_time
    if duration <= 0:
        return []

    # Calculate interval for even distribution
    interval = duration / max_frames if max_frames > 1 else duration

    output_pattern = os.path.join(output_dir, "range_frame_%04d.jpg")

    # Use select filter to pick frames at specific intervals within range
    fps_value = 1.0 / interval if interval > 0 else 1.0

    cmd = [
        "ffmpeg",
        "-ss", str(start_time),
        "-i", video_path,
        "-t", str(duration),
        "-vf", f"fps={fps_value}",
        "-frames:v", str(max_frames),
        "-q:v", str(max(1, min(31, 31 - JPEG_QUALITY // 3))),
        "-f", "image2",
        output_pattern,
        "-y"
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120
    )

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {result.stderr}")

    # Collect extracted frames
    frames = []
    for i in range(1, max_frames + 1):
        frame_path = os.path.join(output_dir, f"range_frame_{i:04d}.jpg")
        if os.path.exists(frame_path):
            frames.append(frame_path)
        else:
            break

    return frames


def concat_videos_ffmpeg(
    video_paths: list[str],
    output_path: str
) -> bool:
    """
    Concatenate multiple videos using FFmpeg concat demuxer

    Args:
        video_paths: List of video file paths in order
        output_path: Output file path

    Returns:
        True if successful
    """
    # Create concat list file
    concat_dir = os.path.dirname(output_path)
    concat_file = os.path.join(concat_dir, "concat_list.txt")

    with open(concat_file, "w") as f:
        for path in video_paths:
            # Escape single quotes in path
            escaped_path = path.replace("'", "'\\''")
            f.write(f"file '{escaped_path}'\n")

    cmd = [
        "ffmpeg",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_file,
        "-c", "copy",  # Stream copy for speed
        "-movflags", "+faststart",
        output_path,
        "-y"
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600  # 10 minute timeout
    )

    # Clean up concat file
    if os.path.exists(concat_file):
        os.remove(concat_file)

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg concat failed: {result.stderr}")

    return True


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

from tracing import TracingMiddleware

app.add_middleware(TracingMiddleware)
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


@app.post("/trim")
async def trim_video(
    video: UploadFile = File(...),
    start_time: float = Form(...),
    end_time: float = Form(...)
):
    """
    Trim video between start_time and end_time

    - **video**: Video file (mp4, webm, etc.)
    - **start_time**: Start time in seconds
    - **end_time**: End time in seconds

    Returns trimmed video as streaming response
    """
    if start_time < 0:
        raise HTTPException(status_code=400, detail="start_time must be non-negative")

    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="end_time must be greater than start_time")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "input_video.mp4")
            output_path = os.path.join(tmpdir, "output_trimmed.mp4")

            # Write uploaded video to temp file
            content = await video.read()
            with open(input_path, "wb") as f:
                f.write(content)

            # Get original duration and validate
            original_duration = get_video_duration(input_path)
            if original_duration and end_time > original_duration:
                end_time = original_duration

            # Trim the video
            trim_video_ffmpeg(input_path, output_path, start_time, end_time)

            # Check output exists
            if not os.path.exists(output_path):
                raise HTTPException(status_code=500, detail="Failed to create trimmed video")

            # Get trimmed video duration
            trimmed_duration = get_video_duration(output_path)

            # Read the output file
            with open(output_path, "rb") as f:
                video_bytes = f.read()

            # Return as streaming response
            def iterfile():
                yield video_bytes

            return StreamingResponse(
                iterfile(),
                media_type="video/mp4",
                headers={
                    "Content-Disposition": "attachment; filename=trimmed_video.mp4",
                    "X-Video-Duration": str(trimmed_duration) if trimmed_duration else "",
                }
            )

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Video processing timed out")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")


@app.post("/resize")
async def resize_video(
    video: UploadFile = File(...),
    min_width: int = Form(default=720),
    target_width: int = Form(default=1080)
):
    """
    Resize video to meet minimum width requirements (for Kling API compatibility)

    Strategy:
    - If width < min_width: upscale to min_width
    - If width between min_width and target_width: upscale to target_width
    - If width >= target_width: return original video

    - **video**: Video file (mp4, webm, etc.)
    - **min_width**: Minimum width required (default: 720)
    - **target_width**: Target width for upscaling (default: 1080)

    Returns resized video as streaming response with X-Original-Width and X-New-Width headers
    """
    if min_width <= 0:
        raise HTTPException(status_code=400, detail="min_width must be positive")

    if target_width < min_width:
        raise HTTPException(status_code=400, detail="target_width must be >= min_width")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "input_video.mp4")
            output_path = os.path.join(tmpdir, "output_resized.mp4")

            # Write uploaded video to temp file
            content = await video.read()
            with open(input_path, "wb") as f:
                f.write(content)

            # Get video dimensions
            dimensions = get_video_dimensions(input_path)
            if not dimensions:
                raise HTTPException(status_code=400, detail="Could not determine video dimensions")

            original_width, original_height = dimensions
            new_width = original_width

            # Determine if resize is needed
            if original_width < min_width:
                # Upscale to min_width
                new_width = min_width
            elif original_width < target_width:
                # Upscale to target_width
                new_width = target_width
            else:
                # No resize needed, return original
                def iterfile():
                    yield content

                return StreamingResponse(
                    iterfile(),
                    media_type="video/mp4",
                    headers={
                        "Content-Disposition": "attachment; filename=video.mp4",
                        "X-Original-Width": str(original_width),
                        "X-Original-Height": str(original_height),
                        "X-New-Width": str(original_width),
                        "X-Resized": "false",
                    }
                )

            # Resize the video
            resize_video_ffmpeg(input_path, output_path, new_width)

            # Check output exists
            if not os.path.exists(output_path):
                raise HTTPException(status_code=500, detail="Failed to create resized video")

            # Get new dimensions
            new_dimensions = get_video_dimensions(output_path)
            new_height = new_dimensions[1] if new_dimensions else 0

            # Read the output file
            with open(output_path, "rb") as f:
                video_bytes = f.read()

            # Return as streaming response
            def iterfile():
                yield video_bytes

            return StreamingResponse(
                iterfile(),
                media_type="video/mp4",
                headers={
                    "Content-Disposition": "attachment; filename=resized_video.mp4",
                    "X-Original-Width": str(original_width),
                    "X-Original-Height": str(original_height),
                    "X-New-Width": str(new_width),
                    "X-New-Height": str(new_height),
                    "X-Resized": "true",
                }
            )

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Video processing timed out")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")


@app.post("/detect-scenes", response_model=SceneDetectionResponse)
async def detect_scenes(
    video: UploadFile = File(...),
    threshold: float = Form(default=27.0),
    min_scene_len: float = Form(default=1.0),
    extract_thumbnails: bool = Form(default=True)
):
    """
    Detect scene changes in video using PySceneDetect

    - **video**: Video file (mp4, webm, etc.)
    - **threshold**: Detection threshold (default 27.0, lower = more scenes)
    - **min_scene_len**: Minimum scene length in seconds
    - **extract_thumbnails**: Extract thumbnail for each scene

    Returns list of detected scenes with timestamps
    """
    if threshold <= 0:
        raise HTTPException(status_code=400, detail="threshold must be positive")

    if min_scene_len <= 0:
        raise HTTPException(status_code=400, detail="min_scene_len must be positive")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, "input_video.mp4")

            # Write video to temp file
            content = await video.read()
            with open(video_path, "wb") as f:
                f.write(content)

            # Get video duration
            duration = get_video_duration(video_path)

            # Detect scenes
            scene_list = detect_scenes_pyscene(
                video_path,
                threshold=threshold,
                min_scene_len_sec=min_scene_len
            )

            # Convert to response format
            scenes: list[SceneInfo] = []
            for i, (start_tc, end_tc) in enumerate(scene_list):
                start_time = start_tc.get_seconds()
                end_time = end_tc.get_seconds()

                thumbnail_base64 = None
                if extract_thumbnails:
                    # Extract thumbnail from middle of scene
                    mid_time = (start_time + end_time) / 2
                    thumb_path = os.path.join(tmpdir, f"thumb_{i}.jpg")
                    if extract_frame_at_time(video_path, mid_time, thumb_path):
                        with open(thumb_path, "rb") as f:
                            thumbnail_base64 = base64.b64encode(f.read()).decode("utf-8")

                scenes.append(SceneInfo(
                    index=i,
                    start_time=start_time,
                    end_time=end_time,
                    duration=end_time - start_time,
                    start_frame=start_tc.get_frames(),
                    end_frame=end_tc.get_frames(),
                    thumbnail_base64=thumbnail_base64
                ))

            return SceneDetectionResponse(
                success=True,
                scenes=scenes,
                total_scenes=len(scenes),
                video_duration=duration
            )

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Video processing timed out")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scene detection error: {e}")


@app.post("/extract-frames-range", response_model=FramesResponse)
async def extract_frames_range(
    video: UploadFile = File(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
    max_frames: int = Form(default=5)
):
    """
    Extract frames from a specific time range of video

    - **video**: Video file (mp4, webm, etc.)
    - **start_time**: Start time in seconds
    - **end_time**: End time in seconds
    - **max_frames**: Maximum frames to extract from range (default: 5)

    Returns list of frames as base64 encoded JPEG images
    """
    if start_time < 0:
        raise HTTPException(status_code=400, detail="start_time must be non-negative")

    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="end_time must be greater than start_time")

    if max_frames <= 0 or max_frames > 30:
        raise HTTPException(status_code=400, detail="max_frames must be between 1 and 30")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            video_path = os.path.join(tmpdir, "input_video.mp4")

            # Write video to temp file
            content = await video.read()
            with open(video_path, "wb") as f:
                f.write(content)

            # Get video duration
            duration = get_video_duration(video_path)

            # Adjust end_time if beyond video duration
            if duration and end_time > duration:
                end_time = duration

            # Extract frames in range
            frame_paths = extract_frames_in_range(
                video_path,
                tmpdir,
                start_time=start_time,
                end_time=end_time,
                max_frames=max_frames
            )

            if not frame_paths:
                return FramesResponse(
                    success=False,
                    frames=[],
                    count=0,
                    duration_sec=end_time - start_time,
                    interval_sec=(end_time - start_time) / max_frames,
                    error="No frames extracted from range"
                )

            # Convert to base64
            frames_base64 = frames_to_base64(frame_paths)

            return FramesResponse(
                success=True,
                frames=frames_base64,
                count=len(frames_base64),
                duration_sec=end_time - start_time,
                interval_sec=(end_time - start_time) / max_frames
            )

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Video processing timed out")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")


@app.post("/concat")
async def concat_videos(
    videos: list[UploadFile] = File(...)
):
    """
    Concatenate multiple videos in order

    - **videos**: List of video files to concatenate (in order)

    Returns concatenated video as streaming response
    """
    if len(videos) < 2:
        raise HTTPException(status_code=400, detail="At least 2 videos required for concatenation")

    if len(videos) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 videos allowed")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Save all videos
            video_paths = []
            for i, video in enumerate(videos):
                path = os.path.join(tmpdir, f"video_{i:03d}.mp4")
                content = await video.read()
                with open(path, "wb") as f:
                    f.write(content)
                video_paths.append(path)

            # Concatenate videos
            output_path = os.path.join(tmpdir, "output.mp4")
            concat_videos_ffmpeg(video_paths, output_path)

            # Check output exists
            if not os.path.exists(output_path):
                raise HTTPException(status_code=500, detail="Failed to create concatenated video")

            # Get duration
            duration = get_video_duration(output_path)

            # Read output
            with open(output_path, "rb") as f:
                video_bytes = f.read()

            def iterfile():
                yield video_bytes

            return StreamingResponse(
                iterfile(),
                media_type="video/mp4",
                headers={
                    "Content-Disposition": "attachment; filename=concatenated.mp4",
                    "X-Video-Duration": str(duration) if duration else "",
                    "X-Video-Count": str(len(videos)),
                }
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

