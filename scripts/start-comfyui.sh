#!/usr/bin/env bash
# Run the user's existing ComfyUI and models through read-only Podman bind mounts.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMFY_SOURCE="${1:-${EMPERY_COMFY_SOURCE_ROOT:-}}"
if [[ -z "$COMFY_SOURCE" ]]; then
  echo 'Usage: scripts/start-comfyui.sh /path/to/podryad' >&2
  exit 1
fi
COMFY_SOURCE="$(realpath "$COMFY_SOURCE")"
COMFY_APP="$COMFY_SOURCE/stack2/comfyui-clean"
COMFY_MODELS="$COMFY_SOURCE/models/comfyui"
[[ -f "$COMFY_APP/main.py" && -d "$COMFY_MODELS" ]] || { echo 'ComfyUI or model directory is missing' >&2; exit 1; }
COMFY_PORT="$(cd "$ROOT" && node --input-type=module -e 'import {loadServicesConfig} from "./packages/shared/dist/config.js";console.log(new URL(loadServicesConfig().comfyui.url).port)')"
[[ "$COMFY_PORT" =~ ^[0-9]+$ ]] || { echo 'Invalid ComfyUI port in services config' >&2; exit 1; }
mkdir -p "$ROOT/data/comfyui-runtime"/{user,input,output,temp}
if podman container exists ewg-comfyui; then
  mounted="$(podman inspect ewg-comfyui --format '{{range .Mounts}}{{if eq .Destination "/opt/ComfyUI"}}{{.Source}}{{end}}{{end}}')"
  [[ "$mounted" == "$COMFY_APP" ]] || { echo 'Existing ewg-comfyui uses another directory' >&2; exit 1; }
  podman start ewg-comfyui
  exit 0
fi
# Normal VRAM keeps the text encoder on GPU; low mode is available on crowded GPUs.
COMFY_MEMORY_ARGS=(--disable-dynamic-vram)
if [[ "${EMPERY_COMFY_LOW_VRAM:-0}" == 1 ]]; then
  COMFY_MEMORY_ARGS=(--lowvram --disable-dynamic-vram)
fi
# CDI on this host supplies devices; explicitly bind the CUDA driver libraries too.
COMFY_DRIVER_MOUNTS=()
for library in libcuda.so.1 libnvidia-ml.so.1 libnvidia-ptxjitcompiler.so.1; do
  [[ -e "/lib64/$library" ]] && COMFY_DRIVER_MOUNTS+=(--mount "type=bind,source=/lib64/$library,target=/usr/local/nvidia/lib64/$library,ro")
done
for library in /lib64/libnvidia-gpucomp.so.*; do
  [[ -f "$library" ]] && COMFY_DRIVER_MOUNTS+=(--mount "type=bind,source=$library,target=/usr/local/nvidia/lib64/$(basename "$library"),ro")
done
podman run -d --name ewg-comfyui --restart=unless-stopped \
  --security-opt label=disable --device=nvidia.com/gpu=all \
  --publish "127.0.0.1:$COMFY_PORT:8188" \
  --mount "type=bind,source=$COMFY_APP,target=/opt/ComfyUI,ro" \
  --mount "type=bind,source=$COMFY_MODELS,target=/models,ro" \
  --mount "type=bind,source=$ROOT/data/comfyui-runtime,target=/workspace" \
  --mount "type=bind,source=$ROOT/scripts/comfyui-bootstrap.py,target=/usr/local/bin/ewg-comfyui-bootstrap.py,ro" \
  "${COMFY_DRIVER_MOUNTS[@]}" \
  --env LD_LIBRARY_PATH=/usr/local/nvidia/lib64 \
  --env PYTHONDONTWRITEBYTECODE=1 \
  --workdir /workspace docker.io/library/python:3.10-slim \
  python /usr/local/bin/ewg-comfyui-bootstrap.py --listen 0.0.0.0 --port 8188 \
  --base-directory /workspace --models-directory /models --user-directory /workspace/user \
  --input-directory /workspace/input --output-directory /workspace/output --temp-directory /workspace/temp \
  --database-url sqlite:////workspace/comfyui.db "${COMFY_MEMORY_ARGS[@]}" \
  --reserve-vram 1 --disable-all-custom-nodes --disable-api-nodes
