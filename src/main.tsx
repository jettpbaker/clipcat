import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import Layout from '@/layout/layout'
import '@/styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
	<StrictMode>
		<Layout>
			<App />
		</Layout>
	</StrictMode>
)
