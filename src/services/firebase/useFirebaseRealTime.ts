import { useCallback, useEffect, useRef, useState } from 'react'
import { getApps, initializeApp } from 'firebase/app'
import { getDatabase, onValue, ref, remove, set, type Unsubscribe } from 'firebase/database'
import { DateTime } from 'luxon'
import { Subject } from 'rxjs'
import { v4 } from 'uuid'
// app
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { computeMvpDifferenceTimers } from '@/helpers'
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

    const newCode = v4()
    localStorage.setItem(localStorageRoomCodeKey, newCode)
    return newCode
}

export const resetRoomCode = (): string => {
    localStorage.removeItem(localStorageRoomCodeKey)
    return getOrCreateRoomCode()
}

export const useFirebaseRealTime = (): UseFirebaseRealTimeReturn => {
    const [sessionState, setSessionState] = useState<SessionState>(SessionState.idle)
    const [roomCode, setRoomCode] = useState<string | null>(null)

    const onFullState$ = useRef(new Subject<TimerState>()).current
    const onTimerUpdate$ = useRef(new Subject<{ id: number; timeOfDeath: string }>()).current

    const firebaseUnsubscribe = useRef<Unsubscribe[]>([])
    // Keep a ref to the current mvps so the firebase listener always has fresh data
    const mvpsRef = useRef<RagnarokMvp[]>([])

    const cleanup = useCallback(() => {
        firebaseUnsubscribe.current.forEach((unsub) => unsub())
        firebaseUnsubscribe.current = []
        setSessionState(SessionState.idle)
        setRoomCode(null)
    }, [])

    // ── Shared: subscribe to room timer changes ────────────────────────────────
    const subscribeToRoom = useCallback(
        (code: string) => {
            const database = getFirebaseDb()

            const unsub = onValue(ref(database, `rooms/${code}/timers`), (snap) => {
                const mvps = mvpsRef.current
                const incoming: TimerState = snap.val() ?? {}

                // filter out stale timers written by other peers
                const valid: TimerState = {}
                Object.entries(incoming).forEach(([idStr, iso]) => {
                    const id = Number(idStr)
                    const mvp = mvps.find((m) => m.id === id)
                    if (!mvp || !iso) return
                    const mvpWithTime = { ...mvp, timeOfDeath: DateTime.fromISO(iso as string) }
                    const { maximumDifferenceInMinutes } = computeMvpDifferenceTimers(mvpWithTime)
                    if (maximumDifferenceInMinutes < 0) valid[id] = iso as string
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

    // ── Host ───────────────────────────────────────────────────────────────────
    const hostSession = useCallback(
        async (mvps: RagnarokMvp[]): Promise<string> => {
            cleanup()
            mvpsRef.current = mvps
            setSessionState(SessionState.connecting)

            const code = getOrCreateRoomCode()
            setRoomCode(code)

            const database = getFirebaseDb()

            // Write the current local state to the room so guests see it immediately
            const initialState = sanitizeState(mvps)
            await set(ref(database, `rooms/${code}/timers`), initialState)

            subscribeToRoom(code)
            setSessionState(SessionState.hosting)

            return code
        },
        [cleanup, subscribeToRoom]
    )

    // ── Guest ──────────────────────────────────────────────────────────────────
    const joinSession = useCallback(
        async (code: string, mvps: RagnarokMvp[]): Promise<void> => {
            cleanup()
            localStorage.setItem(localStorageRoomCodeKey, code)

            mvpsRef.current = mvps
            setSessionState(SessionState.connecting)

            setRoomCode(code)
            subscribeToRoom(code)

            setSessionState(SessionState.joined)
        },
        [cleanup, subscribeToRoom]
    )

    // ── Outbound broadcast ─────────────────────────────────────────────────────
    const broadcastUpdate = useCallback(
        (id: number, timeOfDeath: DateTime | null) => {
            const code = roomCode
            if (!code) return

            const database = getFirebaseDb()
            const path = ref(database, `rooms/${code}/timers/${id}`)

            if (timeOfDeath) {
                set(path, timeOfDeath.toISO())
            } else {
                remove(path)
            }
        },
        [roomCode]
    )

    // ── Cleanup on unmount ─────────────────────────────────────────────────────
    useEffect(() => {
        return () => cleanup()
    }, [cleanup])

    return {
        sessionState,
        roomCode,
        hostSession,
        joinSession,
        leaveSession: cleanup,
        resetRoomCode,
        broadcastUpdate,
        onFullState$,
        onTimerUpdate$,
    }
}
