import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PGlite } from "@electric-sql/pglite";
import { live, PGliteWithLive } from "@electric-sql/pglite/live";
import { PGliteProvider } from "@electric-sql/pglite-react";
import App from "./App.tsx";
import "./index.css";

const db: PGliteWithLive = await PGlite.create({
  dataDir: "idb://todos",
  extensions: { live },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PGliteProvider db={db}>
      <App />
    </PGliteProvider>
  </StrictMode>,
);
