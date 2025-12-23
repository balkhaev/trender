"""
Tracing middleware for FastAPI
Extracts and propagates trace context via headers
"""

import uuid
from contextvars import ContextVar
from typing import Optional, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

TRACE_HEADER = "X-Trace-ID"
SPAN_HEADER = "X-Span-ID"

# Context vars for storing trace context
current_trace_id: ContextVar[Optional[str]] = ContextVar("trace_id", default=None)
current_span_id: ContextVar[Optional[str]] = ContextVar("span_id", default=None)


class TracingMiddleware(BaseHTTPMiddleware):
    """Middleware for extracting and propagating trace context"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Extract trace context from incoming headers
        trace_id = request.headers.get(TRACE_HEADER)
        parent_span_id = request.headers.get(SPAN_HEADER)

        # Generate new trace ID if not provided
        if not trace_id:
            trace_id = str(uuid.uuid4())

        # Generate new span ID for this service
        span_id = str(uuid.uuid4())[:16]

        # Set context vars
        trace_token = current_trace_id.set(trace_id)
        span_token = current_span_id.set(span_id)

        try:
            response = await call_next(request)

            # Add trace headers to response
            response.headers[TRACE_HEADER] = trace_id
            response.headers[SPAN_HEADER] = span_id
            if parent_span_id:
                response.headers["X-Parent-Span-ID"] = parent_span_id

            return response
        finally:
            # Reset context vars
            current_trace_id.reset(trace_token)
            current_span_id.reset(span_token)


def get_trace_id() -> Optional[str]:
    """Get current trace ID"""
    return current_trace_id.get()


def get_span_id() -> Optional[str]:
    """Get current span ID"""
    return current_span_id.get()


def get_trace_headers() -> dict[str, str]:
    """Get headers for propagating trace context to outgoing requests"""
    headers = {}
    trace_id = current_trace_id.get()
    span_id = current_span_id.get()

    if trace_id:
        headers[TRACE_HEADER] = trace_id
    if span_id:
        headers[SPAN_HEADER] = span_id

    return headers
