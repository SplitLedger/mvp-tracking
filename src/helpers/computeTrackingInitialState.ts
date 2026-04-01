import { DateTime } from 'luxon'
import mvpsFromStatic from '@/assets/mvps'
import { localStorageMvpsKey } from '@/constants'
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { computeTimeZone } from '@/helpers'

type ComputeTrackingInitialState = () => RagnarokMvp[]

export const computeTrackingInitialState: ComputeTrackingInitialState = () => {
    const jsonState = localStorage.getItem(localStorageMvpsKey)
    try {
        const parsedState = JSON.parse(jsonState as string)
        const retroState = Array.isArray(parsedState)
            ? parsedState.reduce((merge, mvp) => {
                  return mvp.timeOfDeath ? { ...merge, [mvp.id]: mvp.timeOfDeath } : merge
              }, {})
            : parsedState

        return mvpsFromStatic.map((mvp) => {
            const timeOfDeath = retroState[mvp.id]
            return {
                ...mvp,
                timeOfDeath: timeOfDeath ? DateTime.fromISO(timeOfDeath).setZone(computeTimeZone()) : null,
            }
        })
    } catch (error) {
        return mvpsFromStatic
    }
}
