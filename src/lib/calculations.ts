// Bundesland-spezifische Grunderwerbsteuersätze in Deutschland (in %)
export const FEDERAL_STATE_TAX_RATES: Record<string, number> = {
  Bayern: 3.5,
  Sachsen: 5.5,
  "Sachsen-Anhalt": 5.0,
  "Baden-Württemberg": 5.0,
  Niedersachsen: 5.0,
  Bremen: 5.0,
  Thüringen: 5.0,
  Hamburg: 5.5,
  Berlin: 6.0,
  Hessen: 6.0,
  "Mecklenburg-Vorpommern": 6.0,
  "Nordrhein-Westfalen": 6.5,
  Brandenburg: 6.5,
  "Schleswig-Holstein": 6.5,
  Saarland: 6.5,
  "Rheinland-Pfalz": 5.0,
};

export interface FinancingParams {
  equityPercent: number; // z.B. 15 (%)
  interestRatePercent: number; // z.B. 3.6 (%)
  repaymentRatePercent: number; // z.B. 2.0 (%)
  notaryAndRegistryPercent: number; // Standard: 2.0 (%)
  useCustomBrokerFee: boolean;
  customBrokerFeePercent: number; // Falls überschrieben
  additionalMaintenancePerSqmYear: number; // Eigene Rücklage €/m²/Jahr (z.B. 8 €)
  marginalTaxRatePercent: number; // Persönlicher Grenzsteuersatz in % (z.B. 42 %)
  buildingSharePercent: number; // Gebäudeanteil für AfA in % (z.B. 80 %)
}

export const DEFAULT_FINANCING_PARAMS: FinancingParams = {
  equityPercent: 10,
  interestRatePercent: 3.6,
  repaymentRatePercent: 2.0,
  notaryAndRegistryPercent: 2.0,
  useCustomBrokerFee: false,
  customBrokerFeePercent: 3.57,
  additionalMaintenancePerSqmYear: 6,
  marginalTaxRatePercent: 42,
  buildingSharePercent: 80,
};

export interface PropertySourceDTO {
  id: string;
  portalName: string;
  externalId: string;
  sourceUrl: string;
  listedPrice: number;
  brokerFeePercent: number;
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
}

export interface PriceHistoryDTO {
  id: string;
  recordedAt: string;
  price: number;
  changePercent: number;
  portalName: string;
  note: string | null;
}

export interface PropertyDTO {
  id: string;
  title: string;
  description: string;
  propertyType: string;
  address: string;
  zipCode: string;
  city: string;
  district: string;
  federalState: string;
  latitude: number;
  longitude: number;
  livingAreaSqm: number;
  rooms: number;
  yearBuilt: number;
  floor: number | null;
  energyClass: string;
  condition: string;
  isRented: boolean;
  purchasePrice: number;
  initialPrice: number;
  estimatedRentCold: number;
  currentRentCold: number | null;
  estimatedMarketValue: number;
  hoaTotalMonthly: number;
  nonAllocatableHoa: number;
  maintenanceReserve: number;
  brokerFeePercent: number;
  firstListedAt: string;
  lastUpdatedAt: string;
  sources: PropertySourceDTO[];
  priceHistory: PriceHistoryDTO[];
}

export interface PropertyMetrics {
  // Flächen-Kennzahlen
  pricePerSqm: number;
  rentPerSqm: number;
  marketValuePerSqm: number;

  // Kaufnebenkosten & Gesamtinvestition
  transferTaxPercent: number;
  brokerFeePercent: number;
  notaryPercent: number;
  totalClosingCostPercent: number;
  totalClosingCostsEUR: number;
  totalInvestmentEUR: number;

  // Rendite-Kennzahlen
  annualRentCold: number;
  grossRentalYieldPercent: number;
  factor: number; // Kaufpreisfaktor (Jahreskaltmieten)
  netRentalYieldPercent: number;

  // Marktwert & Preishistorie
  marketValueDiffPercent: number; // Negativ = unter Marktwert (z.B. -21.5%)
  belowMarketValuePercent: number; // Positiv = % unter Marktwert (z.B. +21.5%)
  belowMarketValueEUR: number;
  priceReduced: boolean;
  totalPriceDropEUR: number;
  totalPriceDropPercent: number;
  daysOnline: number;

  // Multi-Portal-Dubletten-Vorteil
  duplicateCount: number;
  maxPortalSpreadEUR: number;

