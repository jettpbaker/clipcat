import {
  Input,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  Conversion,
  ALL_FORMATS,
  BlobSource,
  QUALITY_HIGH,
} from 'mediabunny'

export default async function trimVideo(video: File, start: number, end: number) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(video),
  })

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  })

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      codec: 'avc',
      hardwareAcceleration: 'prefer-hardware',
      bitrate: QUALITY_HIGH,
    },
    trim: {
      start,
      end,
    },
  })

  await conversion.execute()

  if (!conversion.isValid) throw new Error('Error trimming video!')

  const buffer = output.target.buffer
  if (!buffer) throw new Error('Error trimming video!')
  return new File([buffer], video.name, { type: 'video/mp4' })
}
