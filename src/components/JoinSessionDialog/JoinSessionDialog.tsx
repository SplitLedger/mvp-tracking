import { type ReactElement, useState } from 'react'
import { Button, Dialog, Flex, Text, TextField } from '@radix-ui/themes'
import { EnterIcon } from '@radix-ui/react-icons'
import { v4 } from 'uuid'

interface JoinSessionDialogProps {
    onJoin: (code: string) => Promise<void>
    onOpenChange: (open: boolean) => void
    open: boolean
}

export const JoinSessionDialog = ({ open, onOpenChange, onJoin }: JoinSessionDialogProps): ReactElement => {
    const [code, setCode] = useState('')
    const [isJoining, setIsJoining] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleJoin = async () => {
        const trimmed = code.trim()

        setError(null)
        setIsJoining(true)

        try {
            await onJoin(trimmed)
            onOpenChange(false)
            setCode('')
        } catch {
            setError('Could not connect. Check the code and try again.')
        } finally {
            setIsJoining(false)
        }
    }

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Content>
                <Dialog.Title>Join live session</Dialog.Title>
                <Dialog.Description size="2" color="gray">
                    Enter the room code shared by your party host.
                </Dialog.Description>

                <Flex direction="column" gap="3" mt="4">
                    <TextField.Root
                        placeholder={`e.g. ${v4()}`}
                        value={code}
                        onChange={(event) => {
                            setCode(event.target.value)
                            setError(null)
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') handleJoin()
                        }}
                    />

                    {error && (
                        <Text size="1" color="red">
                            {error}
                        </Text>
                    )}
                </Flex>

                <Flex gap="3" mt="4" justify="end">
                    <Dialog.Close>
                        <Button variant="soft" color="gray">
                            Cancel
                        </Button>
                    </Dialog.Close>
                    <Button onClick={handleJoin} loading={isJoining} disabled={!code.trim() || isJoining}>
                        <EnterIcon /> Connect
                    </Button>
                </Flex>
            </Dialog.Content>
        </Dialog.Root>
    )
}
