import styled, { css } from 'styled-components'

export const TrackingContainerStyled = styled.div`
    position: relative;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    background-color: var(--gray-1);
`

export const Header = styled.header`
    position: relative;
    padding: var(--space-4);
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    color: white;
    background-color: var(--gray-1);

    @media (min-width: 770px) {
        grid-template-columns: 3fr 1fr;
    }

    @media (min-width: 1280px) {
        grid-template-columns: 480px 240px;
    }
`

export const HeaderDisplayDates = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);

    @media (min-width: 770px) {
        flex-direction: column;
        align-items: flex-end;
        gap: 0;
    }
`

export const TrackerGridContainer = styled.div`
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    color: white;
    overflow-x: auto;

    @media (min-width: 1280px) {
        width: fit-content;
    }

    > div:nth-child(even) {
        background-color: var(--gray-2);
    }
`

export const TrackerGridRow = styled.div<{ $isHeader?: boolean }>`
    display: grid;
    grid-template-columns: 1fr;
    background-color: var(--gray-4);

    > :first-child {
        padding-top: 1rem;
    }

    > :last-child {
        padding-bottom: 1rem;
    }

    @media (min-width: 770px) {
        gap: 1rem;
        grid-template-columns: repeat(3, minmax(240px, 1fr));

        > :first-child {
            padding-top: 0;
        }

        > :last-child {
            padding-bottom: 0;
        }
    }

    ${({ $isHeader }) =>
        $isHeader &&
        css`
            position: sticky;
            top: 0;
            display: none;
            font-weight: bold;
            border-bottom: 1px solid var(--gray-2);
            z-index: 2;

            @media (min-width: 770px) {
                display: grid;
            }
        `}
`

export const TrackerGridCell = styled.div`
    padding: 0.5rem 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    @media (min-width: 770px) {
        padding: 0 0.5rem;
        min-height: 80px;
        align-items: flex-start;
        justify-content: center;
    }
`

export const MvpInformationContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    gap: 0.5rem;
`

export const UpdateContainer = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
`

export const MvpSpriteContainer = styled.div`
    width: 50px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
`

export const MvpSprite = styled.img`
    width: auto;
    max-height: 32px;
`

export const ConnectionStatusContainer = styled.div`
    position: absolute;
`
