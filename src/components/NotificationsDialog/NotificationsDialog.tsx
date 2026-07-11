import {
    type Dispatch,
    type FC,
    type ReactElement,
    type SetStateAction,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { Button, Callout, Card, Checkbox, Dialog, Flex, ScrollArea, Strong, Text, TextField } from '@radix-ui/themes'
import { debounceTime, Subject } from 'rxjs'
import { BellIcon, ExclamationTriangleIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons'
// app
import mvpsFromStatic from '@/assets/mvps'
import { MvpSprite, MvpSpriteContainer } from '@/containers/TrackingContainer/styles'
import type { RagnarokMvp } from '@/containers/TrackingContainer/types'
import { localStorageNotificationMvpIdsKey } from '@/constants'
import { toast } from 'sonner'

interface NotificationsDialogProps {
    onOpenChange: (open: boolean) => void
    open: boolean
    selectedMvpIds: number[]
    setSelectedMvpIds: Dispatch<SetStateAction<number[]>>
}

const sortNotificationsMvp = (selectedMvpIds: number[]) => (a: RagnarokMvp, b: RagnarokMvp) => {
    const aIsSelected = selectedMvpIds.includes(a.id)
    const bIsSelected = selectedMvpIds.includes(b.id)

    if (aIsSelected && !bIsSelected) {
        return -1
    }

    if (!aIsSelected && bIsSelected) {
        return 1
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export const NotificationsDialog: FC<NotificationsDialogProps> = ({
    onOpenChange,
    open,
    selectedMvpIds,
    setSelectedMvpIds,
}): ReactElement => {
    const searchSubject = useRef(new Subject<string>()).current
    const searchInputRef = useRef<HTMLInputElement>(null)

    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
        Notification?.permission ?? 'default'
    )
    const [searchMvp, setSearchMvp] = useState('')

    const toggleSelectedMvpFactory = useCallback(
        (mvpId: number) => () => {
            setSelectedMvpIds((currentSelectedMvpIds) => {
                if (searchInputRef.current) {
                    searchInputRef.current.value = ''
                    setSearchMvp('')
                }

                const selectedMvps = currentSelectedMvpIds.includes(mvpId)
                    ? currentSelectedMvpIds.filter((filterId) => filterId !== mvpId)
                    : [...currentSelectedMvpIds, mvpId]

                localStorage.setItem(localStorageNotificationMvpIdsKey, selectedMvps.join())
                return selectedMvps
            })
        },
        []
    )

    const handleOpenChange = useCallback(
        (isOpen: boolean) => {
            if (!isOpen) {
            }
            onOpenChange(isOpen)
        },
        [onOpenChange]
    )

    const askForNotificationPermission = useCallback(() => {
        Notification.requestPermission().then((permission) => {
            setNotificationPermission(permission)

            if (permission === 'granted') {
                toast.success('Notification permission granted')
            } else {
                toast.error('Notification permission denied')
            }
        })
    }, [])

    const sortMvpsMemo = useMemo(() => sortNotificationsMvp(selectedMvpIds), [selectedMvpIds])

    const searchFilteredMvps = useMemo(() => {
        return mvpsFromStatic.filter(
            (mvp) =>
                mvp.name.toLowerCase().includes(searchMvp.toLowerCase()) ||
                mvp.map.toLowerCase().includes(searchMvp.toLowerCase())
        )
    }, [searchMvp, mvpsFromStatic])

    // Search debounce
    useEffect(() => {
        const subscription = searchSubject.pipe(debounceTime(300)).subscribe(setSearchMvp)
        return () => subscription.unsubscribe()
    }, [])

    return (
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
            <Dialog.Content>
                <Dialog.Title>
                    <Flex align="center" gap="2">
                        <BellIcon /> Notifications
                    </Flex>
                </Dialog.Title>
                <Dialog.Description size="2">
                    Choose which MVPs you want to be notified when the variation is about to start or it is about to
                    spawn.
                </Dialog.Description>

                <Text size="2">You will be notified 2 minutes before it starts or spawns.</Text>

                {notificationPermission !== 'granted' && (
                    <Callout.Root color="red" mt="4">
                        <Callout.Icon>
                            <ExclamationTriangleIcon />
                        </Callout.Icon>
                        <Callout.Text>
                            Make sure to allow notification otherwise it will not be possible to remind you of the MVP's
                            start or spawn.
                        </Callout.Text>
                        <Flex>
                            <Button variant="soft" onClick={askForNotificationPermission}>
                                Grant permission
                            </Button>
                        </Flex>
                    </Callout.Root>
                )}

                <Flex mt="4">
                    <TextField.Root
                        onChange={(changeEvent) => searchSubject.next(changeEvent.target.value)}
                        placeholder="Search for mvp name or map"
                        style={{ width: '100%' }}
                        ref={searchInputRef}
                        type="text"
                    >
                        <TextField.Slot>
                            <MagnifyingGlassIcon />
                        </TextField.Slot>
                    </TextField.Root>
                </Flex>

                <Flex mt="4">
                    <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: '45dvh' }}>
                        <Flex direction="column" gap="2">
                            {searchFilteredMvps.sort(sortMvpsMemo).map((mvp) => {
                                const spriteToUse = mvp.sprite ?? 'fallback.png'

                                const isSelected = selectedMvpIds.includes(mvp.id)

                                return (
                                    <Card key={`notification-mvp-${mvp.id}`} onClick={toggleSelectedMvpFactory(mvp.id)}>
                                        <Flex align="center" gap="4">
                                            <Checkbox checked={isSelected} />

                                            <MvpSpriteContainer style={{ width: '32px' }}>
                                                <MvpSprite alt={`${mvp.name} sprite`} src={`./mvps/${spriteToUse}`} />
                                            </MvpSpriteContainer>

                                            <Flex direction="column">
                                                <Text>{mvp.name}</Text>
                                                <Text color="gray" size="1">
                                                    {mvp.map}
                                                </Text>
                                            </Flex>
                                        </Flex>
                                    </Card>
                                )
                            })}
                        </Flex>
                    </ScrollArea>
                </Flex>

                {!searchFilteredMvps.length && (
                    <Flex direction="column" width="100%" align="center" gap="1" mt="4">
                        <Text size="2">
                            Nothing found when searching for <Strong>{searchMvp}</Strong>
                        </Text>
                        <Flex>
                            <img src={`./hmm.gif`} alt="hmmmm" />
                        </Flex>
                    </Flex>
                )}

                <Flex gap="3" mt="4" align="center" justify="end">
                    <Dialog.Close>
                        <Button variant="soft">Close</Button>
                    </Dialog.Close>
                </Flex>
            </Dialog.Content>
        </Dialog.Root>
    )
}
