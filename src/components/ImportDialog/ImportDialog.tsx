import { type ChangeEvent, type FC, Fragment, type ReactElement, useCallback, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { Button, Card, Checkbox, Dialog, Flex, ScrollArea, Strong, Text, TextArea } from '@radix-ui/themes'
import { EnterIcon } from '@radix-ui/react-icons'
import { toast } from 'sonner'

import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { defaultDateTimeFormat } from '@/constants.ts'

interface ParsedTimer {
    id: number
    timeOfDeath: DateTime
}

interface ResolvedTimer extends ParsedTimer {
    mvp: RagnarokMvp
}

interface ImportDialogProps {
    mvpsList: RagnarokMvp[]
    onImport: (entries: { mvp: RagnarokMvp; timeOfDeath: DateTime }[]) => void
    onOpenChange: (open: boolean) => void
    open: boolean
}

const parseSharedTimers = (raw: string): ParsedTimer[] | null => {
    const entries = raw.trim().split(';').filter(Boolean)
    if (!entries.length) return null

    const parsed = entries.map((entry) => {
        const separatorIndex = entry.indexOf('|')
        if (separatorIndex === -1) return null

        const id = Number(entry.substring(0, separatorIndex))
        const timeOfDeath = DateTime.fromISO(entry.substring(separatorIndex + 1))

        if (Number.isNaN(id) || !timeOfDeath.isValid) return null
        return { id, timeOfDeath }
    })

    return parsed.includes(null) ? null : (parsed as ParsedTimer[])
}

export const ImportDialog: FC<ImportDialogProps> = ({ mvpsList, onImport, onOpenChange, open }): ReactElement => {
    const [rawInput, setRawInput] = useState('')
    const [parsedTimers, setParsedTimers] = useState<ResolvedTimer[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

    const mvpsById = useMemo(() => {
        return new Map(mvpsList.map((mvp) => [mvp.id, mvp]))
    }, [mvpsList])

    const handleParse = useCallback(() => {
        const parsed = parseSharedTimers(rawInput)

        if (!parsed || parsed.length === 0) {
            toast.error('Invalid format', {
                description: 'Make sure you pasted the shared timers correctly.',
            })
            return
        }

        const resolved: ResolvedTimer[] = []
        const unknownIds: number[] = []

        for (const entry of parsed) {
            const mvp = mvpsById.get(entry.id)
            if (mvp) {
                resolved.push({ ...entry, mvp })
            } else {
                unknownIds.push(entry.id)
            }
        }

        if (unknownIds.length) {
            toast.warning(`Skipped unknown MVP IDs: ${unknownIds.join(', ')}`)
        }

        if (!resolved.length) {
            toast.error('No matching MVPs found for the provided IDs.')
            return
        }

        setParsedTimers(resolved)
        setSelectedIds(new Set(resolved.map((r) => r.id)))
    }, [rawInput, mvpsById])

    const toggleSelection = useCallback((id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }, [])

    const toggleAll = useCallback(() => {
        setSelectedIds((prev) => {
            if (prev.size === parsedTimers.length) return new Set()
            return new Set(parsedTimers.map((t) => t.id))
        })
    }, [parsedTimers])

    const handleImport = useCallback(() => {
        const toImport = parsedTimers
            .filter((t) => selectedIds.has(t.id))
            .map(({ mvp, timeOfDeath }) => ({ mvp, timeOfDeath }))

        if (!toImport.length) {
            toast.warning('No timers selected to import')
            return
        }

        onImport(toImport)
        toast.success(`Imported ${toImport.length} MVP timers`)
        onOpenChange(false)
    }, [parsedTimers, selectedIds, onImport, onOpenChange])

    const handleOpenChange = useCallback(
        (isOpen: boolean) => {
            if (!isOpen) {
                // reset state when closing
                setRawInput('')
                setParsedTimers([])
                setSelectedIds(new Set())
            }
            onOpenChange(isOpen)
        },
        [onOpenChange]
    )

    const hasParsedTimers = parsedTimers.length > 0

    return (
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
            <Dialog.Content>
                <Dialog.Title>
                    <Flex align="center" gap="2">
                        <EnterIcon /> Import timers
                    </Flex>
                </Dialog.Title>
                <Dialog.Description size="2" mb="4">
                    Paste the shared timers string, preview them, and select which ones to import.
                </Dialog.Description>

                {!hasParsedTimers && (
                    <Fragment>
                        <TextArea
                            value={rawInput}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setRawInput(e.target.value)}
                            resize="none"
                            placeholder="Paste shared timers here, e.g. 4|2026-03-08T17:40:34.047+00:00;3|..."
                            rows={4}
                        />

                        <Flex gap="3" mt="4" justify="end">
                            <Dialog.Close>
                                <Button color="gray" variant="soft" type="button">
                                    Close
                                </Button>
                            </Dialog.Close>
                            <Button variant="soft" disabled={!rawInput.trim()} onClick={handleParse}>
                                Preview
                            </Button>
                        </Flex>
                    </Fragment>
                )}

                {hasParsedTimers && (
                    <Fragment>
                        <Flex direction="column" gap="2">
                            <Flex justify="between" align="center">
                                <Text size="2">
                                    {selectedIds.size} of {parsedTimers.length} selected
                                </Text>
                                <Button size="1" variant="ghost" onClick={toggleAll}>
                                    {selectedIds.size === parsedTimers.length ? 'Deselect all' : 'Select all'}
                                </Button>
                            </Flex>

                            <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: '65dvh' }}>
                                <Flex direction="column" gap="2">
                                    {parsedTimers.map((timer) => {
                                        return (
                                            <Card
                                                key={`import-timers-${timer.id}`}
                                                onClick={() => toggleSelection(timer.id)}
                                            >
                                                <Flex align="center" gap="4">
                                                    <Checkbox checked={selectedIds.has(timer.id)} />
                                                    <Flex direction="column">
                                                        <Text>{timer.mvp.name}</Text>
                                                        <Text size="1">
                                                            from <Strong>{timer.mvp.map}</Strong>, died at{' '}
                                                            <Strong>
                                                                {timer.timeOfDeath.toFormat(defaultDateTimeFormat)}
                                                            </Strong>
                                                        </Text>
                                                    </Flex>
                                                </Flex>
                                            </Card>
                                        )
                                    })}
                                </Flex>
                            </ScrollArea>
                        </Flex>

                        <Flex gap="3" mt="4" justify="end">
                            <Button
                                color="gray"
                                variant="soft"
                                onClick={() => {
                                    setParsedTimers([])
                                    setSelectedIds(new Set())
                                }}
                            >
                                Back
                            </Button>

                            <Button variant="soft" disabled={!selectedIds.size} onClick={handleImport}>
                                Import timers
                            </Button>
                        </Flex>
                    </Fragment>
                )}
            </Dialog.Content>
        </Dialog.Root>
    )
}
