import { formatRupiah } from '../constants/categories.js'
import { createId, progressBar } from '../lib/utils.js'

function normalizeName(input = '') {
  return String(input).toLowerCase().trim()
}

export class GoalService {
  constructor({ userService }) {
    this.userService = userService
  }

  async createGoal(userId, { name, targetAmount, dueDate = null }) {
    const user = await this.userService.getUser(userId)
    if (!user) return null

    const goal = {
      id: createId('goal'),
      name,
      targetAmount,
      savedAmount: 0,
      dueDate,
      active: true,
      createdAt: new Date().toISOString(),
    }

    user.goals.push(goal)
    await this.userService.saveUser(user)
    return goal
  }

  async getGoal(userId, goalName = '') {
    const user = await this.userService.getUser(userId)
    if (!user) return null
    if (!goalName) return user.goals.find((item) => item.active) || null

    const normalized = normalizeName(goalName)
    return (
      user.goals.find((item) => normalizeName(item.name) === normalized) ||
      user.goals.find((item) => normalizeName(item.name).includes(normalized)) ||
      null
    )
  }

  async contribute(userId, { amount, goalName }) {
    const user = await this.userService.getUser(userId)
    if (!user) return null

    const goal = !goalName
      ? user.goals.find((item) => item.active)
      : user.goals.find(
          (item) => normalizeName(item.name) === normalizeName(goalName) || normalizeName(item.name).includes(normalizeName(goalName)),
        )

    if (!goal) return null

    goal.savedAmount += amount
    if (goal.savedAmount >= goal.targetAmount) goal.active = false
    await this.userService.saveUser(user)
    return goal
  }

  async listGoals(userId) {
    const user = await this.userService.getUser(userId)
    return user?.goals || []
  }

  formatGoals(goals = []) {
    if (!goals.length) {
      return 'Belum ada goal aktif. Contoh: *goal liburan 3000000 2026-12-01*'
    }

    return goals
      .map((goal, index) => {
        const remaining = Math.max(0, goal.targetAmount - goal.savedAmount)
        return [
          `${index + 1}. *${goal.name}* ${goal.active ? '' : '(selesai)'}`.trim(),
          `${progressBar(goal.savedAmount, goal.targetAmount)} • ${formatRupiah(goal.savedAmount)} / ${formatRupiah(goal.targetAmount)}`,
          `Sisa: ${formatRupiah(remaining)}${goal.dueDate ? ` • Deadline: ${goal.dueDate}` : ''}`,
        ].join('\n')
      })
      .join('\n\n')
  }
}
