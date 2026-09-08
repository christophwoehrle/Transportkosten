import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { WohnungenList } from "@/pages/WohnungenList";
import { WohnungDetail } from "@/pages/WohnungDetail";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="wohnungen" element={<WohnungenList />} />
        <Route path="wohnungen/:id" element={<WohnungDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
