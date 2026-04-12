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
TARGET_SIZE_HEADROOM = 0.95
AUDIO_BITRATE_KBPS = 128
BITRATE_720P_THRESHOLD_KBPS = 4000
MAX_OUTPUT_WIDTH_1080P = 1920
MAX_OUTPUT_HEIGHT_1080P = 1080
MAX_OUTPUT_WIDTH_720P = 1280
MAX_OUTPUT_HEIGHT_720P = 720
FFMPEG_LOG_OUTPUT_LIMIT = 40_000


@app.function(
    image=image,
    secrets=[r2_secret],
    gpu=["L40S", "L4"],
    region=["ap-northeast", "ap"],
)
def compress(input_key: str, output_key: str):
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

    def probe_input_video(input_path: Path):
        ffprobe_path = shutil.which("ffprobe")
        if not ffprobe_path:
            print("ffprobe not found", {"input": describe_path(input_path)})
            return None

        started_at = time.perf_counter()
        result = subprocess.run(
            [
                ffprobe_path,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_name,width,height",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=0",
                str(input_path),
            ],
            capture_output=True,
            text=True,
        )
        elapsed_seconds = time.perf_counter() - started_at
        if result.returncode != 0 or not result.stdout.strip():
            print(
                "ffprobe failed to return video stream info",
                {
                    "command": shlex.join(
                        [
                            ffprobe_path,
                            "-v",
                            "error",
                            "-select_streams",
                            "v:0",
                            "-show_entries",
                            "stream=codec_name,width,height",
                            "-show_entries",
                            "format=duration",
                            "-of",
                            "default=noprint_wrappers=1:nokey=0",
                            str(input_path),
                        ]
                    ),
                    "input": describe_path(input_path),
                    "ffprobe_path": ffprobe_path,
                    "returncode": result.returncode,
                    "stderr": trim_log_output(result.stderr),
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
                "duration": float(parsed["duration"]),
            }
            print(
                "input video stream",
                {
                    **video_info,
                    "seconds": round(elapsed_seconds, 2),
                },
            )
            return video_info
        except ValueError:
            print(
                "unable to parse ffprobe video stream",
                {
                    "ffprobe_stdout": trim_log_output(result.stdout),
                },
            )
            return None

    def get_cuda_decoder_name(codec_name: str | None):
        decoder_by_codec = {
            "av1": "av1_cuvid",
            "h264": "h264_cuvid",
            "hevc": "hevc_cuvid",
            "vp9": "vp9_cuvid",
        }
        return decoder_by_codec.get(codec_name or "")

    def compute_target_dimensions(
        width: int,
        height: int,
        max_width: int,
        max_height: int,
    ):
        scale_ratio = min(max_width / width, max_height / height, 1.0)
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

    def build_target_size(target_width: int | None, target_height: int | None):
        if target_width and target_height:
            return f"{target_width}:{target_height}"
        return "w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease"

    def build_output_args(
        output_path: Path,
        video_bitrate_kbps: int,
    ):
        return [
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

    def build_preferred_ffmpeg_command(
        ffmpeg_path: str,
        input_path: Path,
        output_path: Path,
        target_width: int | None,
        target_height: int | None,
        video_bitrate_kbps: int,
        input_codec_name: str | None,
    ):
        target_size = build_target_size(target_width, target_height)
        cuda_decoder_name = get_cuda_decoder_name(input_codec_name)
        command = [ffmpeg_path, "-y"]
        if cuda_decoder_name:
            command.extend(["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"])
            command.extend(["-c:v", cuda_decoder_name])

        command.extend(
            [
                "-i",
                str(input_path),
                "-vf",
                (
                    f"scale_cuda={target_size},hwdownload,format=nv12"
                    if cuda_decoder_name
                    else f"format=yuv420p,hwupload_cuda,scale_cuda={target_size},hwdownload,format=yuv420p"
                ),
            ]
        )
        command.extend(build_output_args(output_path, video_bitrate_kbps))
        return command

    def build_fallback_ffmpeg_command(
        ffmpeg_path: str,
        input_path: Path,
        output_path: Path,
        target_width: int | None,
        target_height: int | None,
        video_bitrate_kbps: int,
        input_codec_name: str | None,
    ):
        target_size = build_target_size(target_width, target_height)
        cuda_decoder_name = get_cuda_decoder_name(input_codec_name)
        command = [ffmpeg_path, "-y"]
        if cuda_decoder_name:
            command.extend(
                [
                    "-hwaccel",
                    "cuda",
                    "-hwaccel_output_format",
                    "cuda",
                    "-c:v",
                    cuda_decoder_name,
                ]
            )

        command.extend(
            [
                "-i",
                str(input_path),
                "-vf",
                (
                    f"hwdownload,format=nv12,scale={target_size},format=yuv420p"
                    if cuda_decoder_name
                    else f"scale={target_size},format=yuv420p"
                ),
            ]
        )
        command.extend(build_output_args(output_path, video_bitrate_kbps))
        return command

    def run_ffmpeg_command(
        label: str,
        command: list[str],
        input_path: Path,
        output_path: Path,
    ):
        output_path.unlink(missing_ok=True)
        started_at = time.perf_counter()
        result = subprocess.run(command, capture_output=True, text=True)
        elapsed_seconds = time.perf_counter() - started_at

        attempt_summary = {
            "label": label,
            "command": shlex.join(command),
            "returncode": result.returncode,
            "seconds": round(elapsed_seconds, 2),
            "input": describe_path(input_path),
            "output": describe_path(output_path),
            "stdout": trim_log_output(result.stdout),
            "stderr": trim_log_output(result.stderr),
        }

        if result.returncode == 0:
            print(
                "ffmpeg command succeeded",
                {
                    "label": label,
                    "seconds": round(elapsed_seconds, 2),
                    "output": describe_path(output_path),
                },
            )
            return {"ok": True, "summary": attempt_summary}

        print("ffmpeg command failed", attempt_summary)
        return {"ok": False, "summary": attempt_summary}

    total_started_at = time.perf_counter()

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
        multipart_threshold=64 * 1024 * 1024,
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

        input_video = probe_input_video(input_path)
        target_width = None
        target_height = None
        input_codec_name = None
        source_duration = None
        max_output_width = MAX_OUTPUT_WIDTH_1080P
        max_output_height = MAX_OUTPUT_HEIGHT_1080P
        if input_video:
            input_codec_name = input_video["codec_name"]
            source_duration = input_video["duration"]
        if not source_duration or source_duration <= 0:
            raise ValueError("ffprobe did not return a valid duration")

        effective_target_size_mb = TARGET_SIZE_MB * TARGET_SIZE_HEADROOM
        total_bitrate_kbps = max(100, (effective_target_size_mb * 8 * 1024) / source_duration)
        video_bitrate_kbps = max(100, int(total_bitrate_kbps - AUDIO_BITRATE_KBPS))
        if video_bitrate_kbps < BITRATE_720P_THRESHOLD_KBPS:
            max_output_width = MAX_OUTPUT_WIDTH_720P
            max_output_height = MAX_OUTPUT_HEIGHT_720P

        if input_video:
            target_width, target_height = compute_target_dimensions(
                input_video["width"],
                input_video["height"],
                max_output_width,
                max_output_height,
            )

        print(
            "resolved bitrate target",
            {
                "source_duration": round(source_duration, 3),
                "video_bitrate_kbps": video_bitrate_kbps,
                "audio_bitrate_kbps": AUDIO_BITRATE_KBPS,
                "resolution_cap_width": max_output_width,
                "resolution_cap_height": max_output_height,
            },
        )

        if input_video:
            print(
                "resolved output dimensions",
                {
                    "input_codec_name": input_codec_name,
                    "input_width": input_video["width"],
                    "input_height": input_video["height"],
                    "source_duration": round(source_duration, 3),
                    "target_width": target_width,
                    "target_height": target_height,
                },
            )

        preferred_command = build_preferred_ffmpeg_command(
            ffmpeg_path=ffmpeg_path,
            input_path=input_path,
            output_path=output_path,
            target_width=target_width,
            target_height=target_height,
            video_bitrate_kbps=video_bitrate_kbps,
            input_codec_name=input_codec_name,
        )
        fallback_command = build_fallback_ffmpeg_command(
            ffmpeg_path=ffmpeg_path,
            input_path=input_path,
            output_path=output_path,
            target_width=target_width,
            target_height=target_height,
            video_bitrate_kbps=video_bitrate_kbps,
            input_codec_name=input_codec_name,
        )

        print(
            "planned ffmpeg paths",
            {
                "input_codec_name": input_codec_name,
                "preferred_decode": "gpu" if get_cuda_decoder_name(input_codec_name) else "cpu",
                "preferred_scale": "gpu",
                "fallback_scale": "cpu",
            },
        )

        compression_started_at = time.perf_counter()
        ffmpeg_attempts = []
        successful_command = None

        attempt_result = run_ffmpeg_command(
            label="preferred",
            command=preferred_command,
            input_path=input_path,
            output_path=output_path,
        )
        ffmpeg_attempts.append(attempt_result["summary"])
        if attempt_result["ok"]:
            successful_command = "preferred"
        else:
            attempt_result = run_ffmpeg_command(
                label="fallback",
                command=fallback_command,
                input_path=input_path,
                output_path=output_path,
            )
            ffmpeg_attempts.append(attempt_result["summary"])
            if attempt_result["ok"]:
                successful_command = "fallback"

        compression_seconds = time.perf_counter() - compression_started_at

        if not successful_command:
            last_attempt = ffmpeg_attempts[-1] if ffmpeg_attempts else None
            print(
                "ffmpeg failed",
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
                    "message": "both ffmpeg commands exited with a non-zero status",
                    "returncode": last_attempt["returncode"] if last_attempt else None,
                    "stderr_tail": last_attempt["stderr"] if last_attempt else None,
                    "stdout_tail": last_attempt["stdout"] if last_attempt else None,
                    "ffmpeg_path": ffmpeg_path,
                    "attempts": ffmpeg_attempts,
                },
            }

        print(
            "ffmpeg path selected",
            {
                "label": successful_command,
                "compression_seconds": round(compression_seconds, 2),
            },
        )

        upload_started_at = time.perf_counter()
        s3.upload_file(
            str(output_path),
            bucket_name,
            output_key,
            Config=transfer_config,
            ExtraArgs={"ContentType": "video/mp4", "CacheControl": "public, max-age=31536000, immutable",},
        )
        upload_seconds = time.perf_counter() - upload_started_at

        output_size = output_path.stat().st_size
        total_seconds = time.perf_counter() - total_started_at
        print(
            "completed compression",
            {
                "output_key": output_key,
                "output_size": output_size,
                "path": successful_command,
                "video_bitrate_kbps": video_bitrate_kbps,
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
                "duration": source_duration,
                "output_size": output_size,
                "video_bitrate_kbps": video_bitrate_kbps,
                "pipeline": successful_command,
                "path": successful_command,
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
def main(input_key: str, output_key: str):
    result = compress.remote(input_key, output_key)
    print("compressed video", result)
