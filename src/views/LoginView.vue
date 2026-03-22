<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { login } from '../composables/useAuth'

const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const errorMessage = ref('')

function submitLogin() {
  const isValid = login(username.value.trim(), password.value)

  if (!isValid) {
    errorMessage.value = 'Invalid username or password.'
    return
  }

  const redirectPath = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.replace(redirectPath)
}
</script>

<template>
  <section class="login-wrapper">
    <form class="login-card" @submit.prevent="submitLogin">
      <h2>Sign in to Email Inbox</h2>

      <label for="email-inbox-username">Username</label>
      <input id="email-inbox-username" v-model="username" type="text" autocomplete="username" required />

      <label for="email-inbox-password">Password</label>
      <input id="email-inbox-password" v-model="password" type="password" autocomplete="current-password" required />

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

      <button type="submit">Enter Inbox</button>
    </form>
  </section>
</template>

<style scoped>
.login-wrapper {
  min-height: 65vh;
  display: grid;
  place-items: center;
  padding: 1rem;
}

.login-card {
  width: min(24rem, 100%);
  display: grid;
  gap: 0.65rem;
  background: #ffffff;
  border: 1px solid #d7d7d7;
  border-radius: 0.6rem;
  padding: 1rem;
}

.login-card h2 {
  margin: 0 0 0.3rem;
}

.login-card input {
  padding: 0.55rem;
  border-radius: 0.4rem;
  border: 1px solid #b6b6b6;
}

.login-card button {
  margin-top: 0.35rem;
  padding: 0.6rem;
  border: none;
  border-radius: 0.4rem;
  background: #0a5dca;
  color: #fff;
  cursor: pointer;
}

.error {
  color: #c80f0f;
  margin: 0;
}
</style>
