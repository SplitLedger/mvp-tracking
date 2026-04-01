import { useCallback, useEffect, useRef, useState } from 'react'
import { getApps, initializeApp } from 'firebase/app'
import { get, getDatabase, onValue, ref, remove, set, type Unsubscribe } from 'firebase/database'
import { DateTime } from 'luxon'
import { Subject } from 'rxjs'
import { v4 } from 'uuid'
// app
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { computeMvpDifferenceTimers, computeTimeZone } from '@/helpers'
import { localStorageRoomCodeKey } from '@/constants'
// self
import { mergeTimers, sanitizeState, type TimerState } from './validation'
import { SessionState, type UseFirebaseRealTimeReturn } from './types'

const firebaseConfigurations = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

export const getRoomCode = (): string | null => localStorage.getItem(localStorageRoomCodeKey)

const getFirebaseDb = () => {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfigurations)
    return getDatabase(app)
}

const getOrCreateRoomCode = (): string => {
    const existing = getRoomCode()
    if (existing) {
        return existing
    }

    const newRoomCode = v4()
    localStorage.setItem(localStorageRoomCodeKey, newRoomCode)
    return newRoomCode
}

export const useFirebaseRealTime = (): UseFirebaseRealTimeReturn => {
    const [sessionState, setSessionState] = useState<SessionState>(SessionState.idle)

    const roomCodeRef = useRef<string | null>(null)
    const onFullState$ = useRef(new Subject<TimerState>()).current
    const onTimerUpdate$ = useRef(new Subject<{ id: number; timeOfDeath: string }>()).current

    const firebaseUnsubscribe = useRef<Unsubscribe[]>([])
    // Keep a ref to the current mvps so the firebase listener always has fresh data
    const mvpsRef = useRef<RagnarokMvp[]>([])

    const cleanup = useCallback(() => {
        firebaseUnsubscribe.current.forEach((unsub) => unsub())
        firebaseUnsubscribe.current = []

        setSessionState(SessionState.idle)
        roomCodeRef.current = null
    }, [])

    const subscribeToRoom = useCallback(
        (roomCode: string) => {
            const database = getFirebaseDb()

            const unsub = onValue(ref(database, `rooms/${roomCode}/timers`), (snap) => {
                const mvps = mvpsRef.current
                const incoming: TimerState = snap.val() ?? {}

                // filter out stale timers written by other peers
                const valid: TimerState = {}
                Object.entries(incoming).forEach(([idStr, iso]) => {
                    const id = Number(idStr)
                    const mvp = mvps.find((mvp) => mvp.id === id)
                    if (!mvp || !iso) {
                        return
                    }

                    const mvpWithTime = {
                        ...mvp,
                        timeOfDeath: DateTime.fromISO(iso as string).setZone(computeTimeZone()),
                    }
                    const { maximumDifferenceInMinutes } = computeMvpDifferenceTimers(mvpWithTime)
                    if (maximumDifferenceInMinutes < 15) {
                        valid[id] = iso as string
                    }
                })

                const merged = mergeTimers(sanitizeState(mvps), valid, mvps)
                onFullState$.next(merged)

                // also emit individual updates so TrackingContainer dispatcher works
                Object.entries(merged).forEach(([idStr, timeOfDeath]) => {
                    onTimerUpdate$.next({ id: Number(idStr), timeOfDeath })
                })
            })

            firebaseUnsubscribe.current.push(unsub)
        },
        [onFullState$, onTimerUpdate$]
    )

    const checkRoomExists = useCallback(async (roomCode: string): Promise<boolean> => {
        const database = getFirebaseDb()
        const snap = await get(ref(database, `rooms/${roomCode}`))
        return snap.exists()
    }, [])

    const hostSession = useCallback(
        async (mvps: RagnarokMvp[]): Promise<string> => {
            mvpsRef.current = mvps
            setSessionState(SessionState.connecting)

            const roomCode = getOrCreateRoomCode()
            roomCodeRef.current = roomCode

            const database = getFirebaseDb()

            await set(ref(database, `rooms/${roomCode}/timers`), sanitizeState(mvps))

            subscribeToRoom(roomCode)
            setSessionState(SessionState.hosting)

            return roomCode
        },
        [subscribeToRoom]
    )

    const joinSession = useCallback(
        async (roomCode: string, mvps: RagnarokMvp[]): Promise<void> => {
            roomCodeRef.current = roomCode
            localStorage.setItem(localStorageRoomCodeKey, roomCode)

            mvpsRef.current = mvps

            setSessionState(SessionState.connecting)
            subscribeToRoom(roomCode)

            setSessionState(SessionState.joined)
        },
        [subscribeToRoom]
    )

    const broadcastUpdate = useCallback((id: number, timeOfDeath: DateTime | null) => {
        const roomCode = roomCodeRef.current
        if (!roomCode) {
            return
        }

        const database = getFirebaseDb()
        const path = ref(database, `rooms/${roomCode}/timers/${id}`)

        if (timeOfDeath) {
            set(path, timeOfDeath.toUTC().toISO())
        } else {
            remove(path)
        }
    }, [])

    useEffect(() => {
        return () => cleanup()
    }, [])

    return {
        sessionState,
        roomCode: roomCodeRef.current ?? null,
        hostSession,
        joinSession,
        leaveSession: cleanup,
        checkRoomExists,
        broadcastUpdate,
        onFullState$,
        onTimerUpdate$,
    }
}
