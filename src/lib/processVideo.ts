'server-only'

import { ModalClient } from 'modal'

type ProcessVideoProps = {
  inputKey: string
  outputKey: string
}

type ProcessVideoResult =
  | {
      ok: true
      data: {
        inputKey: string
        outputKey: string
        duration: number
        outputSize: number
        videoBitrateKbps: number
      }
    }
  | {
      ok: false
      error: {
        type: string
        message: string
        returncode?: number
        stderrTail?: string | null
      }
    }

export default async function processVideo({
  inputKey,
  outputKey,
}: ProcessVideoProps): Promise<ProcessVideoResult> {
  const modal = new ModalClient()
  const compress = await modal.functions.fromName('clipcat-transcode', 'compress')

  try {
    const result = await compress.remote([], {
      input_key: inputKey,
      output_key: outputKey,
    })

    if (result.ok) {
      return {
        ok: true,
        data: {
          inputKey: result.data.input_key,
          outputKey: result.data.output_key,
          duration: result.data.duration,
          outputSize: result.data.output_size,
          videoBitrateKbps: result.data.video_bitrate_kbps,
        },
      }
    }

    return {
      ok: false,
      error: {
        type: result.error.type,
        message: result.error.message,
        returncode: result.error.returncode,
        stderrTail: result.error.stderr_tail,
      },
    }
  } catch (err) {
    console.error(`Error processing video: ${err}`)
    if (err instanceof Error) {
      return {
        ok: false,
        error: {
          type: 'modal_call_failed',
          message: err.message,
        },
      }
    }

    return {
      ok: false,
      error: {
        type: 'modal_call_failed',
        message: String(err),
      },
    }
  }
}
