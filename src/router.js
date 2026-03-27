import { createRouter, createWebHashHistory } from 'vue-router'
import AdminView from './views/AdminView.vue'
import InboxView from './views/InboxView.vue'
import InboxEmailView from './views/InboxEmailView.vue'
import StartExperimentView from './views/StartExperimentView.vue'
import UsabilityView from './views/UsabilityView.vue'
import LoginView from './views/LoginView.vue'
import { isAuthenticated } from './composables/useAuth'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'inbox',
      component: InboxView,
      meta: { requiresAuth: true }
    },
    {
      path: '/start',
      name: 'start-experiment',
      component: StartExperimentView,
      meta: { requiresAuth: true }
    },
    {
      path: '/inbox/:id',
      name: 'inbox-email',
      component: InboxEmailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/sent/:id',
      name: 'sent-email',
      component: InboxEmailView,
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { requiresAuth: true }
    },
    {
      path: '/usability',
      name: 'usability',
      component: UsabilityView,
      meta: { requiresAuth: true }
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    }
  ]
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    return {
      path: '/login',
      query: { redirect: to.fullPath }
    }
  }

  if (to.path === '/login' && isAuthenticated()) {
    return '/start'
  }

  return true
})

export default router