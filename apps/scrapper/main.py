"""
Instagram Downloader Service using Instaloader
Provides HTTP API for downloading Instagram Reels
Returns video bytes - storage handled by caller
"""

import os
import tempfile
import httpx
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

import instaloader
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel


# Configuration
SESSION_FILE = os.getenv("SESSION_FILE", "./session")
INSTAGRAM_USER = os.getenv("INSTAGRAM_USER", "")
INSTAGRAM_PASS = os.getenv("INSTAGRAM_PASS", "")
# Server URL for fetching cookies from database
SERVER_URL = os.getenv("SERVER_URL", "http://localhost:3000")

# Global instaloader instance
loader: Optional[instaloader.Instaloader] = None


def apply_cookies_to_loader(l: instaloader.Instaloader, cookies: List[Dict[str, Any]]) -> bool:
    """Apply Playwright-format cookies to instaloader session"""
    if not cookies:
        return False
    
    session = l.context._session
    applied = 0
    
    for cookie in cookies:
        name = cookie.get("name")
        value = cookie.get("value")
        domain = cookie.get("domain", ".instagram.com")
        path = cookie.get("path", "/")
        
        if name and value:
            session.cookies.set(
                name,
                value,
                domain=domain,
                path=path,
            )
            applied += 1
    
    print(f"Applied {applied} cookies to instaloader session")
    return applied > 0


def fetch_cookies_from_server() -> List[Dict[str, Any]]:
    """Fetch cookies from server API (stored in database)"""
    try:
        response = httpx.get(f"{SERVER_URL}/api/reels/auth/cookies", timeout=10.0)
        if response.status_code == 200:
            data = response.json()
            cookies = data.get("cookies", [])
            print(f"Fetched {len(cookies)} cookies from server")
            return cookies
        else:
            print(f"Failed to fetch cookies: {response.status_code}")
            return []
    except Exception as e:
        print(f"Error fetching cookies from server: {e}")
        return []


