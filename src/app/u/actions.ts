'use server'

import r2 from '@/lib/r2'

const ONE_HOUR = 3600

export async function getUploadUrl(key: string, contentType: string) {
  return r2.presign(key, {
    expiresIn: ONE_HOUR,
    method: 'PUT',
    type: contentType,
  })
}
