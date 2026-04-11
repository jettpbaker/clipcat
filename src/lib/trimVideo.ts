import {
  Input,
  Output,
  Mp4OutputFormat,
  BufferTarget,
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
} from 'mediabunny'

import type { EncodedPacket } from 'mediabunny'

export default async function trimVideo(video: File, start: number, end: number) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(video),
  })

  const videoTrack = await input.getPrimaryVideoTrack()
  if (!videoTrack) throw new Error('Failed to get primary video track')

  const audioTrack = await input.getPrimaryAudioTrack()
  if (!audioTrack) throw new Error('Failed to get primary audio track')

  const videoDecoderConfig = await videoTrack.getDecoderConfig()
  if (!videoDecoderConfig) throw new Error('Failed to get video decoder config')

  const audioDecoderConfig = await audioTrack.getDecoderConfig()
  if (!audioDecoderConfig) throw new Error('Failed to get audio decoder config')

  const videoSink = new EncodedPacketSink(videoTrack)
  const audioSink = new EncodedPacketSink(audioTrack)

  const keyStartPacket = await videoSink.getKeyPacket(start, { verifyKeyPackets: true })
  if (!keyStartPacket) throw new Error('Failed to get keyStartPacket')
  const offsetAmount = keyStartPacket.timestamp

  const videoEndPacket = await videoSink.getPacket(end, { metadataOnly: true })
  if (!videoEndPacket) throw new Error('Failed to get video endPacket')

  const audioStartPacket = await audioSink.getPacket(offsetAmount)
  if (!audioStartPacket) throw new Error('Failed to get audio startPacket')

  const audioEndPacket = await audioSink.getPacket(end, { metadataOnly: true })
  if (!audioEndPacket) throw new Error('Failed to get audio endPacket')

  console.log(`Ideal Start: ${start}`)
  console.log(`Audio Key Start Packet Start: ${audioStartPacket?.timestamp}`)
  console.log(`Key Start Packet Start: ${offsetAmount}`)

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  })

  const videoCodec = videoTrack.codec
  if (!videoCodec) throw new Error('Failed to get video track codec')

  const audioCodec = audioTrack.codec
  if (!audioCodec) throw new Error('Failed to get audio track codec')

  const videoOutputPackets = new EncodedVideoPacketSource(videoCodec)
  const audioOutputPackets = new EncodedAudioPacketSource(audioCodec)

  output.addVideoTrack(videoOutputPackets)
  output.addAudioTrack(audioOutputPackets)
  await output.start()

  async function writeVideoPacket(
    packet: EncodedPacket,
    offset: number,
    output: EncodedVideoPacketSource,
    decoderConfig?: VideoDecoderConfig,
  ) {
    const timestamp = packet.timestamp - offset
    const offsetPacket = packet.clone({ timestamp })

    if (decoderConfig) {
      await output.add(offsetPacket, { decoderConfig })
      return
    }
    await output.add(offsetPacket)
  }

  async function writeAudioPacket(
    packet: EncodedPacket,
    offset: number,
    output: EncodedAudioPacketSource,
    decoderConfig?: AudioDecoderConfig,
  ) {
    const timestamp = packet.timestamp - offset
    const offsetPacket = packet.clone({ timestamp })

    if (decoderConfig) {
      await output.add(offsetPacket, { decoderConfig })
      return
    }
    await output.add(offsetPacket)
  }

  const videoStart = keyStartPacket.timestamp
  const audioStart = audioStartPacket.timestamp
  const clipStart = Math.min(videoStart, audioStart)

  let firstVideoIteration = true
  let firstAudioIteration = true
  const videoIterator = videoSink.packets(keyStartPacket, videoEndPacket)
  const audioIterator = audioSink.packets(audioStartPacket, audioEndPacket)

  let videoCurrent = await videoIterator.next()
  let audioCurrent = await audioIterator.next()

  while (!videoCurrent.done || !audioCurrent.done) {
    const videoPacket = videoCurrent.value
    const audioPacket = audioCurrent.value
    if (videoPacket && !audioPacket) {
      await writeVideoPacket(
        videoPacket,
        clipStart,
        videoOutputPackets,
        firstVideoIteration ? videoDecoderConfig : undefined,
      )
      firstVideoIteration = false
      videoCurrent = await videoIterator.next()
      continue
    }

    if (!videoPacket && audioPacket) {
      await writeAudioPacket(
        audioPacket,
        clipStart,
        audioOutputPackets,
        firstAudioIteration ? audioDecoderConfig : undefined,
      )
      firstAudioIteration = false
      audioCurrent = await audioIterator.next()
      continue
    }

    if (!videoPacket || !audioPacket) {
      throw new Error('Both video and audio packet are null')
    }

    if (videoPacket.timestamp < audioPacket.timestamp) {
      await writeVideoPacket(
        videoPacket,
        clipStart,
        videoOutputPackets,
        firstVideoIteration ? videoDecoderConfig : undefined,
      )
      firstVideoIteration = false
      videoCurrent = await videoIterator.next()
      continue
    }

    await writeAudioPacket(
      audioPacket,
      clipStart,
      audioOutputPackets,
      firstAudioIteration ? audioDecoderConfig : undefined,
    )
    firstAudioIteration = false
    audioCurrent = await audioIterator.next()
  }
  videoOutputPackets.close()
  audioOutputPackets.close()
  await output.finalize()

  const buffer = output.target.buffer
  if (!buffer) throw new Error('Failed to create output buffer')

  return new File([buffer], video.name, { type: 'video/mp4' })
}
