import { createFileRoute } from "@tanstack/react-router";
import { LocalRecords } from "@/components/app/LocalRecords";
export const Route=createFileRoute("/students")({component:()=> <LocalRecords kind="students" />});
