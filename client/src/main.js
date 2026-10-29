import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'leaflet/dist/leaflet.css'
import './styles/tokens.css'
import './styles/app.css'
import App from './App.vue'
import router from './router.js'
import { applySavedTheme } from './lib/theme.js'

applySavedTheme()
createApp(App).use(router).mount('#app')
