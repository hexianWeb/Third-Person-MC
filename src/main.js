import i18n from '@three/i18n.js'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import '@styles/main.scss'

const app = createApp(App)

const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.mount('#app')
