<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useSimulationStore } from '../composables/useSimulationStore'

const {
  usabilityQuestions,
  usabilityResponses,
  setUsabilityResponse,
  initializeSimulation
} = useSimulationStore()

const activeQuestionIndex = ref(0)

const answeredCount = computed(() => {
  return usabilityQuestions.filter((question) => {
    const value = usabilityResponses.value[question.id]
    return Number.isInteger(value) && value >= 1 && value <= 5
  }).length
})

const isComplete = computed(() => answeredCount.value === usabilityQuestions.length)

const firstUnansweredIndex = computed(() => {
  const index = usabilityQuestions.findIndex((question) => {
    const value = usabilityResponses.value[question.id]
    return !(Number.isInteger(value) && value >= 1 && value <= 5)
  })
  return index === -1 ? usabilityQuestions.length - 1 : index
})

const currentQuestion = computed(() => {
  if (usabilityQuestions.length === 0) return null
  return usabilityQuestions[activeQuestionIndex.value] || usabilityQuestions[usabilityQuestions.length - 1]
})

const currentAnswer = computed(() => {
  const question = currentQuestion.value
  if (!question) return null
  return usabilityResponses.value[question.id] || null
})

function isAnswered(questionId) {
  const value = usabilityResponses.value[questionId]
  return Number.isInteger(value) && value >= 1 && value <= 5
}

function goToQuestion(index) {
  if (index < 0 || index >= usabilityQuestions.length) return
  activeQuestionIndex.value = index
}

function updateAnswer(questionId, score) {
  setUsabilityResponse(questionId, score)

  if (activeQuestionIndex.value < usabilityQuestions.length - 1) {
    activeQuestionIndex.value += 1
  }
}

watch(firstUnansweredIndex, (index) => {
  if (answeredCount.value === 0) {
    activeQuestionIndex.value = 0
  } else if (!isComplete.value && activeQuestionIndex.value < index) {
    activeQuestionIndex.value = index
  }
}, { immediate: true })

onMounted(() => {
  initializeSimulation()
})
</script>

<template>
  <main class="usability-layout">
    <section class="panel usability-panel">
      <div class="usability-header">
        <h2>Usability Questionnaire</h2>
        <p class="meta">5-point Likert scale (1 = Strongly disagree, 5 = Strongly agree)</p>
        <p class="meta">Answered: {{ answeredCount }} / {{ usabilityQuestions.length }}</p>
        <p v-if="isComplete" class="meta">Questionnaire complete.</p>
      </div>

      <ol class="usability-progress-list">
        <li
          v-for="(question, index) in usabilityQuestions"
          :key="question.id"
          class="usability-progress-item"
          :class="{
            answered: isAnswered(question.id),
            active: index === activeQuestionIndex
          }"
          @click="goToQuestion(index)"
        >
          {{ index + 1 }}
        </li>
      </ol>

      <div v-if="currentQuestion" class="usability-question-stage">
        <article class="usability-question-card" :class="{ answered: isAnswered(currentQuestion.id) }">
          <p class="usability-question-number">Question {{ activeQuestionIndex + 1 }} / {{ usabilityQuestions.length }}</p>
          <p class="usability-question-text">{{ currentQuestion.text }}</p>

          <div class="likert-options centered" role="radiogroup" :aria-label="currentQuestion.text">
            <label
              v-for="score in [1, 2, 3, 4, 5]"
              :key="`${currentQuestion.id}-${score}`"
              class="likert-option"
              :class="{ selected: currentAnswer === score }"
            >
              <input
                type="radio"
                :name="currentQuestion.id"
                :checked="currentAnswer === score"
                @change="updateAnswer(currentQuestion.id, score)"
              />
              <span>{{ score }}</span>
            </label>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>
