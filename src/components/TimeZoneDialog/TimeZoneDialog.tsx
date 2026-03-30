import { type FC, useCallback, useState } from 'react'
import { Button, Dialog, Flex, Select, Text } from '@radix-ui/themes'
import { GlobeIcon } from '@radix-ui/react-icons'
// app
import { computeTimeZone } from '@/helpers'
import timezones from '@/assets/timezones'
import { localStorageTimeZoneKey } from '@/constants'
import { toast } from 'sonner'

interface TimeZoneDialogProps {
    onOpenChange: (open: boolean) => void
    open: boolean
}

export const TimeZoneDialog: FC<TimeZoneDialogProps> = ({ onOpenChange, open }) => {
    const [timeZone, setZone] = useState(computeTimeZone())

    const timeZoneHandler = useCallback((timeZone: string) => {
        localStorage.setItem(localStorageTimeZoneKey, timeZone)
        setZone(timeZone)

        toast.success('Time zone has been saved')
        onOpenChange(false)
    }, [])

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Content>
                <Dialog.Title>
                    <GlobeIcon /> Server time
                </Dialog.Title>
                <Dialog.Description size="2" mb="4">
                    Choose the appropriated time of the server you are playing, this is essential for accurate tracking.
                </Dialog.Description>

                <Text as="div" size="2" mb="4">
                    If you are changing timezone with MVPs being tracked, it might show wrong timers, consider resetting
                    and setting timers again.
                </Text>

                <Flex direction="column">
                    <Select.Root value={timeZone} onValueChange={timeZoneHandler}>
                        <Select.Trigger />
                        <Select.Content>
                            {timezones.map((timezone) => {
                                return (
                                    <Select.Item key={timezone.gmt} value={timezone.utc}>
                                        {timezone.gmt} | {timezone.name}
                                    </Select.Item>
                                )
                            })}
                        </Select.Content>
                    </Select.Root>
                </Flex>

                <Flex gap="3" mt="4" justify="end">
                    <Dialog.Close>
                        <Button color="gray" variant="soft">
                            Close
                        </Button>
                    </Dialog.Close>
                </Flex>
            </Dialog.Content>
        </Dialog.Root>
    )
}
