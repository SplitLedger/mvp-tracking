'use no memo'
import { memo, type ReactElement, useEffect, useMemo, useState } from 'react'
import { DateTime, Duration } from 'luxon'
// app
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { computeMvpDifferenceTimers, computeTimeZone } from '@/helpers'
// self
import { RelativeDateContainer, TimerContainer } from './styles'
import { Strong, Tooltip } from '@radix-ui/themes'

interface TrackingSpawnTimeProps {
    mvp: RagnarokMvp
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

const toRelativeAccurate = (target: DateTime): string => {
    const differenceInMilliseconds = target.toMillis() - DateTime.now().setZone(computeTimeZone()).toMillis()
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

export const TrackingSpawnTime = memo<TrackingSpawnTimeProps>(({ mvp }): ReactElement => {
    const [autoUpdate, setAutoUpdate] = useState<number>(0)

    const { maximumDifferenceInMinutes, minimumDifferenceInMinutes, variations } = useMemo<MemoReturn>(() => {
        const dateUTC = DateTime.now().setZone(computeTimeZone())

        if (!mvp.timeOfDeath) {
            return {
                maximumSpawnTime: dateUTC,
                minimalSpawnTime: dateUTC,
                variations: {
                    aboutToStart: false,
                    alreadyEnded: false,
                    alreadyStarted: false,
                    endedMinutesAgo: false,
                },
            }
        }

        const { maximumDifferenceInMinutes, minimumDifferenceInMinutes } = computeMvpDifferenceTimers(mvp)

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
    }, [mvp, autoUpdate])

    const mvpDoesNotHaveVariation = mvp.spawnTime.minMinutes === mvp.spawnTime.maxMinutes

    const timeLabel = useMemo(() => {
        if (mvpDoesNotHaveVariation) {
            return Number(minimumDifferenceInMinutes) >= 0 ? 'Spawned' : 'Spawns'
        }
        return Number(minimumDifferenceInMinutes) >= 0 ? 'Started' : 'Starts'
    }, [mvpDoesNotHaveVariation, minimumDifferenceInMinutes])

    useEffect(() => {
        const intervalId = setInterval(() => setAutoUpdate((current) => current + 1), 1000)
        return () => clearInterval(intervalId)
    }, [])

    if (!mvp.timeOfDeath) {
        return (
            <TimerContainer $variationProgress={false} $variationStart={false} $variationFinished={true}>
                Not tracked
            </TimerContainer>
        )
    }

    const variationToStartOrAlreadyStarted = variations.aboutToStart || variations.alreadyStarted

    const minimumDate = DateTime.now().setZone(computeTimeZone()).minus({ minutes: minimumDifferenceInMinutes })
    const maximumDate = DateTime.now().setZone(computeTimeZone()).minus({ minutes: maximumDifferenceInMinutes })

    return (
        <TimerContainer
            $variationStart={variations.aboutToStart}
            $variationProgress={variations.alreadyStarted}
            $variationFinished={variations.endedMinutesAgo}
        >
            {(mvpDoesNotHaveVariation || !variations.alreadyEnded) && (
                <RelativeDateContainer>
                    {timeLabel}

                    <Tooltip content={`${timeLabel} ${minimumDate.toLocaleString(DateTime.TIME_24_SIMPLE)}`}>
                        <Strong>{toRelativeAccurate(minimumDate)}</Strong>
                    </Tooltip>
                </RelativeDateContainer>
            )}

            {!mvpDoesNotHaveVariation && variationToStartOrAlreadyStarted && (
                <RelativeDateContainer>
                    {Number(maximumDifferenceInMinutes) >= 0 ? 'Finished' : 'Finishes'}
                    <Tooltip content={maximumDate.toLocaleString(DateTime.TIME_24_SIMPLE)}>
                        <Strong>{toRelativeAccurate(maximumDate)}</Strong>
                    </Tooltip>
                </RelativeDateContainer>
            )}
        </TimerContainer>
    )
})
