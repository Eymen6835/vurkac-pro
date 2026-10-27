import React from "react";
import { InvestorDashboard } from "@/components/InvestorDashboard";
import { PropertyDTO } from "@/lib/calculations";
import realProperties from "@/lib/realProperties.json";

export default async function HomePage() {
  const serializedProperties = realProperties as unknown as PropertyDTO[];
  return <InvestorDashboard initialProperties={serializedProperties} />;
}
