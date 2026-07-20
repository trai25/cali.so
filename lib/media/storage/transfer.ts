export const MAX_ORIGINAL_UPLOAD_BYTES = 50 * 1024 * 1024
export const MAX_ORIGINAL_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024

export function originalUploadChunkCount(byteSize: number) {
  return Math.ceil(byteSize / MAX_ORIGINAL_UPLOAD_CHUNK_BYTES)
}

export function originalUploadChunkByteLength(
  byteSize: number,
  chunkIndex: number,
) {
  return Math.min(
    MAX_ORIGINAL_UPLOAD_CHUNK_BYTES,
    byteSize - chunkIndex * MAX_ORIGINAL_UPLOAD_CHUNK_BYTES,
  )
}
