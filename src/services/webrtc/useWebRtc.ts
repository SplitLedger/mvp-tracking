import { useCallback, useEffect, useRef, useState } from 'react'
import { getApps, initializeApp } from 'firebase/app'
import { getDatabase, onChildAdded, onValue, push, ref, remove, set, type Unsubscribe } from 'firebase/database'
import { DateTime } from 'luxon'
import { Subject } from 'rxjs'
import { v4 } from 'uuid'
// app
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { computeMvpDifferenceTimers } from '@/helpers'
// self
import { mergeTimers, sanitizeState, type TimerState } from './validation'
import { localStorageRoomCodeKey } from '@/constants'
import { type DataChannelMessage, SessionState, type UseWebRTCReturn } from './types'

const firebaseConfigurations = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

const getFirebaseDb = () => {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfigurations)
    return getDatabase(app)
}

const getOrCreateRoomCode = (): string => {
    const existing = localStorage.getItem(localStorageRoomCodeKey)
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

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export const useWebRTC = (): UseWebRTCReturn => {
    const [sessionState, setSessionState] = useState<SessionState>(SessionState.idle)
    const [roomCode, setRoomCode] = useState<string | null>(null)

    // Stable Subject refs — never recreated across renders
    const onFullState$ = useRef(new Subject<TimerState>()).current
    const onTimerUpdate$ = useRef(new Subject<{ id: number; timeOfDeath: string }>()).current

    // WebRTC refs — mutable, not state (changing these should not trigger renders)
    const peerConnectionReference = useRef<RTCPeerConnection | null>(null)
    const channelReference = useRef<RTCDataChannel | null>(null)
    const firebaseUnsubscribe = useRef<Unsubscribe[]>([])

    const cleanup = useCallback(() => {
        firebaseUnsubscribe.current.forEach((unsub) => unsub())
        firebaseUnsubscribe.current = []
        channelReference.current?.close()
        channelReference.current = null
        peerConnectionReference.current?.close()
        peerConnectionReference.current = null
        setSessionState(SessionState.idle)
        setRoomCode(null)
    }, [])

    const createPeerConnection = useCallback(() => {
        const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS })
        peerConnectionReference.current = peerConnection
        return peerConnection
    }, [peerConnectionReference])

    const sendMessage = useCallback((message: DataChannelMessage) => {
        const channel = channelReference.current
        if (channel?.readyState === 'open') {
            channel.send(JSON.stringify(message))
        }
    }, [])

    const handleIncomingMessage = useCallback(
        (raw: string, mvps: RagnarokMvp[]) => {
            const message: DataChannelMessage = JSON.parse(raw)

            if (message.type === 'FULL_STATE') {
                // Merge incoming with current valid state before emitting
                const currentState = sanitizeState(mvps)
                const merged = mergeTimers(currentState, message.payload, mvps)
                onFullState$.next(merged)
            }

            if (message.type === 'TIMER_UPDATE') {
                const { id, timeOfDeath } = message.payload
                const mvp = mvps.find((m) => m.id === id)
                if (!mvp) return
                const mvpWithTime = { ...mvp, timeOfDeath: DateTime.fromISO(timeOfDeath) }
                // Only emit if timer is still valid
                const { maximumDifferenceInMinutes } = computeMvpDifferenceTimers(mvpWithTime)

                if (maximumDifferenceInMinutes < 0) {
                    onTimerUpdate$.next({ id, timeOfDeath })
                }
            }

            if (message.type === 'REQUEST_STATE') {
                // Only host receives this — re-broadcast current full state
                sendMessage({ type: 'FULL_STATE', payload: sanitizeState(mvps) })
            }
        },
        [onFullState$, onTimerUpdate$, sendMessage]
    )

    const setupDataChannel = useCallback(
        (channel: RTCDataChannel, mvps: RagnarokMvp[], isHost: boolean) => {
            channelReference.current = channel

            channel.onopen = () => {
                setSessionState(isHost ? SessionState.hosting : SessionState.joined)
                if (!isHost) {
                    // Guest requests full state immediately on connection
                    sendMessage({ type: 'REQUEST_STATE' })
                } else {
                    // Host pushes full state immediately to new guest
                    sendMessage({ type: 'FULL_STATE', payload: sanitizeState(mvps) })
                }
            }

            channel.onmessage = ({ data }) => handleIncomingMessage(data, mvps)

            channel.onclose = () => {
                // host manages their own lifecycle
                if (isHost) {
                    return
                }

                // Guest lost connection — attempt graceful notice
                setSessionState(SessionState.idle)
            }
        },
        [sendMessage, handleIncomingMessage]
    )

    // ── Firebase signaling cleanup ─────────────────────────────────────────────
    const cleanupFirebaseRoom = useCallback((code: string) => {
        const database = getFirebaseDb()
        remove(ref(database, `rooms/${code}`))
    }, [])

    // ── Host ───────────────────────────────────────────────────────────────────
    const hostSession = useCallback(
        async (mvps: RagnarokMvp[]): Promise<string> => {
            cleanup()
            setSessionState(SessionState.connecting)

            const code = getOrCreateRoomCode()
            setRoomCode(code)
            const database = getFirebaseDb()
            const peerConnection = createPeerConnection()

            // Host creates the DataChannel
            const channel = peerConnection.createDataChannel('timers')
            setupDataChannel(channel, mvps, true)

            // Buffer guest candidates until remote description (answer) is set
            const pendingCandidates: RTCIceCandidateInit[] = []
            let remoteDescriptionSet = false

            const applyPendingCandidates = () => {
                pendingCandidates.splice(0).forEach((c) => {
                    peerConnection.addIceCandidate(new RTCIceCandidate(c))
                })
            }

            peerConnection.onicecandidate = ({ candidate }) => {
                if (candidate) {
                    console.log('[Host] ICE candidate gathered:', candidate.type, candidate.protocol, candidate.address)
                    push(ref(database, `rooms/${code}/hostCandidates`), candidate.toJSON())
                }
            }

            const offer = await peerConnection.createOffer()
            await peerConnection.setLocalDescription(offer)
            await set(ref(database, `rooms/${code}/offer`), { type: offer.type, sdp: offer.sdp })

            const answerUnsub = onValue(ref(database, `rooms/${code}/answer`), async (snap) => {
                if (snap.exists() && !peerConnection.currentRemoteDescription) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(snap.val()))
                    remoteDescriptionSet = true
                    applyPendingCandidates()
                }
            })

            const guestCandidatesUnsub = onChildAdded(ref(database, `rooms/${code}/guestCandidates`), (snap) => {
                if (!snap.exists()) return
                const candidate = snap.val()
                if (remoteDescriptionSet) {
                    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                } else {
                    pendingCandidates.push(candidate)
                }
            })

            firebaseUnsubscribe.current.push(answerUnsub, guestCandidatesUnsub)

            channel.addEventListener(
                'open',
                () => {
                    setTimeout(() => cleanupFirebaseRoom(code), 3000)
                },
                { once: true }
            )

            return code
        },
        [cleanup, createPeerConnection, setupDataChannel, cleanupFirebaseRoom]
    )

    // ── Guest ──────────────────────────────────────────────────────────────────
    const joinSession = useCallback(
        async (code: string, mvps: RagnarokMvp[]): Promise<void> => {
            cleanup()
            setSessionState(SessionState.connecting)
            setRoomCode(code)

            const database = getFirebaseDb()
            const peerConnection = createPeerConnection()

            const pendingCandidates: RTCIceCandidateInit[] = []
            let remoteDescriptionSet = false

            const applyPendingCandidates = () => {
                pendingCandidates.splice(0).forEach((c) => {
                    peerConnection.addIceCandidate(new RTCIceCandidate(c))
                })
            }

            peerConnection.ondatachannel = ({ channel }) => {
                setupDataChannel(channel, mvps, false)
            }

            peerConnection.onicecandidate = ({ candidate }) => {
                if (candidate) {
                    push(ref(database, `rooms/${code}/guestCandidates`), candidate.toJSON())
                }
            }

            const offerUnsub = onValue(ref(database, `rooms/${code}/offer`), async (snap) => {
                if (!snap.exists() || peerConnection.currentRemoteDescription) return
                await peerConnection.setRemoteDescription(new RTCSessionDescription(snap.val()))
                const answer = await peerConnection.createAnswer()
                await peerConnection.setLocalDescription(answer)
                await set(ref(database, `rooms/${code}/answer`), { type: answer.type, sdp: answer.sdp })
                remoteDescriptionSet = true
                applyPendingCandidates()
            })

            const hostCandidatesUnsub = onChildAdded(ref(database, `rooms/${code}/hostCandidates`), (snap) => {
                if (!snap.exists()) return
                const candidate = snap.val()
                if (remoteDescriptionSet) {
                    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                } else {
                    pendingCandidates.push(candidate)
                }
            })

            firebaseUnsubscribe.current.push(offerUnsub, hostCandidatesUnsub)
        },
        [cleanup, createPeerConnection, setupDataChannel]
    )

    // ── Outbound broadcast ────────────────────────────────────────────────────
    const broadcastUpdate = useCallback(
        (id: number, timeOfDeath: DateTime | null) => {
            sendMessage({
                type: 'TIMER_UPDATE',
                payload: { id, timeOfDeath: timeOfDeath ? timeOfDeath.toISO()! : '' },
            })
        },
        [sendMessage]
    )

    // ── Cleanup on unmount ────────────────────────────────────────────────────
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
