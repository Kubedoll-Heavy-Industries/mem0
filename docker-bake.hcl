// =============================================================================
// Docker Bake file for mem0 images
// Usage:
//   docker buildx bake                    # Build all images locally
//   docker buildx bake mem0-server        # Build single target
//   docker buildx bake --push             # Build and push to registry
//   docker buildx bake --print            # Print resolved build config
// =============================================================================

variable "REGISTRY" {
  default = "ghcr.io"
}

variable "REGISTRY_NAMESPACE" {
  default = "mem0ai"
}

variable "PYTHON_VERSIONS" {
  default = ["3.10", "3.11", "3.12", "3.13"]
}

variable "DEFAULT_PYTHON" {
  default = "3.12"
}

variable "VARIANT" {
  default = "slim"
}

variable "VERSION" {
  default = "dev"
}

variable "COMMIT" {
  default = ""
}

variable "BUILD_DATE" {
  default = ""
}

// OCI label variables (override in CI for forks)
variable "OCI_SOURCE" {
  default = "https://github.com/mem0ai/mem0"
}

variable "OCI_URL" {
  default = "https://mem0.ai"
}

variable "OCI_VENDOR" {
  default = "Mem0"
}

variable "OCI_AUTHORS" {
  default = ""
}

// =============================================================================
// Functions
// =============================================================================

function "image_tag" {
  params = [name, python_version]
  result = python_version == DEFAULT_PYTHON ? "${REGISTRY}/${REGISTRY_NAMESPACE}/${name}:${VERSION}" : "${REGISTRY}/${REGISTRY_NAMESPACE}/${name}:${VERSION}-py${replace(python_version, ".", "")}"
}

function "cache_tag" {
  params = [name, python_version]
  result = "${REGISTRY}/${REGISTRY_NAMESPACE}/${name}:cache-py${replace(python_version, ".", "")}"
}

// =============================================================================
// Groups
// =============================================================================

group "default" {
  targets = ["mem0-server"]
}

group "all" {
  targets = ["mem0-server-all"]
}

group "mem0-server-all" {
  targets = [for v in PYTHON_VERSIONS : "mem0-server-py${replace(v, ".", "")}"]
}

// TODO: OpenMemory needs consolidation before publishing
// - Merge openmemory-api + openmemory-ui into single container
// - Replace Next.js with static build served from FastAPI
// group "openmemory-all" { ... }

// =============================================================================
// Shared target configuration
// =============================================================================

target "_common" {
  platforms = ["linux/amd64", "linux/arm64"]
  args = {
    VERSION    = VERSION
    COMMIT     = COMMIT
    BUILD_DATE = BUILD_DATE
    OCI_SOURCE = OCI_SOURCE
    OCI_URL    = OCI_URL
    OCI_VENDOR = OCI_VENDOR
    OCI_AUTHORS = OCI_AUTHORS
  }
}

target "_python-base" {
  inherits = ["_common"]
  args = {
    VARIANT = VARIANT
  }
}

// =============================================================================
// mem0-server targets
// =============================================================================

target "mem0-server" {
  inherits   = ["_python-base"]
  context    = "."
  dockerfile = "server/Dockerfile"
  args = {
    PYTHON_VERSION = DEFAULT_PYTHON
  }
  tags = [
    "${REGISTRY}/${REGISTRY_NAMESPACE}/mem0-server:${VERSION}",
    "${REGISTRY}/${REGISTRY_NAMESPACE}/mem0-server:latest",
  ]
  cache-from = ["type=registry,ref=${cache_tag("mem0-server", DEFAULT_PYTHON)}"]
  cache-to   = ["type=registry,ref=${cache_tag("mem0-server", DEFAULT_PYTHON)},mode=max"]
}

target "mem0-server-py310" {
  inherits = ["_python-base"]
  context    = "."
  dockerfile = "server/Dockerfile"
  args = {
    PYTHON_VERSION = "3.10"
  }
  tags = ["${image_tag("mem0-server", "3.10")}"]
  cache-from = ["type=registry,ref=${cache_tag("mem0-server", "3.10")}"]
  cache-to   = ["type=registry,ref=${cache_tag("mem0-server", "3.10")},mode=max"]
}

target "mem0-server-py311" {
  inherits = ["_python-base"]
  context    = "."
  dockerfile = "server/Dockerfile"
  args = {
    PYTHON_VERSION = "3.11"
  }
  tags = ["${image_tag("mem0-server", "3.11")}"]
  cache-from = ["type=registry,ref=${cache_tag("mem0-server", "3.11")}"]
  cache-to   = ["type=registry,ref=${cache_tag("mem0-server", "3.11")},mode=max"]
}

target "mem0-server-py312" {
  inherits = ["_python-base"]
  context    = "."
  dockerfile = "server/Dockerfile"
  args = {
    PYTHON_VERSION = "3.12"
  }
  tags = [
    "${image_tag("mem0-server", "3.12")}",
    "${REGISTRY}/${REGISTRY_NAMESPACE}/mem0-server:latest",
  ]
  cache-from = ["type=registry,ref=${cache_tag("mem0-server", "3.12")}"]
  cache-to   = ["type=registry,ref=${cache_tag("mem0-server", "3.12")},mode=max"]
}

target "mem0-server-py313" {
  inherits = ["_python-base"]
  context    = "."
  dockerfile = "server/Dockerfile"
  args = {
    PYTHON_VERSION = "3.13"
  }
  tags = ["${image_tag("mem0-server", "3.13")}"]
  cache-from = ["type=registry,ref=${cache_tag("mem0-server", "3.13")}"]
  cache-to   = ["type=registry,ref=${cache_tag("mem0-server", "3.13")},mode=max"]
}
