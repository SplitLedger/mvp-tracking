import type { DateTime } from 'luxon'
import { Subject } from 'rxjs'
// app
import type { TimerState } from './validation'
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'

export enum SessionState {
    idle = 'idle',
    connecting = 'connecting',
    hosting = 'hosting',
    joined = 'joined',
}

export interface UseWebRTCReturn {
    sessionState: SessionState
    roomCode: string | null
    // actions
    hostSession: (mvps: RagnarokMvp[]) => Promise<string> // returns room code
    joinSession: (code: string, mvps: RagnarokMvp[]) => Promise<void>
    leaveSession: () => void
    resetRoomCode: () => string
    // outbound — call these when timer state changes
    broadcastUpdate: (id: number, timeOfDeath: DateTime | null) => void
    // inbound — subscribe to these in TrackingContainer
    onFullState$: Subject<TimerState>
    onTimerUpdate$: Subject<{ id: number; timeOfDeath: string }>
}