  // Finanzierung & Cashflow
  equityRequiredEUR: number;
  loanAmountEUR: number;
  monthlyInterestEUR: number;
  monthlyRepaymentEUR: number;
  monthlyDebtServiceEUR: number;
  monthlyNonAllocatableCostsEUR: number;
  monthlyAdditionalMaintenanceEUR: number;
  monthlyOperatingCostsEUR: number;
  monthlyCashflowBeforeTax: number;

  // Steuern & AfA
  afaRatePercent: number;
  monthlyAfaEUR: number;
  monthlyTaxableRentalIncome: number;
  monthlyTaxEffectEUR: number; // Negativ = Steuererstattung, Positiv = Steuerlast
  monthlyCashflowAfterTax: number;
  returnOnEquityPercent: number; // Eigenkapitalrendite inkl. Tilgung nach Steuern
}

export function calculatePropertyMetrics(
  property: PropertyDTO,
  params: FinancingParams,
  overridePurchasePrice?: number,
  overrideRentCold?: number,
  overrideNonAllocatableHoa?: number
): PropertyMetrics {
  const purchasePrice = overridePurchasePrice ?? property.purchasePrice;
  const monthlyRentCold = overrideRentCold ?? property.estimatedRentCold;
  const nonAllocatableHoa = overrideNonAllocatableHoa ?? property.nonAllocatableHoa;

  // 1. Quadratmeterpreise
  const pricePerSqm = purchasePrice / property.livingAreaSqm;
  const rentPerSqm = monthlyRentCold / property.livingAreaSqm;
  const marketValuePerSqm = property.estimatedMarketValue / property.livingAreaSqm;

  // 2. Kaufnebenkosten je Bundesland
  const transferTaxPercent = FEDERAL_STATE_TAX_RATES[property.federalState] ?? 5.5;
  const brokerFeePercent = params.useCustomBrokerFee
    ? params.customBrokerFeePercent
    : property.brokerFeePercent;
  const notaryPercent = params.notaryAndRegistryPercent;
  const totalClosingCostPercent = transferTaxPercent + brokerFeePercent + notaryPercent;
  const totalClosingCostsEUR = purchasePrice * (totalClosingCostPercent / 100);
  const totalInvestmentEUR = purchasePrice + totalClosingCostsEUR;

  // 3. Brutto- & Nettomietrendite
  const annualRentCold = monthlyRentCold * 12;
  const grossRentalYieldPercent = (annualRentCold / purchasePrice) * 100;
  const factor = annualRentCold > 0 ? purchasePrice / annualRentCold : 0;

  // Bewirtschaftungskosten (nicht umlegbares Hausgeld inkl. WEG-Rücklage + eigene Zusatzrücklage)
  const monthlyAdditionalMaintenanceEUR =
    (property.livingAreaSqm * params.additionalMaintenancePerSqmYear) / 12;
  const monthlyNonAllocatableCostsEUR = nonAllocatableHoa;
  const monthlyOperatingCostsEUR =
    monthlyNonAllocatableCostsEUR + monthlyAdditionalMaintenanceEUR;
  const annualNetColdRent = annualRentCold - monthlyOperatingCostsEUR * 12;
  const netRentalYieldPercent = (annualNetColdRent / totalInvestmentEUR) * 100;

  // 4. Marktwert-Abweichung
  const marketValueDiffPercent =
    ((purchasePrice - property.estimatedMarketValue) / property.estimatedMarketValue) * 100;
  const belowMarketValuePercent = -marketValueDiffPercent; // z.B. +21.5 % unter Marktwert
  const belowMarketValueEUR = property.estimatedMarketValue - purchasePrice;

  // 5. Preissenkungen & Vermarktungsdauer
  const totalPriceDropEUR = Math.max(0, property.initialPrice - purchasePrice);
  const totalPriceDropPercent =
    property.initialPrice > 0
      ? ((property.initialPrice - purchasePrice) / property.initialPrice) * 100
      : 0;
  const priceReduced = totalPriceDropEUR > 0;

  const firstListedDate = new Date(property.firstListedAt);
  const now = new Date();
  const daysOnline = Math.max(
    1,
    Math.round((now.getTime() - firstListedDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // 6. Dubletten-Spread über Portale
  const duplicateCount = property.sources.length;
  const portalPrices = property.sources.map((s) => s.listedPrice);
  const maxPortalSpreadEUR =
    portalPrices.length > 1
      ? Math.max(...portalPrices) - Math.min(...portalPrices)
      : 0;

  // 7. Finanzierung & Monatlicher Cashflow vor Steuern
  // Eigenkapital % bezieht sich auf den Kaufpreis + Nebenkosten oder Anteil am Gesamtkapitalbedarf:
  // Üblicherweise im Immo-Kalkulator: Eigenkapitalquote in % vom Kaufpreis + Kaufnebenkosten,
  // oder Darlehen = Kaufpreis * (1 - EK%) und Nebenkosten aus EK.
  // Wir rechnen transparent: Eigenkapital = Kaufnebenkosten + (equityPercent % vom Kaufpreis),
  // bei 0% EK = 100%-Finanzierung des Kaufpreises (Nebenkosten aus EK).
  const equityOnPurchasePrice = purchasePrice * (params.equityPercent / 100);
  const loanAmountEUR = Math.max(0, purchasePrice - equityOnPurchasePrice);
  const equityRequiredEUR = totalClosingCostsEUR + equityOnPurchasePrice;

  const monthlyInterestEUR = (loanAmountEUR * (params.interestRatePercent / 100)) / 12;
  const monthlyRepaymentEUR = (loanAmountEUR * (params.repaymentRatePercent / 100)) / 12;
  const monthlyDebtServiceEUR = monthlyInterestEUR + monthlyRepaymentEUR;

  const monthlyCashflowBeforeTax =
    monthlyRentCold - monthlyOperatingCostsEUR - monthlyDebtServiceEUR;

  // 8. Steuern & Cashflow nach Steuern (inkl. Gebäude-AfA nach § 7 Abs. 4 EStG)
  const afaRatePercent = property.yearBuilt < 1925 ? 2.5 : 2.0;
  const depreciableBuildingValue =
    totalInvestmentEUR * (params.buildingSharePercent / 100);
  const monthlyAfaEUR = (depreciableBuildingValue * (afaRatePercent / 100)) / 12;

  // Steuerlich abzugsfähig: Schuldzinsen + laufende Bewirtschaftungskosten (ohne Zuführung zur WEG-Erhaltungsrücklage, vereinfacht abziehbarer Teil) + AfA
  const deductibleOperatingCostsMonthly =
    Math.max(0, nonAllocatableHoa - property.maintenanceReserve) +
    monthlyAdditionalMaintenanceEUR;
  const monthlyTaxableRentalIncome =
    monthlyRentCold -
    monthlyInterestEUR -
    deductibleOperatingCostsMonthly -
    monthlyAfaEUR;

  const monthlyTaxEffectEUR =
    monthlyTaxableRentalIncome * (params.marginalTaxRatePercent / 100);
  const monthlyCashflowAfterTax = monthlyCashflowBeforeTax - monthlyTaxEffectEUR;

  // Eigenkapitalrendite p.a. nach Steuern (inkl. Vermögensaufbau durch Tilgung)
  const annualWealthIncreaseAfterTax =
    (monthlyCashflowAfterTax + monthlyRepaymentEUR) * 12;
  const returnOnEquityPercent =
    equityRequiredEUR > 0
      ? (annualWealthIncreaseAfterTax / equityRequiredEUR) * 100
      : 0;

  return {
    pricePerSqm,
    rentPerSqm,
    marketValuePerSqm,
    transferTaxPercent,
    brokerFeePercent,
    notaryPercent,
    totalClosingCostPercent,
    totalClosingCostsEUR,
    totalInvestmentEUR,
    annualRentCold,
    grossRentalYieldPercent,
    factor,
    netRentalYieldPercent,
    marketValueDiffPercent,
    belowMarketValuePercent,
    belowMarketValueEUR,
    priceReduced,
    totalPriceDropEUR,
    totalPriceDropPercent,
    daysOnline,
    duplicateCount,
    maxPortalSpreadEUR,
    equityRequiredEUR,
    loanAmountEUR,
    monthlyInterestEUR,
    monthlyRepaymentEUR,
    monthlyDebtServiceEUR,
    monthlyNonAllocatableCostsEUR,
    monthlyAdditionalMaintenanceEUR,
    monthlyOperatingCostsEUR,
    monthlyCashflowBeforeTax,
    afaRatePercent,
    monthlyAfaEUR,
    monthlyTaxableRentalIncome,
    monthlyTaxEffectEUR,
    monthlyCashflowAfterTax,
    returnOnEquityPercent,
  };
}
