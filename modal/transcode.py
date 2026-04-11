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

@app.function(
    image=image,
    secrets=[r2_secret],
    gpu="L40S",
    region=["au", "ap"],
)
def compress(input_key: str, output_key: str, duration: float):
    import os
    from pathlib import Path
    import subprocess
    import time
    import uuid
    import boto3
    from boto3.s3.transfer import TransferConfig

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
        download_started_at = time.perf_counter()
        s3.download_file(bucket_name, input_key, str(input_path), Config=transfer_config)
        download_seconds = time.perf_counter() - download_started_at

        encode_args = [
            "ffmpeg",
            "-y",
            "-i",
            str(input_path),
            "-vf",
            "scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease",
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

        print("starting compression", {"input_key": input_key, "output_key": output_key})
        compression_started_at = time.perf_counter()
        subprocess.run(encode_args, check=True, capture_output=True, text=True)
        compression_seconds = time.perf_counter() - compression_started_at

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
            },
        }
    except subprocess.CalledProcessError as exc:
        stderr_tail = "\n".join(exc.stderr.splitlines()[-20:]) if exc.stderr else None
        print("ffmpeg failed", {"returncode": exc.returncode})
        return {
            "ok": False,
            "error": {
                "type": "ffmpeg_failed",
                "message": "ffmpeg exited with a non-zero status",
                "returncode": exc.returncode,
                "stderr_tail": stderr_tail,
            },
        }
    except Exception as exc:
        print("compression failed", {"message": str(exc)})
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
