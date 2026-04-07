import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import UploadForm from './upload-form'

export default async function Upload() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    return redirect('/')
  }

  return (
    <div>
      <h1>Upload</h1>
      <UploadForm user={session.user} />
    </div>
  )
}
