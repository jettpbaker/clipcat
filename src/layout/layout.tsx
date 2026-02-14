import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<>
			<main className='h-screen w-screen'>{children}</main>
			<Toaster />
		</>
	)
}