def get_loader() -> instaloader.Instaloader:
    """Get or create instaloader instance with session"""
    global loader
    if loader is None:
        loader = instaloader.Instaloader(
            download_videos=True,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            post_metadata_txt_pattern="",
            filename_pattern="{shortcode}",
        )
        
        # Try to load existing session file
        session_path = Path(SESSION_FILE)
        if session_path.exists() and INSTAGRAM_USER:
            try:
                loader.load_session_from_file(INSTAGRAM_USER, str(session_path))
                print(f"Loaded session for {INSTAGRAM_USER}")
            except Exception as e:
                print(f"Failed to load session: {e}")
        
        # Login if credentials provided and no session
        if INSTAGRAM_USER and INSTAGRAM_PASS and not loader.context.is_logged_in:
            try:
                loader.login(INSTAGRAM_USER, INSTAGRAM_PASS)
                loader.save_session_to_file(str(session_path))
                print(f"Logged in as {INSTAGRAM_USER}")
            except Exception as e:
                print(f"Login failed: {e}")
        
        # If still not logged in, try to fetch cookies from server (database)
        if not loader.context.is_logged_in:
            cookies = fetch_cookies_from_server()
            if cookies:
                apply_cookies_to_loader(loader, cookies)
                print("Applied cookies from server database")
    
    return loader


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize loader on startup"""
    get_loader()
    yield


app = FastAPI(
    title="Instagram Downloader Service",
    description="Download Instagram Reels using Instaloader",
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


class DownloadRequest(BaseModel):
    """Request to download a reel"""
    shortcode: str  # The reel ID (e.g., "DQ8gR5ukegX")
    folder: str = "reels"


class DownloadResponse(BaseModel):
    """Response after download"""
    success: bool
    shortcode: str
    filename: Optional[str] = None
    filepath: Optional[str] = None
    error: Optional[str] = None


class MetadataResponse(BaseModel):
    """Metadata about a reel"""
    success: bool
    shortcode: str
    caption: Optional[str] = None
    commentCount: Optional[int] = None
    likeCount: Optional[int] = None
    viewCount: Optional[int] = None
    author: Optional[str] = None
    thumbnailUrl: Optional[str] = None
    duration: Optional[int] = None  # Video duration in seconds
    error: Optional[str] = None


class LoginRequest(BaseModel):
    """Login credentials"""
    username: str
    password: str


class StatusResponse(BaseModel):
    """Service status"""
    status: str
    logged_in: bool
    username: Optional[str] = None


@app.get("/health")
async def health():
    """Health check"""
    return {"status": "ok"}


@app.get("/status", response_model=StatusResponse)
async def status():
    """Get service status and login state"""
    l = get_loader()
    return StatusResponse(
        status="ok",
        logged_in=l.context.is_logged_in,
        username=l.context.username if l.context.is_logged_in else None,
    )


@app.post("/login")
async def login(request: LoginRequest):
    """Login to Instagram"""
    global loader
    try:
        l = get_loader()
        l.login(request.username, request.password)
        l.save_session_to_file(str(SESSION_FILE))
        return {"success": True, "message": f"Logged in as {request.username}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class CookiesRequest(BaseModel):
    """Request to load cookies"""
    cookies: List[Dict[str, Any]]


@app.post("/cookies")
async def load_cookies(request: CookiesRequest):
    """Load cookies from external source (e.g. Playwright)"""
    global loader
    l = get_loader()
    
    if apply_cookies_to_loader(l, request.cookies):
        return {"success": True, "message": f"Applied {len(request.cookies)} cookies"}
    else:
        raise HTTPException(status_code=400, detail="Failed to apply cookies")


@app.post("/cookies/refresh")
async def refresh_cookies():
    """Refresh cookies from server database"""
    global loader
    l = get_loader()
    
    cookies = fetch_cookies_from_server()
    if cookies and apply_cookies_to_loader(l, cookies):
        return {"success": True, "message": f"Refreshed {len(cookies)} cookies from server"}
    else:
        raise HTTPException(status_code=400, detail="No cookies found or failed to apply")


@app.post("/metadata", response_model=MetadataResponse)
async def reel_metadata(request: DownloadRequest):
    """Fetch reel metadata by shortcode"""
    l = get_loader()

    def safe_int(value) -> Optional[int]:
        try:
            if value is None:
                return None
            return int(value)
        except Exception:
            return None

    try:
        post = instaloader.Post.from_shortcode(l.context, request.shortcode)

        caption = post.caption if getattr(post, "caption", None) else None
        like_count = safe_int(getattr(post, "likes", None))
        comment_count = safe_int(getattr(post, "comments", None))

        play_count = safe_int(getattr(post, "play_count", None))
        video_view_count = safe_int(getattr(post, "video_view_count", None))
        view_count = play_count if play_count is not None else video_view_count

        author = (
            getattr(post, "owner_username", None)
            or getattr(getattr(post, "owner_profile", None), "username", None)
            or None
        )

        thumbnail_url = getattr(post, "url", None) or None

        # Get video duration
        video_duration = getattr(post, "video_duration", None)
        duration = safe_int(video_duration) if video_duration is not None else None

        return MetadataResponse(
            success=True,
            shortcode=request.shortcode,
            caption=caption,
            commentCount=comment_count,
            likeCount=like_count,
            viewCount=view_count,
            author=author,
            thumbnailUrl=thumbnail_url,
            duration=duration,
        )
    except instaloader.exceptions.InstaloaderException as e:
        return MetadataResponse(
            success=False,
            shortcode=request.shortcode,
            error=str(e),
        )
    except Exception as e:
        return MetadataResponse(
            success=False,
            shortcode=request.shortcode,
            error=f"Unexpected error: {e}",
        )


@app.post("/download")
async def download_reel(request: DownloadRequest):
    """Download a single reel by shortcode and return video bytes"""
    l = get_loader()
    
    try:
        # Get post by shortcode
        post = instaloader.Post.from_shortcode(l.context, request.shortcode)
        
        # Download to temp dir
        with tempfile.TemporaryDirectory() as tmpdir:
            l.dirname_pattern = tmpdir
            l.download_post(post, target=request.shortcode)
            
            # Find downloaded video file
            video_file = None
            for f in Path(tmpdir).rglob("*.mp4"):
                video_file = f
                break
            
            if not video_file:
                return DownloadResponse(
                    success=False,
                    shortcode=request.shortcode,
                    error="No video file found after download",
                )
            
            # Read video bytes and return
            video_bytes = video_file.read_bytes()
            
            return Response(
                content=video_bytes,
                media_type="video/mp4",
                headers={
                    "X-Shortcode": request.shortcode,
                    "X-Filename": f"{request.shortcode}.mp4",
                    "Content-Disposition": f'attachment; filename="{request.shortcode}.mp4"',
                },
            )
    
    except instaloader.exceptions.InstaloaderException as e:
        return DownloadResponse(
            success=False,
            shortcode=request.shortcode,
            error=str(e),
        )
    except Exception as e:
        return DownloadResponse(
            success=False,
            shortcode=request.shortcode,
            error=f"Unexpected error: {e}",
        )
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8001"))
    reload = os.getenv("RELOAD", "true").lower() == "true"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)

