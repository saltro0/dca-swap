import { CreatePositionForm } from "@/components/dca/create-position-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewDCAPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dca" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">Create DCA Strategy</h1>
      </div>
      <CreatePositionForm />
    </div>
  );
}
