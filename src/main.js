import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import i18n from './js/i18n.js'
import './css/global.css'
import './scss/global.scss'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.mount('#app')
