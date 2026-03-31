import { DateTime } from 'luxon'
import { computeMvpDifferenceTimers } from '@/helpers'
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'

export type TimerState = Record<number, string> // { [mvp.id]: ISO string }

export function isTimerValid(mvp: RagnarokMvp): boolean {
    if (!mvp.timeOfDeath) return false
    const { maximumDifferenceInMinutes } = computeMvpDifferenceTimers(mvp)
    return maximumDifferenceInMinutes < 0
}

export function sanitizeState(mvps: RagnarokMvp[]): TimerState {
    return Object.fromEntries(mvps.filter(isTimerValid).map((mvp) => [mvp.id, mvp.timeOfDeath!.toISO()!]))
}

export function mergeTimers(local: TimerState, incoming: TimerState, mvps: RagnarokMvp[]): TimerState {
    const merged = { ...local }

    Object.entries(incoming).forEach(([idStr, killedAt]) => {
        const id = Number(idStr)
        const mvp = mvps.find((m) => m.id === id)
        if (!mvp) return

        const mvpWithIncoming = { ...mvp, timeOfDeath: DateTime.fromISO(killedAt) }
        if (!isTimerValid(mvpWithIncoming)) return // stale, discard

        if (!merged[id]) {
            merged[id] = killedAt // no local timer, take incoming
            return
        }

        const mvpWithLocal = { ...mvp, timeOfDeath: DateTime.fromISO(merged[id]) }
        const localValid = isTimerValid(mvpWithLocal)

        if (!localValid || DateTime.fromISO(killedAt) > DateTime.fromISO(merged[id])) {
            merged[id] = killedAt
        }
    })

    return merged
}
