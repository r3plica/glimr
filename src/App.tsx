import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { GalleryView } from "./pages/GalleryView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/g/:slug" element={<GalleryView />} />
      </Routes>
    </BrowserRouter>
  );
}
