import { Settings } from 'lucide-react'
import { Button } from './ui/button'

function Header() {
	return (
		<header className='flex justify-between items-center'>
			<h1 className='text-6xl'>ClipCat</h1>
			<Button variant='outline' size='icon'>
				<Settings />
			</Button>
		</header>
	)
}

export default Header
