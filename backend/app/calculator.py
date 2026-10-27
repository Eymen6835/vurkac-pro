from pydantic import BaseModel
from typing import Optional

GRET_RATES = {
    "BW": 5.0, "BY": 3.5, "BE": 6.0, "BB": 6.5, "HB": 5.0,
    "HH": 5.5, "HE": 6.0, "MV": 6.0, "NI": 5.0, "NW": 6.5,
    "RP": 5.0, "SL": 6.5, "SN": 5.5, "ST": 5.0, "SH": 6.5, "TH": 5.0
}

class RawListing(BaseModel):
    portal: str
    external_id: str
    url: str
    title: str
    zip_code: str
    city: str
    state_code: str = "BW"
    price: float
    living_area: float
    rooms: float
    construction_year: Optional[int] = 1980
    actual_rent_cold: Optional[float] = None
    has_broker_fee: bool = True

class EnrichedDeal(RawListing):
    fingerprint: str
    price_per_sqm: float
    estimated_market_value: float
    market_spread_pct: float
    estimated_rent_cold: float
    gross_yield_pct: float
    net_yield_pct: float
    monthly_cashflow_pre_tax: float
    monthly_cashflow_after_tax: float
    is_top_deal: bool

def evaluate_listing(
    listing: RawListing,
    avg_sqm_price_zip: float = 3100.0,
    avg_sqm_rent_zip: float = 11.80,
    equity_pct: float = 15.0,
    interest_rate_pct: float = 3.8,
    repayment_rate_pct: float = 2.0,
    tax_rate_pct: float = 42.0
) -> EnrichedDeal:
    price_per_sqm = round(listing.price / max(listing.living_area, 1), 2)
    estimated_market_value = round(listing.living_area * avg_sqm_price_zip, 0)
    market_spread_pct = round(((estimated_market_value - listing.price) / estimated_market_value) * 100, 1)

    estimated_rent = listing.actual_rent_cold or round(listing.living_area * avg_sqm_rent_zip, 2)
    annual_rent = estimated_rent * 12

    gret = GRET_RATES.get(listing.state_code, 5.0)
    broker = 3.57 if listing.has_broker_fee else 0.0
    notary = 2.0
    ancillary_pct = (gret + broker + notary) / 100.0
    total_investment = listing.price * (1 + ancillary_pct)

    gross_yield_pct = round((annual_rent / listing.price) * 100, 2)
    non_apportionable_costs_month = (listing.living_area * 1.50) + (estimated_rent * 0.05)
    net_annual_income = annual_rent - (non_apportionable_costs_month * 12)
    net_yield_pct = round((net_annual_income / total_investment) * 100, 2)

    equity_amount = listing.price * (equity_pct / 100.0) + (listing.price * ancillary_pct)
    loan_amount = max(total_investment - equity_amount, 0)
    monthly_interest = (loan_amount * (interest_rate_pct / 100.0)) / 12
    monthly_repayment = (loan_amount * (repayment_rate_pct / 100.0)) / 12
    monthly_annuity = monthly_interest + monthly_repayment

    cashflow_pre_tax = estimated_rent - non_apportionable_costs_month - monthly_annuity

    afa_rate = 0.025 if (listing.construction_year and listing.construction_year < 1925) else 0.02
    monthly_afa = (listing.price * 0.80 * afa_rate) / 12
    taxable_profit = estimated_rent - non_apportionable_costs_month - monthly_interest - monthly_afa
    monthly_tax = taxable_profit * (tax_rate_pct / 100.0)
    cashflow_after_tax = round(cashflow_pre_tax - monthly_tax, 2)

    fingerprint = f"{listing.zip_code}_{int(round(listing.living_area))}_{int(round(listing.price, -3))}_{int(listing.rooms)}"

    return EnrichedDeal(
        **listing.model_dump(),
        fingerprint=fingerprint,
        price_per_sqm=price_per_sqm,
        estimated_market_value=estimated_market_value,
        market_spread_pct=market_spread_pct,
        estimated_rent_cold=estimated_rent,
        gross_yield_pct=gross_yield_pct,
        net_yield_pct=net_yield_pct,
        monthly_cashflow_pre_tax=round(cashflow_pre_tax, 2),
        monthly_cashflow_after_tax=cashflow_after_tax,
        is_top_deal=(gross_yield_pct >= 6.0 or market_spread_pct >= 15.0)
    )
