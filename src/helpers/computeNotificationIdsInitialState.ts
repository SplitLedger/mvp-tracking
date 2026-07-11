import { localStorageNotificationMvpIdsKey } from '@/constants'

export const computeNotificationIdsInitialState = (): number[] => {
    const mvpIds = localStorage.getItem(localStorageNotificationMvpIdsKey) ?? ''
    return mvpIds.split(',').map(Number)
}
