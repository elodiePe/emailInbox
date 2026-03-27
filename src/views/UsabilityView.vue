<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useSimulationStore } from '../composables/useSimulationStore'

const {
  usabilityQuestions,
  usabilityResponses,
  demographicData,
  setUsabilityResponse,
  setDemographicField,
  initializeSimulation
} = useSimulationStore()

const activeQuestionIndex = ref(0)
const isFinished = ref(false)

function getQuestionScaleBounds(question) {
  if (!question) return { min: 1, max: 5 }
  const min = Number.isInteger(question.minScale) ? question.minScale : 1
  const max = Number.isInteger(question.maxScale) ? question.maxScale : 5
  return { min, max }
}

function isQuestionAnswered(question, value) {
  const { min, max } = getQuestionScaleBounds(question)
  return Number.isInteger(value) && value >= min && value <= max
}

const answeredCount = computed(() => {
  return usabilityQuestions.filter((question) => {
    const value = usabilityResponses.value[question.id]
    return isQuestionAnswered(question, value)
  }).length
})

const isComplete = computed(() => answeredCount.value === usabilityQuestions.length)

const firstUnansweredIndex = computed(() => {
  const index = usabilityQuestions.findIndex((question) => {
    const value = usabilityResponses.value[question.id]
    return !isQuestionAnswered(question, value)
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
  const question = usabilityQuestions.find((item) => item.id === questionId)
  const value = usabilityResponses.value[questionId]
  return isQuestionAnswered(question, value)
}

const currentScaleValues = computed(() => {
  const { min, max } = getQuestionScaleBounds(currentQuestion.value)
  return Array.from({ length: max - min + 1 }, (_, index) => min + index)
})

const currentQuestionGuidance = computed(() => {
  const question = currentQuestion.value
  if (!question) {
    return {
      title: 'How to answer',
      instruction: 'Select one option that best matches your opinion.'
    }
  }

  if (question.instrument === 'SUS') {
    return {
      title: 'SUS item (agreement scale)',
      instruction: 'Rate your agreement from 1 (Strongly disagree) to 5 (Strongly agree), based on your Password Manager experience.'
    }
  }

  if (question.instrument === 'UEQ-S') {
    return {
      title: 'UEQ-S item (semantic scale)',
      instruction: 'Pick the number that best reflects your position between the left and right words, based on your Password Manager experience.'
    }
  }

  const { min, max } = getQuestionScaleBounds(question)
  return {
    title: 'Question item',
    instruction: `Select one value between ${min} and ${max}.`
  }
})

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

function updateDemographic(field, value) {
  setDemographicField(field, value)
}

function finishQuestionnaire() {
  isFinished.value = true
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
  <main v-if="isFinished" class="finish-screen">
    <p class="finish-screen-text">THE EXPERIEMENT IS FINISHED. THANK YOU FOR YOUR PARTICIPATION</p>
  </main>

  <main v-else class="usability-layout">
    <section class="panel usability-panel">
      <div class="usability-header">
        <h2>Questionnaire</h2>
        <!-- <p class="meta">SUS (1-5 agreement) followed by UEQ-S (1-7 semantic scale)</p> -->
        <p class="meta">Please answer all questions based on your experience using the Password Manager.</p>
        <p class="meta">Answered: {{ answeredCount }} / {{ usabilityQuestions.length }}</p>
        <p v-if="isComplete" class="meta">Questionnaire complete.</p>
      </div>

      <section v-if="isComplete" class="demographics-block">
        <h3>Demographic Data</h3>

        <label class="demographic-field">
          <span>Gender</span>
          <select
            :value="demographicData.gender"
            @change="updateDemographic('gender', $event.target.value)"
          >
            <option value="">Select</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </label>

        <label class="demographic-field">
          <span>Age</span>
          <input
            type="number"
            min="0"
            max="120"
            placeholder="Enter age"
            :value="demographicData.age"
            @input="updateDemographic('age', $event.target.value)"
          />
        </label>

        <label class="demographic-field">
          <span>Level Of Education</span>
          <select
            :value="demographicData.educationLevel"
            @change="updateDemographic('educationLevel', $event.target.value)"
          >
            <option value="">Select</option>
            <option value="High School">High School</option>
            <option value="Bachelor">Bachelor</option>
            <option value="Master">Master</option>
            <option value="PhD">PhD</option>
            <option value="Other">Other</option>
          </select>
        </label>

        <label class="demographic-field">
          <span>IT Background</span>
          <select
            :value="demographicData.itBackground"
            @change="updateDemographic('itBackground', $event.target.value)"
          >
            <option value="">Select</option>
            <option value="None">None</option>
            <option value="Basic User">Basic User</option>
            <option value="Student">Student</option>
            <option value="Professional">Professional</option>
            <option value="Other">Other</option>
          </select>
        </label>

        <label class="demographic-field">
          <span>English Level</span>
          <select
            :value="demographicData.englishLevel"
            @change="updateDemographic('englishLevel', $event.target.value)"
          >
            <option value="">Select</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
            <option value="Native">Native</option>
          </select>
        </label>
      </section>

      <!-- <p v-else class="meta">Demographic data appears after you complete all usability questions.</p> -->

      <ol v-if="!isComplete" class="usability-progress-list">
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

      <div v-if="!isComplete && currentQuestion" class="usability-question-stage">
        <article class="usability-question-card" :class="{ answered: isAnswered(currentQuestion.id) }">
          <p class="usability-question-number">Question {{ activeQuestionIndex + 1 }} / {{ usabilityQuestions.length }}</p>
          <p class="usability-question-instrument">{{ currentQuestion.instrument }}</p>

          <div class="question-guidance">
            <p class="question-guidance-title">{{ currentQuestionGuidance.title }}</p>
            <p class="question-guidance-text">{{ currentQuestionGuidance.instruction }}</p>
          </div>

          <p class="usability-question-text">{{ currentQuestion.text }}</p>

          <div v-if="currentQuestion.leftLabel && currentQuestion.rightLabel" class="semantic-scale-labels">
            <span>{{ currentQuestion.leftLabel }}</span>
            <span>{{ currentQuestion.rightLabel }}</span>
          </div>

          <div v-else-if="currentQuestion.instrument === 'SUS'" class="semantic-scale-labels">
            <span>Strongly disagree</span>
            <span>Strongly agree</span>
          </div>

          <div class="likert-options centered" role="radiogroup" :aria-label="currentQuestion.text">
            <label
              v-for="score in currentScaleValues"
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

      <div v-if="isComplete" class="finish-actions">
        <button v-if="!isFinished" class="finish-btn" @click="finishQuestionnaire">Finish</button>
        <p v-else class="meta">Questionnaire submitted. Thank you.</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.demographics-block {
  margin: 1rem 0 1.25rem;
  padding: 0.85rem;
  border: 1px solid #e1e1e1;
  border-radius: 8px;
  display: grid;
  gap: 0.75rem;
}

.demographics-block h3 {
  margin: 0;
  font-size: 1rem;
}

.demographic-field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.92rem;
}

.demographic-field input,
.demographic-field select {
  border: 1px solid #cfd6de;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  font-size: 0.92rem;
  background: #fff;
}

.usability-question-instrument {
  margin: 0.2rem 0 0.4rem;
  font-size: 0.82rem;
  color: #5f6d7a;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.semantic-scale-labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.45rem;
  font-size: 0.82rem;
  color: #5f6d7a;
}

.question-guidance {
  margin: 0.45rem 0 0.65rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid #d8e1eb;
  background: #f7fbff;
  border-radius: 6px;
}

.question-guidance-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #35506b;
}

.question-guidance-text {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: #5f6d7a;
}

.finish-actions {
  margin-top: 0.9rem;
  display: grid;
  justify-items: center;
  gap: 0.4rem;
}

.finish-btn {
  border: none;
  border-radius: 6px;
  background: #0a5dca;
  color: #ffffff;
  padding: 0.55rem 1.2rem;
  cursor: pointer;
  font-size: 0.92rem;
  font-weight: 600;
}

.finish-screen {
  min-height: calc(100vh - 80px);
  background: #ffffff;
  display: grid;
  place-items: center;
  padding: 1rem;
}

.finish-screen-text {
  margin: 0;
  text-align: center;
  color: #111111;
  font-size: 1.1rem;
  font-weight: 600;
}
</style>
