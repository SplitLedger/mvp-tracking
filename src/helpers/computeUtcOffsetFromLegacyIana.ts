import timezones from '@/assets/timezones'
import { localStorageTimeZoneKey } from '@/constants.ts'

export const computeUtcOffsetFromLegacyIana = (ianaOrUtc: string): string => {
    if (ianaOrUtc.startsWith('UTC')) {
        return ianaOrUtc
    }

    // RETRO-COMPATIBILITY: Handle legacy UTC offsets
    const timezoneFound = timezones.find((timezone) => timezone.iana === ianaOrUtc)
    if (timezoneFound) {
        localStorage.setItem(localStorageTimeZoneKey, timezoneFound.utc)
        return timezoneFound.utc
    }

    return 'UTC'
}
