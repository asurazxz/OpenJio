import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'leaflet/dist/leaflet.css'
import './styles/tokens.css'
import './styles/app.css'
import App from './App.vue'
import router from './router.js'
import { applySavedTheme } from './lib/theme.js'
import { initializeApi, session } from './api/index.js'

applySavedTheme()
try { await initializeApi() } catch (error) { session.error = error.message || 'Unable to restore your account. Please sign in again.' }
createApp(App).use(router).mount('#app')
