import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "../src/router";
import "../src/styles.css";

// This entry is bundled into local files. It never loads a web server.
const root = document.getElementById("root");
if (!root) throw new Error("تعذر تشغيل واجهة البرنامج");
createRoot(root).render(
  <React.StrictMode>
    <RouterProvider router={getRouter(true)} />
  </React.StrictMode>,
);
