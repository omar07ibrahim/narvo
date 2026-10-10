import {
  Building,
  ChartLine,
  ChartSpline,
  ClipboardCheck,
  FileCheck,
  FileSpreadsheet,
  Headset,
  IdCard,
  Languages,
  LayoutPanelLeft,
  PackageSearch,
  ReceiptText,
  ScanSearch,
  ScrollText,
  Server,
  Sparkles,
  UserRoundCheck,
  Users,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  Building,
  ChartLine,
  ChartSpline,
  ClipboardCheck,
  FileCheck,
  FileSpreadsheet,
  Headset,
  IdCard,
  Languages,
  LayoutPanelLeft,
  PackageSearch,
  ReceiptText,
  ScanSearch,
  ScrollText,
  Server,
  Sparkles,
  UserRoundCheck,
  Users,
  Workflow,
  Wrench,
};

export function SolutionIcon({ name, className, strokeWidth = 1.5 }: { name: string; className?: string; strokeWidth?: number }) {
  const Icon = MAP[name] ?? Sparkles;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}
