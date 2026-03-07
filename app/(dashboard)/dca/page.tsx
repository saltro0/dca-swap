import { PositionList } from "@/components/dca/position-list";
import { Plus } from "lucide-react";
import Link from "next/link";

export default function DCAPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">My Orders</h1>
        <Link
          href="/dca/new"
          className="inline-flex items-center gap-1.5 btn-accent px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Strategy
        </Link>
      </div>
      <PositionList />
    </div>
  );
}
