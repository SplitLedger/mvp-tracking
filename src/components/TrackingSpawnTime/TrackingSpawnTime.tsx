'use no memo'
import { memo, type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { DateTime, Duration } from 'luxon'
// app
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { computeMvpDifferenceTimers, computeTimeZone } from '@/helpers'
// self
import { RelativeDateContainer, TimerContainer } from './styles'
import { Strong, Tooltip } from '@radix-ui/themes'
import { defaultDateTimeFormat } from '@/constants.ts'

interface TrackingSpawnTimeProps {
    /** When provided, the timer is frozen at this point in time (maintenance/pause mode) */
    frozenAt?: DateTime
    mvp: RagnarokMvp
    shouldNotify: boolean
}

type MemoReturn = {
    maximumDifferenceInMinutes?: number
    minimumDifferenceInMinutes?: number
    variations: {
        aboutToStart: boolean
        alreadyEnded: boolean
        alreadyStarted: boolean
        endedMinutesAgo: boolean
    }
}

const toRelativeAccurate = (target: DateTime, now: DateTime): string => {
    const differenceInMilliseconds = target.toMillis() - now.toMillis()
    const duration = Duration.fromMillis(Math.abs(differenceInMilliseconds))
        .shiftTo('hours', 'minutes', 'seconds')
        .mapUnits((unit) => Math.floor(unit))

    const parts = (['hours', 'minutes', 'seconds'] as const)
        .filter((unit) => duration.get(unit) > 0)
        .reduce((merge, unit) => merge + duration.get(unit), 0)

    if (parts === 0) return 'now'

    const readableDuration = duration.toHuman({
        listStyle: 'narrow',
        unitDisplay: 'narrow',
        maximumFractionDigits: 0,
        showZeros: false,
    })

    const isFuture = differenceInMilliseconds > 0
    return isFuture ? `in ${readableDuration}` : `${readableDuration} ago`
}

export const TrackingSpawnTime = memo<TrackingSpawnTimeProps>(({ frozenAt, mvp, shouldNotify }): ReactElement => {
    const notifiedRef = useRef(false)

    const [autoUpdate, setAutoUpdate] = useState<number>(0)
    const [notificationPermission] = useState<NotificationPermission>(Notification?.permission ?? 'default')

    const now = frozenAt ?? DateTime.now().setZone(computeTimeZone())

    const { maximumDifferenceInMinutes, minimumDifferenceInMinutes, variations } = useMemo<MemoReturn>(() => {
        if (!mvp.timeOfDeath) {
            return {
                variations: {
                    aboutToStart: false,
                    alreadyEnded: false,
                    alreadyStarted: false,
                    endedMinutesAgo: false,
                },
            }
        }

        const { maximumDifferenceInMinutes, minimumDifferenceInMinutes } = computeMvpDifferenceTimers(mvp, now)

        const variationAlreadyEnded = Number(maximumDifferenceInMinutes) >= 0
        const endedMinutesAgo = Number(maximumDifferenceInMinutes) >= 15
        const variationAboutToStart = Number(minimumDifferenceInMinutes) >= -5
        const variationAlreadyStarted = Number(minimumDifferenceInMinutes) >= 0

        return {
            maximumDifferenceInMinutes,
            minimumDifferenceInMinutes,
            variations: {
                aboutToStart: variationAboutToStart,
                alreadyEnded: variationAlreadyEnded,
                alreadyStarted: variationAlreadyStarted,
                endedMinutesAgo,
            },
        }
    }, [mvp, autoUpdate, frozenAt])

    const mvpDoesNotHaveVariation = mvp.spawnTime.minMinutes === mvp.spawnTime.maxMinutes

    const timeLabel = useMemo(() => {
        if (mvpDoesNotHaveVariation) {
            return Number(minimumDifferenceInMinutes) >= 0 ? 'Spawned' : 'Spawns'
        }
        return Number(minimumDifferenceInMinutes) >= 0 ? 'Started' : 'Starts'
    }, [mvpDoesNotHaveVariation, minimumDifferenceInMinutes])

    useEffect(() => {
        // Do not tick while timers are frozen
        if (frozenAt) {
            return
        }

        const intervalId = setInterval(() => setAutoUpdate((current) => current + 1), 1000)

        return () => clearInterval(intervalId)
    }, [frozenAt])

    useEffect(() => {
        if (!frozenAt && shouldNotify && Math.floor(minimumDifferenceInMinutes || 0) === -2) {
            if (notifiedRef.current) {
                return
            }

            notifiedRef.current = true

            if (notificationPermission === 'granted') {
                const notification = new Notification(`${mvp.name} spawns in 2 minutes!`, {
                    body: `Map: ${mvp.map}`,
                    tag: `mvp-notify-${mvp.id}`, // prevents duplicates if re-rendered
                    icon: `./mvps/${mvp.sprite ?? 'fallback.png'}`,
                })

                setTimeout(() => notification.close(), 120_000)
            }
        }

        // Reset so next spawn cycle can notify again
        if (minimumDifferenceInMinutes !== null && Number(minimumDifferenceInMinutes) >= 0) {
            notifiedRef.current = false
        }
    }, [minimumDifferenceInMinutes])

    if (!mvp.timeOfDeath) {
        return (
            <TimerContainer $variationProgress={false} $variationStart={false} $variationFinished={true}>
                Not tracked
            </TimerContainer>
        )
    }
    const variationToStartOrAlreadyStarted = variations.aboutToStart || variations.alreadyStarted
    const minimumDate = now.minus({ minutes: minimumDifferenceInMinutes })

    const maximumDate = now.minus({ minutes: maximumDifferenceInMinutes })

    return (
        <TimerContainer
            $variationStart={variations.aboutToStart}
            $variationProgress={variations.alreadyStarted}
            $variationFinished={variations.endedMinutesAgo}
        >
            {(mvpDoesNotHaveVariation || !variations.alreadyEnded) && (
                <RelativeDateContainer>
                    {timeLabel}
                    <Tooltip content={`${timeLabel} ${minimumDate.toFormat(defaultDateTimeFormat)}`}>
                        <Strong>{toRelativeAccurate(minimumDate, now)}</Strong>
                    </Tooltip>
                </RelativeDateContainer>
            )}

            {!mvpDoesNotHaveVariation && variationToStartOrAlreadyStarted && (
                <RelativeDateContainer>
                    {Number(maximumDifferenceInMinutes) >= 0 ? 'Finished' : 'Finishes'}
                    <Tooltip content={maximumDate.toFormat(defaultDateTimeFormat)}>
                        <Strong>{toRelativeAccurate(maximumDate, now)}</Strong>
                    </Tooltip>
                </RelativeDateContainer>
            )}
        </TimerContainer>
    )
})
