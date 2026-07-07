import { useCallback, useEffect, useRef, useState } from 'react'
import { getApps, initializeApp } from 'firebase/app'
import {
    get,
    getDatabase,
    onChildAdded,
    onChildChanged,
    onChildRemoved,
    onValue,
    ref,
    remove,
    set,
    type Unsubscribe,
} from 'firebase/database'
import { DateTime } from 'luxon'
import { Subject } from 'rxjs'
// app
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { firebaseMaintenancePausedAtPath, localStorageRoomCodeKey } from '@/constants'
// self
import { SessionState, type TimerUpdate, type UseFirebaseRealTimeReturn } from './types'

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

export const getRoomCode = (): string | null => localStorage.getItem(localStorageRoomCodeKey)

const getFirebaseDb = () => {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    return getDatabase(app)
}

const buildTimersPayload = (mvps: RagnarokMvp[]): Record<string, string> => {
    return mvps.reduce<Record<string, string>>((acc, mvp) => {
        if (mvp.timeOfDeath) {
            acc[mvp.id] = mvp.timeOfDeath.toUTC().toISO()!
        }
        return acc
    }, {})
}

export const useFirebaseRealTime = (): UseFirebaseRealTimeReturn => {
    const [sessionState, setSessionState] = useState<SessionState>(SessionState.idle)
    const [pausedAt, setPausedAt] = useState<string | null>(null)

    const roomCodeRef = useRef<string | null>(null)
    const onTimerUpdate$ = useRef(new Subject<TimerUpdate>()).current
    const unsubscribers = useRef<Unsubscribe[]>([])

    const cleanup = useCallback(() => {
        unsubscribers.current.forEach((unsub) => unsub())
        unsubscribers.current = []
        roomCodeRef.current = null
        localStorage.removeItem(localStorageRoomCodeKey)
        setSessionState(SessionState.idle)
        setPausedAt(null)
    }, [])

    const subscribeToRoom = useCallback(
        (roomCode: string) => {
            const db = getFirebaseDb()
            const timersRef = ref(db, `rooms/${roomCode}/timers`)
            const pausedAtRef = ref(db, `rooms/${roomCode}/${firebaseMaintenancePausedAtPath}`)

            const emit = (id: number, timeOfDeath: string | null) => onTimerUpdate$.next({ id, timeOfDeath })

            unsubscribers.current.push(
                onChildAdded(timersRef, (snap) => emit(Number(snap.key), snap.val() as string)),
                onChildChanged(timersRef, (snap) => emit(Number(snap.key), snap.val() as string)),
                onChildRemoved(timersRef, (snap) => emit(Number(snap.key), null)),
                // All clients react to pause/resume in real time
                onValue(pausedAtRef, (snap) => {
                    setPausedAt(snap.exists() ? (snap.val() as string) : null)
                })
            )
        },
        [onTimerUpdate$]
    )

    const connect = useCallback(
        async (roomCode: string, localMvps: RagnarokMvp[], onRoomExists?: () => void): Promise<void> => {
            if (roomCodeRef.current === roomCode) return

            unsubscribers.current.forEach((unsub) => unsub())
            unsubscribers.current = []

            setSessionState(SessionState.connecting)
            roomCodeRef.current = roomCode
            localStorage.setItem(localStorageRoomCodeKey, roomCode)

            const db = getFirebaseDb()
            const snap = await get(ref(db, `rooms/${roomCode}/timers`))

            if (!snap.exists()) {
                const payload = buildTimersPayload(localMvps)
                if (Object.keys(payload).length > 0) {
                    await set(ref(db, `rooms/${roomCode}/timers`), payload)
                }
            } else {
                onRoomExists?.()
            }

            subscribeToRoom(roomCode)
            setSessionState(SessionState.active)
        },
        [subscribeToRoom]
    )

    const broadcastUpdate = useCallback((id: number, timeOfDeath: DateTime | null) => {
        const roomCode = roomCodeRef.current
        if (!roomCode) return

        const db = getFirebaseDb()
        const timerRef = ref(db, `rooms/${roomCode}/timers/${id}`)

        if (timeOfDeath) {
            set(timerRef, timeOfDeath.toUTC().toISO())
        } else {
            remove(timerRef)
        }
    }, [])

    /** Write pausedAt = now → all clients will freeze their timers */
    const broadcastPause = useCallback(() => {
        const roomCode = roomCodeRef.current
        if (!roomCode) return

        const db = getFirebaseDb()
        set(ref(db, `rooms/${roomCode}/${firebaseMaintenancePausedAtPath}`), DateTime.utc().toISO())
    }, [])

    /**
     * Shift every tracked timeOfDeath forward by how long we were paused,
     * then delete pausedAt → all clients resume and receive updated timers via onChildChanged.
     */
    const broadcastResume = useCallback(() => {
        const roomCode = roomCodeRef.current
        if (!roomCode) return

        const db = getFirebaseDb()
        const pausedAtRef = ref(db, `rooms/${roomCode}/${firebaseMaintenancePausedAtPath}`)
        const timersRef = ref(db, `rooms/${roomCode}/timers`)

        Promise.all([get(pausedAtRef), get(timersRef)]).then(([pausedAtSnap, timersSnap]) => {
            if (!pausedAtSnap.exists()) return

            const pausedAtISO = pausedAtSnap.val() as string
            const pausedAtMs = DateTime.fromISO(pausedAtISO, { zone: 'utc' }).toMillis()
            const elapsedMs = DateTime.utc().toMillis() - pausedAtMs

            const updates: Promise<void>[] = []

            if (timersSnap.exists()) {
                timersSnap.forEach((child) => {
                    const timeOfDeathISO = child.val() as string
                    const shifted = DateTime.fromISO(timeOfDeathISO, { zone: 'utc' }).plus(elapsedMs)
                    updates.push(set(ref(db, `rooms/${roomCode}/timers/${child.key}`), shifted.toUTC().toISO()))
                })
            }

            Promise.all(updates).then(() => remove(pausedAtRef))
        })
    }, [])

    useEffect(
        () => () => {
            unsubscribers.current.forEach((unsub) => unsub())
        },
        []
    )

    return {
        sessionState,
        roomCode: roomCodeRef.current,
        pausedAt,
        connect,
        leaveSession: cleanup,
        broadcastUpdate,
        broadcastPause,
        broadcastResume,
        onTimerUpdate$,
    }
}
