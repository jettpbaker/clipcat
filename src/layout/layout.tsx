import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<>
			<div className='w-full h-full'>{children}</div>
			<Toaster />
		</>
	)
}
