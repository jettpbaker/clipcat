import modal

app = modal.App("clipcat-transcode")

r2_secret = modal.Secret.from_name("clipcat-r2")
image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-runtime-ubuntu22.04", add_python="3.11")
    .entrypoint([])
    .apt_install("ffmpeg")
    .pip_install("boto3")
)

TARGET_SIZE_MB = 10
TARGET_SIZE_HEADROOM = 0.9
AUDIO_BITRATE_KBPS = 128
MAX_OUTPUT_WIDTH = 1920
MAX_OUTPUT_HEIGHT = 1080
FFMPEG_LOG_OUTPUT_LIMIT = 40_000


@app.function(
    image=image,
    secrets=[r2_secret],
    gpu=["L40S", "L4"],
    region=["ap-northeast", "ap"],
)
def compress(input_key: str, output_key: str, duration: float):
    import os
    from pathlib import Path
    import shlex
    import shutil
    import subprocess
    import time
    import uuid
    import boto3
    from boto3.s3.transfer import TransferConfig

    def trim_log_output(value: str | None, limit: int = FFMPEG_LOG_OUTPUT_LIMIT):
        if not value:
            return None
        if len(value) <= limit:
            return value
        return f"[truncated to last {limit} chars]\n{value[-limit:]}"

    def describe_path(path: Path):
        exists = path.exists()
        return {
            "path": str(path),
            "exists": exists,
            "size": path.stat().st_size if exists else None,
        }

    def run_subprocess(command: list[str], label: str):
        started_at = time.perf_counter()
        result = subprocess.run(command, capture_output=True, text=True)
        elapsed_seconds = time.perf_counter() - started_at
        print(
            label,
            {
                "command": shlex.join(command),
                "returncode": result.returncode,
                "seconds": round(elapsed_seconds, 2),
                "stdout": trim_log_output(result.stdout),
                "stderr": trim_log_output(result.stderr),
            },
        )
        return result

    def probe_ffmpeg_capabilities(ffmpeg_path: str):
        def select_matching_lines(output: str, terms: tuple[str, ...]):
            matches = [line for line in output.splitlines() if any(term in line for term in terms)]
            return "\n".join(matches) if matches else None

        probes = {
            "version": [ffmpeg_path, "-hide_banner", "-version"],
            "hwaccels": [ffmpeg_path, "-hide_banner", "-hwaccels"],
            "encoders": [ffmpeg_path, "-hide_banner", "-encoders"],
            "decoders": [ffmpeg_path, "-hide_banner", "-decoders"],
            "filters": [ffmpeg_path, "-hide_banner", "-filters"],
        }
        outputs: dict[str, str] = {}
        probe_terms = {
            "hwaccels": ("cuda",),
            "encoders": ("h264_nvenc", "aac"),
            "decoders": ("av1_cuvid", "h264_cuvid", "hevc_cuvid", "vp9_cuvid"),
            "filters": ("scale_npp", "scale_cuda", "hwupload_cuda", "hwdownload", "format"),
        }
        for name, command in probes.items():
            started_at = time.perf_counter()
            result = subprocess.run(command, capture_output=True, text=True)
            elapsed_seconds = time.perf_counter() - started_at
            outputs[name] = result.stdout or ""
            if name == "version":
                probe_stdout = trim_log_output(result.stdout)
            else:
                probe_stdout = select_matching_lines(result.stdout or "", probe_terms[name])
            print(
                "ffmpeg probe",
                {
                    "probe": name,
                    "command": shlex.join(command),
                    "returncode": result.returncode,
                    "seconds": round(elapsed_seconds, 2),
                    "stdout": probe_stdout,
                    "stderr": trim_log_output(result.stderr),
                },
            )

        encoder_output = outputs.get("encoders", "")
        decoder_output = outputs.get("decoders", "")
        filter_output = outputs.get("filters", "")
        hwaccel_output = outputs.get("hwaccels", "")

        capabilities = {
            "h264_nvenc": "h264_nvenc" in encoder_output,
            "aac": " aac" in encoder_output,
            "cuda_hwaccel": "cuda" in hwaccel_output.lower(),
            "av1_cuvid": "av1_cuvid" in decoder_output,
            "h264_cuvid": "h264_cuvid" in decoder_output,
            "hevc_cuvid": "hevc_cuvid" in decoder_output,
            "vp9_cuvid": "vp9_cuvid" in decoder_output,
            "scale_npp": "scale_npp" in filter_output,
            "scale_cuda": "scale_cuda" in filter_output,
            "hwupload_cuda": "hwupload_cuda" in filter_output,
            "hwdownload": "hwdownload" in filter_output,
            "format": " format" in filter_output,
        }
        print(
            "ffmpeg capabilities",
            {
                "ffmpeg_path": ffmpeg_path,
                "capabilities": capabilities,
            },
        )
        return capabilities

    def probe_input_video(input_path: Path):
        ffprobe_path = shutil.which("ffprobe")
        if not ffprobe_path:
            print("ffprobe not found", {"input": describe_path(input_path)})
            return None

        result = run_subprocess(
            [
                ffprobe_path,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_name,width,height",
                "-of",
                "default=noprint_wrappers=1:nokey=0",
                str(input_path),
            ],
            "ffprobe video stream",
        )
        if result.returncode != 0 or not result.stdout.strip():
            print(
                "ffprobe failed to return video stream info",
                {
                    "input": describe_path(input_path),
                    "ffprobe_path": ffprobe_path,
                },
            )
            return None

        try:
            parsed: dict[str, str] = {}
            for line in result.stdout.splitlines():
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                parsed[key.strip()] = value.strip()

            video_info = {
                "codec_name": parsed.get("codec_name"),
                "width": int(parsed["width"]),
                "height": int(parsed["height"]),
            }
            print("input video stream", video_info)
            return video_info
        except ValueError:
            print(
                "unable to parse ffprobe video stream",
                {
                    "ffprobe_stdout": trim_log_output(result.stdout),
                },
            )
            return None

    def codec_supports_cuda_decode(codec_name: str | None, capabilities: dict[str, bool]):
        decoder_by_codec = {
            "av1": "av1_cuvid",
            "h264": "h264_cuvid",
            "hevc": "hevc_cuvid",
            "vp9": "vp9_cuvid",
        }
        decoder_name = decoder_by_codec.get(codec_name or "")
        if not decoder_name:
            return False
        return capabilities.get(decoder_name, False)

    def get_cuda_decoder_name(codec_name: str | None):
        decoder_by_codec = {
            "av1": "av1_cuvid",
            "h264": "h264_cuvid",
            "hevc": "hevc_cuvid",
            "vp9": "vp9_cuvid",
        }
        return decoder_by_codec.get(codec_name or "")

    def compute_target_dimensions(width: int, height: int):
        scale_ratio = min(MAX_OUTPUT_WIDTH / width, MAX_OUTPUT_HEIGHT / height, 1.0)
        target_width = max(2, int(width * scale_ratio))
        target_height = max(2, int(height * scale_ratio))

        # Keep 4:2:0-compatible dimensions while preserving the aspect-ratio-decrease behavior.
        if target_width % 2 != 0:
            target_width -= 1
        if target_height % 2 != 0:
            target_height -= 1

        target_width = max(2, target_width)
        target_height = max(2, target_height)
        return target_width, target_height

    def build_filter_chain(
        pipeline: str,
        target_width: int | None,
        target_height: int | None,
    ):
        if target_width and target_height:
            target_size = f"{target_width}:{target_height}"
            cpu_scale = f"scale={target_size},format=yuv420p"
            if pipeline == "gpu_decode_gpu_scale_npp_gpu_encode":
                return f"scale_npp={target_size}:format=nv12,hwdownload,format=nv12"
            if pipeline == "gpu_decode_gpu_scale_cuda_gpu_encode":
                return f"scale_cuda={target_size},hwdownload,format=nv12"
            if pipeline == "gpu_decode_gpu_scale_cuda_named_gpu_encode":
                return f"scale_cuda=w={target_width}:h={target_height},hwdownload,format=nv12"
            if pipeline == "gpu_decode_cpu_scale_gpu_encode":
                return f"hwdownload,format=nv12,scale={target_size},format=yuv420p"
            if pipeline == "cpu_decode_gpu_scale_cuda_gpu_encode":
                return (
                    f"format=yuv420p,hwupload_cuda,scale_cuda={target_size},"
                    "hwdownload,format=yuv420p"
                )
            if pipeline == "cpu_decode_gpu_scale_cuda_named_gpu_encode":
                return (
                    f"format=yuv420p,hwupload_cuda,scale_cuda=w={target_width}:h={target_height},"
                    "hwdownload,format=yuv420p"
                )
            if pipeline == "cpu_decode_cpu_scale_gpu_encode":
                return cpu_scale
        else:
            cpu_scale_expr = (
                "scale=w=min(1920\\,iw):h=min(1080\\,ih):"
                "force_original_aspect_ratio=decrease,format=yuv420p"
            )
            if pipeline == "gpu_decode_gpu_scale_npp_gpu_encode":
                return (
                    "scale_npp=w=min(1920\\,iw):h=min(1080\\,ih):"
                    "force_original_aspect_ratio=decrease:format=nv12,"
                    "hwdownload,format=nv12"
                )
            if pipeline == "gpu_decode_gpu_scale_cuda_gpu_encode":
                return (
                    "scale_cuda=w=min(1920\\,iw):h=min(1080\\,ih):"
                    "force_original_aspect_ratio=decrease,"
                    "hwdownload,format=nv12"
                )
            if pipeline == "gpu_decode_gpu_scale_cuda_named_gpu_encode":
                return (
                    "scale_cuda=w=min(1920\\,iw):h=min(1080\\,ih):"
                    "force_original_aspect_ratio=decrease,"
                    "hwdownload,format=nv12"
                )
            if pipeline == "gpu_decode_cpu_scale_gpu_encode":
                return (
                    "hwdownload,format=nv12,"
                    "scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease,"
                    "format=yuv420p"
                )
            if pipeline == "cpu_decode_gpu_scale_cuda_gpu_encode":
                return (
                    "format=yuv420p,hwupload_cuda,"
                    "scale_cuda=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease,"
                    "hwdownload,format=yuv420p"
                )
            if pipeline == "cpu_decode_gpu_scale_cuda_named_gpu_encode":
                return (
                    "format=yuv420p,hwupload_cuda,"
                    "scale_cuda=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease,"
                    "hwdownload,format=yuv420p"
                )
            if pipeline == "cpu_decode_cpu_scale_gpu_encode":
                return cpu_scale_expr
        raise ValueError(f"unsupported pipeline: {pipeline}")

    def build_ffmpeg_command(
        ffmpeg_path: str,
        input_path: Path,
        output_path: Path,
        pipeline: str,
        target_width: int | None,
        target_height: int | None,
        video_bitrate_kbps: int,
        input_codec_name: str | None,
    ):
        command = [ffmpeg_path, "-y"]
        if pipeline.startswith("gpu_decode_"):
            command.extend(["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"])
            cuda_decoder_name = get_cuda_decoder_name(input_codec_name)
            if cuda_decoder_name:
                command.extend(["-c:v", cuda_decoder_name])

        command.extend(
            [
                "-i",
                str(input_path),
                "-vf",
                build_filter_chain(pipeline, target_width, target_height),
                "-c:v",
                "h264_nvenc",
                "-preset",
                "p3",
                "-rc",
                "vbr",
                "-b:v",
                f"{video_bitrate_kbps}k",
                "-maxrate",
                f"{video_bitrate_kbps}k",
                "-bufsize",
                f"{video_bitrate_kbps * 2}k",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                f"{AUDIO_BITRATE_KBPS}k",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
        return command

    def run_ffmpeg_attempt(
        ffmpeg_path: str,
        input_path: Path,
        output_path: Path,
        pipeline: str,
        target_width: int | None,
        target_height: int | None,
        video_bitrate_kbps: int,
        input_codec_name: str | None,
    ):
        output_path.unlink(missing_ok=True)
        command = build_ffmpeg_command(
            ffmpeg_path=ffmpeg_path,
            input_path=input_path,
            output_path=output_path,
            pipeline=pipeline,
            target_width=target_width,
            target_height=target_height,
            video_bitrate_kbps=video_bitrate_kbps,
            input_codec_name=input_codec_name,
        )

        print(
            "starting ffmpeg attempt",
            {
                "pipeline": pipeline,
                "command": shlex.join(command),
                "ffmpeg_path": ffmpeg_path,
                "input": describe_path(input_path),
                "input_codec_name": input_codec_name,
                "input_cuda_decoder": get_cuda_decoder_name(input_codec_name) if pipeline.startswith("gpu_decode_") else None,
                "target_width": target_width,
                "target_height": target_height,
            },
        )

        started_at = time.perf_counter()
        result = subprocess.run(command, capture_output=True, text=True)
        elapsed_seconds = time.perf_counter() - started_at

        attempt_summary = {
            "pipeline": pipeline,
            "command": shlex.join(command),
            "returncode": result.returncode,
            "seconds": round(elapsed_seconds, 2),
            "ffmpeg_path": ffmpeg_path,
            "input": describe_path(input_path),
            "output": describe_path(output_path),
            "stdout": trim_log_output(result.stdout),
            "stderr": trim_log_output(result.stderr),
        }

        if result.returncode == 0:
            print("ffmpeg attempt succeeded", attempt_summary)
            return {"ok": True, "summary": attempt_summary}

        print("ffmpeg attempt failed", attempt_summary)
        return {"ok": False, "summary": attempt_summary}

    total_started_at = time.perf_counter()
    effective_target_size_mb = TARGET_SIZE_MB * TARGET_SIZE_HEADROOM
    total_bitrate_kbps = max(100, (effective_target_size_mb * 8 * 1024) / duration)
    video_bitrate_kbps = int(total_bitrate_kbps - AUDIO_BITRATE_KBPS)

    account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    access_key_id = os.environ["CLOUDFLARE_ACCESS_KEY_ID"]
    secret_access_key = os.environ["CLOUDFLARE_SECRET_ACCESS_KEY"]
    bucket_name = os.environ["R2_BUCKET_NAME"]

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name="auto",
    )
    transfer_config = TransferConfig(
        multipart_threshold=8 * 1024 * 1024,
        multipart_chunksize=8 * 1024 * 1024,
        max_concurrency=20,
        use_threads=True,
    )

    input_path = Path("/tmp") / f"clipcat-input-{uuid.uuid4()}.mp4"
    output_path = Path("/tmp") / f"clipcat-{uuid.uuid4()}.mp4"

    try:
        ffmpeg_path = shutil.which("ffmpeg") or "ffmpeg"
        print(
            "starting compression",
            {
                "input_key": input_key,
                "output_key": output_key,
                "duration": duration,
                "video_bitrate_kbps": video_bitrate_kbps,
                "audio_bitrate_kbps": AUDIO_BITRATE_KBPS,
                "ffmpeg_path": ffmpeg_path,
            },
        )

        download_started_at = time.perf_counter()
        s3.download_file(bucket_name, input_key, str(input_path), Config=transfer_config)
        download_seconds = time.perf_counter() - download_started_at
        print(
            "downloaded input",
            {
                "input": describe_path(input_path),
                "download_seconds": round(download_seconds, 2),
            },
        )

        capabilities = probe_ffmpeg_capabilities(ffmpeg_path)
        input_video = probe_input_video(input_path)
        target_width = None
        target_height = None
        input_codec_name = None
        if input_video:
            input_codec_name = input_video["codec_name"]
            target_width, target_height = compute_target_dimensions(
                input_video["width"],
                input_video["height"],
            )
            print(
                "resolved output dimensions",
                {
                    "input_codec_name": input_codec_name,
                    "input_width": input_video["width"],
                    "input_height": input_video["height"],
                    "target_width": target_width,
                    "target_height": target_height,
                },
            )

        pipeline_attempts: list[str] = []
        can_use_cuda_decode = codec_supports_cuda_decode(input_codec_name, capabilities)
        can_use_cuda_scale_from_cpu = capabilities["scale_cuda"] and capabilities["hwupload_cuda"]

        print(
            "input decode planning",
            {
                "input_codec_name": input_codec_name,
                "can_use_cuda_decode": can_use_cuda_decode,
                "can_use_cuda_scale_from_cpu": can_use_cuda_scale_from_cpu,
            },
        )

        if can_use_cuda_decode and capabilities["scale_npp"]:
            pipeline_attempts.append("gpu_decode_gpu_scale_npp_gpu_encode")
        if can_use_cuda_decode and capabilities["scale_cuda"]:
            pipeline_attempts.append("gpu_decode_gpu_scale_cuda_gpu_encode")
            pipeline_attempts.append("gpu_decode_gpu_scale_cuda_named_gpu_encode")
        if can_use_cuda_decode:
            pipeline_attempts.append("gpu_decode_cpu_scale_gpu_encode")
        if can_use_cuda_scale_from_cpu:
            pipeline_attempts.append("cpu_decode_gpu_scale_cuda_gpu_encode")
            pipeline_attempts.append("cpu_decode_gpu_scale_cuda_named_gpu_encode")
        pipeline_attempts.extend(
            [
                "cpu_decode_cpu_scale_gpu_encode",
            ]
        )

        print(
            "planned ffmpeg pipelines",
            {
                "pipelines": pipeline_attempts,
                "capabilities": capabilities,
            },
        )

        compression_started_at = time.perf_counter()
        ffmpeg_attempts = []
        successful_pipeline = None
        for pipeline in pipeline_attempts:
            attempt_result = run_ffmpeg_attempt(
                ffmpeg_path=ffmpeg_path,
                input_path=input_path,
                output_path=output_path,
                pipeline=pipeline,
                target_width=target_width,
                target_height=target_height,
                video_bitrate_kbps=video_bitrate_kbps,
                input_codec_name=input_codec_name,
            )
            ffmpeg_attempts.append(attempt_result["summary"])
            if attempt_result["ok"]:
                successful_pipeline = pipeline
                break

        compression_seconds = time.perf_counter() - compression_started_at

        if not successful_pipeline:
            last_attempt = ffmpeg_attempts[-1] if ffmpeg_attempts else None
            print(
                "all ffmpeg attempts failed",
                {
                    "attempts": ffmpeg_attempts,
                    "ffmpeg_path": ffmpeg_path,
                    "input": describe_path(input_path),
                    "output": describe_path(output_path),
                },
            )
            return {
                "ok": False,
                "error": {
                    "type": "ffmpeg_failed",
                    "message": "all ffmpeg pipeline attempts exited with a non-zero status",
                    "returncode": last_attempt["returncode"] if last_attempt else None,
                    "stderr_tail": last_attempt["stderr"] if last_attempt else None,
                    "stdout_tail": last_attempt["stdout"] if last_attempt else None,
                    "ffmpeg_path": ffmpeg_path,
                    "attempts": ffmpeg_attempts,
                },
            }

        print(
            "ffmpeg pipeline selected",
            {
                "pipeline": successful_pipeline,
                "compression_seconds": round(compression_seconds, 2),
            },
        )

        upload_started_at = time.perf_counter()
        s3.upload_file(
            str(output_path),
            bucket_name,
            output_key,
            Config=transfer_config,
            ExtraArgs={"ContentType": "video/mp4"},
        )
        upload_seconds = time.perf_counter() - upload_started_at

        output_size = output_path.stat().st_size
        total_seconds = time.perf_counter() - total_started_at
        print(
            "completed compression",
            {
                "output_key": output_key,
                "output_size": output_size,
                "pipeline": successful_pipeline,
                "download_seconds": round(download_seconds, 2),
                "compression_seconds": round(compression_seconds, 2),
                "upload_seconds": round(upload_seconds, 2),
                "total_seconds": round(total_seconds, 2),
                "modal_region": os.environ.get("MODAL_REGION"),
            },
        )

        return {
            "ok": True,
            "data": {
                "input_key": input_key,
                "output_key": output_key,
                "duration": duration,
                "output_size": output_size,
                "video_bitrate_kbps": video_bitrate_kbps,
                "pipeline": successful_pipeline,
            },
        }
    except Exception as exc:
        print(
            "compression failed",
            {
                "message": str(exc),
                "input": describe_path(input_path),
                "output": describe_path(output_path),
            },
        )
        return {
            "ok": False,
            "error": {
                "type": "compression_failed",
                "message": str(exc),
            },
        }
    finally:
        for path in [input_path, output_path]:
            path.unlink(missing_ok=True)

@app.local_entrypoint()
def main(input_key: str, output_key: str, duration: float):
    result = compress.remote(input_key, output_key, duration)
    print("compressed video", result)
