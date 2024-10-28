import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '192.168.1.247',
    proxy: {
      '/api': {
        target: 'http://localhost:9170',
        rewrite: (path) => path.replace(/^\/api/, ''),
      }
    },
  },
})
