import { Fragment, type ReactElement, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { debounceTime, Subject } from 'rxjs'
import {
    Box,
    Button,
    DropdownMenu,
    Flex,
    IconButton,
    Popover,
    Separator,
    Spinner,
    Text,
    TextField,
    Tooltip,
} from '@radix-ui/themes'
import {
    Cross1Icon,
    DownloadIcon,
    EnterIcon,
    ExclamationTriangleIcon,
    ExternalLinkIcon,
    GlobeIcon,
    HamburgerMenuIcon,
    MagnifyingGlassIcon,
    MoonIcon,
    PlusIcon,
    ResetIcon,
    Share1Icon,
    StarFilledIcon,
    TargetIcon,
    TimerIcon,
    UpdateIcon,
    UploadIcon,
} from '@radix-ui/react-icons'
import { toast } from 'sonner'
import { v4 } from 'uuid'
// app
import {
    HistoryDialog,
    ImportDialog,
    JoinSessionDialog,
    MvpInformation,
    ResetDialog,
    TimeZoneDialog,
    TrackingSpawnTime,
    UpdateFromTombForm,
} from '@/components'
import { computeTimeZone, computeTrackingInitialState, sortTrackingMvpList } from '@/helpers'
import { defaultDateTimeFormat, localStorageMvpsKey } from '@/constants'
import { getRoomCode, SessionState, useFirebaseRealTime } from '@/services/firebase'
// self
import {
    Header,
    HeaderDisplayDates,
    MvpInformationContainer,
    MvpSprite,
    MvpSpriteContainer,
    TrackerGridCell,
    TrackerGridContainer,
    TrackerGridRow,
    TrackingContainerStyled,
    UpdateContainer,
} from './styles'
import {
    type DispatcherStateModifier,
    type RagnarokMvp,
    RagnarokMvpProtocol,
    type TrackingChange,
    TrackingChangeAction,
} from './types'

const reducer = (currentState: RagnarokMvp[], beingModified: DispatcherStateModifier) => {
    if (beingModified.fullReset) {
        localStorage.removeItem(localStorageMvpsKey)
        return computeTrackingInitialState()
    }

    const modifiedMvps = [
        { ...beingModified.mvp, timeOfDeath: beingModified.timeOfDeathToUpdate },
        ...currentState.filter((mvp) => mvp.id !== beingModified.mvp.id),
    ]

    const toPersistInLocalStorage = modifiedMvps.reduce((merge, mvp) => {
        return mvp.timeOfDeath ? { ...merge, [mvp.id]: mvp.timeOfDeath.toUTC().toISO() } : merge
    }, {})

    localStorage.setItem(localStorageMvpsKey, JSON.stringify(toPersistInLocalStorage))

    return modifiedMvps
}

const computeUndoAction = (action: TrackingChangeAction): TrackingChangeAction => {
    if (action === TrackingChangeAction.manualTrack) return TrackingChangeAction.undoManualTrack
    if (action === TrackingChangeAction.track) return TrackingChangeAction.undoTrack
    if (action === TrackingChangeAction.reset) return TrackingChangeAction.undoReset
    return TrackingChangeAction.undo
}

const TrackingContainer = (): ReactElement => {
    const firebaseRealTime = useFirebaseRealTime()

    const searchSubject = useRef(new Subject<string>()).current
    const searchInputRef = useRef<HTMLInputElement>(null)

    const [mvpsList, dispatcher] = useReducer(reducer, computeTrackingInitialState())
    const [changesState, setChangesState] = useState<TrackingChange[]>([])
    const [searchMvp, setSearchMvp] = useState('')

    const [historyDialog, setHistoryDialog] = useState(false)
    const [resetDialog, setResetDialog] = useState(false)
    const [serverTimeDialog, setServerTimeDialog] = useState(false)
    const [importDialog, setImportDialog] = useState(false)
    const [joinSessionDialog, setJoinSessionDialog] = useState(false)

    // Keep a stable ref to mvpsList for use inside callbacks and effects
    const mvpsListRef = useRef(mvpsList)
    useEffect(() => {
        mvpsListRef.current = mvpsList
    }, [mvpsList])

    const isShareable = useMemo(
        () => ['.rot.splitledger.pro', 'localhost'].some((hostname) => location.hostname.includes(hostname)),
        []
    )

    const cleanSearchInput = useCallback(() => {
        setSearchMvp('')
        if (searchInputRef.current) {
            searchInputRef.current.value = ''
        }
    }, [searchInputRef])

    const addChangeToHistory = useCallback(
        (change: {
            action: TrackingChangeAction
            mvp: RagnarokMvp
            timeOfDeathFrom: DateTime | null
            timeOfDeathTo: DateTime | null
        }) => {
            setChangesState((currentState) => {
                return [{ ...change, timestamp: DateTime.now().setZone(computeTimeZone()) }, ...currentState]
            })
        },
        []
    )

    const realTimeUpdateFactory = (mvp: RagnarokMvp) => () => {
        const updateTime = DateTime.now().setZone(computeTimeZone())
        addChangeToHistory({
            action: TrackingChangeAction.track,
            mvp,
            timeOfDeathFrom: mvp.timeOfDeath,
            timeOfDeathTo: updateTime,
        })
        dispatcher({ mvp, timeOfDeathToUpdate: updateTime })
        firebaseRealTime.broadcastUpdate(mvp.id, updateTime)
        cleanSearchInput()
    }

    const fromTombUpdateFactory = useCallback(
        (mvp: RagnarokMvp) => (data: { tombTime: string; confirmedTombTime?: DateTime }) => {
            const [hour, minute] = data.tombTime.split(':').map(Number)

            const tombTime = data.confirmedTombTime
                ? data.confirmedTombTime
                : DateTime.now().setZone(computeTimeZone()).set({ hour, minute, second: 0, millisecond: 0 })

            addChangeToHistory({
                action: TrackingChangeAction.manualTrack,
                mvp,
                timeOfDeathFrom: mvp.timeOfDeath,
                timeOfDeathTo: tombTime,
            })
            dispatcher({ mvp, timeOfDeathToUpdate: tombTime })
            firebaseRealTime.broadcastUpdate(mvp.id, tombTime)
            cleanSearchInput()
        },
        [addChangeToHistory, firebaseRealTime, cleanSearchInput]
    )

    const resetTimeFromMvpFactory = useCallback(
        (mvp: RagnarokMvp) => () => {
            addChangeToHistory({
                action: TrackingChangeAction.reset,
                mvp,
                timeOfDeathFrom: mvp.timeOfDeath,
                timeOfDeathTo: null,
            })
            dispatcher({ mvp, timeOfDeathToUpdate: null })
            firebaseRealTime.broadcastUpdate(mvp.id, null)
        },
        [addChangeToHistory, firebaseRealTime]
    )

    const undoChangeAndAddToHistory = useCallback(
        (undo: TrackingChange) => () => {
            const actionToUse = computeUndoAction(undo.action)
            addChangeToHistory({
                action: actionToUse,
                mvp: undo.mvp,
                timeOfDeathFrom: null,
                timeOfDeathTo: null,
            })
            dispatcher({ mvp: undo.mvp, timeOfDeathToUpdate: undo.timeOfDeathFrom })
            firebaseRealTime.broadcastUpdate(undo.mvp.id, undo.timeOfDeathFrom)
        },
        [addChangeToHistory, firebaseRealTime]
    )

    const resetChangesState = useCallback(() => {
        setChangesState([])
        dispatcher({
            fullReset: true,
            mvp: {
                id: 0,
                map: '',
                mobId: '',
                name: '',
                protocol: RagnarokMvpProtocol.normal,
                spawnTime: { minMinutes: 0, maxMinutes: 0 },
                timeOfDeath: null,
            },
            timeOfDeathToUpdate: null,
        })
        toast.success('Tracker has been reset', {
            description: 'All tracked MVPs have been removed',
        })
    }, [])

    const trackedMvps = mvpsList.filter((mvp) => mvp.timeOfDeath)

    const shareTimers = useCallback(() => {
        if (!trackedMvps.length) return
        const toShare = trackedMvps.map((mvp) => `${mvp.id}|${(mvp.timeOfDeath as DateTime).toUTC().toISO()}`)
        navigator.clipboard
            .writeText(toShare.join(';'))
            .then(() => {
                toast.success('Tracked MVPs copied to clipboard', {
                    description: 'You can now share it with your friends',
                })
            })
            .catch(() => toast.error('Failed to copy to clipboard'))
    }, [trackedMvps])

    const importTimers = useCallback(
        (entries: { mvp: RagnarokMvp; timeOfDeath: DateTime }[]) => {
            for (const { mvp, timeOfDeath } of entries) {
                addChangeToHistory({
                    action: TrackingChangeAction.manualTrack,
                    mvp,
                    timeOfDeathFrom: mvp.timeOfDeath,
                    timeOfDeathTo: timeOfDeath,
                })
                dispatcher({ mvp, timeOfDeathToUpdate: timeOfDeath })
            }
        },
        [addChangeToHistory]
    )

    const createSession = useCallback(() => {
        const roomCode = v4()
        firebaseRealTime.connect(roomCode, mvpsListRef.current).then(() => {
            navigator.clipboard
                .writeText(roomCode)
                .then(() => {
                    toast.success('Session started', {
                        description: 'Live session code copied to clipboard',
                    })
                })
                .catch(() => toast.success('Session started'))
        })
    }, [firebaseRealTime])

    const onJoinSession = useCallback(
        (code: string) => firebaseRealTime.connect(code, mvpsListRef.current),
        [firebaseRealTime]
    )

    const copyRoomCode = useCallback(() => {
        if (!firebaseRealTime.roomCode) {
            return
        }

        navigator.clipboard
            .writeText(firebaseRealTime.roomCode)
            .then(() => toast.success('Live session code copied to clipboard'))
            .catch(() => toast.error('Failed to copy live session code'))
    }, [firebaseRealTime.roomCode])

    const badgeSessionState = useMemo<{ color: 'gray' | 'green' | 'yellow'; feedback: string }>(() => {
        if (firebaseRealTime.sessionState === SessionState.idle) {
            return { color: 'gray', feedback: 'Not connected' }
        }

        if (firebaseRealTime.sessionState === SessionState.connecting) {
            return { color: 'yellow', feedback: 'Connecting' }
        }

        return { color: 'green', feedback: 'Connected. Receiving and sending real time updates' }
    }, [firebaseRealTime.sessionState])

    // Search debounce
    useEffect(() => {
        const subscription = searchSubject.pipe(debounceTime(300)).subscribe(setSearchMvp)
        return () => subscription.unsubscribe()
    }, [])

    // Auto-connect if a roomCode was persisted from a previous session
    useEffect(() => {
        if (!isShareable) {
            return
        }

        const savedCode = getRoomCode()
        if (savedCode) {
            firebaseRealTime.connect(savedCode, mvpsListRef.current)
        }
    }, [])

    // Subscribe to Firebase timer updates — Firebase is the source of truth
    useEffect(() => {
        const sub = firebaseRealTime.onTimerUpdate$.subscribe(({ id, timeOfDeath }) => {
            const mvp = mvpsListRef.current.find((m) => m.id === id)
            if (!mvp) {
                return
            }

            dispatcher({
                mvp,
                timeOfDeathToUpdate: timeOfDeath ? DateTime.fromISO(timeOfDeath).setZone(computeTimeZone()) : null,
            })
        })
        return () => sub.unsubscribe()
    }, [firebaseRealTime.onTimerUpdate$])

    const searchFilteredMvps = mvpsList.filter(
        (mvp) =>
            mvp.name.toLowerCase().includes(searchMvp.toLowerCase()) ||
            mvp.map.toLowerCase().includes(searchMvp.toLowerCase())
    )

    const serverTime = DateTime.now().setZone(computeTimeZone())
    const localTime = DateTime.now()

    return (
        <TrackingContainerStyled>
            <ResetDialog open={resetDialog} onOpenChange={setResetDialog} resetTracker={resetChangesState} />

            <HistoryDialog
                changes={changesState}
                open={historyDialog}
                onOpenChange={setHistoryDialog}
                undoChangeFactory={undoChangeAndAddToHistory}
            />

            <TimeZoneDialog open={serverTimeDialog} onOpenChange={setServerTimeDialog} />

            <ImportDialog
                mvpsList={mvpsList}
                onImport={importTimers}
                open={importDialog}
                onOpenChange={setImportDialog}
            />

            <JoinSessionDialog onJoin={onJoinSession} onOpenChange={setJoinSessionDialog} open={joinSessionDialog} />

            <Header>
                <Flex gap="2" align="center">
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger>
                            <IconButton color="gray" variant="surface">
                                <HamburgerMenuIcon />
                            </IconButton>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content>
                            {isShareable && firebaseRealTime.sessionState === SessionState.idle && (
                                <DropdownMenu.Item onClick={createSession}>
                                    <PlusIcon /> Create live session
                                </DropdownMenu.Item>
                            )}

                            {isShareable && firebaseRealTime.sessionState === SessionState.idle && (
                                <DropdownMenu.Item onClick={() => setJoinSessionDialog(true)}>
                                    <EnterIcon /> Join live session
                                </DropdownMenu.Item>
                            )}

                            {isShareable && firebaseRealTime.roomCode && (
                                <DropdownMenu.Item onClick={copyRoomCode}>
                                    <Share1Icon /> Share live session
                                </DropdownMenu.Item>
                            )}

                            {isShareable && firebaseRealTime.sessionState !== SessionState.idle && (
                                <DropdownMenu.Item color="red" onClick={firebaseRealTime.leaveSession}>
                                    <Cross1Icon /> Leave session
                                </DropdownMenu.Item>
                            )}

                            {isShareable && <DropdownMenu.Separator />}

                            <DropdownMenu.Item
                                disabled={!changesState.length}
                                onClick={!changesState.length ? undefined : () => setHistoryDialog(true)}
                            >
                                <UpdateIcon /> Session update history
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item onClick={() => setServerTimeDialog(true)}>
                                <GlobeIcon /> Server time
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item
                                disabled={!trackedMvps.length}
                                onClick={!trackedMvps.length ? undefined : shareTimers}
                            >
                                <UploadIcon /> Copy timers
                            </DropdownMenu.Item>
                            <DropdownMenu.Item onClick={() => setImportDialog(true)}>
                                <DownloadIcon /> Import timers
                            </DropdownMenu.Item>

                            <DropdownMenu.Separator />

                            <DropdownMenu.Item asChild>
                                <a href="https://github.com/recs182/mvp-tracking/issues" target="_blank">
                                    <ExternalLinkIcon /> Bug or Feature Request
                                </a>
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item color="red" onClick={() => setResetDialog(true)}>
                                <ExclamationTriangleIcon /> Reset tracker
                            </DropdownMenu.Item>
                        </DropdownMenu.Content>
                    </DropdownMenu.Root>

                    <Popover.Root>
                        <Popover.Trigger>
                            <Button>
                                <StarFilledIcon />
                                <Box display={{ initial: 'none', sm: 'inline' }}> Donate</Box>
                            </Button>
                        </Popover.Trigger>
                        <Popover.Content style={{ backgroundColor: '#f7f7f7' }}>
                            <iframe
                                id="kofiframe"
                                src="https://ko-fi.com/woodlie/?hidefeed=true&widget=true&embed=true&preview=true"
                                style={{ border: 'none', width: '100%', background: 'transparent' }}
                                height="712"
                                title="woodlie"
                            />
                        </Popover.Content>
                    </Popover.Root>

                    <Separator orientation="vertical" />

                    <Flex direction="column" width="100%">
                        <TextField.Root
                            onChange={(changeEvent) => searchSubject.next(changeEvent.target.value)}
                            placeholder="Search for mvp name or map"
                            ref={searchInputRef}
                            style={{ width: 'auto' }}
                            type="text"
                        >
                            <TextField.Slot>
                                <MagnifyingGlassIcon />
                            </TextField.Slot>
                        </TextField.Root>
                    </Flex>

                    {isShareable && firebaseRealTime.sessionState !== SessionState.idle && (
                        <Fragment>
                            <Separator orientation="vertical" />
                            <Tooltip content={badgeSessionState.feedback}>
                                <Button color={badgeSessionState.color} size="1" variant="ghost" type="button">
                                    <Spinner />
                                </Button>
                            </Tooltip>
                        </Fragment>
                    )}
                </Flex>

                <HeaderDisplayDates>
                    <Tooltip content="This timers do not update. If they are completely off, just refresh the page">
                        <Text size="1">Server time: {serverTime.toFormat('HH:mm')}</Text>
                    </Tooltip>

                    <Text size="1">Your time: {localTime.toFormat('HH:mm')}</Text>
                </HeaderDisplayDates>
            </Header>

            <TrackerGridContainer>
                <TrackerGridRow $isHeader={true}>
                    <TrackerGridCell>
                        <Flex align="center" gap="2">
                            <TargetIcon /> Mvp information
                        </Flex>
                    </TrackerGridCell>
                    <TrackerGridCell>
                        <Flex align="center" gap="2">
                            <TimerIcon /> Timers
                        </Flex>
                    </TrackerGridCell>
                    <TrackerGridCell>
                        <Flex align="center" gap="2">
                            <UpdateIcon /> Update timers
                        </Flex>
                    </TrackerGridCell>
                </TrackerGridRow>

                {searchFilteredMvps.sort(sortTrackingMvpList).map((mvp) => {
                    const { id, map, mobId, name, spawnTime, sprite, timeOfDeath } = mvp

                    const spriteToUse = sprite ?? 'fallback.png'
                    const trackingChange = changesState
                        .slice(0, 1)
                        .find((history) => history.mvp.id === mvp.id && !history.action.startsWith('UNDO'))

                    return (
                        <TrackerGridRow key={`tracking-row-${id}`}>
                            <TrackerGridCell>
                                <MvpInformationContainer>
                                    <MvpSpriteContainer>
                                        <MvpSprite src={`./mvps/${spriteToUse}`} alt={`${name} sprite`} />
                                    </MvpSpriteContainer>
                                    <MvpInformation map={map} mobId={mobId} name={name} spawnTime={spawnTime} />
                                </MvpInformationContainer>
                            </TrackerGridCell>
                            <TrackerGridCell>
                                <Flex align="center" gap="4">
                                    {timeOfDeath && (
                                        <Fragment>
                                            <Tooltip content={timeOfDeath?.toFormat(defaultDateTimeFormat)}>
                                                <Flex align="center" gap="2">
                                                    <MoonIcon /> {timeOfDeath?.toLocaleString(DateTime.TIME_24_SIMPLE)}
                                                </Flex>
                                            </Tooltip>
                                            <Tooltip content="Remove">
                                                <IconButton
                                                    color="red"
                                                    variant="ghost"
                                                    onClick={resetTimeFromMvpFactory(mvp)}
                                                >
                                                    <Cross1Icon />
                                                </IconButton>
                                            </Tooltip>
                                        </Fragment>
                                    )}

                                    {Boolean(trackingChange) && (
                                        <Tooltip content="Undo">
                                            <Button
                                                color="blue"
                                                variant="ghost"
                                                onClick={undoChangeAndAddToHistory(trackingChange as TrackingChange)}
                                            >
                                                <ResetIcon />
                                            </Button>
                                        </Tooltip>
                                    )}
                                </Flex>
                                <TrackingSpawnTime mvp={mvp} />
                            </TrackerGridCell>
                            <TrackerGridCell>
                                <UpdateContainer>
                                    <Button onClick={realTimeUpdateFactory(mvp)} variant="surface">
                                        Track
                                    </Button>
                                    <div style={{ padding: '0.25rem' }}>or</div>
                                    <UpdateFromTombForm updateFromTomb={fromTombUpdateFactory(mvp)} />
                                </UpdateContainer>
                            </TrackerGridCell>
                        </TrackerGridRow>
                    )
                })}

                {!searchFilteredMvps.length && (
                    <TrackerGridRow style={{ gridTemplateColumns: '1fr' }}>
                        <TrackerGridCell>
                            <Flex direction="column" width="100%" align="center" gap="1">
                                <Flex gap="1">
                                    Nothing found when searching for <strong>{searchMvp}</strong>
                                </Flex>
                                <Flex>
                                    <img src={`./hmm.gif`} alt="hmmmm" />
                                </Flex>
                            </Flex>
                        </TrackerGridCell>
                    </TrackerGridRow>
                )}
            </TrackerGridContainer>
        </TrackingContainerStyled>
    )
}

export default TrackingContainer
