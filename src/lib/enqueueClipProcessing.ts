'server-only'

import { ModalClient } from 'modal'

export default async function enqueueClipProcessing(
  clipId: string,
  inputKey: string,
  outputKey: string,
): Promise<string> {
  const modal = new ModalClient()
  const compress = await modal.functions.fromName('clipcat-transcode', 'compress')

  const call = await compress.spawn([], {
    clip_id: clipId,
    input_key: inputKey,
    output_key: outputKey,
  })

  return call.functionCallId
}
