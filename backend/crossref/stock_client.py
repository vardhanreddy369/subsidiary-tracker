"""Free stock data client — uses Yahoo Finance chart API + SEC EDGAR for ticker lookup."""

from __future__ import annotations

import json
import logging
import urllib.request
from datetime import datetime
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

_YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"


def get_stock_data(ticker, start_date, end_date):
    # type: (str, str, str) -> List[Dict]
    """Fetch historical daily close prices via Yahoo Finance chart API.

    Returns list of {date, open, high, low, close, volume}.
    """
    try:
        period1 = int(datetime.strptime(start_date, "%Y-%m-%d").timestamp())
        period2 = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp())

        url = (
            _YAHOO_CHART_URL.format(ticker=ticker)
            + "?period1={p1}&period2={p2}&interval=1d&events=history".format(
                p1=period1, p2=period2
            )
        )
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (SubTrack Research)",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())

        chart = data.get("chart", {}).get("result", [])
        if not chart:
            return []

        result = chart[0]
        timestamps = result.get("timestamp", [])
        quote = result.get("indicators", {}).get("quote", [{}])[0]

        opens = quote.get("open", [])
        highs = quote.get("high", [])
        lows = quote.get("low", [])
        closes = quote.get("close", [])
        volumes = quote.get("volume", [])

        results = []
        for i, ts in enumerate(timestamps):
            if closes[i] is None:
                continue
            results.append({
                "date": datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d"),
                "open": round(float(opens[i] or 0), 2),
                "high": round(float(highs[i] or 0), 2),
                "low": round(float(lows[i] or 0), 2),
                "close": round(float(closes[i]), 2),
                "volume": int(volumes[i] or 0),
            })
        return results
    except Exception as exc:
        logger.error("Error fetching stock data for %s: %s", ticker, exc)
        return []


def find_ticker_for_cik(cik):
    # type: (str) -> Optional[str]
    """Resolve a CIK to a stock ticker via SEC EDGAR."""
    try:
        padded_cik = cik.zfill(10)
        url = "https://data.sec.gov/submissions/CIK{cik}.json".format(cik=padded_cik)
        req = urllib.request.Request(url, headers={
            "User-Agent": "SubTrack/1.0 (sri.vardhan@ucf.edu)",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        tickers = data.get("tickers", [])
        if tickers:
            return str(tickers[0])
        return None
    except Exception as exc:
        logger.error("Error looking up ticker for CIK %s: %s", cik, exc)
        return None
