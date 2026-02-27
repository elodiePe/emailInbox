import { createRouter, createWebHashHistory } from 'vue-router'
import AdminView from './views/AdminView.vue'
import InboxView from './views/InboxView.vue'
import InboxEmailView from './views/InboxEmailView.vue'
import UsabilityView from './views/UsabilityView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'inbox',
      component: InboxView
    },
    {
      path: '/inbox/:id',
      name: 'inbox-email',
      component: InboxEmailView
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView
    },
    {
      path: '/usability',
      name: 'usability',
      component: UsabilityView
    }
  ]
})

export default router