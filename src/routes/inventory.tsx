import { createFileRoute } from "@tanstack/react-router";
import { LocalRecords } from "@/components/app/LocalRecords";
export const Route=createFileRoute("/inventory")({component:()=> <LocalRecords kind="inventoryItems" />});
