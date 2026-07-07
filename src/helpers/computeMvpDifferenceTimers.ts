import { DateTime } from 'luxon'
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { computeTimeZone } from '@/helpers'

type ComputeMvpDifferenceTimers = (
    mvp: RagnarokMvp,
    /** Override "now" — used when timers are frozen during maintenance */
    now?: DateTime
) => {
    maximumDifferenceInMinutes: number
    minimumDifferenceInMinutes: number
}

export const computeMvpDifferenceTimers: ComputeMvpDifferenceTimers = (mvp, now) => {
    const { spawnTime, timeOfDeath } = mvp

    if (!timeOfDeath) {
        return {
            maximumDifferenceInMinutes: 0,
            minimumDifferenceInMinutes: 0,
        }
    }

    const dateUTC = now ?? DateTime.now().setZone(computeTimeZone())

    const maximumSpawnTime = timeOfDeath.plus({ minutes: spawnTime.maxMinutes })
    const maximumDifferenceInMinutes = dateUTC.diff(maximumSpawnTime, ['minutes']).toObject().minutes

    const minimalSpawnTime = timeOfDeath.plus({ minutes: spawnTime.minMinutes })
    const minimumDifferenceInMinutes = dateUTC.diff(minimalSpawnTime, ['minutes']).toObject().minutes

    return {
        maximumDifferenceInMinutes: maximumDifferenceInMinutes ?? 0,
        minimumDifferenceInMinutes: minimumDifferenceInMinutes ?? 0,
    }
}
