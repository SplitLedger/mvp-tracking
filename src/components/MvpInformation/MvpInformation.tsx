import { memo, type ReactElement, useCallback } from 'react'
import { Button, Flex, Text, Tooltip } from '@radix-ui/themes'
// app
import { type RagnarokMvp } from '@/containers/TrackingContainer/types'

interface MvpInformationProps {
    map: string
    mobId: string
    name: string
    spawnTime: RagnarokMvp['spawnTime']
}

function minutesToHoursMinutes(totalMinutes: number): string {
    const safe = Math.max(0, Math.floor(totalMinutes)) // optional: avoid negatives/decimals

    const hours = Math.floor(safe / 60)
    const minutes = safe % 60

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

export const MvpInformation = memo<MvpInformationProps>(({ map, mobId, name, spawnTime }): ReactElement => {
    const minTime = minutesToHoursMinutes(spawnTime.minMinutes)
    const maxTime = minutesToHoursMinutes(spawnTime.maxMinutes)

    const noVariation = minTime === maxTime
    const spawnTimeLabel = noVariation ? minTime : `${minTime}~${maxTime}`

    const copyMobIdFactory = useCallback(
        (mobId: string) => () => {
            navigator.clipboard.writeText(`@mi ${mobId}`).finally()
        },
        []
    )

    return (
        <Flex direction="column">
            <Flex>
                <Tooltip content={`Click to copy @mi ${mobId} and paste in-game chat`}>
                    <Button onClick={copyMobIdFactory(mobId)} size="3" variant="ghost">
                        {name}
                    </Button>
                </Tooltip>
            </Flex>
            <Text as="div" size="1">
                Map: <strong>{map}</strong>
            </Text>
            <Text as="div" size="1">
                Spawn: <strong>{spawnTimeLabel}</strong>
            </Text>
        </Flex>
    )
})
