import { DateTime } from 'luxon'

export enum RagnarokMvpProtocol {
    normal = 'normal',
    miniBoss = 'mini-boss',
    boss = 'boss',
}

export interface RagnarokMvp {
    id: number
    map: string
    mobId: string
    name: string
    spawnTime: { minMinutes: number; maxMinutes: number }
    sprite?: string
    timeOfDeath: DateTime | null
    protocol: RagnarokMvpProtocol
}

export type DispatcherStateModifier = {
    fullReset?: boolean
    mvp: RagnarokMvp
    timeOfDeathToUpdate: DateTime | null
}

export enum TrackingChangeAction {
    manualTrack = 'MANUAL_TRACK',
    track = 'TRACK',
    reset = 'RESET',
    undo = 'UNDO_GENERAL',
    undoReset = 'UNDO_RESET',
    undoTrack = 'UNDO_TRACK',
    undoManualTrack = 'UNDO_MANUAL_TRACK',
}

export type TrackingChange = {
    action: TrackingChangeAction
    mvp: RagnarokMvp
    timeOfDeathFrom: DateTime | null
    timeOfDeathTo: DateTime | null
    timestamp: DateTime
}
