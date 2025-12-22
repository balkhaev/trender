// Docker Bake configuration for parallel builds with shared stages
// Usage: docker buildx bake [target]
// Examples:
//   docker buildx bake           # Build all targets
//   docker buildx bake server    # Build only server
//   docker buildx bake --push    # Build and push all

variable "REGISTRY" {
  default = ""
}

variable "TAG" {
  default = "latest"
}

variable "NEXT_PUBLIC_API_URL" {
  default = ""
}

// Groups
group "default" {
  targets = ["server", "web", "scrapper", "video-frames", "playwright"]
}

group "python" {
  targets = ["scrapper", "video-frames"]
}

group "node" {
  targets = ["server", "web", "playwright"]
}

// Application targets
target "server" {
  context    = "."
  dockerfile = "apps/server/Dockerfile"
  tags       = notequal("", REGISTRY) ? ["${REGISTRY}/server:${TAG}"] : ["trender/server:${TAG}"]
}

target "web" {
  context    = "."
  dockerfile = "apps/web/Dockerfile"
  args = {
    NEXT_PUBLIC_API_URL = "${NEXT_PUBLIC_API_URL}"
  }
  tags = notequal("", REGISTRY) ? ["${REGISTRY}/web:${TAG}"] : ["trender/web:${TAG}"]
}

target "scrapper" {
  context    = "."
  dockerfile = "apps/scrapper/Dockerfile"
  tags       = notequal("", REGISTRY) ? ["${REGISTRY}/scrapper:${TAG}"] : ["trender/scrapper:${TAG}"]
}

target "video-frames" {
  context    = "."
  dockerfile = "apps/video-frames/Dockerfile"
  tags       = notequal("", REGISTRY) ? ["${REGISTRY}/video-frames:${TAG}"] : ["trender/video-frames:${TAG}"]
}

target "playwright" {
  context    = "."
  dockerfile = "apps/playwright/Dockerfile"
  tags       = notequal("", REGISTRY) ? ["${REGISTRY}/playwright:${TAG}"] : ["trender/playwright:${TAG}"]
}
