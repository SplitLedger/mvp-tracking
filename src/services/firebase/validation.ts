import { DateTime } from 'luxon'
import { computeMvpDifferenceTimers, computeTimeZone } from '@/helpers'
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'

export type TimerState = Record<number, string>

export function isTimerValid(mvp: RagnarokMvp): boolean {
    if (!mvp.timeOfDeath) return false
    const { maximumDifferenceInMinutes } = computeMvpDifferenceTimers(mvp)
    return maximumDifferenceInMinutes < 15
}

export function sanitizeState(mvps: RagnarokMvp[]): TimerState {
    return Object.fromEntries(mvps.filter(isTimerValid).map((mvp) => [mvp.id, mvp.timeOfDeath!.toUTC().toISO()!]))
}

export function mergeTimers(local: TimerState, incoming: TimerState, mvps: RagnarokMvp[]): TimerState {
    const merged = { ...local }

    Object.entries(incoming).forEach(([idStr, killedAt]) => {
        const id = Number(idStr)
        const mvp = mvps.find((mvp) => mvp.id === id)
        if (!mvp) return

        const mvpWithIncoming = { ...mvp, timeOfDeath: DateTime.fromISO(killedAt).setZone(computeTimeZone()) }
        if (!isTimerValid(mvpWithIncoming)) return // stale, discard

        if (!merged[id]) {
            merged[id] = killedAt // no local timer, take incoming
            return
        }

        const mvpWithLocal = { ...mvp, timeOfDeath: DateTime.fromISO(merged[id]).setZone(computeTimeZone()) }
        const localValid = isTimerValid(mvpWithLocal)

        if (
            !localValid ||
            DateTime.fromISO(killedAt).setZone(computeTimeZone()) >
                DateTime.fromISO(merged[id]).setZone(computeTimeZone())
        ) {
            merged[id] = killedAt
        }
    })

    return merged
}
