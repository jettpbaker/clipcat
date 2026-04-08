'use client'

import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Button
          onClick={async () => {
            const data = await authClient.signIn.social({
              provider: 'discord',
            })
            console.log(data)
          }}
        >
          Sign In with Discord
        </Button>
        <Button
          onClick={async () => {
            const data = await authClient.signOut()
            console.log(data)
          }}
        >
          Sign Out
        </Button>

        <Link href="/l">Library</Link>
        <Link href="/u">Upload</Link>
      </main>
    </div>
  )
}
