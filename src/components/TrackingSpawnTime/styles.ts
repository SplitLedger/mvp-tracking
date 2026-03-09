import styled, { css } from 'styled-components'

export const TimerContainer = styled.div<{
    $variationProgress: boolean
    $variationStart: boolean
    $variationFinished: boolean
}>`
    ${(props) => {
        if (props.$variationFinished) {
            return css`
                color: var(--gray-10);
            `
        }

        if (props.$variationProgress) {
            return css`
                color: var(--red-10);
            `
        }

        if (props.$variationStart) {
            return css`
                color: var(--amber-9);
            `
        }
    }}
`

export const RelativeDateContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;

    @media (min-width: 770px) {
        justify-content: flex-start;
    }
`
