import type { DateTime } from 'luxon'
import { Subject } from 'rxjs'
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'

export enum SessionState {
    idle = 'idle',
    connecting = 'connecting',
    active = 'active',
}

export type TimerUpdate = { id: number; timeOfDeath: string | null }

export interface UseFirebaseRealTimeReturn {
    // join or create a room; pass current local mvps so they are pushed when creating
    broadcastUpdate: (id: number, timeOfDeath: DateTime | null) => void
    broadcastPause: () => void
    broadcastResume: () => void
    connect: (roomCode: string, localMvps: RagnarokMvp[], onRoomExists?: () => void) => Promise<void>
    leaveSession: () => void
    // emits every time a single timer changes in Firebase (including removals → null)
    onTimerUpdate$: Subject<TimerUpdate>
    /** ISO string of when maintenance started, or null if not paused */
    pausedAt: string | null
    roomCode: string | null
    sessionState: SessionState
}
