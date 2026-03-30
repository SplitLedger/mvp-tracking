import { defaultTimeZoneName, localStorageTimeZoneKey } from '@/constants'
import { computeUtcOffsetFromLegacyIana } from '@/helpers'

export const computeTimeZone = () => {
    const storedTimeZone = localStorage.getItem(localStorageTimeZoneKey)
    return computeUtcOffsetFromLegacyIana(storedTimeZone ?? defaultTimeZoneName)
}
