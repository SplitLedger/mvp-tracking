import { BrowserRouter, Route, Routes } from 'react-router'
import TrackingContainer from '@/containers/TrackingContainer/TrackingContainer'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route index element={<TrackingContainer />} path="/" />
                <Route index element={<TrackingContainer />} path="/live" />
            </Routes>
        </BrowserRouter>
    )
}

export default App
