import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { GalleryView } from "./pages/GalleryView";
import { Favorites } from "./pages/Favorites";
import { Duplicates } from "./pages/Duplicates";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/g/:slug" element={<GalleryView />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/duplicates" element={<Duplicates />} />
      </Routes>
    </BrowserRouter>
  );
}
