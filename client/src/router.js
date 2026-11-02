import { createRouter, createWebHistory } from 'vue-router'
import { session } from './api/index.js'

const routes = [
  { path: '/', name: 'home', component: () => import('./views/EntryView.vue'), meta: { title: 'Home' } },
  { path: '/signin', name: 'signin', component: () => import('./views/SignInView.vue'), meta: { title: 'Sign in' } },
  { path: '/discover', name: 'discover', component: () => import('./views/DiscoverView.vue'), meta: { title: 'Discover' } },
  { path: '/new', name: 'new', component: () => import('./views/NewHangoutView.vue'), meta: { auth: true, title: 'Create a jio' } },
  { path: '/h/:id', name: 'hangout', component: () => import('./views/HangoutView.vue'), meta: { auth: true, title: 'Hangout' } },
  { path: '/j/:token', name: 'join', component: () => import('./views/JoinView.vue'), meta: { title: 'Join', bare: true } },
  { path: '/o/:id', name: 'openjio', component: () => import('./views/JoinView.vue'), meta: { title: 'Open Jio', bare: true } },
  { path: '/profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { auth: true, title: 'Profile' } },
  { path: '/how', name: 'how', component: () => import('./views/HowView.vue'), meta: { title: 'How planning works' } },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Not found' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // Waits for the outgoing page to fade (App.vue, 120 ms) so the jump is not seen; never animated.
  scrollBehavior: (to, from, saved) => {
    if (!saved && to.path === from.path) return undefined
    return new Promise((resolve) => setTimeout(() => resolve({ ...(saved || { top: 0 }), behavior: 'instant' }), 130))
  },
})

router.beforeEach((to) => {
  if (to.meta.auth && !session.userId) return { name: 'signin', query: { next: to.fullPath } }
})

router.afterEach((to) => {
  const title = to.name === 'discover' && to.query.type === 'hangout' ? 'Open Jios' : to.meta.title
  document.title = to.name === 'home' && !session.userId ? 'OpenJio | Plan your next outing' : title ? `${title} | OpenJio` : 'OpenJio'
})

export default router
