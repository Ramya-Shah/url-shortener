from pydantic import BaseModel
from typing import List, Dict, Union

class ClickStats(BaseModel):
    total_clicks: int
    unique_ips: int
    clicks_by_day: Dict[str, int]
    top_referrers: List[Dict[str, Union[int, str]]]
    top_countries: List[Dict[str, Union[int, str]]]
