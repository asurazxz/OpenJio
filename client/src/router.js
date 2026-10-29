import { createRouter, createWebHistory } from 'vue-router'
import { session } from './api/index.js'

const routes = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { auth: true, title: 'Home' } },
  { path: '/signin', name: 'signin', component: () => import('./views/SignInView.vue'), meta: { title: 'Sign in' } },
  { path: '/discover', name: 'discover', component: () => import('./views/DiscoverView.vue'), meta: { title: 'Discover' } },
  { path: '/new', name: 'new', component: () => import('./views/NewHangoutView.vue'), meta: { auth: true, title: 'Create a jio' } },
  { path: '/h/:id', name: 'hangout', component: () => import('./views/HangoutView.vue'), meta: { auth: true, title: 'Hangout' } },
  { path: '/j/:token', name: 'join', component: () => import('./views/JoinView.vue'), meta: { title: 'Join', bare: true } },
  { path: '/o/:id', name: 'openjio', component: () => import('./views/JoinView.vue'), meta: { title: 'Open jio', bare: true } },
  { path: '/profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { auth: true, title: 'Profile' } },
  { path: '/review', name: 'review', component: () => import('./views/ReviewView.vue'), meta: { auth: true, title: 'Review listings' } },
  { path: '/how', name: 'how', component: () => import('./views/HowView.vue'), meta: { title: 'How planning works' } },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Not found' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || (to.path !== from.path ? { top: 0 } : undefined),
})

router.beforeEach((to) => {
  if (to.meta.auth && !session.userId) return { name: 'signin', query: { next: to.fullPath } }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} | OpenJio` : 'OpenJio'
})

export default router
